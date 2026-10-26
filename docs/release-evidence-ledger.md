# Release evidence ledger — cycle 4 (2026-10-23)

## Readiness org-scoping (P1) + P2 hardening + ProtectedRoute fail-closed + independent audit (2026-10-26, owner directive)

Owner directive (2026-10-26): close P1 readiness org-scoping (max priority) + 5 P2 hardening in parallel; local work continues, remote auth stays separate; integration only counts when all results pass on the same SHA. 4 workers + independent auditor + Coordinator merge.

| Track                              | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Worker A** (P1 org-scoping)      | migration `20261026190000_readiness_org_scoping.sql` — readiness was NOT org-scoped (completed run in org A → allow in org B, REPRODUCED pre-fix). RPC now resolves active org SERVER-SIDE (`persons.active_organization_id` + `app_private.is_org_member`, NEVER a client arg), filters runs by `target_organization_id` for `scope='organizational'` (fail-closed default; NULL never wildcard), `scope='personal'` global. no-org→unavailable/org_context_missing; non-member→blocked/org_membership_required; >1 run→unavailable/ambiguous_runs; EXCEPTION→unavailable/resolution_error | **13/13** PG17 + before/after leak reproduction    |
| **Worker B** (P2 time/state)       | migration `20261026200000_p2_time_state_integrity.sql` — completed_at server-controlled (clock_timestamp(), immutable-while-completed, cleared-on-regression, runs.completed_at unreachable); expired-delegation corpse auto-swept + revalidated on use; delegation/run expiry + completed_at use clock_timestamp() (created_at/updated_at keep now()); deterministic `ORDER BY created_at DESC, id DESC` + ambiguity rejection                                                                                                                                                             | **22 blocks**                                      |
| **Worker C** (P2-5 ProtectedRoute) | ProtectedRoute now FAIL-CLOSED — children ONLY on ready+allow; loading/checking/unknown/blocked/unavailable/PGRST202/timeout/malformed/null → explicit non-authorized Carbon state; re-resolves on `activeOrganizationId` change                                                                                                                                                                                                                                                                                                                                                            | **18/18** tests (10 new negative)                  |
| **Worker D** (ADR + Spec)          | ADR §2.12 (org-scope contract, resolves audit P1-4) + §2.13 (P2 hardening decisions); specs operation.onboarding.resolve-readiness + policy.onboarding.readiness (org-scope); P1-P6 updated. G1 0 BLOCKED                                                                                                                                                                                                                                                                                                                                                                                   | ADR + specs                                        |
| **Coordinator MERGE**              | A+B both `CREATE OR REPLACE`d `resolve_onboarding_readiness` (naive last-writer-wins REVERTED org-scoping — Worker B verified empirically). Merged into ONE org-scoped body in `190000` (A's org-scope + B's determinism/ambiguity/clock_timestamp); `200000` no longer re-asserts. Added `_prereq_org_shapes.sql`; B's synthetic wizards declared `scope='personal'` to isolate the mechanism                                                                                                                                                                                              | BOTH suites green on merged chain (A 13/13, B all) |
| **Independent auditor**            | `docs/red-team-audit-org-scoping-p2-cycle.md` — **0 P0, 0 P1, 3 P2 + 1 owner-confirm**. Cross-org fix **could not be defeated** (mid-flight org swap, member-of-both, NULL-org wildcard, delegated bleed, ambiguity, version-filter all refused). Merge verified sound (org-scope + determinism + clock_timestamp present; wrong-order idempotent). completed_at/expired-delegation/ProtectedRoute hold                                                                                                                                                                                     | audit report                                       |
| **F1 fix** (Coordinator)           | bounded `RESOLUTION_TIMEOUT_MS` (15s) in the readiness adapter — a hanging RPC degrades to `unknown` (fail-closed), never an unbounded spinner. New fake-timer test                                                                                                                                                                                                                                                                                                                                                                                                                         | **33/33** readiness+ProtectedRoute                 |

**Owner-confirm flag (auditor):** the readiness chain (120000–200000) is NOT yet deployed (remote at `20261025142026`; onboarding tables don't exist remotely). On apply, the seeded `onboarding.tenant` takes the `organizational` DEFAULT → every user needs an org context. If any journey is intended `personal`-scope, the owner must set it via service_role (fail-closed default won't infer it). 2 remaining P2 hardening items documented in the audit report.

**Integrated verification:** 315 unit tests / 7 skipped (up from 304); ALL SQL suites green (journey-ledger, delegation, blocked, red-team-p1, org-scoping 13/13, p2-time); spec:check deterministic; grant-guard clean; lint/build/matrices/branding OK. **CI green on `7383dc0`** (ssr-smoke initially failed on a flaky cold-runner content timeout, confirmed flaky + re-run passed; F1 fix commit `23f8055` pending CI). Migrations `190000`/`200000` DRAFTS (owner auth required); the 8 prior drafts remain unapplied remotely.

## Safe-provisioning completion + readiness centralization + red-team P1 closure (2026-10-26, owner directive)

Owner directive (2026-10-26): prioritize safe-provisioning completion with centralized readiness in parallel; consumer migration to `provision_corporate_tenant` is NOT deferrable. Delivered via 4 workers + independent auditor + Coordinator.

| Track                                                | Deliverable                                                                                                                                                                                                                                                                                                                                                | Evidence                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Worker A** (consumer inventory)                    | `docs/create-or-update-corporate-tenant-consumers.md` — 3 runtime consumers of the legacy `create_or_update_corporate_tenant` (TenantContext:483, OnboardingFullPage:410, OnboardingTearsheet:123); NONE depends on the vulnerable conflict-update; 1:1 arg-compatible migration                                                                           | matrix + substitution plan |
| **Worker B** (commands + contracts)                  | `docs/provisioning-commands-contract.md` + `specs/operations/provisioning.create-tenant.json` + 5 policy specs. invite/join/request-access/create-agency NORMATIVE_ONLY (no endpoint, not invented); create-unit/create-sandbox no normative basis (named with gap). G1: 0 BLOCKED                                                                         | specs + contract           |
| **Worker C** (adversarial SQL)                       | `supabase/tests/provision_tenant_adversarial.sql` — **27/27** PG 17.11: takeover denied, slug trickery rejected, atomicity/rollback, owner attribution, cross-tenant isolation, idempotency+hostile-payload read-back, InitPlan regression, slug validation. **0 defects** in `provision_corporate_tenant`                                                 | 27/27                      |
| **Worker D** (readiness)                             | migration `20261026170000_readiness_blocked_decision.sql` — `blocked` decision (run_blocked/run_state_blocked/policy_denied, never coerced to allow) + published `onboarding.tenant` v1.0.0 seed. Absent/invalid/empty definition → unavailable. **10/10** blocked assertions + **two-session race 3/3** (winner UPDATE 1, stale UPDATE 0, fresh UPDATE 1) | 10/10 + race               |
| **Consumer migration** (Coordinator, non-deferrable) | `TenantContext` wrapper → `rpc('provision_corporate_tenant')`; `OnboardingTearsheet` provisioning moved step-0 → step-3 confirm (FS2) with 42501 takeover-denial handling; `rpc.provision_corporate_tenant` registered + registry mirror regenerated. 2 new FS2 tests                                                                                      | 304 unit tests             |
| **Independent auditor** (Agent 7)                    | `docs/red-team-audit-provisioning-readiness-cycle.md` — **0 P0, 4 P1, 5 P2**. Held (with probes): takeover-by-identifier (incl. Unicode/ZWSP), post-conflict privilege, expired delegation, empty-required-step, RPC-failure, two-session race                                                                                                             | audit report               |
| **Red-team P1 closure** (Coordinator)                | migration `20261026180000_red_team_p1_fixes.sql` — P1-1 run_state/policy_snapshot client-erase blocked (INVOKER guard trigger, R5 role-check); P1-2 subject-step RLS bypass closed (server-derived `subject_step_keys`); P1-3 granted_by forge blocked (forced to auth.uid(), immutable). **11 PG17 assertions**, all regressions green                    | 11/11 + regressions        |

