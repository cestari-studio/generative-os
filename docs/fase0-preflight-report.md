<!--
  Copyright IBM Corp. 2026
  This source code is licensed under the Apache-2.0 license found in the
  LICENSE file in the root directory of this source tree.
-->

# Fase 0 — Preflight report (read-only)

> **Scope:** inspection & verification only. **No** merge, push, deploy, promote,
> remote migration, or change to config/grants/RLS/Auth/domain. **No** new feature
> code. Uncommitted local changes were **not** discarded or overwritten.
> Captured: **2026-10-25** against the observed SHAs/IDs below.
> Normative reference `cestari-studio/genOS` remains strictly **read-only**.

---

## 1. Baseline

### 1.1 GitHub / Git

| Item                         | Observed value                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Branch                       | `feat/complete-carbon-page-rebuild`                                                          |
| HEAD (full SHA)              | `a919bc039d1a9ae414cba03b303bd572e79c7458`                                                   |
| Remote HEAD (`origin/…`)     | `a919bc039d1a9ae414cba03b303bd572e79c7458`                                                   |
| `a919bc0` relation to remote | **ancestor of remote HEAD** (in sync; nothing to push)                                       |
| Staged                       | — (none)                                                                                     |
| Unstaged                     | `src/context/TenantContext.jsx` (passkey detection helpers — **preserved, not overwritten**) |
| Untracked                    | `docs/onboarding-wizard-steps-and-passkey-plan.md` (the plan doc; preserved)                 |

**Uncommitted local inventory (do not lose):**

1. `src/context/TenantContext.jsx` — adds `listPasskeys()` / `refreshPasskeys()` and re-points
   `registerPasskey()` refresh at the **native** store (`auth.passkey.list()`). **Known flaw to fix
   in Fase 8:** `listPasskeys()` collapses error → `[]`, so callers cannot distinguish
   "no credentials" from "list failed". Must become a discriminated result (`checking | ready | unknown | unsupported`).
2. `docs/onboarding-wizard-steps-and-passkey-plan.md` — the (now **superseded-in-part**) passkey plan;
   retained as history. Its Carbon version claim (`@carbon/react@1.73`) is **wrong** vs lockfile (`1.117.0`).

### 1.2 PR #7 (the integration PR)

| Item                     | Observed value                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number / state / draft   | `#7` / `OPEN` / **draft**                                                                                                                                           |
| Mergeable                | `MERGEABLE` (no conflicts)                                                                                                                                          |
| `reviewDecision`         | **empty** — **no human review recorded**                                                                                                                            |
| Reviews                  | only **`vercel` bot `COMMENTED`** (2026-10-25T23:15Z) — the payments zero/empty flag. **Not** a human approval.                                                     |
| Head SHA                 | `a919bc039d1a` (includes the payment-fix commit `a919bc0`)                                                                                                          |
| Required checks observed | `quality`, `ssr-smoke`, `billing-sql`, `browser-smoke`, `release-dry-run`, Vercel, DCO. On `a919bc0`: **all pass** (`browser-smoke` confirmed green after capture). |

**Implication:** PR #7 is **not** release-ready. It lacks a human review, and the Vercel bot
comment is now addressed by `a919bc0` but a fresh human review is still required before merge.

### 1.3 Vercel

| Item                              | Observed value                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Preview (latest, Git-source)      | `generative-iby25a7d6-cestari-studio.vercel.app` — SHA `a919bc039d1a`, `READY` |
| Preview (prior)                   | `generative-htp0myk5i-cestari-studio.vercel.app` — SHA `61216abeb9cf`, `READY` |
| Production (`app.cestari.studio`) | `generative-ksgjjse74-cestari-studio.vercel.app` — SHA `41357df385a2`, `READY` |
| Deployment protection             | none reported by `vercel project inspect`                                      |

**Implication:** Production is **behind** the branch (`41357df` vs `a919bc0`). `READY` ≠ E2E-passed;
no promotion without explicit owner authorization + human review.

### 1.4 Supabase `ldjfjmihdvdmltrptngf` (read-only)

