"""Deterministic tests for evidence_export — formal schema conformance via repo Ajv.

Run: /path/to/python test_evidence_export.py  (stdlib unittest; node must be on PATH)
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import evidence_export
from evidence_export import (
    DuplicateEvidenceError,
    EvidenceError,
    SchemaRejected,
    SecretDetected,
)

ROWS = [
    {
        "fixture_id": "T4-positive",
        "adapter": "requirement-check",
        "verdict": "PASS",
        "score_value": "yes",
        "latency_ms": 100,
        "eval_count": 7,
        "error_class": None,
        "model_id": "granite-switch-4.1-3b-preview",
        "model_revision": "9e52f1c054d05e35e8032a338672a9bba4ed999c",
        "config_version": "ollama-raw/num_ctx=8192/temp=0/v1",
    },
    {
        "fixture_id": "T4-negative",
        "adapter": "requirement-check",
        "verdict": "FAIL",
        "score_value": "no",
        "latency_ms": 90,
        "eval_count": 7,
        "error_class": None,
        "model_id": "granite-switch-4.1-3b-preview",
        "model_revision": "9e52f1c054d05e35e8032a338672a9bba4ed999c",
        "config_version": "ollama-raw/num_ctx=8192/temp=0/v1",
    },
]


def valid_evidence() -> dict:
    return evidence_export.build_evidence(
        commit_sha="a" * 40,
        adapter="requirement-check",
        run_id="run-test",
        rows=ROWS,
        recorded_at="2026-10-27T00:00:00.000Z",
    )


class BuildTests(unittest.TestCase):
    def test_only_schema_fields_present(self):
        evidence = valid_evidence()
        schema = json.loads((evidence_export.REPO_ROOT / "specs/schemas/evidence.schema.json").read_text())
        allowed = set(schema["properties"].keys())
        self.assertEqual(set(evidence.keys()) - allowed, set())
        for required in schema["required"]:
            self.assertIn(required, evidence)

    def test_spec_key_pattern_and_summary(self):
        evidence = valid_evidence()
        self.assertRegex(evidence["spec_key"], r"^[a-z]+\.[a-z0-9_.-]+$")
        self.assertEqual(evidence["verdicts"]["summary"], {"PASS": 1, "FAIL": 1, "UNCERTAIN": 0, "ERROR": 0})
        self.assertEqual(evidence["maturity"], "NORMATIVE_ONLY")
        self.assertEqual(evidence["evidence_class"], "validation.local")


class SecretGuardTests(unittest.TestCase):
    def test_planted_secret_refused(self):
        for payload in [
            '{"token": "sk-lm-abc12345"}',
            '{"header": "Bearer xyz"}',
            '{"auth": "oauth-abcdef"}',
            '{"k": "bzl_abc12345"}',
            '{"k": "ghp_abcdefghij"}',
            '{"k": "hf_abcdefghij"}',
            '{"Authorization": "x"}',
            '{"api_key": "xyz"}',
        ]:
            with self.assertRaises(SecretDetected, msg=payload):
                evidence_export.guard_no_secrets(payload)

    def test_clean_payload_passes(self):
        evidence_export.guard_no_secrets(json.dumps(valid_evidence()))


class WriteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out_dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_atomic_write_then_identical_is_noop(self):
        first = evidence_export.write_evidence_atomic(valid_evidence(), self.out_dir, "e.json")
        second = evidence_export.write_evidence_atomic(valid_evidence(), self.out_dir, "e.json")
        self.assertTrue(first.written)
        self.assertFalse(second.written)
        self.assertEqual(first.path, second.path)

    def test_conflicting_duplicate_raises(self):
        evidence_export.write_evidence_atomic(valid_evidence(), self.out_dir, "e.json")
        changed = valid_evidence()
        changed["recorded_at"] = "2026-10-27T01:00:00.000Z"
        with self.assertRaises(DuplicateEvidenceError):
            evidence_export.write_evidence_atomic(changed, self.out_dir, "e.json")


class FormalValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out_dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, evidence: dict, name: str = "e.json") -> Path:
        path = self.out_dir / name
        path.write_text(json.dumps(evidence, indent=2))
        return path

    def test_valid_evidence_passes_repo_validator(self):
        outcome = evidence_export.validate_with_repo_validator(self._write(valid_evidence()))
        self.assertTrue(outcome["valid"])

    def test_missing_required_field_rejected(self):
        evidence = valid_evidence()
        del evidence["commit_sha"]
        with self.assertRaises(SchemaRejected):
            evidence_export.validate_with_repo_validator(self._write(evidence))

    def test_invalid_evidence_class_rejected(self):
        evidence = valid_evidence()
        evidence["evidence_class"] = "smoke.passed"
        with self.assertRaises(SchemaRejected):
            evidence_export.validate_with_repo_validator(self._write(evidence))

    def test_invalid_maturity_rejected(self):
        evidence = valid_evidence()
        evidence["maturity"] = "CERTIFIED"
        with self.assertRaises(SchemaRejected):
            evidence_export.validate_with_repo_validator(self._write(evidence))

    def test_bad_commit_sha_pattern_rejected(self):
        evidence = valid_evidence()
        evidence["commit_sha"] = "not-a-sha"
        with self.assertRaises(SchemaRejected):
            evidence_export.validate_with_repo_validator(self._write(evidence))

    def test_extra_property_rejected(self):
        evidence = valid_evidence()
        evidence["invented_field"] = True
        with self.assertRaises(SchemaRejected):
            evidence_export.validate_with_repo_validator(self._write(evidence))


class ExportRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out_dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_rows_refused(self):
        with self.assertRaises(EvidenceError):
            evidence_export.export_run(
                ledger_rows=[], adapter="requirement-check", run_id="r",
                recorded_at="2026-10-27T00:00:00.000Z", out_dir=self.out_dir, validate=False,
            )

    def test_export_writes_and_formally_validates(self):
        result = evidence_export.export_run(
            ledger_rows=ROWS, adapter="requirement-check", run_id="run-test",
            recorded_at="2026-10-27T00:00:00.000Z", out_dir=self.out_dir, validate=True,
        )
        self.assertTrue(result.written)
        self.assertTrue(result.path.exists())
        # second identical export is a no-op, not an error
        again = evidence_export.export_run(
            ledger_rows=ROWS, adapter="requirement-check", run_id="run-test",
            recorded_at="2026-10-27T00:00:00.000Z", out_dir=self.out_dir, validate=True,
        )
        self.assertFalse(again.written)


if __name__ == "__main__":
    unittest.main(verbosity=2)