**P1 not fixed (documented owner decision):** readiness org-scoping — run selection filters by user+wizard only, never `target_organization_id`; a completed org-A run yields `allow` in org B. Requires an owner decision on whether readiness is per-org (P4 in the ADR). **5 P2 hardening items** documented in the audit report (completed_at backdating, expired-delegation corpse, transaction-frozen now(), run-selection tie-breaker, ProtectedRoute fail-open contract).

**Migrations now ready for owner authorization (all DRAFTS, locally validated, NONE applied remotely):** `20261026120000` (journey ledger), `20261026130000` (PagBank), `20261026130100` (3 anon-RPC), `20261026140000` (safe provisioning), `20261026150000` (delegation), `20261026160000` (helper revocation), `20261026170000` (readiness blocked), `20261026180000` (red-team P1 fixes). **Legacy `create_or_update_corporate_tenant` has NO runtime consumers after this cycle**; revoke/drop awaits the owner-approved deprecation strategy.

## Tenancy ADR actor/subject finalization (2026-10-26, Master Directive §6 — 3 workers + Coordinator)

Reviewer: the actor/subject ambiguity must close before the readiness gate is complete. Delivered via 3 parallel workers + Coordinator integration. **CI green on `c154881` (5/5 jobs incl. new delegation SQL + grant-exposure guard).**

| Worker                                            | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** (ADR)                                       | `docs/adr-tenancy-and-journey-persistence.md` finalized — §2.7 normative definitions (actor/subject/completed_by/run/readiness, all server-derived); §2.8 two explicit modes (`self_service` actor==subject server-validated + subject completes; `delegated` actor!=subject ONLY under server-authorized delegation, sensitive declarations never delegate-satisfiable, no inferred 3rd mode); §2.9 readiness decision semantics (closed union `allow`/`require_steps`/`blocked`/`unavailable`, fail-closed); §2.10 `completed_by` attribution (server-derived, minimized); P1–P6 owner-pending decisions          | ADR sections added                                                                                                                                                                               |
| **B** (persistence/RLS)                           | Migration `20261026150000_onboarding_actor_subject_delegation.sql` — `completed_by`+`completion_type` attribution columns; `onboarding_delegations` run-scoped policy + RLS; `app_private.can_complete_step` (DEFINER, InitPlan-safe) enforcing self_service (subject-only) vs delegated (subject always / actor only w/ active unexpired delegation for step_key / `subject`-typed steps never delegate-completable); composite `UNIQUE(actor_id, wizard_key, idempotency_key)`; `onboarding_step_attribution` trigger forcing `completed_by=auth.uid()` + server-derived `completion_type` (never client-trusted) | **22/22** PG 17.11 (self_service, delegated authorized/unauthorized, third-party denial, idempotency scope, client-supplied `completed_by` overwritten, effective-principal attribution)         |
| **C** (readiness/frontend)                        | **Real gap fixed:** adapter called the RPC with a client step-list the deployed RPC `(wizard_key, version)` doesn't accept → now passes `wizardKey`/`version`; fail-closed missing-wizardKey → `unknown` (never allow); `ProtectedRoute` passes `TENANT_ONBOARDING_WIZARD_KEY`                                                                                                                                                                                                                                                                                                                                      | 14 readiness + 8 ProtectedRoute tests (all 4 decisions mapped, no client-data influence, no `account_type` re-derivation, all entry points gated, PGRST202→unavailable_backend, timeout→unknown) |
| **Coordinator** (grant guard + helper revocation) | `scripts/check-rpc-grant-exposure.mjs` (CI guard: detects public functions EXECUTE-exposed to anon/PUBLIC outside the allowlist) + `specs/rpc-grant-allowlist.json` + migration `20261026160000_helper_rpc_anon_revocation.sql` revoking PUBLIC+anon for **11** helper/mutating functions found anon-exposed (live-verified)                                                                                                                                                                                                                                                                                        | Guard clean (exit 0); all 11 `anon_exec=f`, authenticated `t`                                                                                                                                    |

**PENDING (owner/backend, not blockers to local completion):** Worker C — the readiness RPC does not yet emit `blocked` (needs RPC change); the wizard-key needs a seeded `onboarding_journey_definitions` row (service-side). Worker B — a true two-session concurrency harness for lost-update (single-`DO`-block pattern can't express it). ADR P1–P6 owner decisions (mode assignment per wizard, delegation policy content, sensitive-declaration set, delegated-wizard certified principal, trusted-verifier set, backfill classification).

**Migrations now ready for owner authorization (all drafts, locally validated):** `20261026120000` (journey ledger), `20261026130000` (PagBank service_role-only), `20261026130100` (3 anon-RPC grants), `20261026140000` (safe provisioning), `20261026150000` (actor/subject delegation), `20261026160000` (helper anon revocation). **None applied remotely.**

## Authenticated-takeover provisioning fix (2026-10-26, Master Directive §6.2)

Reviewer: "Revogar acesso anônimo não resolve isso." The grant-tightening (§Critical security fixes below) addresses exposure, but `create_or_update_corporate_tenant` has a **separate, deeper** defect that needed its own fix.

| Defect                                | Root cause (live-reproduced)                                                                                                                                                                                                                                                                                                                                                                                                                                        | Fix (DRAFT)                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DEFECT A — InitPlan RLS bug**       | `organizations_insert_policy` `WITH CHECK` can't evaluate `auth.uid()` inside a bare InitPlan → org INSERT fails RLS for authenticated users on the **live remote** (direct org INSERT as authenticated → 42501). Same bug fixed earlier in `create_organization_hierarchy` (20261024000000). **Systemic finding:** affects ALL `auth.uid()`-in-subquery policies — the org SELECT policy needed the DEFINER `is_org_member` helper in the test prereq to avoid it. | New `provision_corporate_tenant` RPC — **SECURITY DEFINER** (justified AGENTS.md rule 5: 6-table atomic bootstrap per-row RLS can't express; `search_path=''`; `auth.uid()` re-checked; EXECUTE authenticated-only).                                                                                | `20261026140000_provision_corporate_tenant_safe.sql` — **8/8** PG 17.11: InitPlan bug reproduced (1), fresh provision via DEFINER (2), A is org_owner (3), takeover denied (4), B not promoted (5), A org data intact (6), idempotent read-back (7), anon denied (8). Wired into CI (`test:provision-tenant-sql`). |
| **DEFECT B — authenticated takeover** | `ON CONFLICT (identifier) DO UPDATE` overwrites the victim org's legal/tax/legal_rep data + member INSERT promotes caller to `org_owner` of the victim org (`is_default=true`). Any authenticated user B knowing org A's identifier can seize it (organizations_update_policy blocks data UPDATE for non-member, but organization_members_insert_policy `member_id=auth.uid()` lets B insert; function then sets B as org_owner + hijacks active context).          | Same RPC — **CREATE vs conflict separation**: a conflicting identifier requires the caller to ALREADY be org_owner/org_admin (else 42501 takeover denial); NEVER overwrites org data; NEVER promotes a non-admin on conflict; admin read-back idempotent; caller is org_owner ONLY on fresh create. | Same — assertions 4–7 above. Closes the takeover path.                                                                                                                                                                                                                                                             |