| Item                                                                                                                                              | Observed value                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres                                                                                                                                          | 17.11 (healthy)                                                                                                                                                |
| Migrations                                                                                                                                        | **24** applied (latest: `…org_hierarchy_security_definer_fix`, `…normative_catalog_registries`, `…web_surface_configuration`)                                  |
| Normative catalog                                                                                                                                 | 225 features / 100 operations / 200 configurations / 60 pages / 30 journeys / 4 entitlement_profiles / 225 traceability (metadata, not availability)           |
| `registry_allowlist`                                                                                                                              | **76** rows                                                                                                                                                    |
| `setting_definitions`                                                                                                                             | **12** operational settings                                                                                                                                    |
| `scoped_settings`                                                                                                                                 | 16 rows                                                                                                                                                        |
| `organization_members`                                                                                                                            | 4 rows                                                                                                                                                         |
| `surface_definitions` / `surface_revisions` / `operation_bindings` / `setting_normative_map` / `setting_normative_map_terms` / `message_registry` | **all 0**                                                                                                                                                      |
| Legacy `tenants` / `tenant_users` / `tenant_settings`                                                                                             | exist, **0 rows** (parallel model; ADR decision pending — do not populate or drop by convenience)                                                              |
| `organizations` tenancy columns                                                                                                                   | only `parent_organization_id`. **No** `tenant_kind`, **no** `authority_level` column.                                                                          |
| Workflow/wizard/action tables                                                                                                                     | `audit_actions`, `billing_transactions`, `usage_events`. **No** `onboarding_runs` / `onboarding_step_states` / `action_frames` / `wizard_runs` / outbox table. |

#### RPC grant exposure (read-only — Fase 4 review candidate)

| Function                            | SECURITY | EXECUTE includes `anon`?           |
| ----------------------------------- | -------- | ---------------------------------- |
| `apply_setting_cascade`             | DEFINER  | no (`authenticated, service_role`) |
| `create_organization_hierarchy`     | DEFINER  | no (`authenticated, service_role`) |
| `create_or_update_corporate_tenant` | INVOKER  | **yes (`anon`)**                   |
| `save_onboarding_progress`          | INVOKER  | **yes (`anon`)**                   |
| `resolve_effective_settings`        | INVOKER  | **yes (`anon`)**                   |

**Finding (documented, not changed):** three INVOKER RPCs are `anon`-executable. Body-level
`auth.uid()` checks mitigate, but `anon EXECUTE` should be reviewed per-function with a negative
test; tightening = owner-authorized additive migration. **No change made in this phase.**

---

## 2. Traceability matrix (journey → evidence)

Current authoritative wiring (no invention; `—` = absent). The `onboarding.*` journey is the only
journey with a UI today; it has **no** server run/step ledger.

| journey_key              | wizard surface (component / registry)                                  | step_key(s)                                                   | field/schema                             | operation_id → endpoint/RPC                                                                  | entity/table                                                      | policy/entitlement                                                             | tests                                 | evidence                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------ |
| `auth.login`             | `carbon.auth.sign-in-modal` → `SignInModal.jsx` (tested)               | identity→credentials                                          | email/password                           | `signInWithPassword` (client) → Supabase Auth; passkey assertion → `authenticateWithPasskey` | `auth.users`                                                      | session JWT                                                                    | `SignInModal.test.jsx`                | local unit                           |
| `onboarding.person` (PF) | `carbon.wizard.progress-indicator` → `OnboardingFullPage.jsx` (tested) | 1 classification, 2 identity, 4 address, 5 workspace+security | `COUNTRY_DOC_CONFIG` per country         | `rpc.save_onboarding_progress` → `persons.additional_property.onboarding` (JSON)             | `persons`                                                         | `auth.uid()` in body; **`anon` EXECUTE**                                       | `OnboardingFullPage.test.jsx`         | local unit                           |
| `onboarding.tenant` (PJ) | same component; step 3 corporate (PJ-only)                             | +3 corporate                                                  | legal/fiscal fields                      | `rpc.create_or_update_corporate_tenant` (upsert by identifier) → `organizations`             | `organizations`, `organization_members`, `workspaces`, `projects` | INVOKER + `auth.uid()`; **`anon` EXECUTE**; no `tenant_kind`/`authority_level` | — (no contract test)                  | **gap**                              |
| `onboarding.resume`      | rehydration effect (`:211-257`)                                        | —                                                             | `persons.additional_property.onboarding` | `loadOnboardingProgress`                                                                     | `persons`                                                         | —                                                                              | partial                               | no run/step ledger                   |
| `tenant.provision`       | `OnboardingTearsheet` (secondary surface)                              | 0 DNA→1 workspaces→2 knowledge→3 subscriptions                | org/ws names                             | `createOrUpdateCorporateTenant` called **at step 0**                                         | `organizations`                                                   | see FS2                                                                        | `OnboardingTearsheet.test.jsx`        | **gap (side-effect before confirm)** |
| `dashboard.readiness`    | `ProtectedRoute.jsx`                                                   | —                                                             | —                                        | —                                                                                            | —                                                                 | `user` only (no readiness/membership/policy)                                   | —                                     | **gap (direct-route bypass)**        |
| `payments.read`          | `PaymentManagementPage.jsx`                                            | —                                                             | KPI/charges/sellers/audit                | `rpc.get_tenant_payment_kpis` + table reads                                                  | `payment_*`, `audit_actions`                                      | authenticated + RLS                                                            | `PaymentManagementPage.test.jsx`      | **fixed** (`a919bc0`)                |
| `settings.cascade`       | `TenantCascadeSettings.jsx`                                            | —                                                             | 12 `setting_definitions`                 | `rpc.apply_setting_cascade` (DEFINER) / `rpc.resolve_effective_settings`                     | `scoped_settings`                                                 | authenticated+membership; DEFINER justified                                    | `TenantApplySettingCascade.test.jsx`  | local unit                           |
| `knowledge.rag`          | `KnowledgeVectorPage.jsx`                                              | —                                                             | documents                                | `edge.vector-rag`                                                                            | `knowledge_documents`                                             | `edge.*` JWT gateway + org membership (Data API)                               | —                                     | local                                |
| `passkey.*`              | (not yet a surface)                                                    | —                                                             | —                                        | `edge.passkey-auth` (registry only) + native `auth.passkey.*`                                | `auth.webauthn_credentials`                                       | native Supabase Auth                                                           | **uncommitted helper; flawed result** | **gap (Fase 8)**                     |

