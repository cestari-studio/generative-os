# Release evidence ledger — cycle 4 (2026-10-23)

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