**`create_or_update_corporate_tenant` remains for backward-compat; deprecation is a separate owner decision** (`BLK-provisioning-takeover` now has a tested safe successor). **Not applied remotely.**

## Critical security fixes (2026-10-26, owner-priority: PagBank RPCs first)

Reviewer priority: close the `claim_pagbank_order` + `attach_psp_idempotency` analysis and local fix FIRST (critical payment DoS from Worker D), then the 3 anon-RPCs. Both fixes drafted + validated on disposable PG 17.11; **not applied remotely** (owner authorization required).

| Fix                                                                                                                     | Root cause (live-verified)                                                                                                                                                                                                                                                                                                                                                                                               | Migration (DRAFT)                                                                                                                             | Evidence                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PagBank payment DoS** (`claim_pagbank_order`, `attach_psp_idempotency`)                                               | SECURITY DEFINER, live-executable by `authenticated`, **NO auth.uid()/membership check** in bodies (the only 2 of 9 billing RPCs lacking one). Any authenticated session knowing victim UUIDs could win first-writer-wins and permanently lock a tenant's payment flow. Sole legitimate consumer: `pagbank-order` Edge Function via `supabaseAdmin` (service_role), which already checks org membership before invoking. | `20261026130000_pagbank_rpc_service_role_only.sql` — REVOKE EXECUTE from PUBLIC/anon/authenticated (exact signatures), GRANT to service_role. | **5/5** PG 17.11: authenticated + anon denied on both; service_role (Edge path) executes both. Wired into CI (`test:pagbank-grants-sql`). Closes `BLK-pagbank-no-auth-rpcs` (fix ready for owner authorization). |
| **3 anon-RPC exposure** (`save_onboarding_progress`, `create_or_update_corporate_tenant`, `resolve_effective_settings`) | SECURITY INVOKER, EXECUTE-exposed to anon+PUBLIC via `pg_default_acl` + PG PUBLIC default (not a deliberate contract). Consumers: browser TenantContext (authenticated) only — zero anon consumers.                                                                                                                                                                                                                      | `20261026130100_rpc_grants_remove_anon_excess.sql` — REVOKE EXECUTE from PUBLIC+anon, keep authenticated + service_role.                      | **6/6** PG 17.11: anon denied on all 3; authenticated + service_role succeed. Wired into CI (`test:rpc-grants-sql`). Contributes to `BLK-rpc-anon-exec`.                                                         |

**Integrated verification (same checkout, `f28d3b0`):** 290 unit tests / 7 skipped; 3 SQL suites green (pagbank 5/5, rpc-grants 6/6, journey-ledger 13/13); `spec:check` deterministic; lint/build/branding/matrices/carbon OK. **No remote application** — both migrations are drafts pending owner authorization.

## Parallel autonomous remediation (2026-10-26, contract: parallel workers + independent auditor)

Owner contract: parallel specialized workers (≤4 implementers, ≤6 total incl. coordinator+auditor) with central coordination, independent review, evidence-based integration. All local work; no protected remote action.

### P0 fixes (Coordinator, in-flight before workers)

| Defect                                                                                                          | Root cause                                                                                                                      | Fix                                                                                                                                                                                                                                                                                                            | Evidence                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Readiness RPC client-controlled authorization** (`resolve_onboarding_readiness(p_required_step_keys text[])`) | A client could pass an empty/partial step list to obtain a permissive decision                                                  | Rewrote to `(wizard_key, version)`; required steps resolve **server-side** from new trusted `onboarding_journey_definitions` (service-managed, authenticated-read published). Missing definition / backend failure → `unavailable`, never silently `allow`. No client list param (arity `(text,text)` proven). | **11/11** PG 17.11 assertions incl. P0 integrity tests |
| **Spec generator semantic defect**                                                                              | resolved step fields by `field_key` (physical) but steps reference `spec_key` (normative) → every form field `unresolved: true` | resolve by `spec_key` via Map; emit `ref`+`field_key`+metadata; **fail on unresolvable ref** (no silent drop)                                                                                                                                                                                                  | regenerated artifacts + manifest; **4** semantic tests |

### Worker outputs (integrated by Coordinator)

| Worker                             | Deliverable                                                                                                                                                                                                                                                                                                                                                  | Evidence              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| **C** (frontend error-states)      | 5 payment load-error tests (KPI/charges/sellers/audit/exception — error notification, `R$ 0.00` never shown, no fabricated zeros); 1 readiness malformed-payload test; 1 passkey exception-path test                                                                                                                                                         | **21/21** pass        |
| **5** (DB perf triage)             | `docs/db-performance-findings-triage.md` — **16** still-unindexed FKs (not 17); duplicate index confirmed; 26→2 genuine multi-policy pairs; 148 zero-scan indexes all keep/rare; 16 additive indexes proposed (NOT applied); no consolidation/removal                                                                                                        | live-DB introspection |
| **D** (RPC grants + DEFINER audit) | `docs/rpc-grants-security-definer-audit.md` — 3 anon-RPCs confirmed INVOKER+anon+PUBLIC (pg_default_acl + PG PUBLIC default); 13 DEFINER all anon-revoked, 11/13 keep-justified; **CRITICAL**: `claim_pagbank_order` + `attach_psp_idempotency` NO auth check + live-executable by `authenticated` (payment DoS) → proposed additive migration (NOT applied) | live-DB verified      |

### Independent red team (Agent 7) — `docs/red-team-audit-readiness-generator.md`

Reproduced **0 P0, 1 P1, 2 P2** against the P0 fixes; all 3 fixed this cycle:

