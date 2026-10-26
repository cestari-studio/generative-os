# Consumer Inventory + Substitution Matrix: `create_or_update_corporate_tenant`

**Date:** 2026-10-26
**Worker:** Worker A (inventory + consumers)
**Scope:** Complete consumer inventory for the vulnerable legacy RPC `create_or_update_corporate_tenant` and substitution path to the safe successor `provision_corporate_tenant` (migration `20261026140000`).

---

## 1. Complete Hit Inventory

### 1.1 Runtime Consumers (actually invoke the RPC)

| #   | File                                                | Line(s)                      | Role                                                                                                                                                         | How it invokes                                                                     |
| --- | --------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| R1  | `src/context/TenantContext.jsx`                     | 466–506                      | **Defines** `createOrUpdateCorporateTenant` — the wrapper that calls `supabase.rpc('create_or_update_corporate_tenant', {…13 args…})` via the browser client | Direct RPC call via `getSupabaseBrowserClient()` (user JWT, **supabaseUser** role) |
| R2  | `src/components/onboarding/OnboardingFullPage.jsx`  | 166 (import), 410–422 (call) | **Primary onboarding PJ flow** — full-page wizard step 3; calls `createOrUpdateCorporateTenant()` with org details collected from the form                   | Consumes R1 via `useTenant()` context                                              |
| R3  | `src/components/onboarding/OnboardingTearsheet.jsx` | 36 (import), 123–131 (call)  | **Secondary onboarding surface** — Carbon Tearsheet; calls `createOrUpdateCorporateTenant()` at **step 0** (before user confirms)                            | Consumes R1 via `useTenant()` context                                              |

**Total runtime consumers: 3** (one definition + two UI call sites)

### 1.2 Test / Fixture References

| #   | File                                         | Line(s)      | Role                                                                                                                                                                                                                                                                | Type                                  |
| --- | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| T1  | `src/__tests__/OnboardingTearsheet.test.jsx` | 19, 51, 77   | Mocks `createOrUpdateCorporateTenant` as `mockCreateCorporate` for unit tests                                                                                                                                                                                       | **Test mock** — no real RPC call      |
| T2  | `src/context/useTenant.js`                   | 66           | Default no-op in `DEFAULT_CONTEXT_VALUE`: `createOrUpdateCorporateTenant: async () => {}`                                                                                                                                                                           | **Context contract stub**             |
| T3  | `supabase/tests/_prereq_rpc_grants.sql`      | 21–40        | Creates a **behavioral stub** of the legacy RPC — a faithful mirror of the real 20261018225420 body (ON CONFLICT conflict-update + org_owner promotion + context switch) — plus an `alter_policies` switch for the permissive/hardened organizations policy surface | **Test fixture** — disposable DB only |
| T4  | `supabase/tests/rpc_grants_no_anon.sql`      | 28–34, 59–64 | Tests that `anon` is denied and `service_role` is allowed on the legacy RPC                                                                                                                                                                                         | **Test assertion** — grant audit      |

### 1.3 Migration Definitions

| #   | File                                                                                | Line(s)    | Role                                                                                                                          |
| --- | ----------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| M1  | `supabase/migrations/20261018225420_onboarding_pf_pj_multi_country_and_chinese.sql` | 111–284    | **Creates** the legacy RPC (`SECURITY INVOKER`, 13 args, `ON CONFLICT (identifier) DO UPDATE` + member `org_owner` promotion) |
| M2  | `supabase/migrations/20261026130100_rpc_grants_remove_anon_excess.sql`              | 30–33      | **Revokes** `PUBLIC`/`anon` EXECUTE, keeps `authenticated` + `service_role`                                                   |
| M3  | `supabase/migrations/20261026140000_provision_corporate_tenant_safe.sql`            | 7, 39, 175 | **Creates** the successor `provision_corporate_tenant`; references the legacy RPC in comments                                 |

### 1.4 Documentation / Audit References

| #   | File                                               | Line(s)              | Role                                                                                                                       |
| --- | -------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D1  | `docs/fase0-preflight-report.md`                   | 88, 107–109          | Preflight audit table showing INVOKER + anon EXECUTE exposure; documents the OnboardingTearsheet side-effect-at-step-0 gap |
| D2  | `docs/release-evidence-ledger.md`                  | 20, 27, 36, 98       | Evidence ledger tracking `BLK-rpc-anon-exec` and the separate takeover defect                                              |
| D3  | `docs/rpc-grants-security-definer-audit.md`        | 35, 110–276          | Detailed audit of the RPC's grants, defects, and consumer map                                                              |
| D4  | `docs/onboarding-wizard-steps-and-passkey-plan.md` | 42, 175–181, 277–279 | Plan documenting defects and migration checklist                                                                           |
| D5  | `docs/ui-rebuild/tools-mcp-sdk-api-registry.md`    | 42                   | Registry listing the RPC as active                                                                                         |
| D6  | `docs/ui-rebuild/master-directive.md`              | 350, 370, 1262, 1507 | Master directive §6.2 calling for consumer mapping and takeover fix                                                        |
| D7  | `scripts/check-rpc-grant-exposure.mjs`             | 16                   | CI guard referencing the RPC in its rationale comment                                                                      |
| D8  | `specs/rpc-grant-allowlist.json`                   | 7                    | Allowlist note documenting the correction                                                                                  |

