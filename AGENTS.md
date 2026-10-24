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

## Current known gaps (verified 2026-10-23 — see `docs/phase0-preflight-consolidated-state.md`)

- Remote Supabase runtime is **reconciled** (owner-authorized deploy 2026-10-23): 21 migrations applied, Edge Functions at versions 7/5/7/6/6/7 with `verify_jwt` per `supabase/config.toml`, billing/catalog/notifications tables and RPCs present. Verified live via MCP read. Do not re-apply applied migrations.
- Vercel Git integration is **proven** (connected 2026-10-23; git-source Previews; production promoted to `973d884`, serving `app.cestari.studio`). **Residual channel restriction:** the Vercel MCP connector still returns 404/empty — use the Vercel CLI (authenticated `octavio-4895`, linked project `generative-os` — ID recorded in the Phase 0 doc). Do not create a duplicate project.
- Identity record `00000000-0000-4000-8000-000000000010` is **frozen** (auth.users vs public.persons divergence) — do not mutate.
- Phase 7 is **partially done**: preview-smoke 34/34, preview-axe 0 critical/serious, screenshots `e7247f8` (8 routes × desktop/tablet/mobile) recorded in `docs/release-evidence-ledger.md`. **Still pending:** human WCAG 2.2 AA manual checklist (all boxes unchecked — no route may go to `ACCEPTED` without it), white/g100 theme screenshots, and the axe evidence-path drift (`preview-3405000` cited vs `preview-b2beb6e` present). Route matrix `E2E_VERIFIED`/`ACCEPTED` statuses require these.