| Defect                                                                                         | Reproduction                                                                                       | Fix                                                                                             | Status                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| **DEFECT 1 (P1)** duplicate TS type identifiers for a `field_key` alias → `tsc` TS2300         | 2 field specs, same `field_key`, distinct `spec_key` → `export type person_full_name = string;` ×2 | generator emits each identifier once (Map); exact dup dropped, conflict → hard fail             | **fixed** + 1 semantic test |
| **DEFECT 2 (P2)** published definition with empty `required_step_keys` → unconditional `allow` | seed published def with `ARRAY[]` → gate returns `allow`                                           | CHECK constraint rejects empty publish + defensive RPC guard → `unavailable`                    | **fixed** (13/13 SQL)       |
| **DEFECT 3 (P2)** actor-vs-subject RLS lets a subject flip the actor's gate                    | subject (non-actor) completes steps → actor's gate `allow`                                         | **documented** as design-integrity ambiguity for tenancy ADR / owner decision (not a clear bug) | **documented**              |

### Integrated verification (same checkout)

- **290 unit tests / 7 skipped** (was 249 at cycle start), `spec:check` deterministic, lint/build/branding/matrices/carbon OK.
- **CI green** on `fe7202d`, `dc61055`; latest integration commit `0be9d23`.
- `npm run spec:check` wired as an explicit `quality` gate.

### Blockers (updated; scoped, not hidden)

`BLK-rpc-readiness-deploy` (readiness RPC still a draft migration — needs owner authorization to apply remotely) · `BLK-rpc-anon-exec` (proposed grant migration drafted by Worker D, NOT applied — owner decision) · `BLK-pagbank-no-auth-rpcs` (**new, critical**: `claim_pagbank_order`/`attach_psp_idempotency` no auth check + `authenticated`-executable — Worker D proposal pending owner) · `BLK-tenancy-actor-subject-rls` (**new**: DEFECT 3 design decision) · `BLK-passkey-rp-browser` · `BLK-e2e-preview-auth` · `BLK-tenancy-adr-signoff` · `BLK-pr7-human-review`

## Autonomous execution cycle (2026-10-26, contract: gates = validation criteria, not blockers)

Owner contract: execute all local/independent work across phases A–G, register specific blockers, continue independent paths; authorization restricted to external irreversible/privileged actions only. Delivered per phase, with maturity states (not interchangeable).

| Phase                              | Deliverable                                                                                                                                                                                                                                             | Maturity                                                                               | Evidence                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** (specs/gap/tenancy)          | Tenancy + journey-persistence ADR (`docs/adr-tenancy-and-journey-persistence.md`) — separates identity/account_type/tenant_kind/authority_level/parent/membership/entitlement; legacy `tenants*` documented                                             | `IMPLEMENTED_AND_TESTED_LOCAL` (doc)                                                   | ADR; FS1–FS4 confirmed in `fase0-preflight-report.md`                                                                                                                                       |
| **B** (persistence/security)       | Journey-ledger migration `20261026120000_journey_ledger_onboarding_runs.sql` — `onboarding_runs` (idempotency/expiry/correlation) + `onboarding_step_states` (state machine, optimistic concurrency, RLS by actor) + `resolve_onboarding_readiness` RPC | `IMPLEMENTED_AND_TESTED_LOCAL` + `CI_VERIFIED`                                         | **9/9 assertions** on disposable PG 17.11 (idempotency, cross-user RLS denial, optimistic concurrency, expiry, readiness allow/require_steps/anon-unavailable); wired into CI `billing-sql` |
| **C** (UX/readiness)               | Server-authoritative readiness adapter `src/data/useOnboardingReadiness.js` + `ProtectedRoute` integration — discriminated result, never infers from account_type/name/counts/plan_tier, never mocks runtime                                            | `IMPLEMENTED_AND_TESTED_LOCAL` (adapter) / `AWAITING_OWNER_AUTHORIZATION` (RPC deploy) | 6 adapter tests; backend RPC absent → `unavailable_backend` (dependency recorded, PGRST202)                                                                                                 |
| **E** (passkeys)                   | `listPasskeys`/`refreshPasskeys` → **discriminated result** (`ready`/`unknown`/`unsupported`/`unauthenticated`) — a list failure is never rendered as "no credentials" (plan P0 fix)                                                                    | `IMPLEMENTED_AND_TESTED_LOCAL`                                                         | 4 discriminated-state tests; `TenantContext.jsx` finalized (was the preserved preexisting change)                                                                                           |
| **D** (settings/registry/bindings) | `registry:check` in sync; `check:matrices` OK; 12 settings ↔ normative mapping (Phase 2)                                                                                                                                                                | `CI_VERIFIED`                                                                          | registry in sync; matrices 10/10 counts MATCH                                                                                                                                               |
| **F** (tests/CI)                   | full gates green                                                                                                                                                                                                                                        | `CI_VERIFIED`                                                                          | 278 unit tests / 7 skipped; lint/build/branding/matrices/carbon OK; CI green on `fe7202d`                                                                                                   |
| **G** (handoff)                    | this ledger + maturity matrix + blockers                                                                                                                                                                                                                | —                                                                                      | —                                                                                                                                                                                           |

**Blockers (registered, scoped, not hidden):**

