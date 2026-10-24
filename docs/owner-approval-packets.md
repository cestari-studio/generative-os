# Owner approval packets — blocked operations ready for decision

> Each packet identifies the resource, environment, operation, branch/SHA,
> risk, rollback condition, and the validation that must follow approval —
> per the master directive §3.2. **None of these has been executed.** All
> local preparation is complete and CI-verified at the SHA cited.

## 1. Supabase runtime reconciliation — **EXECUTED 2026-10-23 (owner-authorized, production)**

**Status: COMPLETE.** Owner authorized the production Supabase as the deploy
target with full scope. Executed via `supabase db push` + `supabase db query
--linked` + `supabase functions deploy` against `ldjfjmihdvdmltrptngf`
(generative-os project — NOT the sibling genOS).

- **Migrations (4, dependency order, additive):** billing `20261022053203`,
  catalog `20261022060000`, workspace `20261023000000`, notifications
  `20261023010000`. Ledger now 21 (was 17). Read-back: all tables + RPCs present.
- **Catalog seed:** 5 products, 30 subproducts, 9 capabilities, 6 services,
  1 version (normative registries with provenance).
- **Functions (6):** passkey-auth v7, settings-cascade v5, vector-rag v7,
  pagbank-connect v6, pagbank-order v6, pagbank-webhook v7. verify_jwt:
  5 true, pagbank-webhook false (by design).
- **Hardening verified live:** passkey anonymous challenge/list → 401;
  pagbank-order anonymous → 401 gateway; catalog anon read → RLS denies (correct).
- **Runtime drift RESOLVED** — code verified in CI is the code deployed in
  production. deploy-manifest v3.0.

The original packet below is retained for the rollback reference.

| Field                                            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource                                         | Project `ldjfjmihdvdmltrptngf` (`generative-os`, sa-east-1, PG 17.11) — **never** the sibling `jkespoegdpkdcrxsxwry` (44 migrations, 15 functions — a distinct project, not a target)                                                                                                                                                                                                                                                                                             |
| Environment requested                            | An **isolated non-production** Supabase project/branch first; production only after non-prod verification                                                                                                                                                                                                                                                                                                                                                                         |
| Operation                                        | Apply 4 migrations in dependency order + deploy 6 Edge Functions from the versioned source; set `verify_jwt` per `supabase/config.toml` (5 true, `pagbank-webhook` false)                                                                                                                                                                                                                                                                                                         |
| Branch/SHA                                       | migrations + functions as in PR #7 @ `bf93ea7` (CI green at `8dc0716` for the code; these 2 doc commits add no code)                                                                                                                                                                                                                                                                                                                                                              |
| Current observed drift (read 2026-10-23 cycle 4) | 17 migrations applied (last `20261022002300`); **4 migrations unapplied**: billing `20261022053203`, catalog `20261022060000`, workspace `20261023000000`, notifications `20261023010000`. Tables `workspaces` + `payment_orders` present; `notifications`, `quotes` absent. RPCs `create_workspace`, `mark_notification_read`, `issue_manual_quote`, `consume_quote`, `claim_pagbank_order` absent. 6 functions `verify_jwt=false`; `passkey-auth`/`pagbank-order` pre-hardening |
| Remediation sequence (dependency-checked)        | **1.** billing `20261022053203` (self-contained prereq) → **2.** catalog `20261022060000` (needs billing `has_platform_role`) → **3.** workspace `20261023000000` (independent) → **4.** notifications `20261023010000` (independent). All additive (CREATE TABLE/CREATE OR REPLACE FUNCTION/CREATE POLICY/GRANT — no drops)                                                                                                                                                      |
| Risk                                             | 4 schemas become live + function behavior changes. Mitigated by: 44 billing + 7 catalog + 5 workspace + 5 notifications SQL assertions green on disposable PG 17.11; function unit tests (8 PSP + challenge fail-closed + tenant-access) green                                                                                                                                                                                                                                    |
| Rollback / forward-recovery                      | Migrations are additive — no drops to reverse; a mid-sequence failure leaves earlier migrations applied (re-runnable, idempotent). Pre-deployment snapshot/backup required                                                                                                                                                                                                                                                                                                        |
| Validation after approval                        | read-back: ledger shows all 4 versions; `to_regclass` returns the new tables; RPCs present; re-run all 4 SQL suites against the non-prod target; passkey anonymous challenge 401; pagbank-order rejects amountCents; create_workspace cross-tenant denied; notifications cross-tenant invisible                                                                                                                                                                                   |

