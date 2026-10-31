"""SQLite ledger for the genOS execution controller (blueprint §9).

Local, gitignored, separate from the product database. No credentials, no secrets,
no PII, no private reasoning traces. Idempotency: a judge signal with the same
(task_id, input_hash, config_version) is deduplicated — the earlier row stands and
the duplicate attempt is reported, never silently double-recorded.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CONTROLLER_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = CONTROLLER_DIR / "ledger.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS task_envelopes (
    task_id TEXT NOT NULL,
    envelope_json TEXT NOT NULL,
    envelope_hash TEXT NOT NULL,
    canonical_divergences_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    stop_condition TEXT,
    created_ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (task_id, envelope_hash)
);

CREATE TABLE IF NOT EXISTS judge_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    run_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    config_version TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_revision TEXT NOT NULL,
    adapter TEXT NOT NULL,
    fixture_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('PASS','FAIL','UNCERTAIN','ERROR')),
    score_value TEXT,
    latency_ms INTEGER,
    eval_count INTEGER,
    raw_output TEXT,
    error_class TEXT,
    options_json TEXT NOT NULL,
    UNIQUE (task_id, input_hash, config_version)
);
"""


@dataclass
class DedupeResult:
    inserted: bool
    row_id: Optional[int]


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()


class Ledger:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH):
        self.db_path = str(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def record_envelope(
        self, task_id: str, envelope_json: str, divergences: list[str]
    ) -> DedupeResult:
        envelope_hash = sha256_text(envelope_json)
        existing = self.conn.execute(
            "SELECT rowid FROM task_envelopes WHERE task_id = ? AND envelope_hash = ?",
            (task_id, envelope_hash),
        ).fetchone()
        if existing:
            return DedupeResult(inserted=False, row_id=existing[0])
        cursor = self.conn.execute(
            """INSERT INTO task_envelopes (task_id, envelope_json, envelope_hash, canonical_divergences_json)
               VALUES (?,?,?,?)""",
            (task_id, envelope_json, envelope_hash, json.dumps(divergences)),
        )
        self.conn.commit()
        return DedupeResult(inserted=True, row_id=cursor.lastrowid)

    def set_task_state(self, task_id: str, status: str, stop_condition: Optional[str] = None) -> None:
        self.conn.execute(
            "UPDATE task_envelopes SET status = ?, stop_condition = ? WHERE task_id = ?",
            (status, stop_condition, task_id),
        )
        self.conn.commit()

    def record_judge_signal(
        self,
        *,
        run_id: str,
        task_id: str,
        config_version: str,
        model_id: str,
        model_revision: str,
        adapter: str,
        fixture_id: str,
        input_hash: str,
        verdict: str,
        score_value: Optional[str],
        latency_ms: Optional[int],
        eval_count: Optional[int],
        raw_output: Optional[str],
        error_class: Optional[str],
        options: dict,
    ) -> DedupeResult:
        existing = self.conn.execute(
            """SELECT id FROM judge_signals
               WHERE task_id = ? AND input_hash = ? AND config_version = ?""",
            (task_id, input_hash, config_version),
        ).fetchone()
        if existing:
            return DedupeResult(inserted=False, row_id=existing[0])
        cursor = self.conn.execute(
            """INSERT INTO judge_signals
               (run_id, task_id, config_version, model_id, model_revision, adapter, fixture_id,
                input_hash, verdict, score_value, latency_ms, eval_count, raw_output,
                error_class, options_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id, task_id, config_version, model_id, model_revision, adapter, fixture_id,
                input_hash, verdict, score_value, latency_ms, eval_count, raw_output,
                error_class, json.dumps(options, sort_keys=True),
            ),
        )
        self.conn.commit()
        return DedupeResult(inserted=True, row_id=cursor.lastrowid)

    def judge_rows(self, run_id: Optional[str] = None) -> list[tuple]:
        query = (
            "SELECT id, ts, run_id, task_id, adapter, fixture_id, verdict, score_value,"
            " latency_ms, eval_count, error_class FROM judge_signals"
        )
        params: tuple = ()
        if run_id:
            query += " WHERE run_id = ?"
            params = (run_id,)
        query += " ORDER BY id"
        return list(self.conn.execute(query, params))

    def judge_dicts_for_export(
        self, *, run_id: Optional[str] = None, task_id: Optional[str] = None, adapter: Optional[str] = None
    ) -> list[dict]:
        query = (
            "SELECT fixture_id, adapter, verdict, score_value, latency_ms, eval_count,"
            " error_class, model_id, model_revision, config_version, run_id, ts"
            " FROM judge_signals WHERE 1=1"
        )
        params: list = []
        if run_id:
            query += " AND run_id = ?"
            params.append(run_id)
        if task_id:
            query += " AND task_id = ?"
            params.append(task_id)
        if adapter:
            query += " AND adapter = ?"
            params.append(adapter)
        query += " ORDER BY id"
        cursor = self.conn.execute(query, tuple(params))
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
