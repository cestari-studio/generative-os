# Vercel integration diagnosis — 2026-10-23

> Read-only investigation via Vercel CLI (authenticated as `octavio-4895`).
> The MCP Vercel connector is **auth-broken** (`GET /v2/user` → 404 "User not
> found"; project reads → 404; deployments → 403). The CLI uses different
> credentials and works. **No mutations were executed.**

## Executive summary

The production deployment exists and is live, but it is **146 commits behind
HEAD** and was deployed **manually via CLI** (`source: cli`) — there is **no
Git integration** (`linkedProjects: []`, `originConnections: []`). The site
does not serve the remediated code.

## Confirmed facts (OBSERVED)

| Item                  | Value                                                                                                                                                                     | Evidence                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Project               | `generative-os`                                                                                                                                                           | `vercel project inspect`                  |
| Project ID            | `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`                                                                                                                                        | CLI                                       |
| Scope/team            | `cestari-studio` (owner shown as "Octavio's projects")                                                                                                                    | CLI                                       |
| Root Directory        | `.`                                                                                                                                                                       | CLI                                       |
| Framework             | Vite preset                                                                                                                                                               | CLI                                       |
| Build command         | `npm run build` / `vite build`                                                                                                                                            | CLI                                       |
| Output Directory      | **None** (relies on framework default)                                                                                                                                    | CLI                                       |
| Node                  | 24.x                                                                                                                                                                      | CLI                                       |
| Region                | iad1                                                                                                                                                                      | CLI                                       |
| Production deployment | `dpl_Ups6Si3JpTvfDsAuZdYzw8TmjK74`                                                                                                                                        | `vercel inspect`                          |
| Deployment URL        | `generative-3ifcp8qi3-cestari-studio.vercel.app`                                                                                                                          | CLI                                       |
| Deployment created    | 2026-10-21 20:37 (-0300)                                                                                                                                                  | CLI                                       |
| Deployment source     | **cli** (NOT Git integration)                                                                                                                                             | API `/v13/deployments/{id}` meta          |
| Deployed commit       | `b580fc841dbe8bf64af39dc11dfaf43c09cecf16` (`main`)                                                                                                                       | API meta `githubCommitSha`                |
| Deployed commit date  | 2026-10-16 "fix: corrigir erro de módulo já carregado do Sass"                                                                                                            | local `git log`                           |
| Gap to HEAD           | **146 commits** behind `f84b9cc`                                                                                                                                          | local `git log b580fc8..HEAD`             |
| Aliases               | `app.cestari.studio` (23h), `generative-os-bay.vercel.app` (7d), `generative-os-cestari-studio.vercel.app` (7d) → all to `3ifcp8qi3`                                      | `vercel alias ls`                         |
| Live probe            | HTTP 200, SSR HTML renders "Cestari Studio"; bundle contains pre-`a69fcc2` optimistic settings code and post-`2f3ffca` hydration fix — consistent with `b580fc8` ancestry | curl                                      |
| Git integration       | `linkedProjects: []`, `originConnections: []`                                                                                                                             | connector + consistent with `source: cli` |

## What is broken

1. **No Git integration** — deployments happen manually via CLI. Every PR/SHA
   is invisible to Vercel until someone runs `vercel deploy`. This is why
   `linkedProjects` is empty.
2. **Production is 146 commits stale** — `app.cestari.studio` serves
   `b580fc8` (2026-10-16). All remediation work (fixture removal, Carbon
   rebuild, auth/onboarding, billing, catalog, hydration fix, settings/knowledge
   contract fixes, matrix/binding gates) is absent from production.
3. **MCP connector auth** — `GET /v2/user` 404; the connector cannot be used
   for reads. The CLI (`octavio-4895`) works and was used instead.
4. **Output Directory unset** — `None` recorded; relies on Vite preset default
   (`dist`). The SSR build produces `dist/client` + `dist/server` — the
   deployment serving SSR HTML means a serverless/adapter path exists and
   works today, but the exact serving configuration (functions vs static)
   needs verification before changing anything.

## What is NOT broken / risks to avoid

- The site IS reachable and serving SSR HTML (not a blank client shell).
- Deployment protection: not probed (would be a mutation-adjacent check);
  Preview URLs listed are `● Ready`.
- **Do NOT** create a duplicate project, relink Git blindly, change
  domains/DNS, or run `vercel deploy --prod` — all are owner-gated mutations.

## Recovery procedure (owner authorization required)

1. **Decide deployment model:** connect the existing project to
   `cestari-studio/generative-os` via the official Git integration (recommended
   for per-PR Previews) OR keep CLI deploys with an explicit, documented
   release command. Git integration enables automatic Preview per PR — which
   the E2E gate needs.
2. **Verify serving config:** confirm how the SSR server is deployed today
   (Vercel Functions vs external host). The current deployment serves SSR HTML
   from `src/server.js`; the project has no `vercel.json`/adapter config in
   the repo — the serving path must be identified before any redeploy.
3. **Preview for E2E (next after access decision):** create a Preview of an
   exact SHA (e.g., `f84b9cc` or the next green head) through the authorized
   flow, confirm `READY`, then run browser-smoke + axe + E2E against it.
4. **Production promotion:** only after Preview E2E passes AND human review
   AND owner approval — promote the exact SHA to production.

## Evidence artifacts

- CLI outputs: `vercel project inspect`, `vercel ls`, `vercel inspect <url>`,
  `vercel alias ls` (this document).
- API meta: `githubCommitSha b580fc8`, `source cli`.
- Live probe: HTTP 200 + bundle marker analysis (optimistic settings code
  present = pre-`a69fcc2`).
