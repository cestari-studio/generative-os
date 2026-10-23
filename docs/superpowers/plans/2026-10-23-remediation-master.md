# Remediation master plan — 2026-10-23

Source directive: `DIRECIONAMENTO_MASTER.md` (2026-10-23 handoff). Execution repo:
`cestari-studio/generative-os`. Normative reference (read-only): `cestari-studio/genOS`.

## Baseline reconciled at start (read-only)

| Item                   | State                                                                                                                   | Evidence                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| HEAD before this cycle | `98fc0a0` on `feat/complete-carbon-page-rebuild` (PR #7)                                                                | `git log`                                                               |
| PR stack               | #9 → #8 → #2 → #3 → #4 → #5 → #6 → #7 (merge commits, owner gate)                                                       | directive §1.4                                                          |
| #8 official CI         | FAILURE at lint, run 39739746838, SHA `f1de94f3`                                                                        | directive §1.3                                                          |
| Human reviews          | 0 on all PRs                                                                                                            | prior cycles                                                            |
| Remote Supabase        | 17 migrations applied (last `20261022002300`); billing + catalog migrations absent; 6 Edge Functions `verify_jwt=false` | re-confirmed 2026-10-23: 18/18 expected tables absent via `to_regclass` |
| Vercel                 | project listed; detail 404; deployments 403; `linkedProjects: []`                                                       | prior read-only reads                                                   |
| Identity `...0010`     | frozen — no mutation                                                                                                    | AGENTS.md                                                               |
| Ontology bindings      | 19/225 features with `page_keys`, 76/225 with `operation_ids`                                                           | registry-coverage-matrix.json                                           |

## P0-1 Catalog integration test safety + CI execution (THIS CYCLE)

**Problem (directive §6.1):** `catalog-adapter-integration.test.mjs` auto-detected any
Postgres on a local port and ran `DROP DATABASE` against it. CI reported
208 passed + 7 skipped at `98fc0a0` — the 7 catalog tests never ran in CI.

**Fix (TDD):**

- [x] RED: `src/__tests__/catalog-test-guard.test.mjs` — 11 unit tests for
      fail-closed guard behavior (no opt-in → skip; remote host → error; missing
      recreate flag → error; system db → error; invalid port/name → error; no
      secrets in any reason string).
- [x] GREEN: `src/test/catalog-test-guard.mjs` — `resolveCatalogTestTarget()`
  - `assertDisposablePostgres()` implementing the guard.
- [x] Rewrite integration test to consume the guard; opted-in + unreachable →
      suite failure (never silent skip); terminate stale backends before recreate.
- [x] CI `quality` job: `postgres:17` service container (health-checked);
      explicit `CATALOG_TEST_ENABLE=1`, `CATALOG_TEST_ALLOW_RECREATE=1`,
      `CATALOG_TEST_DATABASE=catalog_adapter_it`, `PGHOST=127.0.0.1`, `PGPORT=5432`.
- [x] New CI step asserts JSON reporter output: exactly 7 passed / 0 skipped,
      else the gate fails. A skip can no longer count as success.

**Verification (local, disposable PostgreSQL 17.11):**

| Scenario                        | Result                               |
| ------------------------------- | ------------------------------------ |
| No opt-in                       | 219 passed + 7 intentionally skipped |
| Opt-in, loopback, recreate flag | 226 passed + 0 skipped               |
| Opt-in, remote host             | hard error (fail closed)             |
| Opt-in, no recreate flag        | hard error (fail closed)             |
| PG 16 server                    | refused by version guard             |

**CI evidence:** run 39901369262 on SHA `2f2a0f2` — all 4 jobs green
(quality / ssr-smoke / billing-sql / release-dry-run); quality log line
`catalog integration: total=7 passed=7 skipped=0` at 2026-10-23T04:40:35Z.

**Exit criteria:** CI `quality` green on `2f2a0f2` with the assertion step
printing `total=7 passed=7 skipped=0`. Status: **PASS**.

## P0-2 Brand DNA fictional tenants removed (THIS CYCLE)

**Problem (directive §7):** the Brand DNA tab rendered 12 hardcoded fictional
tenants (`BRAND_DNA_PROFILES`: "All Life Institute", "Clareira de Avalon",
"PUTTINATO", …) as if they were real configured tenant brands — runtime-
prohibited fixed list presented as operational data. No backend brand
registry exists (no brand/tenant tables in the schema).

**Fix (TDD):**

- [x] RED: test asserts fictional tenants never render and the unprovisioned
      state is shown (`PUTTINATO`, `All Life Institute`, `Clareira de Avalon`
      absent; "Brand DNA registry not provisioned" present).
- [x] GREEN: tab content replaced with the honest unprovisioned state; all
      `BRAND_DNA_PROFILES` wiring removed (import, search state, filtered/active
      memos, table rows/headers, inspector sidebar); unused Carbon imports
      removed; tab label no longer claims "(12)"; locale keys in 6 locales.

**Verification (local):** page tests 3/3; full suite 219 passed + 7
intentionally skipped (no opt-in); lint clean; build OK.

**CI evidence:** pending — SHA `f6180c7` (run 39901931522).

## Phase 2 runtime mock/demo/fake audit (THIS CYCLE)

Searches executed over runtime `src/` (excluding tests) and
`supabase/functions/`: `mock|demo|fake|fixture`, `example.com`, sample
emails/CPF/CNPJ patterns, `setTimeout`-simulated backend, `window.alert`,
static arrays presented as data, `setSearchResults` sources, dashboard data
sources.

**Result:** no remaining runtime-prohibited findings. Evidence:

- `useTenant.js` / `TenantContext.jsx`: all org/workspace/project/persons/
  documents/media/audit data via `supabase.from(...)` / `supabase.rpc(...)`;
  context contract documents the no-synthetic-fallback rule.
- `DashboardCharts`/`DashboardKpis`: data from `useDashboardData()` →
  `useTenant()` (backend), not static arrays.
- `KnowledgeVectorPage`: search results from the vector-rag Edge Function
  (`setSearchResults(data?.results || [])` — empty state, not fabricated).
- `pagbank-order` (versioned): amount from consumed quote
  (`quoteResult.total_cents`), synthetic charges explicitly blocked; the
  `Date.now()` reference is only a display-label default — authoritative
  reference is the DB `gateway_reference_id` from `claim_pagbank_order`.
- `pagbank-connect`: fake OAuth flows explicitly blocked.
- `genOsCatalog.js` remains on disk as the verified static taxonomy reference
  but is no longer imported by any runtime page.

**Residual risk:** the audit is search-based; the manual contextual review of
less obvious spots continues in the next cycle (settings cascade drafts,
onboarding copy, notifications).

## P0-3 Hydration mismatch eliminated + browser-smoke gate (THIS CYCLE)

**Found by:** the new local browser smoke (first run caught it).

**Root cause:** lazy route subtrees hydrate AFTER `TenantProvider`'s mount
effect fires `initializeSession` → `refreshTenantData` → `setLoading(true)`.
When the suspended subtree finally hydrated, `ProtectedRoute` rendered
`loading=true` (spinner gate) while the SSR HTML held the anonymous access
gate — React hydration mismatch on `/dashboard`, `/products`, `/knowledge`.
Second breaker: `useDashboardData` used `useState(() => Date.now())` — the
exact pattern the React error message names.

**Fix (TDD via browser smoke RED→GREEN):**

- [x] `refreshTenantData` gains `{ silent }`; mount-time refresh is silent
      (explicit user refreshes keep the spinner).
- [x] dashboard clock via `useSyncExternalStore` (server snapshot null,
      client snapshot cached per-load) + explicit refresh anchor.
- [x] `scripts/browser-smoke.mjs`: 24 local Chromium assertions — HTTP
      status, non-empty SSR `#root`, expected anonymous content (access gate on
      private routes), zero fictional demo tenant content, zero fatal page
      errors (hydration regressions fail).
- [x] CI `browser-smoke` job (Chromium via `playwright install`). **Not a
      required check** — branch protection is owner-only (§16.3); recommend
      adding `browser-smoke` to required checks after owner review.

**Verification:** 24/24 browser assertions, 219 unit + 7 skipped, lint clean.
Before the fix the same smoke reported 3 hydration failures.

**CI evidence:** pending — SHA `2f3ffca`.

## P1 matrix consistency gate (THIS CYCLE)

- [x] `scripts/validate-matrices.mjs` + `npm run check:matrices` wired into
      the quality job: binding counters internally consistent, canonical counts
      MATCH with equal numbers, no achieved `E2E_VERIFIED`/`ACCEPTED` status
      without per-SHA artifact evidence, crosswalk/JSON counters agree.
      Negative path verified (planted `E2E_VERIFIED` status cell fails).

**CI evidence:** pending — SHA `a7ccf68` (in the `2f3ffca` tree).

## Next non-blocked tasks (queue)

1. **Phase 2 — mock/demo/fake runtime audit** (`src/`, Edge Functions,
   workflows): automated searches + contextual review; classify per directive
   taxonomy; replace prohibited findings with real backend or honest states.
   Focus: Brand DNA tab in `ProductsCatalogPage.jsx` (static
   `BRAND_DNA_PROFILES` still presented as data), dashboard tabs, knowledge.
2. **Phase 10 — local E2E/browser layer**: Playwright against local SSR
   server for auth guards, tenant switch, knowledge empty/error states —
   clearly labeled LOCAL, not Preview E2E.
3. **Phase 6 — ontology coverage engine**: recalc counters from
   `registry-coverage-matrix.json` (never hand-written); keep bindings
   evidence-based only.
4. **Runtime reconciliation packet refresh** (read-only): re-pull remote
   migration ledger + function versions to keep `expected vs observed` fresh.
5. **SECURITY DEFINER consumer map** (read-only + local analysis): build
   function→consumers→grants→checks table for the 4 flagged functions.

## Human gates (unchanged)

- Merge sequence #9→#8→…→#7: `HUMAN_REVIEW_REQUIRED` (0 reviews).
- Remote Supabase migration/function deploy: `BLOCKED_OWNER` (needs isolated
  non-prod target + explicit authorization).
- Vercel Preview/E2E: `BLOCKED_OWNER` (404/403 connector access).
- Identity `...0010`: `BLOCKED_OWNER` (authoritative source decision).
- SECURITY DEFINER grant changes: `BLOCKED_OWNER` (consumer map first).
- PagBank sandbox E2E: `BLOCKED_OWNER` (sandbox credentials).
- Leaked-password protection: `BLOCKED_OWNER` (Auth policy confirmation).

## Notes for owner

- 4 untracked `PRIVACY_POLICY*` draft files sit in the repo root (Portuguese
  content describing an unrelated product). They broke the repo-wide cspell
  gate locally. Content untouched; paths added to `cspell.json` `ignorePaths`.
  Decide whether they belong in this repo at all.
