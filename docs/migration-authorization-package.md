# Migration authorization package — 10 pending migrations (staged, conditional)

**Date:** 2026-10-26 · **Certified SHA:** `4a9ea5c378c8e73c466ec7a58fad17d9d0785dc7` (CI green)
**Remote state:** Supabase `ldjfjmihdvdmltrptngf` — **24 migrations applied, last `20261025142026`. All 10 below are NOT applied. No remote change has been made.**

This package is the owner's decision record for **staged, conditional authorization** — NOT a batch apply, NOT an automatic application. Each stage lists its migrations, the exact post-apply verification, and its dependency. Authorization is requested **per stage**; the remote state is verified **after each authorized stage** before the next is proposed.

---

## Gate 4 — final validation (CLOSED)

- Exact green-CI SHA: `4a9ea5c378c8e73c466ec7a58fad17d9d0785dc7` (`completed/success`).
- Tree is clean at that SHA (only intentionally-preserved untracked reference docs, never committed).
- The migration manifest below (names, order, checksums) matches the tree at `4a9ea5c` exactly. **Any later change to these files invalidates the checksums and requires its own CI + a regenerated manifest.**

---

## Gate 2 — migration integrity (CLOSED, validated)

The 10 pending migrations, in application order, with SHA-256 checksums at `4a9ea5c`. Dependencies: each stage depends on the stages above it **and** on the already-applied remote base (≤ `20261025142026`). The grant-revocation migrations (130000, 130100, 160000) additionally depend on functions created by the already-applied remote migrations (`20261022053203` billing, `20261018225420` onboarding, `20261017231645` settings) — they do NOT create those functions, only tighten their grants.

| #   | Migration                                            | SHA-256 (first 16) | Creates / changes                                                                                                                       | Depends on                                   |
| --- | ---------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `20261026120000_journey_ledger_onboarding_runs`      | `f73ba74d2c031e44` | `onboarding_runs`, `onboarding_step_states`, `onboarding_journey_definitions`, `resolve_onboarding_readiness`                           | remote base                                  |
| 2   | `20261026130000_pagbank_rpc_service_role_only`       | `ce5d3899887998c7` | revoke PUBLIC/anon from `claim_pagbank_order`, `attach_psp_idempotency`                                                                 | `20261022053203` (applied)                   |
| 3   | `20261026130100_rpc_grants_remove_anon_excess`       | `99a6fc44746a1296` | revoke anon from `save_onboarding_progress`, `create_or_update_corporate_tenant`, `resolve_effective_settings`                          | `20261018225420`, `20261017231645` (applied) |
| 4   | `20261026140000_provision_corporate_tenant_safe`     | `2cd80a47adc6fe47` | `provision_corporate_tenant` (takeover-safe)                                                                                            | remote base                                  |
| 5   | `20261026150000_onboarding_actor_subject_delegation` | `06a1b2709d8ee1dc` | `completed_by`/`completion_type`, `onboarding_delegations`, `app_private.can_complete_step`, composite idempotency, attribution trigger | #1                                           |
| 6   | `20261026160000_helper_rpc_anon_revocation`          | `b43ad2e835c1cf2d` | revoke anon from 11 helper/mutating functions                                                                                           | `20261017231645` (applied)                   |
| 7   | `20261026170000_readiness_blocked_decision`          | `f2b9373316b9bd66` | `blocked` decision + `onboarding.tenant` v1.0.0 seed                                                                                    | #1                                           |
| 8   | `20261026180000_red_team_p1_fixes`                   | `eb6fa138c8a3f94a` | `subject_step_keys`, run-field guard, grantor trigger                                                                                   | #1, #5, #7                                   |
| 9   | `20261026190000_readiness_org_scoping`               | `aa3ce62e43aafdeb` | org-scoped readiness (merged body), `scope` column                                                                                      | #1, #5, #7, #8                               |
| 10  | `20261026200000_p2_time_state_integrity`             | `59b97718c8b1eb47` | `completed_at` server-control, delegation sweep, `can_complete_step` (clock_timestamp)                                                  | #1, #5, #7, #8, #9                           |

**Validation executed (disposable PostgreSQL 17.11, `authenticated`/`service_role`, RLS enforced):** all 11 SQL suites green — journey-ledger, pagbank-grants, rpc-grants, provision-safe (8/8), provision-adversarial (27/27), onboarding-delegation (22/22), readiness-blocked (10/10), readiness two-session race, red-team-p1 (11/11), org-scoping (13/13), p2-time-state. Each suite runs the migration against its own fixture schema mirroring the remote shape, with happy + negative paths. **Note on faithful-reproduction scope:** a raw "apply all 34 files to a bare DB" run fails on _platform_ fixtures the migrations legitimately assume (real `auth.users`, `supabase_realtime` publication, extension bootstrap) — those are provided by the Supabase platform, not by migrations. The authoritative gate is the per-suite harnesses above, each reproducing its migration against the remote-mirror fixture. Idempotency: the per-suite harnesses re-create the DB each run and re-apply cleanly; `resolve_onboarding_readiness` was verified idempotent across the 190000/200000 merge (wrong-order application is safe).

---

## Gate 1 — onboarding scope decision (OWNER DECISION REQUIRED)

The readiness chain is not yet deployed, so the seeded `onboarding.tenant` v1.0.0 definition will take the column DEFAULT on apply. The default is **`scope='organizational'` (fail-closed)**: every user's readiness gate will require a valid org context (a run whose `target_organization_id` matches the caller's membership-validated active org). The independent auditor flagged: **if any journey is intended to be `personal`-scope (evaluated globally, no org context), the owner must set it explicitly via service_role** — the fail-closed default will not infer it.

**Decision needed (per journey, not inferred from `account_type`):**