## 2. Edge Functions `verify_jwt` alignment — **EXECUTED 2026-10-23 (with the deploy)**

**Status: COMPLETE** (folded into the §1 production deploy). `supabase
functions deploy` applied the config.toml verify_jwt automatically: 5 true
(`passkey-auth`, `settings-cascade`, `vector-rag`, `pagbank-connect`,
`pagbank-order`), `pagbank-webhook` false (ECDSA signature in-handler, by
design). Verified live: anonymous calls to the 5 → 401; the webhook retains
its signature-based authenticity path.

## 3. Vercel — Git integration VERIFIED; production promotion still gated

| Field                                     | Value                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource                                  | Existing Vercel project `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC` (scope `cestari-studio`, CLI user `octavio-4895`)                                                                                                                                                                                                                                                                                               |
| Git integration (2026-10-23 07:17:46 UTC) | **CONNECTED and VERIFIED** — owner connected `cestari-studio/generative-os` (repoId 1422711827, productionBranch `main`, gitCredentialId present). Auto-deploys a Preview per push: `b5b50e6` → `generative-1rgmk27fy` (READY), `a00bc50` → `generative-3pjqt4cw5` (READY), `bf93ea7` → `generative-le2mi9kth` — all `source=git`, exact SHAs. Access via `vercel curl` (Deployment Protection SSO active) |
| Preview validation                        | `/` serves "Cestari Studio" SSR; `/dashboard` + `/products` show the honest access gate; hydration fix present. **The code verified by CI is the code deployed in the Preview**                                                                                                                                                                                                                            |
| Production staleness                      | `app.cestari.studio` + `generative-os-bay.vercel.app` → `generative-3ifcp8qi3` = **`b580fc8` (2026-10-16)**, 146+ commits behind. Unchanged — no promotion authorized                                                                                                                                                                                                                                      |
| Remaining gated actions                   | **(a)** Browser-smoke + axe + E2E against a Preview URL (authenticated via `vercel curl` / trusted OIDC header). **(b)** Serving-config verification (how SSR is deployed) before any production promotion. **(c)** Owner-authorized promotion of an exact green SHA to production — separate explicit authorization                                                                                       |
| Explicitly NOT done                       | No `vercel --prod`, no DNS/domain change, no deployment-protection change, no promotion                                                                                                                                                                                                                                                                                                                    |

## 4. PagBank sandbox E2E

| Field         | Value                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource      | PagBank **sandbox** credentials (token, webhook secret) — provided securely by the owner, never committed                                                                                                                                           |
| Operation     | Run the sandbox test matrix: PIX creation, timeout (ambiguous ≠ failure), webhook replay, cancellation, refusal, split                                                                                                                              |
| Current state | Contracts versioned and unit-tested (8 PSP tests); SQL claim/idempotency proven (44 assertions). No real PSP call has been made                                                                                                                     |
| Risk          | Sandbox-only charges; no real money movement. Secrets must stay server-side                                                                                                                                                                         |
| Rollback      | n/a (sandbox)                                                                                                                                                                                                                                       |
| Validation    | Each case produces the expected `payment_orders` state from the authoritative vocabulary (`draft`, `waiting_payment`, `paid`, `canceled`, `refunded`); idempotency key reuse returns the same charge; ambiguous outcome leaves the order in `draft` |

## 5. Branch protection: add `browser-smoke` to required checks

