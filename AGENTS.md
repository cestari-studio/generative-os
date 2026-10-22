# AGENTS.md — `generative-os`

> Operational boundaries for any agent (human or automated) working in this repository.
> Source of truth for these rules: `generative-os-plano-execucao-corrigido-v2.md` (2026-10-22).

## Identity and scope

- **Owner:** Cestari Studio Inc. **Product:** genOS (generative operational system). **Repo:** `cestari-studio/generative-os`.
- **Target platforms:** Vercel (web, existing `generative-os` project) + Supabase remote **`ldjfjmihdvdmltrptngf`** (project `generative-os`).
- **`cestari-studio/genOS` is read-only reference** for functional specs/taxonomy/acceptance criteria. Never copy its runtime, migrations, schema, IDs, seeds, credentials or configuration. Its database (`jkespoegdpkdcrxsxwry`) is **not** a target.
- **Chat with AI is out of the MVP.** Delivery order: Edge Functions + real persistence → auditable actions/actors → entitled Granite access → chat.

## Hard rules (do not violate)

1. **No implicit authorization.** Never merge to `main`, mark PRs ready, apply migrations, deploy (Vercel/Supabase), promote, rotate secrets or change domains without explicit owner approval. PRs #1–#8 stay **draft** until their gates pass.
2. **Zero mock/demo in runtime.** No synthetic tenant entities, demo identities, fabricated prices/limits/defaults, simulated passkeys or "success" on failed service calls. Fixtures live only under `src/test/**`. UI shows real loading/empty/error/forbidden states (Carbon `EmptyState`).
3. **The browser never sets authoritative values.** No `amountCents`, price, quota, role or entitlement from the client is trusted. Payments consume a server-issued, unexpired, tenant-owned, single-use quote (`consume_quote`).
4. **Authorization = authenticated identity + membership + policy/entitlement.** Never `user_metadata` as authority; never e-mail comparison per request (roles via `platform_role_assignments`); `auth.uid()` + `organization_members` + RLS/PBAC.
5. **RLS everywhere.** Every table in exposed schemas has RLS enabled. Write paths that must bypass client policies use `SECURITY DEFINER` **only with a documented justification** (`search_path=''`, qualified objects, `auth.uid()` checks in body, `EXECUTE` revoked from `PUBLIC`/`anon`) — see migration `20261022053203`. Prefer `SECURITY INVOKER` otherwise.
6. **Secrets stay server-side.** No `service_role`, PSP tokens, or webhook secrets in the browser bundle or `VITE_*` public vars. Publishable/anon keys only. CI receives publishable coordinates, never service keys.
7. **CI is read-only.** No lint/format step may write to the checkout (`format:check` ≠ `format:fix`); CI asserts `git diff --exit-code`. Actions pinned to full SHA; minimum permissions per job; `npm ci` from the lockfile.
8. **Migrations are forward-only and additive.** Never edit an applied migration, never reset against the shared project. Test on disposable DB/branches first, as a non-superuser with RLS enforced (`SET ROLE authenticated`), never as owner/superuser.
9. **Legal notices preserved.** `LICENSE`, copyright headers and upstream attribution are allowlisted in the branding gate — never strip them for "rebranding".
10. **Stop before destructive or production actions.** Ask explicitly.

## Verification workflow (per change)

- `npm run lint` (read-only) · `npm run test` · `npm run build` · `npm run check:branding`
- SSR smoke: server-rendered content on all routes, no empty `#root`, no streaming-error markers.
- SQL changes: apply on disposable Postgres (matching remote major), then test happy + negative paths as `authenticated` with RLS enforced — cross-tenant read/write, replay, expiry, single-use, recursion, direct-write denial.
- Record `PASS`/`FAIL`/`BLOCKED` with SHA. CI green ≠ runtime verified ≠ deployed ≠ accepted.

## Current known gaps (do not re-declare as done)

- Remote Supabase runtime is **not reconciled** (Edge Functions are pre-`74c3b87` versions; `verify_jwt=false` on all six). Phase 6 reconciliation is gated on owner approval.
- Vercel Git integration for the existing project is **unproven** (project read 404/403 via connector). Do not create a duplicate project; resolve access first.
- Identity record `00000000-0000-4000-8000-000000000010` is **frozen** (auth.users vs public.persons divergence) — do not mutate.
- Phase 7 (Preview E2E, screenshots white/g100, WCAG 2.2 AA evidence, browser tests) is **not done**; route matrix `E2E_VERIFIED`/`ACCEPTED` statuses require it.