**Binding/surface maturity:** `surface_definitions`, `surface_revisions`, `operation_bindings`,
`setting_normative_map(_terms)`, `message_registry` are **all empty** → dynamic surface rendering
and normative↔setting mapping are **NORMATIVE_ONLY**; nothing may be declared CONFIGURED/WIRED.

---

## 3. The four documented failure states (confirmed against source)

| #   | Failure state                                                                                                                                                                                                                                                                                                                 | Evidence (source)                                                              | Status        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------- |
| FS1 | **Three independent onboarding ledgers.** `OnboardingFullPage` (5 steps, 9 `saveOnboardingProgress`/`persistStep` refs), `OnboardingTearsheet` (4 steps, 24 progress refs), `DashboardOnboarding` (heuristic checklist from `name`/`workspaces.length`/`knowledgeDocuments.length`/`plan_tier`). No shared run/step contract. | `OnboardingFullPage.jsx`, `OnboardingTearsheet.jsx`, `DashboardOnboarding.jsx` | **Confirmed** |
| FS2 | **Provisioning before confirmation.** `OnboardingTearsheet.handleNext()` calls `createOrUpdateCorporateTenant()` at `currentStep === 0` (`:113-124`) — a tenant is created before the user reviews/confirms the journey. Identifier is browser-built from name + `Date.now()`.                                                | `OnboardingTearsheet.jsx:109-124`                                              | **Confirmed** |
| FS3 | **Resume/rehydration not step-authoritative.** Rehydration reads the JSON blob but there is no run/step status, version, TTL, or authoritative validation; a returning user is not restored to a verified step.                                                                                                               | `OnboardingFullPage.jsx:211-257`                                               | **Confirmed** |
| FS4 | **Direct-route gate bypass.** `ProtectedRoute` only checks `user` (`:32-34`) and renders children; no readiness/membership/policy/step gate, so a direct URL to `/dashboard` bypasses onboarding completion. `SignInModal` uses `person.account_type` as a proxy, which is not a durable readiness gate.                      | `ProtectedRoute.jsx:19-34`                                                     | **Confirmed** |

---

## 4. ADR draft — tenancy & journey persistence

> **Status:** DRAFT for owner review. No migration proposed for application; forward-only/additive
> only, validated on disposable PG 17.11 before any remote request.

### 4.1 Context

The active tenancy model is `organizations` (42 cols) + `organization_members` + `workspaces` +
`projects`. PF/PJ is `persons.account_type` — a **person classification**, wrongly used as a
"create organization" trigger. `parent_organization_id` exists but there is **no** normalized
`tenant_kind` or `authority_level`. Legacy `tenants*` tables (0 rows) carry a parallel, unused model.
Onboarding progress lives in `persons.additional_property.onboarding` (generic JSON, holds PII).

### 4.2 Decision (proposed)

1. **Separate concepts**: identity/session ≠ `persons.account_type` ≠ `tenant_kind` ≠
   `authority_level` ≠ parent ≠ membership/role ≠ entitlement. PF/PJ never creates a tenant by itself.
