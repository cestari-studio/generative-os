# Migration authorization package — pending migrations (staged, conditional, REVISED)

**Date:** 2026-10-26 (revised after owner reviews #1 and #2) · **Certified SHAs:** `4a9ea5c378c8e73c466ec7a58fad17d9d0785dc7` (CI green) and `b9d424f` (CI green, Stage-1 scope correction + this chronology reconciliation — see the commit history; this package's checksums are reconciled to the current checkout)
**Remote state:** Supabase `ldjfjmihdvdmltrptngf` — **24 migrations applied, last `20261025142026`. The pending migrations below are NOT applied. No remote change has been made.**

This package is the owner's decision record for **staged, conditional authorization** — NOT a batch apply, NOT an automatic application. Authorization is requested **per stage**; the remote state is verified **read-only after each authorized stage** before the next is proposed.

> **REVISED per owner review (2026-10-26):** two corrections were required before Stage 1 could represent an effective risk reduction without introducing migration-history inconsistencies.
>
> **(1) Stage-1 security scope corrected.** The original package revoked only `anon`/`PUBLIC` from `create_or_update_corporate_tenant`, which left the **authenticated-takeover** vector open (the exact attack `provision_corporate_tenant` prevents). A new migration `20261026210000_legacy_corporate_tenant_restrict.sql` now revokes `PUBLIC`/`anon`/`authenticated`/`service_role` from the legacy RPC — no role retains EXECUTE (consumer inventory: zero runtime consumers; full drop remains a separate owner decision). Acceptance criteria C1–C5 are enforced by `supabase/tests/legacy_corporate_tenant_restrict.sql`.
>
> **(2) Explicit chronological application order + partition.** Across three owner reviews the ordering was corrected to a **single strictly-chronological sequence across all 11 migrations**, partitioned into two contiguous stages: **Stage 1 = `120000…160000`**, **Stage 2 = `170000…210000`**. Stage boundaries are pauses for re-authorization + read-only verification, never reordering. The earlier partition that ended Stage 1 at `210000` was self-contradictory (it would have run `210000` before `170000–200000`) and is corrected here — no migration renamed or silently reordered. §"Application order" below specifies the per-migration ledger conferral, the stop-procedure, and the read-only post-apply verification. Approval-by-stage is a **risk grouping**; the **operational application is one chronological sequence**. No out-of-order exception, no generic `db push`.

---

## Gate 4 — final validation (CLOSED)

- Exact green-CI SHA: `4a9ea5c378c8e73c466ec7a58fad17d9d0785dc7` (`completed/success`).
- Tree is clean at that SHA (only intentionally-preserved untracked reference docs, never committed).
- The migration manifest below (names, order, checksums) matches the tree at `4a9ea5c` exactly. **Any later change to these files invalidates the checksums and requires its own CI + a regenerated manifest.**

---

## Gate 2 — migration integrity (CLOSED, validated)

The 10 pending migrations, in application order, with SHA-256 checksums at `4a9ea5c`. Dependencies: each stage depends on the stages above it **and** on the already-applied remote base (≤ `20261025142026`). The grant-revocation migrations (130000, 130100, 160000) additionally depend on functions created by the already-applied remote migrations (`20261022053203` billing, `20261018225420` onboarding, `20261017231645` settings) — they do NOT create those functions, only tighten their grants.

| #   | Migration                                            | SHA-256 (first 16) | Creates / changes                                                                                                                                                                             | Depends on                                   |
| --- | ---------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `20261026120000_journey_ledger_onboarding_runs`      | `f73ba74d2c031e44` | `onboarding_runs`, `onboarding_step_states`, `onboarding_journey_definitions`, `resolve_onboarding_readiness`                                                                                 | remote base                                  |
| 2   | `20261026130000_pagbank_rpc_service_role_only`       | `ce5d3899887998c7` | revoke PUBLIC/anon from `claim_pagbank_order`, `attach_psp_idempotency`                                                                                                                       | `20261022053203` (applied)                   |
| 3   | `20261026130100_rpc_grants_remove_anon_excess`       | `99a6fc44746a1296` | revoke anon from `save_onboarding_progress`, `create_or_update_corporate_tenant`, `resolve_effective_settings`                                                                                | `20261018225420`, `20261017231645` (applied) |
| 4   | `20261026140000_provision_corporate_tenant_safe`     | `2cd80a47adc6fe47` | `provision_corporate_tenant` (takeover-safe)                                                                                                                                                  | remote base                                  |
| 5   | `20261026150000_onboarding_actor_subject_delegation` | `06a1b2709d8ee1dc` | `completed_by`/`completion_type`, `onboarding_delegations`, `app_private.can_complete_step`, composite idempotency, attribution trigger                                                       | #1                                           |
| 6   | `20261026160000_helper_rpc_anon_revocation`          | `b43ad2e835c1cf2d` | revoke anon from 11 helper/mutating functions                                                                                                                                                 | `20261017231645` (applied)                   |
| 7   | `20261026170000_readiness_blocked_decision`          | `f2b9373316b9bd66` | `blocked` decision + `onboarding.tenant` v1.0.0 seed                                                                                                                                          | #1                                           |
| 8   | `20261026180000_red_team_p1_fixes`                   | `eb6fa138c8a3f94a` | `subject_step_keys`, run-field guard, grantor trigger                                                                                                                                         | #1, #5, #7                                   |
| 9   | `20261026190000_readiness_org_scoping`               | `aa3ce62e43aafdeb` | org-scoped readiness (merged body), `scope` column                                                                                                                                            | #1, #5, #7, #8                               |
| 10  | `20261026200000_p2_time_state_integrity`             | `59b97718c8b1eb47` | `completed_at` server-control, delegation sweep, `can_complete_step` (clock_timestamp)                                                                                                        | #1, #5, #7, #8, #9                           |
| 11  | `20261026210000_legacy_corporate_tenant_restrict`    | `94f88bdc52521815` | **revoke PUBLIC/anon/authenticated/service_role from legacy `create_or_update_corporate_tenant`** (takeover closed at grant layer); re-assert `provision_corporate_tenant` authenticated-only | #3, #4                                       |

**Test artifacts (checksums):** `supabase/tests/legacy_corporate_tenant_restrict.sql` = `a04de8a3cd290a22`; `scripts/test-legacy-corporate-restrict-sql.sh` = `464a3f6c4fd11cfe`; `supabase/tests/_prereq_rpc_grants.sql` = `0e04e706b4614623` (adds the `provision_corporate_tenant` successor stub).

**Validation executed (disposable PostgreSQL 17.11, `authenticated`/`service_role`, RLS enforced):** all 12 SQL suites green — journey-ledger, pagbank-grants, rpc-grants, provision-safe (8/8), provision-adversarial (27/27), onboarding-delegation (22/22), readiness-blocked (10/10), readiness two-session race, red-team-p1 (11/11), org-scoping (13/13), p2-time-state, **legacy-corporate-restrict (C1–C5)**. Each suite runs the migration against its own fixture schema mirroring the remote shape, with happy + negative paths. **Chronology probe:** the Stage-1 tenancy chain (`120000→140000→150000`) followed by the grant-revocations (`130000→130100→160000→210000`) applies cleanly in sequence, and `210000` after `140000` produces the target grants (legacy `authenticated=f, service_role=f`; `provision_corporate_tenant authenticated=t`). **Note on faithful-reproduction scope:** a raw "apply all 34 files to a bare DB" run fails on _platform_ fixtures the migrations legitimately assume (real `auth.users`, `supabase_realtime` publication, extension bootstrap, and the already-applied PagBank/settings functions the grant-revocations target) — those are provided by the Supabase platform / earlier applied migrations, not by the pending migrations. The authoritative gate is the per-suite harnesses above, each reproducing its migration against the remote-mirror fixture. Idempotency: the per-suite harnesses re-create the DB each run and re-apply cleanly; `resolve_onboarding_readiness` was verified idempotent across the 190000/200000 merge (wrong-order application is safe).

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

| Item                                           | Class                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Decision needed                                                                                                                                   |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy RPC `create_or_update_corporate_tenant` | **Deprecation strategy** | **0 runtime consumers** (TenantContext/FullPage/Tearsheet all on `provision_corporate_tenant`), but the RPC is still **invocable** (`anon_exec=true`, `auth_exec=true` live). Existence of the successor ≠ the legacy surface is closed. **Stage 1** removes only its anon/PUBLIC grant (via `130100`); the **full restriction lands in Stage 2** via `20261026210000` (revokes PUBLIC/anon/authenticated/service_role — no role retains it; C1–C5 enforced). | The remaining decision is **full drop** (removal of the function) — separate, after a confirmation window post-Stage-2. NOT part of either stage. |
| P2 residual (auditor)                          | hardening                | 2 remaining P2 items from `docs/red-team-audit-org-scoping-p2-cycle.md` beyond F1 (fixed).                                                                                                                                                                                                                                                                                                                                                                    | Review the audit report; decide whether to schedule or accept. Not blockers to the security stages.                                               |

**Live exposure baseline (verified 2026-10-26)** — 14 functions currently `anon_exec=true` that the pending migrations revoke: `create_or_update_corporate_tenant`, `save_onboarding_progress`, `resolve_effective_settings`, `create_workspace`, `mark_notification_read`, `switch_active_context`, `set_updated_at`, `enforce_scoped_setting_lock`, `jsonb_cascade_merge`, `to_schema_org_jsonld`, `enforce_surface_template_allowlist`, `enforce_surface_revision_publication`, `enforce_operation_binding_evidence`, `enforce_setting_map_none_has_no_terms`. (`match_knowledge_chunks` stays public-by-design, allowlisted.) This is the surface the security stages close.

---

## Gate 5 — staged authorization, application order & verification (OWNER APPROVAL PER STAGE)

**Approval-by-stage is a risk grouping; the operational application is STRICTLY chronological** (per the Gate-2 "Order" column), within and across stages. Supabase migrations are a sequence — a later file may depend on an earlier one. We do NOT apply out of order, and we do NOT use a generic `db push` to blur the distinction.

### Application order & ledger procedure (applies to every stage)

1. **Confirm the remote ledger baseline:** read the applied versions; the last applied must be `20261025142026` and none of the pending versions may be present. (Verified 2026-10-26: 24 applied, all pending absent.)
2. **Apply the stage's migrations ONE AT A TIME, in chronological version order**, each via the normal forward-only mechanism (`supabase migration up` / the versioned apply path), never a batch out-of-order push.
3. **After each single migration, confer registration:** read the migration ledger and confirm that exact version is recorded, and run that migration's post-apply checks (below) read-only **before** applying the next.
4. **Stop-procedure (mandatory):** if any of the following is found, STOP the stage immediately and do NOT proceed automatically — report and await owner direction:
   - an unexpected grant (e.g. a function still `anon`/`authenticated`-executable that the migration should have revoked, or an unexpected new grant);
   - a missing dependency (a function/table/column the migration expects but the remote lacks);
   - a divergence in the migration ledger (a version recorded that was not applied in order, a missing version, or a checksum/name mismatch vs this manifest);
   - any migration that fails to apply.
5. **No result transfer across SHAs:** the verification below is valid only for the exact SHA whose checksums are recorded here. Any change re-generates the manifest and requires its own CI.

### The single chronological sequence

All 11 migrations apply in this exact order (chronological = dependency = application order). Stage boundaries are **pauses for owner re-authorization and read-only verification** — they never reorder. The stage partition respects the sequence: each stage is a contiguous slice of the chronological list.

```
120000 → 130000 → 130100 → 140000 → 150000 → 160000 → 170000 → 180000 → 190000 → 200000 → 210000
└────────────── Stage 1 (6 migrations) ──────────────┘└────────── Stage 2 (5 migrations) ──────────┘
```

> **Partition correction (owner review #3):** a prior revision ended Stage 1 at `210000` while Stage 2 held `170000–200000`, which contradicted the declared chronological rule (applying the stages in order would have run `210000` before `170000–200000`). `210000`'s dependency on `140000` does NOT require it to precede the intermediate migrations — only that `140000` (and `130100`) be applied first, which they are. `210000` is chronologically last, so it now ends **Stage 2**. Stage 1 = `120000…160000`; Stage 2 = `170000…210000`. No migration was renamed or silently reordered.

### Stage 1 — tenancy foundation + critical security grant-revocations (6 migrations)

Apply in order: `120000` → `130000` → `130100` → `140000` → `150000` → `160000`.

This closes the bulk of the live exposure and lays the tenancy foundation. `140000` creates `provision_corporate_tenant` (the authorized path the C3/C5 criteria need). `120000` (chronologically first, no dependency on any later file) opens the sequence so there is no out-of-order gap and the ledger stays consistent.

- `20261026120000_journey_ledger_onboarding_runs` (readiness ledger + `resolve_onboarding_readiness`)
- `20261026130000_pagbank_rpc_service_role_only` (PagBank RPCs → service_role only)
- `20261026130100_rpc_grants_remove_anon_excess` (3 RPCs → remove anon, incl. legacy create_or_update_corporate_tenant anon)
- `20261026140000_provision_corporate_tenant_safe` (**`provision_corporate_tenant`** — the authorized path)
- `20261026150000_onboarding_actor_subject_delegation` (actor/subject, delegation)
- `20261026160000_helper_rpc_anon_revocation` (11 helper/mutating functions → remove anon)

**Per-migration conferral (read-only, after each single migration):** the version appears in the ledger in the correct position; the migration's specific effect took place; no error, no unexpected grant, no missing dependency. Stop on any deviation (see §4 above).

**Stage-1 post-apply verification (Coordinator runs, READ-ONLY, before proposing Stage 2):**

- Ledger: exactly the 6 new versions present, in chronological order, none missing, none extra; the last-applied is `20261026160000`.
- For each of the 14 baseline-exposed functions, assert `anon_exec=false` (and `authenticated` retained ONLY where the browser is the legitimate consumer: `save_onboarding_progress`, `create_workspace`, `mark_notification_read`, `switch_active_context`; `provision_corporate_tenant`).
- PagBank RPCs `claim_pagbank_order`/`attach_psp_idempotency`: `authenticated=false, anon=false, service_role=true`.
- Safe provisioning: `provision_corporate_tenant` present with `authenticated=true, anon=false`; a fresh provision succeeds; a non-admin identifier conflict → 42501 (no promotion, no ownership transfer, org data unchanged).
- Readiness foundation: `onboarding_runs`/`onboarding_step_states`/`onboarding_delegations` exist with RLS enabled; `resolve_onboarding_readiness` present.
- Note: the legacy `create_or_update_corporate_tenant` is still `authenticated`-executable after Stage 1 (only its anon/PUBLIC grant was removed by `130100`). **Its full restriction (C1–C5) lands in Stage 2 via `210000`** — flagged here so Stage 1 is not misread as closing the authenticated-takeover path.

### Stage 2 — readiness decisions + hardening + legacy-RPC restriction (5 migrations, depends on Stage 1)

Apply in order: `170000` → `180000` → `190000` → `200000` → `210000`.

- `20261026170000_readiness_blocked_decision` (blocked + `onboarding.tenant` seed)
- `20261026180000_red_team_p1_fixes` (subject_step_keys, guards)
- `20261026190000_readiness_org_scoping` (org-scoped readiness)
- `20261026200000_p2_time_state_integrity` (completed_at, sweep, clock_timestamp)
- `20261026210000_legacy_corporate_tenant_restrict` (**legacy `create_or_update_corporate_tenant` → revoke PUBLIC/anon/authenticated/service_role**; re-assert `provision_corporate_tenant` authenticated-only)

**Post-apply verification (READ-ONLY):**

- `resolve_onboarding_readiness` is the org-scoped merged body (org filter + determinism + clock_timestamp); `onboarding.tenant` v1.0.0 seeded `published` with `scope='organizational'` (per Gate-1 decision); `subject_step_keys` column present; cross-org readiness probe (completed org-A run, evaluate in org-B context) → NOT allow; full decision matrix (allow/require_steps/blocked/unavailable) per context.
- **C1–C5 against the live remote:** legacy `create_or_update_corporate_tenant` → `anon_exec=false`, `auth_exec=false`, `service_role_exec=false`, no PUBLIC EXECUTE (empty-grantee aclitem absent); `provision_corporate_tenant` → `authenticated=true`, `anon=false`, no PUBLIC.
- Takeover negative test (live): an authenticated non-admin invoking the legacy RPC → 42501; org A's data/legal-rep/memberships/context unchanged afterward.
- Ledger: exactly the 5 new versions present, in chronological order; the last-applied is `20261026210000`; the full 11-migration sequence is now contiguous with no gap.

**Stage-2 readiness semantics gate (owner condition):** before accepting the delegated-completion contract (`can_complete_step`, `subject_step_keys`, org-scoped readiness), the **actor/subject semantics** that govern who may complete a step and who a decision certifies are documented in `docs/adr-tenancy-and-journey-persistence.md` §2.7–§2.13 (self_service vs delegated modes, `completed_by`/`completion_type` server-derivation, the org-scope contract, and the P2 hardening decisions). Stage 2's verification confirms the _deployed_ behavior matches that documented semantics — server-authoritative decision, valid published definition, fail-closed on any failure. The delegation _policy content_ (which steps are delegable per wizard, ADR P2) and the sensitive-declaration set (ADR P3) remain owner decisions, flagged in Gate 3 — they do not block Stage 2's deployment of the mechanism, but they gate declaring any specific delegated wizard "complete".

---

## What is NOT authorized by this package

- Any merge of PR #7 (separate human review).
- Any production promotion (separate gate).
- Any drop/revoke of `create_or_update_corporate_tenant` beyond the Stage-1 restriction (PUBLIC/anon/authenticated/service_role EXECUTE removal via `20261026210000`) — the full drop is the separate Gate-3 decision above.
- Preview E2E (BLockered separately: needs authorized session/secrets + `app.cestari.studio` for passkeys).

## Execution protocol (per authorized migration — mandatory)

For EACH authorized migration, in chronological order:

1. **Confirm the target project** is `ldjfjmihdvdmltrptngf` (never another).
2. **Verify the expected prior ledger state** — the last-applied version matches the manifest's expected predecessor (for Stage 1's first migration: `20261025142026`; for each subsequent: the prior migration in the sequence).
3. **Verify the migration checksum and dependencies** against this package (SHA-256 above; in-set dependency edges above).
4. **Apply ONLY the next migration in chronological order** — one at a time, never a batch.
5. **Verify postconditions:** grants, RLS, the function/table/column it creates or alters, and the migration-ledger entry — all read-only.
6. **STOP on any** error, missing dependency, unexpected privilege/grant, checksum discrepancy, or ledger divergence. Do NOT skip ahead or continue to the next migration; report and await owner direction.

**After Stage 1:** re-run the relevant negative tests as non-superuser roles — **including the test proving the legacy `create_or_update_corporate_tenant` is STILL `authenticated`-executable** (Stage 1 only removed its anon/PUBLIC grant). **After Stage 2:** verify NO unauthorized role retains EXECUTE on the legacy RPC, and the safe replacement (`provision_corporate_tenant`) still works for the intended caller.

---

## Residual-risk tracking — legacy `create_or_update_corporate_tenant` (open until Stage 2)

**`BLK-provisioning-takeover` is OPEN, not closed.** The safe successor `provision_corporate_tenant` (Stage 1, `140000`) provides a safe provisioning _path_, but it does NOT deactivate the vulnerable legacy RPC. Until Stage 2's `210000` is applied **and** its negative privilege tests pass, the following hold and are tracked explicitly:

- The legacy RPC remains **executable by `authenticated`** — the authenticated-takeover defect (DEFECT B in `docs/release-evidence-ledger.md`) is **not remediated**.
- The application MUST NOT rely on the legacy RPC as a safe provisioning path (no consumer does — verified — but the RPC remains invocable by any authenticated session).
- The takeover remediation is **complete only when** `210000` is applied AND the C1–C5 negative tests pass against the live remote.

**If Stage 1 is authorized independently of Stage 2**, this residual exposure is **explicitly accepted and tracked** as `BLK-provisioning-takeover` (scope: authenticated-takeover via the legacy RPC) until Stage 2 is verified. **Coordinator recommendation (safer operational plan):** prevalidate BOTH stages and run a controlled, sequential rollout — Stage 1 then Stage 2 in one supervised sequence, stopping immediately at the first failed verification — so the window in which the legacy RPC is still `authenticated`-executable is minimized. This is a recommendation, not an authorization; the staging is the owner's call.

---

**Coordinator status:** Gates 1 (framed, needs your word), 2 (closed), 4 (closed) are ready. Gates 3 and 5 are your explicit decisions. **ADR P2/P3 (and the certified-principal half of P4) are now DECIDED by the owner (2026-10-26, ADR §6.1): `onboarding.tenant` = `self_service`; `subject_step_keys = {identity, organization}` (encoded in `20261026180000`, §6.2 reconciliation); P4 = `policy-per-step`.** `BLK-tenancy-adr-p2-p3` is unblockable on your confirmation. No remote action has been or will be taken without your per-stage approval.