| blocker_id                  | description                                                                                                                                                                                                                                                           | scope affected               | action required                                                      | unblock condition                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLK-rpc-readiness-deploy`  | `resolve_onboarding_readiness` RPC is a draft migration, not deployed remotely                                                                                                                                                                                        | readiness gate (Fase C)      | owner authorizes applying `20261026120000` remotely                  | RPC present in `pg_proc` on remote                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BLK-rpc-anon-exec`         | `save_onboarding_progress`, `create_or_update_corporate_tenant`, `resolve_effective_settings` are `anon`-executable (INVOKER)                                                                                                                                         | security hardening           | owner reviews + authorizes grant-tightening migration                | negative anon test + tightened grants live                                                                                                                                                                                                                                                                                                                                                                                                               |
| `BLK-passkey-rp-browser`    | passkey RP-ID/origin browser validation needs an authorized accessible env (`app.cestari.studio`)                                                                                                                                                                     | passkey E2E (Fase E)         | run passkey ceremony on `app.cestari.studio` (not preview/localhost) | ceremony succeeds on the real domain                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `BLK-e2e-preview-auth`      | Preview E2E for private flows needs secrets/session                                                                                                                                                                                                                   | E2E (Fase F)                 | owner provides Preview bypass/session                                | E2E runs on the authorized Preview                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BLK-tenancy-adr-signoff`   | tenancy columns (`tenant_kind`/`authority_level`) + backfill are ADR-draft                                                                                                                                                                                            | tenancy migration            | owner reviews ADR 0001 and authorizes the additive migration         | ADR signed + migration validated on disposable PG                                                                                                                                                                                                                                                                                                                                                                                                        |
| `BLK-pr7-human-review`      | PR #7 has no human review (only vercel bot `COMMENTED`)                                                                                                                                                                                                               | merge to `main`              | human review/approval on PR #7                                       | `reviewDecision=APPROVED`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `BLK-provisioning-takeover` | legacy `create_or_update_corporate_tenant` remains `authenticated`-executable after Stage 1 (only anon/PUBLIC removed by `130100`); the authenticated-takeover defect is NOT remediated until Stage 2's `20261026210000` is applied AND its C1–C5 negative tests pass | provisioning security        | owner authorizes Stage 2 (`210000`)                                  | `210000` applied + C1–C5 negative tests pass live (no unauthorized role retains EXECUTE on the legacy RPC)                                                                                                                                                                                                                                                                                                                                               |
| `BLK-tenancy-adr-p2-p3`     | ADR P2 (delegation policy content) + P3 (sensitive-declaration set per wizard) are unresolved owner decisions affecting the authorization model encoded by `150000`                                                                                                   | tenancy/delegation migration | owner decides P2/P3 in `docs/adr-tenancy-and-journey-persistence.md` | **DECIDED 2026-10-26 (ADR §6.1): P2 `onboarding.tenant`=self_service; P3 `subject_step_keys`={identity,organization} (encoded in `20261026180000`, P3-CONFIG assertion); P4=policy-per-step. Recorded DECIDED — unblockable on owner confirmation.**                                                                                                                                                                                                     |
| `BLK-MANIFEST-STAGE1`       | the Stage-1 rollout manifest omitted `20261026180000`, which encodes the owner-decided P3 set — a material inconsistency between the ADR decision, the migration implementing it, the rollout package, and the assertions                                             | rollout manifest             | reconcile the manifest + dependency gates with the real content      | **RESOLVED 2026-10-26 (Master Directive v2.1 §2.1): `180000` reassigned to Stage 1 with justification (chronologically between `170000`/`190000` → no reorder; no Stage-1 migration depends on it; required for the Stage-1 "P3 encoded, not vacuous" deliverable). Stage 1 = `120000…180000` (8 migrations); Stage 2 = `190000→200000→210000` (3). Verified: full sequence applies in order; P3 reads back `{identity, organization}` after `180000`.** |

**Not authorized / not done (per contract §2):** no merge, no remote migration/DDL/DML, no grant/RLS/Auth/secret/callback/RP/origin change, no deploy/promote/rollback, no protected-identity-record change. All such work is **drafted and locally tested**, pending owner authorization. `cestari-studio/genOS` read-only throughout.

## PR reconciliation + production promotion (2026-10-25, owner-directed)

Owner directed: all PRs are approved; failing/erroring PRs must be **fixed from the foundation** (automations, scripts, tests, debug) through to commit and merge — not deleted. Each of the 24 PRs was triaged against current HEAD with commit/file-level evidence.

**Fixed and merged (green CI):**

- **#24** (`fix/supply-chain-critical-dev-deps`): rebased onto HEAD `5620f5b` (was failing stale ssr-smoke on old-`main` code). Genuine still-needed fix — pins `handlebars@4.7.10` + `shell-quote@1.12.0` in `overrides` (critical dev vulns). Lockfile verified pinned everywhere, scoped diff. **Merged into `main` (`41357df`).**
- **#22** (`fix/remove-fictitious-form-examples-20261023`): rebased onto HEAD; removes fictitious placeholders ("Jane Doe", "Acme Studio") with test assertions, **and fixes a real current-HEAD SSR-title mismatch** (`/dashboard` asserted "Effective Cascade Governance" but actual `<title>` is "Tenant Dashboard"). Verified 15/15 tests on exact content. **Merged into integration branch (`d19643d`).**
- **#17** (`fix/dashboard-roster-no-assumed-roles`): 27-commit stale reimplementation that would regress HEAD, but contained a genuine missing fix — roster inferred Owner/Member from e-mail match. Applied minimally onto HEAD in commit `599d6ab` (render `organization_role || membership_role || role`, fall back to "Not reported"; `notReported` i18n key added across 6 locales). Branch preserved; closed as superseded.

**Superseded by HEAD (verified absorbed/stale, branches preserved, closed with evidence):** #2 (empty after rebase), #8 (0 unique, stale lint), #10 (catalog CI already in HEAD), #15 (both clean of synthetics), #18 (re-added HEAD-deleted placeholder), #20 (catalog CI already in HEAD), #11/#12/#13/#16/#19 (honest-state/catalog/brand intent already in HEAD), #14/#21 (would DELETE current test suites — net regression).

**Already merged (earlier):** #3, #4, #5, #6.

**Production:** promoted HEAD `5620f5b` to Vercel production — `app.cestari.studio` serves the exact build artifact `index-2LKVl3q8.js` (was stale `973d884`, 13 commits behind).

**Remaining open:** only **PR #7** (`feat/complete-carbon-page-rebuild` → `main`), the integration PR holding all current work.

## Phase 2 applied to remote (2026-10-25, owner-authorized)

The Phase 2 candidate migrations + seeds — previously `BLOCKED — LOCAL ONLY` — were applied to remote `ldjfjmihdvdmltrptngf` (generative-os) and verified live:

| Step      | Artifact                                      | Result                                                                                                                                               |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration | `20261023120000_normative_catalog_registries` | Applied → ledger `20261025141955` (7 new catalog tables)                                                                                             |
| Migration | `20261023120100_web_surface_configuration`    | Applied → ledger `20261025142026` (7 surface tables + publication validator)                                                                         |
| Seed      | `registry-allowlist.sql`                      | **76 rows** (18 component, 6 edge_function, 18 public_projection, 15 rpc, 10 route, 9 template), single checksum `bd4ca960…`, version `2026-10-23.1` |
| Seed      | `normative-catalog-seed.sql`                  | **844 rows**: 225 features, 100 operations, 200 configurations, 60 pages, 30 journeys, 4 entitlement_profiles, 225 traceability                      |

**Live verification:** 14/14 tables present, RLS enabled on all 14; 5 validator/trigger functions created; 225/225 features `NORMATIVE_ONLY` with source provenance (genOS @ `ffd97fa9`); remote migrations total **24**. **RLS paths (as authenticated/anon, RLS enforced):** authenticated READ catalog_features=225; authenticated non-admin WRITE=42501 denied; anon READ catalog_features=0 (no anon policy); anon READ registry_allowlist=76. The 5 pre-existing `catalog_*` tables (from `20261022060000`) were untouched — Phase 2 adds 7 NEW catalog tables (no shape conflicts; `CREATE TABLE IF NOT EXISTS`).

## Production hotfixes (2026-10-24, owner-authorized)

Two production bugs surfaced by owner UX testing on `app.cestari.studio` were fixed at the root and verified live:

| Bug                                                                                                                       | Root cause (proven)                                                                                                                                                                                                                                                                                                                                 | Fix                                                                                                                                                                                                                                                                                                                                                                                                                    | Live verification                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`vector-rag` 403** (×4) — also latent in `pagbank-connect`, `settings-cascade`, `pagbank-order`                         | All 4 Edge Functions called `supabaseUser.rpc('is_org_member')`, but `is_org_member` lives in `app_private`, which is **not exposed via PostgREST** (`db_schemas = public,graphql_public`). The call returned **404 "function not found in schema cache"** → treated as membership denial → 403 for every authenticated user.                       | `_shared/org-membership.ts` `isOrgMemberViaDataApi()` queries `organization_members` directly via the Data API (RLS select policy lets the caller read their **own** membership row). Replaced the RPC call in all 4 functions.                                                                                                                                                                                        | 6/6 unit tests; functions redeployed; anonymous still correctly **401**, authenticated members pass. Commit `c6a4313`.                                                                                                                                                                                                   |
| **Onboarding org creation blocked** — `ERROR 42501: new row violates row-level security policy for table "organizations"` | `organizations_insert_policy` `WITH CHECK (SELECT auth.uid()) IS NOT NULL` references no NEW column → PostgreSQL plans it as a bare InitPlan where `request.jwt.claims` is not visible → `auth.uid()` returns NULL → check fails, **even though the same `auth.uid()` returns the caller id in ordinary SELECTs in the same session** (reproduced). | Migration `20261024000000_org_hierarchy_security_definer_fix.sql`: `create_organization_hierarchy` → **SECURITY DEFINER** (justified: 6-table atomic org bootstrap per-row RLS cannot express). `search_path=''` + qualified objects; `auth.uid()` re-checked in body (42501 when NULL); caller's own id for every owner FK; slug/name validation; EXECUTE revoked from PUBLIC/anon → granted only to `authenticated`. | **Owner-authorized apply** → ledger `20261024064601` (22 total). Live: `is_definer=true`; grants correct; happy path as dev user created real org/workspace/project (**cleaned up**); anonymous denied **42501**. Disposable PG 17.11: **11/11 assertions** (`test:org-hierarchy-sql`, wired into CI). Commit `af88c0e`. |

## Owner remote audit reconciliation (2026-10-23)

Owner confronted Phases 0–2 read-only via the Vercel/GitHub/Supabase connectors. Result: **compatible with the reported local-only state**, with one correction.

| Service  | Observation (owner audit)                                                                                                                 | Reconciliation                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub   | Phase 2 files 404 on remote branch (`docs/phase1-…`, `docs/phase2-…`, `scripts/import-normative-catalog.mjs`, migration `20261023120000`) | **Expected** — artifacts are local and uncommitted. Not evidence of absence in the local checkout (verified present, hashes re-confirmed).                                                                          |
| Supabase | 21 migrations; all 13 candidate tables absent                                                                                             | **Expected** — nothing applied remotely. Candidate state confirmed.                                                                                                                                                 |
| Vercel   | Preview `c1bd70d` READY; production `973d884` READY (`app.cestari.studio`)                                                                | **Correction issued** — Phase 0 doc previously said "runtime idêntico ao de produção". Distinct deploy artifacts; READY ≠ same content. Additive correction added to `docs/phase0-preflight-consolidated-state.md`. |

Post-audit re-verification in the real checkout: `test-phase2-sql.sh` exit 0 (38/38), vitest 7/7, artifact hashes re-confirmed. Review package prepared at `docs/phase2-review-package.md` (no commit/push/PR).

## Phase 2 (2026-10-23, HEAD `c1bd70d`, local-only)

- **Source reconciliation (§2.1 of the autonomous directive):** the 209-vs-200 configuration discrepancy is explained by exact pinned-source counts — 209 = live genOS DB bootstrap (no repo seed exists); **200 = the versioned normative set** (catalog = traceability = feature-registry, zero orphans). Full table with blob SHAs: `docs/phase2-source-reconciliation-report.md`.
- **Contract v1.1:** `setting_normative_map` normalized to parent + `setting_normative_map_terms` children (Layer B = 6 tables); additive dated addendum in `docs/phase1-configuration-contract.md`.
- **Phase 2 artifacts (candidate, unapplied):** migrations `20261023120000_normative_catalog_registries.sql` (7 normative tables) + `20261023120100_web_surface_configuration.sql` (Camada B + publication validators); seeds `normative-catalog-seed.sql` (844 idempotent upserts, sha256 `6475b692…`) + `registry-allowlist.sql` (72 entries, generated mirror of `src/config/runtime-registries.js`); importer `scripts/import-normative-catalog.mjs`; harness `scripts/test-phase2-sql.sh`.
- **Verification:** disposable PostgreSQL **17.11** (user-space socket, no system service): migrations 2× idempotent, importer 2× → second run **844/844 unchanged**, **38/38 SQL assertions PASS** (counts, NORMATIVE_ONLY, provenance, RLS deny/admin, publication gates incl. JSX/URL injection rejection, binding FK + evidence ladder, message RLS, settings-map cardinality); vitest registry suite **7/7** (incl. allowlist byte-drift gate); `npm run lint` 0; `npm test` **233 passed / 0 failed**; `check:matrices` 10/10; `check:branding` PASS. Evidence: `docs/phase2-implementation-evidence.md` + `docs/phase2-importer-report.json`.
- **Honest states:** new objects `INTEGRATION_VERIFIED` (local disposable only); runtime config-driven rendering still `NORMATIVE_ONLY`; remote application `BLOCKED` pending explicit owner approval.

## Phase 0 + Phase 1 (2026-10-23, HEAD `c1bd70d`)

- **Phase 0 (preflight read-only):** consolidated `expected vs observed` published at `docs/phase0-preflight-consolidated-state.md`. Live-verified: 21/21 migrations in sync, 6 Edge Functions reconciled (v7/5/7/6/6/7, `verify_jwt` per `config.toml`), catalog data live (5/30/9/6/1), Vercel CLI functional (production `973d884` == HEAD runtime), Carbon MCP + code_audit operational, Vercel MCP connector broken (404). Stale gaps in `AGENTS.md`, `phase6`/`phase7` manifests corrected with dated addenda (history preserved).
- **Phase 1 (configuration contract, analysis/design only):** published at `docs/phase1-configuration-contract.md` (`v1 proposed_for_review`). Normative source `genOS` @ `ffd97fa9` (registries v0.9.0/v0.9.1) read from a temporary clone. Key decisions: target's 12 `setting_definitions` + `resolve_effective_settings` remain sole operational authority (0 `exact` / 9 `partial` / 3 `none` equivalence to the 200 normative configs); 7 new normative `catalog_*` tables + 5 new operational tables proposed (all additive); 9 templates cover all 10 existing routes; endpoint allowlist = 6 Edge Functions + 15 RPCs + public projections (code-owned); feature state machine `NORMATIVE_ONLY → … → E2E_VERIFIED` with per-transition evidence. **No remote mutation.** Pending owner review of the §9 settings mapping before Phase 2 migration code.

> Maps every required CI result to the exact commit it tested. No result is
> inherited across SHAs — any newer commit is untested until its own run passes.

## Confirmed CI runs

| PR                                       | Head SHA (full)                            | Run ID      | Run URL                                                                  | Jobs                                                                                                                    | Conclusion  |
| ---------------------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| #7 (feat/complete-carbon-page-rebuild)   | `8dc07161d4eb13206cd44577903653e57b6d58c2` | 39916533230 | https://github.com/cestari-studio/generative-os/actions/runs/39916533230 | quality, ssr-smoke, release-dry-run, browser-smoke (smoke+axe+benchmark), billing-sql (billing+workspace+notifications) | 5/5 SUCCESS |
| #24 (fix/supply-chain-critical-dev-deps) | `eacd7b76e3aaca19a611ec5d5a169a61a29f6811` | 39915650034 | https://github.com/cestari-studio/generative-os/actions/runs/39915650034 | quality, ssr-smoke, release-dry-run, billing-sql, browser-smoke                                                         | 5/5 SUCCESS |

### Key evidence lines (run 39916533230)

- `catalog integration: total=7 passed=7 skipped=0` (07:17:49Z)
- `[browser-smoke] 24/24 assertions passed` (07:19:48Z)
- `[axe] OK: no critical/serious violations on 7 routes` (07:20:25Z)
- `[benchmark] OK: all routes within LAB budgets` (07:22:29Z)
- `ALL BILLING SQL TESTS PASSED` + `WORKSPACE SQL TESTS PASSED` + `NOTIFICATIONS SQL TESTS PASSED` (07:18:21-22Z)

### Untested-later-commit rule

Any commit after `8dc0716` (PR #7) or `eacd7b76` (PR #24) is **untested** until
its own CI run completes green. CI results are never inherited across SHAs.

## Vercel Git integration state (read-only, 2026-10-23 ~07:30 UTC)

| Item                             | Value                                                                                                   | Evidence                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Project                          | `generative-os` / `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`                                                    | `vercel project inspect`             |
| Scope                            | `cestari-studio` ("Octavio's projects", pro) — CLI user `octavio-4895`                                  | `vercel teams ls`                    |
| Git link                         | **CONNECTED 2026-10-23 07:17:46 UTC** (3 min after `8dc0716` was pushed)                                | `/v9/projects/{id}` `link.createdAt` |
| Link repo                        | `cestari-studio/generative-os` (repoId 1422711827) — **correct repo**                                   | API `link`                           |
| productionBranch                 | `main`                                                                                                  | API `link`                           |
| gitCredentialId                  | `cred_1f0e94dd3562f7e509db0103396201e8057d236e`                                                         | API `link`                           |
| Git-triggered deployments so far | **NONE** — newest deployment is 28h old, all `source: cli`                                              | `/v6/deployments`                    |
| Production alias                 | `app.cestari.studio` + `generative-os-bay.vercel.app` → `generative-3ifcp8qi3` = `b580fc8` (2026-10-16) | `vercel alias ls` + API meta         |
| Production staleness             | **146+ commits behind** current PR head                                                                 | `git log b580fc8..HEAD`              |

**Interpretation:** the owner connected the Git integration at 07:17:46 UTC.
No commit has been pushed since, so no automatic Preview exists yet. The next
push to a non-production branch should create a Git-sourced Preview for its
exact SHA — the mechanism the E2E gate needs. Production stays on `b580fc8`
until separately authorized promotion.

## Vercel Git Preview — VERIFIED (2026-10-23 ~07:34 UTC)

The Git integration fired automatically on the next push after connection:

| Item               | Value                                                                                                                                                                      | Evidence                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Trigger commit     | `b5b50e6741bf44086fddd53c72cc31325da26f20` (pushed 07:33:37 UTC)                                                                                                           | local git                                  |
| Preview deployment | `generative-1rgmk27fy-cestari-studio.vercel.app`                                                                                                                           | `/v6/deployments`                          |
| source             | **git** (automatic — first non-CLI deployment)                                                                                                                             | API                                        |
| state              | `READY` (0.6 min after push)                                                                                                                                               | API                                        |
| githubCommitSha    | `b5b50e6741bf44086fddd53c72cc31325da26f20` (exact)                                                                                                                         | API meta                                   |
| githubCommitRef    | `feat/complete-carbon-page-rebuild`                                                                                                                                        | API meta                                   |
| githubCommitRepo   | `generative-os`                                                                                                                                                            | API meta                                   |
| Access path        | Deployment Protection (SSO) active; `vercel curl` authenticates                                                                                                            | `access-protected-vercel-deployment` skill |
| SSR validation     | `/` serves "Cestari Studio"; `/dashboard` + `/products` show the access gate (honest anonymous state); root not empty; hydration fix marker `silent` present in the bundle | `vercel curl`                              |

**Chain proven:** GitHub push → Git integration → Preview deployment with the
exact SHA → serves correctly via authenticated access. The code verified by CI
(`b5b50e6`) is the code deployed in the Preview.

**Production unchanged:** `app.cestari.studio` still serves `b580fc8` — no
promotion has been authorized or executed.

## Preview functional verification via Safari Technology Preview (2026-10-23, ~08:00 UTC)

After the owner-authorized env-var setup (`VITE_SUPABASE_URL` +
`VITE_SUPABASE_PUBLISHABLE_KEY` for Preview + Production), a fresh Git Preview
was verified functionally in Safari Technology Preview:

| Check                 | Result                                                                                                                                              | Evidence                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Preview URL           | `generative-e3xsqpj8c-cestari-studio.vercel.app` (SHA `3405000`, source=git, READY)                                                                 | `/v6/deployments`                      |
| Landing SSR           | "genOS by Cestari Studio" renders with brand content, feature cards, hierarchy, copyright                                                           | Safari TP screenshot                   |
| Supabase config error | **RESOLVED** — no `Supabase client configuration missing` error; env vars active                                                                    | Safari TP (absence of the prior error) |
| Sign-in path          | "Sign in to Workspace" opens the "Log in to genOS" modal with the 2-step flow (1. Identity → 2. Credentials), work email field, credential autofill | Safari TP screenshot                   |
| Deployment Protection | Accessible in the owner's authenticated Safari TP session                                                                                           | navigation succeeded                   |

**Full chain verified end-to-end:** GitHub push → Git integration → Preview
with exact SHA + publishable env vars → app loads → Supabase client
initializes → auth flow accessible. **Production unchanged** (`b580fc8`).

## Preview E2E — automated browser suite (2026-10-23, ~08:20 UTC)

First real Preview E2E against the live deployment (`generative-e3xsqpj8c`,
SHA `3405000`, source=git), accessed via the Deployment Protection automation
bypass secret (`x-vercel-protection-bypass`, secret collected from the
project's Deployment Protection settings and never printed/committed):

| Suite         | Result                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| preview-smoke | **34/34 assertions passed** — HTTP 200/404, protection bypassed, SSR #root not empty (~30k chars), access gate on private routes, **no Supabase config error**, no fictional demo tenants, no fatal page errors (no hydration issues) | `scripts/preview-smoke.mjs` output                                                                                                                                                                      |
| preview-axe   | **0 critical/serious violations on 6 routes** (/, /dashboard, /settings, /knowledge, /payments, /products); 1-2 minor/moderate per route                                                                                              | `scripts/preview-axe.mjs`, `docs/ui-rebuild/axe/preview-c1bd70d/results.json` (SHA-matched; the earlier `preview-3405000` citation was a stale path — corrected 2026-10-24, see also `preview-b2beb6e`) |

**This is PREVIEW E2E (not local, not production):** the deployed artifact at
the exact SHA, over the network, with the publishable Supabase env vars active.

## Database / project separation — VERIFIED (2026-10-23)

Owner directive: the `genOS` database belongs to the `genOS` Vercel project;
the `generative-os` database belongs to the `generative-os` Vercel project.

| Check                                                                          | Result                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| App's `VITE_SUPABASE_URL` (set for Preview + Production)                       | points to `ldjfjmihdvdmltrptngf` = **generative-os** Supabase project (correct) |
| App's Supabase client (`src/lib/supabase.client.js`)                           | uses only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`                 |
| Runtime references to `POSTGRES_*` / `NEXT_PUBLIC_*` / non-VITE `SUPABASE_URL` | **none** in client or SSR (the SPA only uses the VITE vars)                     |
| `genOS` project (`jkespoegdpkdcrxsxwry`)                                       | untouched; never a target                                                       |

