# orchestration/ — genOS blueprint-v3 execution controller (directive tooling)

**What this is:** the Python Execution Controller for the Master Directive execution
(blueprint v3, `docs/ui-rebuild/generative-os-ai-execution-blueprint-v3.md`).
This is **execution tooling**, not product runtime code. Nothing here ships with the app.

**Decision (owner, 2026-10-27):** option C (hybrid) — controller code and contracts live
in this repo under version control; heavy runtime artifacts (models, GGUF, venvs,
llama.cpp) stay in `~/.local/share/genos-ai/` (documented local cache); `/genos` stays
read-only normative reference.

## Contracts consumed (not duplicated)

- **Task envelope:** `/genos/docs/agents/AGENT_TASK_ENVELOPE.schema.json`
  (`$id: https://genos.local/schemas/agent-task-envelope.v0.9.1.json`) — field semantics
  preserved in `task_envelope.py`. **Recorded divergence:** the canonical schema pins
  `source.repository` to `cestari-studio/genOS`; this controller executes for
  `cestari-studio/generative-os`. Same semantics, different repository id — recorded
  explicitly, never silently validated as the canonical envelope.
- **Evidence:** `specs/schemas/evidence.schema.json` + `artifacts/evidence/` — judge
  exports follow that shape (`evidence_class: validation.local`).
- **Judge role:** `/genos` OpenCode setup (`genos-acceptance-judge`) — a judge verdict
  is an evidence input, **never** authorization, release gate, or `PASS` for the task.

## Runtime interface (condition 4 of the decision)

Existing launchers (`genos-mellea`, `genos-lmstudio-profile`) drive LM Studio models
via Mellea and cannot drive Granite Switch adapters over Ollama `raw` mode. The minimal
explicit adapter is therefore a direct, loopback-only client in `judge_signal.py`
(no new runtime layers, no duplication of existing launchers).

## Layout

- `task_envelope.py` — task envelope semantics (mirror of canonical fields)
- `ledger.py` — SQLite ledger (gitignored), idempotency + run/task/judge rows
- `judge_signal.py` — Granite Switch judge adapters (fail-closed) + ledger writer
- `test_judge_signal.py` — deterministic tests (no live model calls)

State stays `EXPERIMENTAL` for Granite Switch until the v3 §14.10 benchmark passes
with ground-truth fixtures, per-adapter FP/FN, and latency p50/p95.
