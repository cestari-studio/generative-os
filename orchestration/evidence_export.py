"""export_evidence — ledger run → auditable artifact in artifacts/evidence/.

Contract (authorized 2026-10-27):
- Reads specs/schemas/evidence.schema.json and uses only its fields/enums.
- Validates FORMALLY with the project's own validator (repo Ajv via
  validate-evidence.mjs) — JSON serialization alone is never claimed as validation.
- Atomic writes; no silent overwrite (identical content → no-op; different → error).
- No secrets: export refuses any payload containing credential-shaped strings.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "specs/schemas/evidence.schema.json"
VALIDATOR_SCRIPT = Path(__file__).resolve().parent / "validate-evidence.mjs"
EVIDENCE_DIR = REPO_ROOT / "artifacts/evidence"

SPEC_VERSION = "0.1.0"
GENERATOR_VERSION = "orchestration/0.1.0"
EVIDENCE_CLASS = "validation.local"
MATURITY = "NORMATIVE_ONLY"

SECRET_PATTERNS = [
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    re.compile(r"\bsk-[A-Za-z0-9_-]{6,}"),
    re.compile(r"\boauth-[A-Za-z0-9_-]{4,}"),
    re.compile(r"\bbzl_[A-Za-z0-9_-]{6,}"),
    re.compile(r"\bghp_[A-Za-z0-9]{10,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{10,}"),
    re.compile(r"authorization[\"'\s]*[:=]", re.IGNORECASE),
    re.compile(r"api[_-]?key[\"'\s]*[:=]\s*\S", re.IGNORECASE),
]


class EvidenceError(Exception):
    pass


class SecretDetected(EvidenceError):
    pass


class DuplicateEvidenceError(EvidenceError):
    pass


class SchemaRejected(EvidenceError):
    def __init__(self, errors):
        super().__init__(f"schema validation failed: {errors}")
        self.errors = errors


def guard_no_secrets(payload_text: str) -> None:
    for pattern in SECRET_PATTERNS:
        match = pattern.search(payload_text)
        if match:
            raise SecretDetected(f"credential-shaped string matched pattern {pattern.pattern!r}")


def repo_commit_sha() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def spec_key_for_adapter(adapter: str) -> str:
    return f"judge.switch.{adapter}"


def build_evidence(*, commit_sha: str, adapter: str, run_id: str, rows: list[dict], recorded_at: str) -> dict:
    findings = [
        {
            "fixture_id": row["fixture_id"],
            "adapter": row["adapter"],
            "verdict": row["verdict"],
            "score_value": row["score_value"],
            "latency_ms": row["latency_ms"],
            "eval_count": row["eval_count"],
            "error_class": row["error_class"],
        }
        for row in rows
    ]
    summary: dict[str, int] = {"PASS": 0, "FAIL": 0, "UNCERTAIN": 0, "ERROR": 0}
    for row in rows:
        summary[row["verdict"]] = summary.get(row["verdict"], 0) + 1
    return {
        "spec_key": spec_key_for_adapter(adapter),
        "spec_version": SPEC_VERSION,
        "generator_version": GENERATOR_VERSION,
        "commit_sha": commit_sha,
        "evidence_class": EVIDENCE_CLASS,
        "verdicts": {
            "run_id": run_id,
            "model_id": rows[0]["model_id"] if rows else None,
            "model_revision": rows[0]["model_revision"] if rows else None,
            "config_version": rows[0]["config_version"] if rows else None,
            "findings": findings,
            "summary": summary,
        },
        "maturity": MATURITY,
        "blockers": [],
        "recorded_at": recorded_at,
    }


def validate_with_repo_validator(evidence_path: Path) -> dict:
    result = subprocess.run(
        ["node", str(VALIDATOR_SCRIPT), str(SCHEMA_PATH), str(evidence_path)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    try:
        outcome = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise EvidenceError(
            f"validator itself failed (exit {result.returncode}): {result.stderr[:400]}"
        )
    if not outcome.get("valid"):
        raise SchemaRejected(outcome.get("errors", []))
    return outcome


@dataclass
class WriteResult:
    path: Path
    written: bool


def write_evidence_atomic(evidence: dict, out_dir: Path, filename: str) -> WriteResult:
    payload = json.dumps(evidence, indent=2, sort_keys=True) + "\n"
    guard_no_secrets(payload)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / filename
    if target.exists():
        if target.read_text() == payload:
            return WriteResult(path=target, written=False)
        raise DuplicateEvidenceError(
            f"evidence file already exists with different content: {target}"
        )
    fd, tmp_name = tempfile.mkstemp(dir=out_dir, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(payload)
        os.replace(tmp_name, target)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise
    return WriteResult(path=target, written=True)


def export_run(*, ledger_rows: list[dict], adapter: str, run_id: str, recorded_at: str,
               out_dir: Path = EVIDENCE_DIR, validate: bool = True) -> WriteResult:
    if not ledger_rows:
        raise EvidenceError("no ledger rows to export")
    evidence = build_evidence(
        commit_sha=repo_commit_sha(), adapter=adapter, run_id=run_id,
        rows=ledger_rows, recorded_at=recorded_at,
    )
    filename = f"{evidence['commit_sha'][:8]}-judge-{adapter}-{run_id}.json"
    result = write_evidence_atomic(evidence, out_dir, filename)
    if validate and result.written:
        validate_with_repo_validator(result.path)
    return result


if __name__ == "__main__":
    import argparse
    from datetime import datetime, timezone
    from ledger import Ledger

    parser = argparse.ArgumentParser(description="Export ledger judge signals to formal evidence JSON.")
    parser.add_argument("--task-id", required=True, help="Task ID (e.g., JUDGE-SWITCH-SMOKE-01)")
    parser.add_argument("--run-id", default=None, help="Specific run_id (defaults to latest run for task)")
    parser.add_argument("--out-dir", type=Path, default=EVIDENCE_DIR, help="Output directory")
    args = parser.parse_args()

    ledger = Ledger()
    try:
        rows = ledger.judge_dicts_for_export(run_id=args.run_id, task_id=args.task_id)
        if not rows:
            raise SystemExit(f"ERROR: no ledger rows found for task_id={args.task_id!r}")
        target_run_id = args.run_id or rows[-1]["run_id"]
        run_rows = [r for r in rows if r["run_id"] == target_run_id]
        adapters = sorted({r["adapter"] for r in run_rows})
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

        for adapter in adapters:
            adapter_rows = [r for r in run_rows if r["adapter"] == adapter]
            res = export_run(
                ledger_rows=adapter_rows,
                adapter=adapter,
                run_id=target_run_id,
                recorded_at=now_iso,
                out_dir=args.out_dir,
                validate=True,
            )
            print(json.dumps({"adapter": adapter, "path": str(res.path), "written": res.written, "valid": True}))
    finally:
        ledger.close()