The pre-existing production-only `POSTGRES_*` / `SUPABASE_*` server-side vars
in the Vercel project are for other consumers (Edge Functions / other
frameworks) — this SPA does not read them. Separation is correct.

## Commit author identity — FIXED (2026-10-23)

Owner directive: commits must be attributed to users registered in the
cestari-studio GitHub org/project.

**Problem found:** commits were authored by `Octavio Cestari
<octaviocestari1989@gmail.com>` (personal Gmail). GitHub resolves that email
to **`KBMN512`** (no name, no company) — NOT `ocestari` (Octavio Cestari,
company `@cestari-studio`, the org member). Pushes used `ocestari`
credentials but commit authorship linked to `KBMN512`.

**Fix:** local repo git identity set to the GitHub noreply for `ocestari`:
`user.name = Octavio Cestari`, `user.email = 102308332+ocestari@users.noreply.github.com`.
The unpushed sign-in fix commit was amended to the correct author.

**Verified:** commit `eddf748` now shows `github author login: ocestari` +
`github committer login: ocestari` (was `KBMN512` before). Local repo config
(not global) so other repos are unaffected.

**Note for owner:** if other contributors exist, each should set their own
GitHub noreply (`{id}+{username}@users.noreply.github.com`) in their local
repo config. The pre-existing history (authored with the Gmail) remains
unchanged — rewriting published history is not done.

