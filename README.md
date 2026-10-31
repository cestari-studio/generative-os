# genOS

genOS is Cestari Studio's generative operational system. This repository contains the Carbon Design System web application, Supabase-backed product services, and the local execution and evidence tooling used to build the system.

The web application builds on IBM's Carbon Design System and the Carbon React Router starter. Preserve upstream notices and the Apache-2.0 terms in [`LICENSE`](LICENSE) when adapting starter-derived code.

The repository is under active development. The current release candidate is PR [#7](https://github.com/cestari-studio/generative-os/pull/7), which remains a draft. See [the current handoff](docs/handoff-current-state.md) before continuing work.

## Run locally

Requires Node.js 24 and npm 11 (the package manager version is recorded in `package.json`).

```bash
npm ci
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the intended Supabase project's URL and publishable key, then run:

```bash
npm run dev
```

The browser bundle may contain only publishable Supabase coordinates. Never put a Supabase `service_role` key, payment provider token, or webhook secret in a `VITE_*` variable. Do not use the reference project's credentials or database.

## Build and quality commands

```bash
npm run build
npm run preview
npm run test
npm run check:branding
npm run check:matrices
npm run check:carbon-patterns
npm run test:browser-smoke
```

PostgreSQL security changes have named disposable-database suites such as `npm run test:readiness-org-scoping-sql` and `npm run test:switch-active-context-sql`. Run the suites relevant to a change against disposable PostgreSQL with RLS enforced. Never reset or test shared Supabase using an owner or superuser role.

The repository-wide `npm run lint` is currently not green; see the handoff for the observed formatting and spelling failures. Do not use formatting commands that rewrite unrelated files.

## System boundaries

- **Web:** Vite + React Router with server-side rendering; deploy previews through the existing Vercel `generative-os` project.
- **Persistence and identity:** the Supabase project `ldjfjmihdvdmltrptngf` is the only target. The sibling `cestari-studio/genOS` repository is read-only reference material; its database `jkespoegdpkdcrxsxwry` is never a target.
- **Authorization:** authenticated identity, active membership, policy/entitlement, and PostgreSQL RLS. Client metadata is not authority.
- **AI execution tooling:** `orchestration/` is local controller/evidence tooling, not application runtime. Local model and audit artifacts must redact credentials and personal data. Model judgments are evidence inputs, never authorization or release approval.
- **MVP boundary:** chat with AI is out of scope. Delivery order is Edge Functions and real persistence, auditable actions and actors, entitled Granite access, then chat.

## Project documentation

- [Operational rules for agents](AGENTS.md)
- [Current state and next steps](docs/handoff-current-state.md)
- [Release evidence ledger](docs/release-evidence-ledger.md)
- [Owner approval packets](docs/owner-approval-packets.md)
- [Master directive](docs/ui-rebuild/master-directive.md)
- [AI execution blueprint v3](docs/ui-rebuild/generative-os-ai-execution-blueprint-v3.md)
- [UI route/page matrix](docs/ui-rebuild/route-page-matrix.md)
- [AI execution controller notes](orchestration/README.md)

## Change and release policy

Changes are prepared on feature branches and reviewed in draft pull requests. A green local check or Preview does not authorize a merge, production deployment, Supabase migration, promotion, secret change, or domain change. Those actions require separate explicit owner approval for the exact target and operation. Migrations are forward-only and additive.

Preserve Apache-2.0 licensing, copyright notices, and upstream attribution when changing the Carbon starter-derived files.