2. **Tenancy columns (additive)**: `organizations.tenant_kind` (enum: `platform_operator, creative_agency, holding, network, client, unit, sandbox`) and `organizations.authority_level` (enum: `master, agency, tenant`), both server-derived/validated; parent tree with depth/cycle guard.
3. **Journey ledger (additive, new tables)**: `onboarding_runs` + `onboarding_step_states` —
   versioned, RLS by actor/context, unique `(run_id, step_key)`, optimistic concurrency (revision),
   TTL/expiry, audit events, allowlisted+schema-validated minimized payload (no secrets/PII dump),
   idempotency/correlation keys. Migrate existing `additional_property.onboarding` forward-compatibly
   (preserve history; legacy read-only fallback).
4. **Readiness**: server-authoritative `resolve_onboarding_readiness` returning
   `allow | require_steps | blocked | unavailable` + reason + next step + `run_id`; consumed by
   `ProtectedRoute`/sign-in/restore/context-switch (closes FS4).
5. **Provisioning**: move tenant creation to an explicit, idempotent, transactional confirm action
   (org + parent link + owner membership + workspace/project + entitlement snapshot + audit/outbox),
   with backend-generated identifier/slug + idempotency key (closes FS2). Separate `create` vs `update`.

### 4.3 Consequences

- Requires **owner-authorized additive migrations** (tenancy columns, run/step ledger, possibly
  RPC grant tightening for the three `anon`-executable INVOKER RPCs). None applied in Fase 0.
- Legacy `tenants*`: document as legacy; migration/deprecation is a **separate ADR**; no action now.
- PII: `additional_property.onboarding` PII must be minimized/redacted/TTL'd; canonical records hold
  legal data; no PII in logs/analytics/CI artifacts.

---

## 5. Gaps, confidence, pending decisions

| Gap / risk                                                                      | Confidence | Evidence                     | Decision needed                                                                   |
| ------------------------------------------------------------------------------- | ---------- | ---------------------------- | --------------------------------------------------------------------------------- |
| PR #7 lacks human review; Vercel bot `COMMENTED` only                           | **High**   | `gh pr view 7`               | Human review required before merge.                                               |
| `browser-smoke` pending on `a919bc0` at capture                                 | Medium     | `gh pr checks 7`             | Confirm green before any merge ask.                                               |
| `anon EXECUTE` on 3 INVOKER RPCs                                                | **High**   | RPC grant query              | Review per-function; tightening = additive migration (owner).                     |
| No `tenant_kind`/`authority_level` columns                                      | **High**   | `organizations` column query | ADR §4 + additive migration.                                                      |
| No journey run/step ledger                                                      | **High**   | workflow-table query (none)  | ADR §4 + additive migration.                                                      |
| FS1–FS4                                                                         | **High**   | source grep §3               | Addressed across Fases 1–5.                                                       |
| `public.passkey_credentials` empty; native store is `auth.webauthn_credentials` | **High**   | table + schema query         | Detection must use native `auth.passkey.list()`; fix flawed helper (Fase 8).      |
| Legacy `tenants*` (0 rows)                                                      | **High**   | counts query                 | Legacy ADR; no populate/drop.                                                     |
| `@carbon/react` version                                                         | **High**   | lockfile `1.117.0`           | All Carbon API claims must target `1.117.0` / `ibm-products@2.100.0`, not `1.73`. |
| Bindings/surfaces/settings-map all empty                                        | **High**   | counts query                 | NORMATIVE_ONLY; nothing declared CONFIGURED+.                                     |

---

## 6. Recommendation for the next phase

1. **Hold PR #7** until a **human** review is recorded. All required checks on `a919bc0` are green
   and the payments bot comment is addressed by `a919bc0`, but the draft PR has **no human approval**
   (`reviewDecision` empty; only the `vercel` bot `COMMENTED`). Do **not** merge yet.
2. **Proceed to Fase −1 (Spec Control Plane) planning** using this baseline: define the spec schemas
   (journey/field/operation/policy/surface), the deterministic validator, the task-envelope generator,
   and the evidence ledger format — grounded in the traceability matrix above.
3. **Fase 1** then runs the Gap Protocol against FS1–FS4 and the tenancy/run-ledger ADR (§4),
   producing the ADR for owner sign-off before any additive migration is drafted.
4. **Passkeys (Fase 8)** only after the Carbon/API version claims are pinned to lockfile
   (`@carbon/react@1.117.0`, `@supabase/auth-js@2.118`) and the `listPasskeys` helper returns a
   discriminated result. The uncommitted `TenantContext` passkey change is preserved for that phase.

**Fase 0 complete.** No mutations performed; Fase −1 and all implementation remain gated on this
evidence and the pending human decisions above.