| Journey (wizard_key)                  | Intended scope                          | Rationale                                                                                             |
| ------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `onboarding.tenant`                   | `organizational` (default) / `personal` | Tenant onboarding is inherently org-scoped — recommend keeping the `organizational` default. Confirm. |
| (any future personal-profile journey) | `personal`                              | Must be declared explicitly; none exists in the tree yet.                                             |

**Coordinator recommendation:** keep `onboarding.tenant` = `organizational` (matches the ADR §2.12 contract and the P1 cross-org fix). No journey currently requires `personal`. This is a one-word confirmation, but it is the owner's call, not mine.

---

## Gate 3 — residual risks (CLASSIFIED, not resolved)

Presented honestly as **open**, not resolved:

| Item                                           | Class                    | Status                                                                                                                                                                                                                                   | Decision needed                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy RPC `create_or_update_corporate_tenant` | **Deprecation strategy** | **0 runtime consumers** (TenantContext/FullPage/Tearsheet all on `provision_corporate_tenant`), but the RPC is still **invocable** (`anon_exec=true`, `auth_exec=true` live). Existence of the successor ≠ the legacy surface is closed. | Owner chooses: (a) revoke anon+authenticated (keep service_role for backfill), (b) drop entirely, (c) leave invocable with an observation window. Recommend (a) now, (b) after a confirmation window. This is **Stage 1** below. |
| P2 residual (auditor)                          | hardening                | 2 remaining P2 items from `docs/red-team-audit-org-scoping-p2-cycle.md` beyond F1 (fixed).                                                                                                                                               | Review the audit report; decide whether to schedule or accept. Not blockers to the security stages.                                                                                                                              |

**Live exposure baseline (verified 2026-10-26)** — 14 functions currently `anon_exec=true` that the pending migrations revoke: `create_or_update_corporate_tenant`, `save_onboarding_progress`, `resolve_effective_settings`, `create_workspace`, `mark_notification_read`, `switch_active_context`, `set_updated_at`, `enforce_scoped_setting_lock`, `jsonb_cascade_merge`, `to_schema_org_jsonld`, `enforce_surface_template_allowlist`, `enforce_surface_revision_publication`, `enforce_operation_binding_evidence`, `enforce_setting_map_none_has_no_terms`. (`match_knowledge_chunks` stays public-by-design, allowlisted.) This is the surface the security stages close.

---

## Gate 5 — staged authorization & post-apply verification (OWNER APPROVAL PER STAGE)

The 10 migrations grouped into 3 stages by dependency and risk. **Authorize per stage.** After each authorized stage is applied, the Coordinator verifies the remote state (grants, RLS, functions, migration ledger, functional behavior) before the next stage is proposed.

### Stage 1 — critical security grant-revocations (lowest risk, immediate exposure reduction)

- `20261026130000_pagbank_rpc_service_role_only` (PagBank RPCs → service_role only)
- `20261026130100_rpc_grants_remove_anon_excess` (3 RPCs: save_onboarding_progress, create_or_update_corporate_tenant, resolve_effective_settings → remove anon)
- `20261026160000_helper_rpc_anon_revocation` (11 helper/mutating functions → remove anon)

**Post-apply verification (Coordinator runs, read-only):** for each of the 14 baseline-exposed functions, assert `anon_exec=false` (and `authenticated` retained where the browser is the consumer: save_onboarding_progress, create_workspace, mark_notification_read, switch_active_context); assert PagBank RPCs are `authenticated=false, anon=false, service_role=true`; confirm the migration ledger shows the 3 new versions; spot-check the app (TenantContext switch_active_context, notifications) still works as authenticated.

### Stage 2 — safe provisioning + journey ledger + delegation (tenancy foundation)

- `20261026140000_provision_corporate_tenant_safe` (takeover-safe provisioning)
- `20261026120000_journey_ledger_onboarding_runs` (readiness ledger + RPC)
- `20261026150000_onboarding_actor_subject_delegation` (actor/subject, delegation)

**Post-apply verification:** `provision_corporate_tenant` present, `authenticated=true, anon=false`; takeover guard live (a non-admin identifier conflict → 42501); `onboarding_runs`/`onboarding_step_states`/`onboarding_delegations` exist with RLS enabled; `resolve_onboarding_readiness` present; ledger updated. Functional: a fresh provision succeeds; a non-member read of another org's run is denied.

### Stage 3 — readiness decisions + hardening (depends on Stage 2)

- `20261026170000_readiness_blocked_decision` (blocked + seed)
- `20261026180000_red_team_p1_fixes` (subject_step_keys, guards)
- `20261026190000_readiness_org_scoping` (org-scoped readiness)
- `20261026200000_p2_time_state_integrity` (completed_at, sweep, clock_timestamp)

**Post-apply verification:** `resolve_onboarding_readiness` is the org-scoped merged body (org filter + determinism + clock_timestamp); `onboarding.tenant` v1.0.0 seeded `published` with `scope='organizational'` (per Gate-1 decision); `subject_step_keys` column present; cross-org readiness probe (completed org-A run, evaluate in org-B context) → NOT allow; ledger updated. Functional: full readiness decision matrix (allow/require_steps/blocked/unavailable) per context.

---

## What is NOT authorized by this package

- Any merge of PR #7 (separate human review).
- Any production promotion (separate gate).
- Any drop/revoke of `create_or_update_corporate_tenant` beyond the Stage-1 anon removal — the fuller deprecation is the Gate-3 decision above.
- Preview E2E (BLockered separately: needs authorized session/secrets + `app.cestari.studio` for passkeys).

**Coordinator status:** Gates 1 (framed, needs your word), 2 (closed), 4 (closed) are ready. Gates 3 and 5 are your explicit decisions. No remote action has been or will be taken without your per-stage approval.