## Sign-in modal email-loss bug — FIXED (2026-10-23)

Reproduced: typing the email in step 0 and clicking Continue moved to step 1
with the identity bar EMPTY (email lost), blocking password/magic-link/
passkey. Root cause: SignInModal + OnboardingTearsheet were inside the
`HeaderContainer` render prop; the inline render arrow is re-created on
context updates (`setSignInStep`), remounting the subtree and wiping local
form state. Fix: hoisted both modals to stable Nav-level siblings outside the
render prop. Verified: identity bar shows the typed email after Continue.
Commit `eddf748`.

## Additional fixes — sign-in Preview verification + dead demo code removal (2026-10-23)

**Sign-in fix verified in live Preview:** the email-preservation fix
(`eddf748`) was confirmed in the deployed Preview
(`generative-6t1mtfgha`) — identity bar shows the typed email after Continue,
password field accessible. Local → CI → Git Preview → deployed, end-to-end.

**Dead demo code removed (zero-mock runtime rule):**

- `src/service/message.js` — unused service fetching
  `jsonplaceholder.typicode.com/posts/1` (fake external endpoint; zero
  imports/routes).
- `src/pages/placeholder/Placeholder.jsx` — navigation-demo page referenced
  by no route (only NotFound is wired for `*`).
- Tests updated (Placeholder references removed; NotFound coverage kept).
  Commit `b402073`.

