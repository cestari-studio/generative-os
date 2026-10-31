# genOS operational handoff

**Snapshot date:** 2026-10-31

**Repository:** `cestari-studio/generative-os`

**Branch:** `feat/complete-carbon-page-rebuild`

**Application code SHA:** `b94b9acc2b8825f48621a20ac3267ecb43829720` (the handoff changes are documentation only)

## Executive state

PR [#7](https://github.com/cestari-studio/generative-os/pull/7) is open and draft. Vercel Preview is READY for the snapshot SHA. The application has a passing protected-fetch SSR readback across the home page, three access-gated routes, and a not-found route. Supabase production has not received any of the 12 candidate onboarding/readiness migrations. No production deploy or promotion was performed for this work.

This is a handoff for continued implementation and review. It does not claim release acceptance: global lint and the human accessibility gates are still open, and the Supabase migration history needs reconciliation before any migration decision.

## External service state

### GitHub

- At the cross-service readback, PR #7 was draft and targeted `main` at `b94b9acc2b8825f48621a20ac3267ecb43829720`. This handoff adds documentation-only changes after that readback; inspect the current GitHub head before starting follow-up work.
- The code changes were last verified at `2f07c3f59a851a5c86bedd01ff5bb026d5a3cdeb`; `b94b9ac` adds only documentation.
- Keep the PR draft until the lower stack, current CI, human review, and route acceptance evidence are complete.

### Vercel

- Existing project: `generative-os`, project ID `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`.
- Preview: [`generative-gwc4k4ni3-cestari-studio.vercel.app`](https://generative-gwc4k4ni3-cestari-studio.vercel.app), deployment `dpl_2AtzSG8dVYSJ6MFXY4vsaHHLPyma`, READY for `b94b9acc2b8825f48621a20ac3267ecb43829720`.
- Protected fetch returned `/` 200, `/dashboard` 200, `/products` 200, `/knowledge` 200, and `/nonexistent-route` 404. Each response had a server-rendered root and the expected title. The three protected routes showed “Access Gate Active.”
- No production deployment, promotion, or domain change was made for this work.

### Supabase

- Only target: `ldjfjmihdvdmltrptngf` (`generative-os`, PostgreSQL 17). The reference project `jkespoegdpkdcrxsxwry` is out of scope.
- Read-only remote listing: 24 migration IDs. This checkout has 36 local migration files: 21 matching version IDs, 15 local-only IDs, and 3 remote-only IDs.
- The three remote-only versions have names that resemble local migrations under different timestamps. Their content and resulting schema have not yet been reconciled. A version-name match or mismatch alone does not establish whether a change was applied.
- The exact 12 candidate onboarding/readiness files and SHA-256 values are in [`owner-approval-packets.md`](owner-approval-packets.md), with hashes in the [release evidence ledger](release-evidence-ledger.md).
- Do not use `supabase db push`, reset the shared project, or apply any candidate migration until the complete history is reconciled and the owner separately approves the exact project, production environment, migration set, and code SHA.

Authentication is available through the existing local Keychain/CLI session and connected service accounts. Do not copy token values into documentation, source, logs, or evidence files.

## Verification evidence

At code SHA `2f07c3f59a851a5c86bedd01ff5bb026d5a3cdeb`:

- Unit tests: 321 passed, 7 skipped.
- Disposable PostgreSQL: 11/11 relevant SQL suites passed; each used local disposable databases and was dropped afterwards.
- Browser smoke: 24/24; build passed.
- Branding, matrices, and Carbon pattern checks passed.
- Mellea/controller suite: 71 tests passed in a detached checkout with the repository dependencies linked; Ajv evidence validation passed.
- Repository-wide `npm run lint` did not pass. Prettier reported 17 onboarding/audit/blueprint files; spelling checks also report existing technical vocabulary. These checks must be rerun against the final code SHA after the formatting findings are resolved.

These results belong to the code SHA stated above; the latest SHA is a documentation-only commit. CI green, local tests, and Preview readiness are separate evidence types.

## AI execution blueprint progress

- OpenCode v2.1.4 local server and its `/openapi.json` were inspected; its actual `/api/info` endpoint was confirmed.
- LM Studio authentication was retrieved from Keychain without recording the secret. The model endpoint returned five models; an actual Granite Switch chat-completions tool call and response round-trip passed, and the model was unloaded afterward.
- The OpenCode file-edit and path-policy vertical slice is **not verified**. A small model failed to demonstrate the allowed temporary edit, and the denied-path result was not proven. The larger model attempt was stopped after memory pressure; no repository files were changed by that attempt.
- The currently dirty Mellea/compiler and audit-artifact changes were not included in this handoff commit. Review them against the execution blueprint and repository security rules before staging; in particular, confirm fixture-only examples cannot be interpreted as real tenant, entitlement, price, or passkey state.

## Worktree and commit scope

The documentation commits on this branch cover the preview readback and approval packet. The following pre-existing local changes remain outside the handoff commit and must be preserved:

- `orchestration/mellea_onboarding_compiler.py`
- `orchestration/test_mellea_onboarding.py`
- `package.json`
- onboarding audit and fixture files under `orchestration/skills/onboarding/`

Inspect the full status before staging. Do not use `git add .` or `git add -A`; do not overwrite or clean those files without owner direction.

## Next actions, in order

1. Reconcile the 15 local-only and 3 remote-only migration history entries with migration contents and live schema, in read-only mode. Record the evidence and update the migration packet.
2. Resolve the repository-wide format/spell findings without rewriting unrelated artifacts, then run lint, unit, build, branding, matrix, Carbon, and relevant SQL gates on one exact code SHA.
3. Prove OpenCode policy behavior end to end: one permitted edit with observed diff, one denied edit with no filesystem change, and restart/recovery behavior using a bounded model context.
4. Complete the human WCAG 2.2 AA route checklist, white/g100 screenshots, and axe evidence-path correction. Keep route matrix statuses below `E2E_VERIFIED`/`ACCEPTED` until evidence is complete.
5. Obtain human review for PR #7 and the lower stack. Keep all PRs draft until gates pass.
6. If migrations are proposed for production, request separate explicit owner approval against the reconciled exact migration set and SHA; then follow the pre-apply and post-apply validation in the packet.

## Reference documents

- [`AGENTS.md`](../AGENTS.md) — repository hard rules and current state.
- [`README.md`](../README.md) — setup and project overview.
- [`generative-os-ai-execution-blueprint-v3.md`](ui-rebuild/generative-os-ai-execution-blueprint-v3.md) — AI execution contract and acceptance gates.
- [`master-directive.md`](ui-rebuild/master-directive.md) — project delivery and handoff requirements.
- [`release-evidence-ledger.md`](release-evidence-ledger.md) — dated test, runtime, and service evidence.
- [`owner-approval-packets.md`](owner-approval-packets.md) — protected operations and exact migration candidate packet.
