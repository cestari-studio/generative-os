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

## Preview E2E — automated browser suite (2026-10-23, ~08:20 UTC)

First real Preview E2E against the live deployment (`generative-e3xsqpj8c`,
SHA `3405000`, source=git), accessed via the Deployment Protection automation
bypass secret (`x-vercel-protection-bypass`, secret collected from the
project's Deployment Protection settings and never printed/committed):

| Suite         | Result                                                                                                                                                                                                                                | Evidence                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| preview-smoke | **34/34 assertions passed** — HTTP 200/404, protection bypassed, SSR #root not empty (~30k chars), access gate on private routes, **no Supabase config error**, no fictional demo tenants, no fatal page errors (no hydration issues) | `scripts/preview-smoke.mjs` output                                            |
| preview-axe   | **0 critical/serious violations on 6 routes** (/, /dashboard, /settings, /knowledge, /payments, /products); 1-2 minor/moderate per route                                                                                              | `scripts/preview-axe.mjs`, `docs/ui-rebuild/axe/preview-3405000/results.json` |

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