### 1.5 Spec / Baseline References

| #   | File                  | Line(s) | Role                                                                 |
| --- | --------------------- | ------- | -------------------------------------------------------------------- |
| S1  | `specs/baseline.json` | 6, 64   | Lists the RPC in `endpoints_anon` and the general endpoint inventory |

---

## 2. Runtime Consumer Detail

### R1 — `TenantContext.jsx:466-506` (Definition)

- **What:** `createOrUpdateCorporateTenant` — a `useCallback` wrapper that calls `supabase.rpc('create_or_update_corporate_tenant', {…})` with 13 named args.
- **Client:** `getSupabaseBrowserClient()` → `@supabase/ssr` `createBrowserClient` with `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key, user JWT attached via cookie).
- **Auth context:** **supabaseUser** (authenticated end-user's JWT). The RPC's `SECURITY INVOKER` means RLS applies as that user. The function body re-checks `auth.uid()`.
- **Args passed:** All 13 parameters from the legacy RPC signature:
  ```
  p_name, p_identifier, p_legal_name, p_tax_id, p_country_code,
  p_size_category, p_revenue_range, p_registration_number, p_industry_code,
  p_address (jsonb), p_in_language, p_workspace_name, p_project_name
  ```
- **Post-call:** `await refreshTenantData()` — reloads the tenant tree into context.
- **Registry entry:** **NOT in `ENDPOINT_ALLOWLIST`** (`runtime-registries.js`). The RPC is absent from the code-owned registry — it's a runtime call that predates the registry contract.

### R2 — `OnboardingFullPage.jsx:410-422` (Primary Call Site)

- **Flow:** Full-page onboarding wizard, step 3 ("PJ" corporate path). Called when the user selects "create new" (no existing `selectedOrgId`).
- **Identifier construction:** `${slug}-${Date.now().toString(36).slice(-4)}` — **always unique** by design (timestamp suffix), meaning the conflict path is effectively unreachable from this consumer.
- **Args passed:** `name`, `identifier`, `legalName`, `taxId`, `countryCode`, `sizeCategory`, `registrationNumber`, `address`, `inLanguage`, `workspaceName`, `projectName` — mapped 1:1 to the 13 RPC params.
- **Behavioral dependency:** **Fresh-create only.** The identifier is always unique (browser-constructed with a timestamp suffix). The `ON CONFLICT DO UPDATE` path is never intentionally triggered.
- **Auth context:** Authenticated user JWT (via TenantContext wrapper R1).

### R3 — `OnboardingTearsheet.jsx:123-131` (Secondary Call Site)

- **Flow:** Carbon Tearsheet onboarding, called at `currentStep === 0` (before the user reviews/confirms).
- **Identifier construction:** `orgName.toLowerCase().replace(/[^a-z0-9]/g, '-')` — **deterministic from the org name**, meaning if two users (or the same user in a retry) enter the same org name, the identifier collides and the conflict path fires.
- **Args passed:** `name`, `identifier`, `legalName`, `taxId`, `countryCode`, `workspaceName` — only 6 of 13 params; the rest fall to PostgreSQL defaults.
- **Behavioral dependency:** **Can hit the conflict-update path** (deterministic identifier, no uniqueness suffix). This is the ONLY consumer that could realistically trigger the vulnerable `ON CONFLICT DO UPDATE` + `org_owner` promotion. However, the known FS2 gap (called at step 0 before confirmation) means this surface is already flagged for redesign.
- **Auth context:** Authenticated user JWT (via TenantContext wrapper R1).

---

## 3. Registry Entry Check

**`src/config/runtime-registries.js` — `ENDPOINT_ALLOWLIST`:**

`create_or_update_corporate_tenant` is **NOT registered** in the `ENDPOINT_ALLOWLIST`. It has no `rpc.*` key. The successor `provision_corporate_tenant` is also not yet registered. This means:

1. The legacy RPC operates outside the registry contract (predates it).
2. Migrating to `provision_corporate_tenant` should include registering it as `rpc.provision_corporate_tenant` with `auth: 'authenticated'`.

---

## 4. Substitution Matrix

| Consumer                              | Current Call                                                                                                                                                                                                                  | Permission Needed                         | Behavioral Dependency                                                                                                          | Replacement Mapping                                                                                                                                                                                                                                                                         | Migration Effort                                                                    | Risk if Left on Legacy                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1** `TenantContext.jsx:483`        | `supabase.rpc('create_or_update_corporate_tenant', {…13 args})`                                                                                                                                                               | `authenticated` EXECUTE (already granted) | Wraps the RPC for all consumers; passes args through                                                                           | Change RPC name to `'provision_corporate_tenant'`. Args map 1:1 (same param names, same 13-arg signature). No arg-shape change needed.                                                                                                                                                      | **Trivial** — single-line RPC name swap                                             | **HIGH** — continues to expose the takeover-vulnerable conflict path to any caller who can construct a matching identifier                                               |
| **R2** `OnboardingFullPage.jsx:410`   | `createOrUpdateCorporateTenant({ name, identifier, legalName, taxId, countryCode, sizeCategory, registrationNumber, address, inLanguage, workspaceName, projectName })`                                                       | `authenticated` EXECUTE (via R1)          | **Fresh-create only** — identifier always unique (timestamp suffix)                                                            | No code change needed in this file — the change is in R1's RPC name. The successor's takeover guard is never triggered (identifier is unique).                                                                                                                                              | **Zero** — inherits R1's fix automatically                                          | **MEDIUM** — currently safe by accident (unique identifier), but the legacy RPC's conflict path is a loaded gun available to anyone who calls it directly                |
| **R3** `OnboardingTearsheet.jsx:123`  | `createOrUpdateCorporateTenant({ name, identifier, legalName, taxId, countryCode, workspaceName })`                                                                                                                           | `authenticated` EXECUTE (via R1)          | **Can hit conflict-update** — deterministic identifier from org name; the ONLY consumer that could trigger the vulnerable path | No code change needed in this file — the change is in R1's RPC name. **BUT:** the successor will raise `42501` (takeover denial) if the identifier already exists and the caller is not org_owner/org_admin, which is the CORRECT behavior. The caller should handle this error gracefully. | **Low** — inherits R1's fix; should add error handling for the takeover-denial case | **CRITICAL** — this is the consumer most likely to accidentally trigger the takeover vulnerability (deterministic identifier, called at step 0 before user confirmation) |
| **T1** `OnboardingTearsheet.test.jsx` | Mocks `createOrUpdateCorporateTenant` as vi.fn()                                                                                                                                                                              | N/A (test mock)                           | N/A                                                                                                                            | Update mock name if the context export name changes; otherwise no change                                                                                                                                                                                                                    | **Zero**                                                                            | None                                                                                                                                                                     |
| **T3** `_prereq_rpc_grants.sql`       | Behavioral stub of legacy RPC for disposable-DB tests (updated 2026-10-26: mirrors the real 20261018225420 body + `alter_policies` surface switch; harnesses apply the REAL `provision_corporate_tenant` from 20261026140000) | N/A (test fixture)                        | N/A                                                                                                                            | DONE (2026-10-26): the provision successor is no longer stubbed here — harnesses apply the real 20261026140000 body                                                                                                                                                                         | **Done**                                                                            | None (test-only)                                                                                                                                                         |
| **T4** `rpc_grants_no_anon.sql`       | Tests anon denied / service_role allowed on legacy RPC                                                                                                                                                                        | N/A (test assertion)                      | N/A                                                                                                                            | Should add equivalent tests for `provision_corporate_tenant` (anon denied, authenticated allowed)                                                                                                                                                                                           | **Low**                                                                             | None (test-only)                                                                                                                                                         |

---

## 5. Break-If-Revoked Analysis

**If the legacy RPC `create_or_update_corporate_tenant` were revoked tomorrow:**

| Consumer                          | Breaks?                                | Why                                                                       |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| R1 `TenantContext.jsx`            | **YES** — all onboarding PJ flows fail | The RPC call would return a permission-denied or function-not-found error |
| R2 `OnboardingFullPage.jsx`       | **YES** — primary PJ onboarding breaks | Calls R1 which calls the revoked RPC                                      |
| R3 `OnboardingTearsheet.jsx`      | **YES** — secondary onboarding breaks  | Calls R1 which calls the revoked RPC                                      |
| T1 `OnboardingTearsheet.test.jsx` | **NO** — mocks only                    | Tests mock the context function, never hit the real RPC                   |
| T3 `_prereq_rpc_grants.sql`       | **NO** — creates its own stub          | Test fixture creates the function in disposable DB                        |
| T4 `rpc_grants_no_anon.sql`       | **NO** — tests grants on the stub      | Tests the stub from T3, not the live function                             |

**Summary:** All 3 runtime consumers break. All test fixtures are self-contained and unaffected.

---

## 6. Conflict-Update Dependency Verdict

**Does ANY runtime consumer depend on the vulnerable conflict-update behavior?**

| Consumer                 | Depends on conflict-update?               | Evidence                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 `OnboardingFullPage`  | **NO**                                    | Identifier is always unique (`slug + timestamp`); conflict path is unreachable                                                                                                                                                           |
| R3 `OnboardingTearsheet` | **Not intentionally, but CAN trigger it** | Identifier is deterministic (org-name slug); a name collision hits the conflict path. This is a bug (FS2 + takeover risk), not a feature the consumer depends on. The consumer would be BETTER OFF with the successor's takeover denial. |

**Verdict: NO consumer intentionally depends on the conflict-update behavior.** R3 can accidentally trigger it, but that's a defect, not a dependency. All consumers can be cleanly migrated to `provision_corporate_tenant`.

---

## 7. Recommended Migration Order (Safest First)

### Step 1: `TenantContext.jsx` (R1) — RPC name swap

- **What:** Change `'create_or_update_corporate_tenant'` → `'provision_corporate_tenant'` on line 483.
- **Why first:** Single point of change; all consumers flow through this wrapper. Zero arg-shape change needed (same 13-param signature).
- **Risk:** Minimal — successor has identical param names and defaults. The takeover guard only fires on identifier collision (which no consumer intentionally triggers).
- **Effort:** 1-line change.

### Step 2: Register in `ENDPOINT_ALLOWLIST`

- **What:** Add `'rpc.provision_corporate_tenant': { kind: 'rpc', target: 'provision_corporate_tenant', auth: 'authenticated' }` to `runtime-registries.js`.
- **Why second:** Brings the successor under the registry contract. Also remove the legacy RPC from `specs/baseline.json`'s `endpoints_anon` list (or mark it deprecated).
- **Effort:** Small — one entry added, baseline updated.

### Step 3: `OnboardingTearsheet.jsx` (R3) — Add takeover-denial error handling

- **What:** Handle the `42501` error that `provision_corporate_tenant` raises when the identifier already exists and the caller is not an admin. Show a user-friendly message ("This organization name is already in use").
- **Why third:** The only consumer that can hit the conflict path. The successor correctly denies it, but the UI should handle the error gracefully rather than showing a raw Supabase error.
- **Effort:** Small — add error branch in the existing try/catch.
- **Note:** The FS2 gap (provisioning at step 0 before confirmation) is a SEPARATE pre-existing issue tracked in the onboarding plan; this migration does not fix or worsen it.

### Step 4: Update test fixtures

- **What:** Add `provision_corporate_tenant` stubs to `_prereq_rpc_grants.sql` and add grant tests to `rpc_grants_no_anon.sql` (or a new test file). Update `OnboardingTearsheet.test.jsx` mock name if the context export name changes.
- **Why last:** Tests should verify the new state, not gate the migration.
- **Effort:** Small.

### Step 5 (owner decision, not blocking): Deprecate the legacy RPC

- **What:** Revoke `authenticated` EXECUTE on `create_or_update_corporate_tenant`, or drop it entirely.
- **Why:** Only after all consumers are confirmed on the successor. This is an owner-authorized destructive action.
- **Effort:** One migration (REVOKE or DROP).

---

## 8. Edge Function Check

**No Edge Function in `supabase/functions/` references `create_or_update_corporate_tenant` or `createOrUpdateCorporateTenant`.** The RPC is exclusively a browser-to-PostgREST call. No server-side (Deno) consumer exists.

---

## 9. Summary

| Metric                                                | Value                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| **Total runtime consumers**                           | **3** (1 definition + 2 call sites)                              |
| **Consumers depending on vulnerable conflict-update** | **0** (R3 can accidentally trigger it, but doesn't depend on it) |
| **Consumers that break if legacy RPC revoked**        | **3** (all runtime consumers)                                    |
| **Consumers migratable cleanly**                      | **3** (all — single RPC name swap in R1 propagates to R2 and R3) |
| **Edge Function consumers**                           | 0                                                                |
| **Registry entry exists**                             | No (legacy RPC not in `ENDPOINT_ALLOWLIST`)                      |
| **Successor arg-mapping compatibility**               | 100% — identical 13-param signature, same names, same defaults   |