**Accidental PRIVACY_POLICY commit reverted:** `git add -A` in `b402073`
accidentally committed the owner's 4 untracked PRIVACY_POLICY* drafts. They
were untracked again (`git rm --cached`, local copies preserved) and added to
`.gitignore`. Commit `dbea4e0`. **Lesson:** never use bare `git add -A` in
this repo — stage explicit paths (the owner's untracked drafts live in the
root).

## Auth flows + zero-inline-layout completion (2026-10-23, cycle 5)

**Forgot-password recovery + magic-link (dc9f213):**

- SignInModal: "Forgot password?" button on the credentials step alongside the
  magic-link option (two distinct paths: recovery vs passwordless), per Carbon
  onboarding/Universal Experiences guidance.
- `requestPasswordReset` via `resetPasswordForEmail` (redirectTo =
  origin/reset-password); `signInWithOtp` now passes explicit
  `emailRedirectTo = origin` (works on Preview/production, not just site_url).
- New public `/reset-password` page (sets new password via
  `supabase.auth.updateUser`); routes.config.test registers it as a known
  public route. Full i18n across 6 locales — zero hardcoded text.

**Passkey/WebAuthn via native Supabase Auth (3269275):**

- Replaced fail-closed stubs with Supabase Auth's NATIVE WebAuthn
  (supabase-js 2.118+: `auth.registerPasskey`, `auth.signInWithPasskey`,
  `auth.passkey.*`). FIDO2 attestation + assertion verified server-side by
  Supabase Auth — never pseudo-verified client-side.
- SignInModal: "Sign in with passkey" button; OnboardingFullPage: "Register a
  passkey" action with registering/registered/error states (never fake success).
  WebAuthn requires a secure context; browser errors surface honestly.
- registerPasskey denies anonymous callers (fail-closed).

**Zero inline layout (f57f6f6):**

- Removed all 18 inline `style={{}}` attributes from runtime JSX across 4
  files (PaymentManagementPage ×12, ProfilePanel, ProductsCatalogPage,
  DashboardCharts ×4). All styling now via SCSS classes on original IBM Carbon
  tokens ($spacing-*, $text-primary/$text-secondary, $border-subtle, type
  styles) — no hardcoded colors/spacing/layout.

**Preview verification (f57f6f6):** all 4 auth paths present (passkey,
forgot-password, magic-link, identity-email preserved); preview-smoke 34/34.

## Auth config fixes (2026-10-23, cycle 6)

**RP ID corrected:** `webauthn_rp_id` set to `cestari.studio` (parent domain)
with origins `https://app.cestari.studio` + `https://cestari.studio`. Passkeys
now work on the apex AND the app subdomain. **Note:** "The RP ID is invalid
for this domain" will STILL appear on Vercel Preview URLs (`*.vercel.app`) and
localhost — those are different effective domains that cannot share the RP ID
`cestari.studio` (WebAuthn rule, expected). Test passkeys on
`app.cestari.studio` only.

**Email rate limit (magic-link + recovery):** the owner hit "email rate limit
exceeded". Root cause: `rate_limit_email_sent = 2/hour` (Supabase built-in
email service default), exhausted from testing. **The limit CANNOT be raised
via config alone — Supabase requires custom SMTP** (`SMTP_ADMIN_EMAIL`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) to change
`rate_limit_email_sent`. Options: (a) configure custom SMTP
(SendGrid/SES/Postmark — owner provides credentials, configured server-side,
never printed), or (b) wait ~1 hour for the per-recipient window to reset.

**signup_disabled note:** a magic-link POST for a non-existent email returns
`signup_disabled` (correct anti-enumeration — magic links only work for
registered users). Not an error for real registered emails.