| Field               | Value                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| Resource            | Branch protection for `main`, `preview-homologation`, `ui-rebuild-carbon`         |
| Operation           | Add the `browser-smoke` job to the required status checks                         |
| Evidence it is safe | Job runs green (24 assertions + axe: 0 critical/serious) — see CI run 39905023885 |
| Risk                | New gate may block PRs that fail hydration/a11y — intended                        |
| Rollback            | Remove the required check (owner's console)                                       |

## 6. Human reviews for the PR stack

| Field          | Value                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource       | PRs #9 → #8 → #2 → #3 → #4 → #5 → #6 → #7 (merge-commit order)                                                                                                                                      |
| State          | All draft, 0 human reviews                                                                                                                                                                          |
| Action         | Independent human review per PR, then owner-authorized merges in order                                                                                                                              |
| Evidence ready | CI green on each current head (PR #7 @ `a313a36` pending run; last green @ `7c182fd` run 39905023885). #8 official CI at `f1de94f3` is a recorded lint FAILURE — must be re-run after #9 integrates |

## 7. Identity record `...0010` decision

| Field               | Value                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Resource            | Identity record `00000000-0000-4000-8000-000000000010` (auth.users vs public.persons divergence)                          |
| State               | **Frozen** — no mutation by anyone                                                                                        |
| Action needed       | Owner decides the authoritative source (auth.users or persons), then a migration plan with tests is prepared for approval |
| Explicitly NOT done | No inference, no generated replacement, no data change                                                                    |

## 8. Leaked-password protection enablement

| Field      | Value                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Resource   | Supabase Auth configuration (non-prod first)                                                   |
| Operation  | Enable leaked-password protection; decide minimum password strength policy alongside           |
| Evidence   | Advisor finding `auth_leaked_password_protection` = disabled; test plan in phase6 manifest §13 |
| Validation | Breached password rejected at signup/reset with honest UI error; existing logins unaffected    |

## 9. `create_pagbank_order` deprecation (candidate)

| Field     | Value                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource  | Public RPC `create_pagbank_order` (SECURITY DEFINER, executable by `authenticated`)                                                                                                                      |
| Evidence  | Zero consumers in versioned code (grep across `src/` + `supabase/`); the quote-first flow uses `claim_pagbank_order` (pending migration). **Absence in code does not prove absence of external callers** |
| Operation | Observation window in non-prod (log calls), then an additive migration revoking `authenticated` EXECUTE                                                                                                  |
| Risk      | An unknown external caller could break — mitigated by the observation window                                                                                                                             |
| Rollback  | Re-grant EXECUTE via additive migration                                                                                                                                                                  |

## 10. Dedicated dependency-update PR (supply chain) — **PR #24 opened (draft)**

| Field    | Value                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource | Dev dependency tree (2 critical, dev-only vulnerabilities)                                                                                                                                                                                                                                                  |
| Finding  | `handlebars <=4.7.9` (3 advisories, via `semantic-release` chain) + `shell-quote 1.8.4-1.10.0` (via `unlighthouse` chain). Production audit: **0 vulnerabilities** — neither ships in the bundle                                                                                                            |
| Status   | **PR #24 opened (draft)** on branch `fix/supply-chain-critical-dev-deps` @ `eacd7b7`: overrides pin `handlebars@4.7.10` + `shell-quote@1.12.0`; `git diff package-lock.json` = **0 lines** (versions already resolved); `npm audit` = 0 critical; `semantic-release --dry-run` OK; full gates green locally |
| Action   | Human review of PR #24, then owner-authorized merge                                                                                                                                                                                                                                                         |
| Rollback | Revert PR #24                                                                                                                                                                                                                                                                                               |

## 11. PRIVACY_POLICY* untracked files disposition

| Field         | Value                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource      | 4 untracked files in repo root (`PRIVACY_POLICY.html`, `.md`, `_BACKUP.md`, `_LGPD.md`) — Portuguese privacy-policy drafts apparently for a different product |
| Impact        | They break the repo-wide cspell gate locally; currently excluded via `cspell.json` `ignorePaths`                                                              |
| Action needed | Owner decides: move them out, delete them, or commit them (then they need proper spell-check treatment, e.g. pt-BR dictionary entries)                        |

---

## 12. Vercel Preview environment variables (publishable Supabase coordinates)

| Field                         | Value                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource                      | Vercel project `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC` environment variables                                                                                                                                                                                                                                         |
| Blocker evidence (2026-10-23) | Git Preview deploys succeed and serve SSR HTML, but the client-side Supabase client throws `Supabase client configuration missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this environment.` at runtime — the project has **0 env vars configured** (verified via `/v9/projects/{id}/env`) |
| Operation                     | **EXECUTED 2026-10-23** with owner authorization (CLI): `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` set for Preview AND Production (publishable coordinates only; never service-role). Verified via `vercel env ls` (4 entries)                                                                       |
| Why it was gated              | Setting remote env vars is a remote configuration change — done only after explicit owner authorization. The values themselves are publishable coordinates (the URL is in `.env.example`; the publishable key is designed for browser exposure)                                                                 |
| Risk                          | Low — publishable coordinates only. **No** service-role key, PSP token, or secret was set in the Vercel env                                                                                                                                                                                                     |
| Rollback                      | Remove the 2 env vars                                                                                                                                                                                                                                                                                           |
| Validation                    | Pending: a fresh Preview deployment must initialize the Supabase client without the configuration error; SSR + client hydration work; browser-smoke + axe against the authenticated Preview                                                                                                                     |
