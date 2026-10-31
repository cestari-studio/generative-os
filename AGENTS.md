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

- `npm run lint` (read-only) · `npm run test` · `npm run build` · `npm run check:branding` · `npm run check:matrices` · `npm run check:carbon-patterns`
- SSR smoke: server-rendered content on all routes, no empty `#root`, no streaming-error markers.
- SQL changes: apply on disposable Postgres (matching remote major), then test happy + negative paths as `authenticated` with RLS enforced — cross-tenant read/write, replay, expiry, single-use, recursion, direct-write denial.
- Record `PASS`/`FAIL`/`BLOCKED` with SHA. CI green ≠ runtime verified ≠ deployed ≠ accepted.

## Current state and known gaps (read-only checks, 2026-10-31)

- **Supabase target:** project `ldjfjmihdvdmltrptngf` (`generative-os`, PostgreSQL 17). The current remote migration listing has 24 IDs; this checkout has 36 migration files. 21 version IDs match, 15 local versions are absent remotely, and 3 remote versions are absent locally. Three of those differences may be timestamp/name remappings, but equivalence must be proven from contents and live schema before any reconciliation. The 12 onboarding/readiness migrations from 2026-10-26 are not listed remotely. Do not run `supabase db push`, reset the shared project, or infer they are unapplied solely from version names. The exact candidate set, checksums, divergence, and validation gate are in `docs/owner-approval-packets.md` and `docs/release-evidence-ledger.md`.
- **Vercel:** use the existing `generative-os` project (`prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`) and authenticated CLI session; do not create a duplicate project. At the last readback, Preview deployment `dpl_D298ut8xdYspSGyVoXsfN5hUq8W9` was READY for branch SHA `27e076963a0c70c3a330644923c6fd5328f030a4`. Read-only protected fetch verified SSR status/root/title on `/`, `/dashboard`, `/products`, `/knowledge`, and `/nonexistent-route`; the three protected routes showed the access gate. This is Preview evidence only; no production deployment or promotion was made for this change. The newest commit is documentation-only.
- **GitHub:** PR #7 (`feat/complete-carbon-page-rebuild`) was open and draft at head `27e076963a0c70c3a330644923c6fd5328f030a4` on the last readback. Read the current PR head before relying on that value. Do not mark ready or merge until the required stack, CI, human review, and route acceptance gates pass.
- **Quality and release gaps:** the last code verification SHA is `2f07c3f59a851a5c86bedd01ff5bb026d5a3cdeb`; the latest branch commit is documentation-only. That code SHA had 321 unit tests pass and 7 skipped; 11 disposable-Postgres SQL suites passed; local build/SSR smoke and branding, matrices, and Carbon checks passed. Repository-wide `npm run lint` was not green (Prettier reports 17 onboarding/audit/blueprint files; spell-check also has existing technical-vocabulary findings). Re-run relevant gates on the exact candidate SHA after resolving the formatting findings.
- **Accessibility acceptance:** Phase 7 is still partial. The human WCAG 2.2 AA manual checklist, required white/g100 evidence, and axe evidence-path discrepancy remain open. Do not mark routes `E2E_VERIFIED` or `ACCEPTED` until the route matrix's evidence and human checklist are complete.
- **Frozen record:** identity `00000000-0000-4000-8000-000000000010` remains frozen because of `auth.users` vs `public.persons` divergence; do not mutate it.
- **Local worktree:** Mellea/compiler and audit artifacts may be present as local changes. Inspect ownership and diffs before staging; never use `git add .` or `git add -A`. Keep private model credentials and tokens out of source and evidence.

See [`docs/handoff-current-state.md`](docs/handoff-current-state.md) for the current operational handoff and next actions.
