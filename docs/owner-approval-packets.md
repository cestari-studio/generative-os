# Owner approval packets — blocked operations ready for decision

> Each packet identifies the resource, environment, operation, branch/SHA,
> risk, rollback condition, and the validation that must follow approval —
> per the master directive §3.2. **None of these has been executed.** All
> local preparation is complete and CI-verified at the SHA cited.

## 1. Supabase runtime reconciliation (non-prod first)

| Field                                    | Value                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource                                 | Project `ldjfjmihdvdmltrptngf` (`generative-os`, sa-east-1, PG 17.11) — **never** the sibling `jkespoegdpkdcrxsxwry`                                                                                                                                                                    |
| Environment requested                    | An **isolated non-production** Supabase project/branch first; production only after non-prod verification                                                                                                                                                                               |
| Operation                                | Apply migrations `20261022053203` (billing) + `20261022060000` (catalog); deploy 6 Edge Functions from the versioned source; set `verify_jwt` per `supabase/config.toml` (5 true, `pagbank-webhook` false)                                                                              |
| Branch/SHA                               | migrations + functions as in PR #7 @ `a313a36` (CI green)                                                                                                                                                                                                                               |
| Current observed drift (read 2026-10-23) | 17 migrations applied (last `20261022002300`); billing + catalog absent; 18/18 expected tables absent; 6 functions `verify_jwt=false`; `passkey-auth`/`pagbank-order` are pre-hardening versions                                                                                        |
| Risk                                     | Billing/catalog schema becomes live; function behavior changes for auth (fail-closed passkey) and payments (quote-first). Mitigated by: 44 billing SQL assertions + 7 catalog integration tests green on disposable PG 17.11; function unit tests (8 PSP + challenge fail-closed) green |
| Rollback                                 | Migrations are additive (no drops); rollback = restore previous function versions via redeploy; tables created can remain unused. Pre-deployment snapshot/backup required                                                                                                               |
| Validation after approval                | read-back: migration ledger shows both versions; `to_regclass` returns all 18 tables; function versions match deployed hashes; re-run billing-sql + catalog integration against the non-prod target; passkey anonymous challenge returns 401; pagbank-order rejects amountCents         |

## 2. Edge Functions `verify_jwt` alignment

| Field      | Value                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource   | The 6 deployed functions in the same project                                                                                                                                                                                                                                         |
| Operation  | Flip `verify_jwt` to `true` for `passkey-auth`, `settings-cascade`, `vector-rag`, `pagbank-connect`, `pagbank-order`; keep `false` ONLY for `pagbank-webhook` (which validates ECDSA signature in-handler — proof in `_shared/pagbank-security.ts` with DER/P1363 fail-closed tests) |
| Risk       | Anonymous calls to the 5 functions will 401. Intended. The webhook's signature validation is the alternative authenticity mechanism — its existence and correctness must be re-proven in non-prod before relying on it                                                               |
| Rollback   | Re-set flags (no code change)                                                                                                                                                                                                                                                        |
| Validation | Invalid/absent JWT → 401 on the 5; webhook with invalid signature → 401 fail-closed; webhook replay rejected                                                                                                                                                                         |

## 3. Vercel deployment model + production staleness

| Field                                                          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource                                                       | Existing Vercel project `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC` (scope `cestari-studio`, CLI user `octavio-4895`)                                                                                                                                                                                                                                                                                                                                                 |
| Diagnosis (2026-10-23, `docs/vercel-integration-diagnosis.md`) | Production deployment `dpl_Ups6Si3JpTvfDsAuZdYzw8TmjK74` (created 2026-10-21) serves `app.cestari.studio` + `generative-os-bay.vercel.app` with commit `b580fc8` (2026-10-16) via `source=cli` — **146 commits behind HEAD**. **No Git integration** (`linkedProjects: []`, `originConnections: []`). MCP connector auth-broken (404 "User not found"); CLI works                                                                                            |
| Operation requested — two decisions                            | **(a) Deployment model:** connect the existing project to `cestari-studio/generative-os` via the official Git integration (recommended — enables automatic per-PR Previews, which the E2E gate needs) OR keep CLI deploys with a documented release command. **(b) Serving config:** identify how the SSR server is deployed today (Vercel Functions vs external host) before any redeploy — the repo has no `vercel.json` and the Output Directory is unset |
| Explicitly NOT done                                            | No duplicate project, no relink, no env/domain/DNS change, no deployment, no bypass of deployment protection                                                                                                                                                                                                                                                                                                                                                 |
| Validation after decision                                      | Preview of an exact green SHA via the authorized flow → `READY` → browser-smoke + axe + E2E against it → human review → owner-approved promotion to production                                                                                                                                                                                                                                                                                               |

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
