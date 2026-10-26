# Red-Team Audit — Org-Scoping + P2 Time/State Cycle

- **Commit audited:** `7383dc0` (`feat/complete-carbon-page-rebuild`)
- **Auditor:** independent (did not implement this work)
- **Date:** 2026-10-26
- **Method:** static review of migrations `20261026190000` / `20261026200000` and `src/components/auth/ProtectedRoute.jsx`; independent adversarial SQL probes (A1–A12, written by the auditor, **not** the workers' suites) on disposable PG 17.11 as `authenticated` with RLS enforced; live function-body dump; wrong-order migration application; JS suite run.
- **Probe DBs:** `audit2_main`, `audit2_wrongorder` (both dropped after the run).

## Verdict at a glance

| #   | Severity | Area                                           | Result                                              |
| --- | -------- | ---------------------------------------------- | --------------------------------------------------- |
| 1   | —        | P1 cross-org leak fix (190000)                 | **HOLDS** (pass-with-evidence)                      |
| 2   | —        | Coordinator MERGE (190000∩200000)              | **HOLDS** (pass-with-evidence)                      |
| 3   | —        | P2-1 `completed_at` server-controlled          | **HOLDS** (pass-with-evidence)                      |
| 4   | —        | P2-2 expired-delegation corpse + revalidation  | **HOLDS** (pass-with-evidence)                      |
| 5   | —        | P2-4 ambiguity/determinism                     | **HOLDS** (pass-with-evidence)                      |
| 6   | P2       | ProtectedRoute fail-closed (P2-5)              | **HOLDS** + 3 hardening observations (non-blocking) |
| 7   | P2       | scope DEFAULT `'organizational'` data/backfill | **DEFERRED / owner action required**                |

**Findings count: 0 P0, 0 P1, 3 P2** (all P2 are hardening/robustness observations, none a reachable leak). One data/backfill question is deferred to the owner.

---

## 1. P1 readiness org-scoping (migration `20261026190000`) — HOLDS

I did **not** re-run their `readiness_org_scoping.sql` (13/13). I wrote independent probes A1–A6 against the live, fully-merged function. Every adversarial case I constructed was refused.

### Cross-org leak — tried to defeat the fix, could not

- **A1 — mid-flight pointer swap (their suite misses this).** Created a _live, active_ org-A run, completed all its steps (sanity: `allow` in A), then flipped `persons.active_organization_id` to org B _while the run was still active_ and re-evaluated.
  - Expected: org-A run must not leak into B; membership re-validated.
  - Observed: `require_steps` (decision), no `allow`. **PASS.** The RPC re-validates membership at evaluation time; a stale/forged pointer degrades to `blocked/org_membership_required`, never to `allow`.

- **A2 — member of BOTH orgs, correct scoping.** Subject is a member of A and B. Org A has a _completed_ run (`allow`); org B has an _incomplete_ run. Evaluated in B.
  - Expected: `require_steps` on the **B** run (not `allow` from A, and the surfaced `run_id` must be B's, not A's).
  - Observed: `require_steps`, `run_id` = B run. **PASS.** The active-org pointer correctly scopes; `allow` in A does not imply `allow` in B.

- **A3 — NULL `target_organization_id` wildcard.** A completed NULL-org run + active org B.
  - Expected: NULL never matches a real org (no wildcard `allow`).
  - Observed: `require_steps`. **PASS.**

- **A4 — delegated-actor org-A auth does not bleed into subject's org-B.** Delegate (member A only) holds an org-A run for the subject; subject completes all steps; subject evaluates in org B.
  - Expected: no `allow` in B.
  - Observed: `require_steps`. **PASS.**

- **A5 — ambiguity.** Two live active runs in org A (same version).
  - Expected: `unavailable/ambiguous_runs`.
  - Observed: exactly that. **PASS.**

- **A6 — ambiguity count vs latest-run pick DISAGREE on the _version_ filter.** One live run on `1.0.0`, one live run on `2.0.0` (same org), evaluate `1.0.0`.
  - Expected: the `2.0.0` run must not poison the `1.0.0` ambiguity count (count is version-filtered), so no spurious `ambiguous_runs`.
  - Observed: `require_steps/required_steps_incomplete` for `1.0.0` — not ambiguous. **PASS.** The ambiguity count and the latest-run pick use the _same_ wizard+version+org filter, so a blocked terminal run on a different version/org cannot also trip `ambiguous`.

### Scope-default fail-closed (probe A12)

A journey definition inserted by the service with **no explicit scope** (column DEFAULT applies) and a caller with **no active org context**:

- Expected: DEFAULT `'organizational'` → fail-closed → `unavailable/org_context_missing` (never a silent global evaluation).
- Observed: exactly that. **PASS.** See finding F7 for the data/backfill implication.

---

## 2. Coordinator MERGE integrity (Worker A `190000` ∩ Worker B `200000`) — HOLDS

**Static:** only `120000`, `170000`, and `190000` `CREATE OR REPLACE public.resolve_onboarding_readiness`; `200000` does **not** re-assert it (verified by grep across all migrations). Canonical chain `…120000,150000,170000,180000,190000,200000` applies `190000` last among function-writers.

**Live body after `190000` then `200000`** (dumped `prosrc`):

| Merged element                                                             | Present?                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| Worker A org-scope (`app_private.is_org_member`)                           | ✅ (1 ref)                                          |
| `target_organization_id = v_active_org` on **both** the count and the pick | ✅ (2 refs)                                         |
| Worker B determinism `ORDER BY created_at DESC, id DESC`                   | ✅ (2 refs)                                         |
| `clock_timestamp()` for run-expiry                                         | ✅ (5 refs)                                         |
| `>1 live active` → `unavailable/ambiguous_runs`                            | ✅ (2 refs)                                         |
| fail-closed `EXCEPTION WHEN OTHERS` → `unavailable/resolution_error`       | ✅                                                  |
| `now()` in an expiry comparison                                            | ✅ **none** (the single `now()` match is a comment) |

**Wrong order (`200000` then `190000`):** applied cleanly on `audit2_wrongorder`; live body still carries all three markers (`org_scoped=t, deterministic=t, ambiguity=t`). `190000` is self-contained and idempotent, so ordering within the chain is robust. **PASS.**

**No stale non-org body:** the only earlier bodies (`120000` non-org, `170000` blocked-taxonomy) are fully superseded by `190000`; `200000` leaves no competing definition. **PASS.**

---

## 3. P2-1 `completed_at` server-controlled — HOLDS

- **A7a — backdate via step INSERT (future date).** `INSERT … state='completed', completed_at='2999-01-01'` → overwritten with server wall-clock (within `[before, now]`). **PASS.**
- **A7b — born-completed run INSERT with backdated `completed_at='1970'`.** → stamped with server wall-clock, not the client value. **PASS.**
- **A8i — direct authenticated `UPDATE runs.completed_at`.** → `42501` (guard set extended to `completed_at`). **PASS.**
- **A8iii — smuggle `completed_at` alongside an innocuous column (`current_step_key`).** → still `42501`. **PASS.**
- **A8iv — authenticated `UPDATE run_state` (P1-1 guard).** → `42501`. **PASS.**
- **A11 — `completed_at` immutability vs `set_updated_at` trigger ordering.** BEFORE row triggers fire in name order: `onboarding_step_attribution` (a…) fires **before** `set_updated_at` (s…). A non-transition `UPDATE` that sets another column **and** smuggles a 1970 `completed_at` preserves the original server stamp. **PASS.**

**Adjacent (non-blocking) observations on the test prereq mirror** — these are prereq artifacts, _not_ migration-logic defects:

- The prereq's `set_updated_at()` mirror uses **unqualified** `NEW.updated_at = now()` with no explicit `search_path`; the real migration `20261017231645` uses `SET search_path=''` + `pg_catalog.now()`. On a DB where the prereq defines `set_updated_at`, `updated_at` did **not** advance (a no-op) — so the `set_updated_at` interaction is under-exercised in the disposable harness. It does not affect the P2-1 `completed_at` guarantee (the attribution trigger runs first), but the mirror should be aligned with the real definition so the harness exercises the real ordering.
- Migration `20261026120000` creates the `set_updated_at` trigger on `onboarding_step_states` but **not** on `onboarding_runs`; `onboarding_runs.updated_at` relies on the later `…231645`/`…80000` triggers. Out of scope for the P2 `completed_at` claim (which is trigger-guarded independently), noted for completeness.

---

## 4. P2-2 expired-delegation corpse + revalidation — HOLDS

- **A9 — expired delegation authorizes nothing.** Granted a delegation expiring in 150 ms, slept past the boundary, then probed both the helper and a row write. `can_complete_step` → `false`; the row-level `UPDATE … state='completed'` was denied and the step stayed non-completed (non-vacuity: step visible to the delegate first). **PASS.** Note the expiry check uses `clock_timestamp()`, so a mid-transaction expiry stops authorizing immediately.
- **A10a — born-corpse swept on fresh INSERT.** An `active`-but-past-expiry corpse occupies the partial-unique slot; a fresh active delegation succeeds and the corpse is flipped to `expired`. **PASS.**
- **A10b — live conflict still `23505`.** Two genuinely-live active delegations for the same `(run_id, actor_id)` → `unique_violation`. **PASS.** The constraint is intact; the sweep only removes _expired_ corpses, never live rows.
- **A10c — re-activation (UPDATE) path sweeps too.** Re-activating a `revoked` delegation while a corpse exists succeeds and the corpse is flipped. **PASS.**

---

## 5. P2-4 ambiguity / determinism — HOLDS

Covered by A5 (two live → `ambiguous_runs`) and A6 (version-filter isolation). The merged body's `ORDER BY created_at DESC, id DESC` tie-break is present in the live definition (§2). The auditor did not find a construction where a blocked terminal run on a _different_ version/org also trips `ambiguous_runs` — the count and the pick share one filter.

---

## 6. ProtectedRoute fail-closed (P2-5) — HOLDS, with 3 P2 hardening observations

Static review of `src/components/auth/ProtectedRoute.jsx` + `src/data/useOnboardingReadiness.js`; JS suite run: **18/18 pass** (`npx vitest run src/__tests__/ProtectedRoute.test.jsx`).

**Children render on exactly one path:** `user` present **and** `readiness.status==='ready'` **and** `readiness.decision==='allow'` (line 93). Every other state (`checking`, `require_steps`, `blocked`, `unavailable`, `unavailable_backend`, `unknown`, unauthenticated) renders an explicit non-authorized Carbon state — never children. I found **no** state that renders children without `ready+allow`.

**Org-switch re-resolve:** the `useEffect` on `[user, activeOrganizationId]` calls `resolve()`, which first sets `readiness=CHECKING`. So a stale `allow` is replaced by the `checking` spinner during the re-resolve — it does **not** persist the prior org's `allow` on screen. Covered by their org-switch test. **PASS.**

**No fail-open in `isBackendMissing`:** only a genuine function-not-found (`PGRST202` / "could not find the function" / "schema cache" / "does not exist") maps to `unavailable_backend`; a permission error (`42501`) and a network error map to `unknown`. Both are non-authorized. Confirmed by tests. **PASS.**

### F1 — P2 — `checking` state has no timeout (unbounded spinner)

**Reproduction:** `rpcMock.mockReturnValue(new Promise(() => {}))` (their own test, line 469) leaves `readiness.status==='checking'` forever → the "Resolving tenant readiness…" spinner renders indefinitely.
**Expected vs observed:** an unreachable/RPC-hung backend should eventually degrade to an explicit non-authorized state; instead the spinner is unbounded.
**Why only P2:** this is **fail-closed** (children never render), so it is availability/UX, not a leak. A user on a degraded-but-not-erroring connection sees a spinner with no path forward.
**Negative test that catches it:** fake-timer test — mount with a never-resolving RPC, advance past a timeout budget, assert the gate transitions to `unknown`/`unavailable` (non-authorized) instead of staying on `checking`.

### F2 — P2 — `require_steps` discards the server-provided step (`nextStepKey`)

**Reproduction:** the RPC returns `require_steps` with `next_step_key`/`incomplete_steps`; `normalizeRpc` preserves `nextStepKey`, but the component's effect calls `openOnboardingFlow(0)` with a hardcoded `0` (line 64) and never reads `readiness.nextStepKey`.
**Expected vs observed:** the gate should route to the server's _next required step_ (the adapter carries it); instead it always opens at step 0.
**Why only P2:** not a leak (children still never render on `require_steps`), and the RPC does not return a numeric index — only a step _key_ — so a fix needs a key→index mapping. But the hardcoded `0` makes the "route to the next required step" comment misleading and can force an already-complete step on a partially-done user.
**Negative test that catches it:** mock `require_steps` with `next_step_key='onboarding.tenant.workspace'` (3rd step); assert the onboarding flow opens at the index mapped from that key, not `0`.

### F3 — P2 — non-authorized notifications are not internationalized at the source

**Reproduction:** the four non-authorized states (`blocked`, `unavailable`, `unavailable_backend`, `unknown`) call `t(key, 'English fallback')`; the suite asserts on the English fallback strings (`'Access Blocked'`, `'Service Unavailable'`, `'Unable to Verify Access'`).
**Expected vs observed:** user-facing gate copy should resolve real locale entries; if the `auth.protected.*` keys are absent from the locale bundles, every locale renders English.
**Why only P2:** cosmetic/i18n completeness, not a security property; fail-closed behavior is unaffected.
**Negative test that catches it:** a locale-snapshot test (or a bundle grep) asserting each `auth.protected.*` key exists in every shipped locale file (not just the default).

---

## 7. scope DEFAULT `'organizational'` — data/backfill question (P2, owner action)

**The mechanism holds** (probe A12): a definition with no explicit scope fails closed to `organizational` and demands a valid org context — never a silent global evaluation.

**The data/backfill question the owner must confirm:**

1. **The readiness chain is not yet deployed.** Verified via the Supabase MCP against project `ldjfjmihdvdmltrptngf`: the remote is at `…20261025142026` and `public.onboarding_journey_definitions` / `onboarding_runs` / `onboarding_delegations` **do not exist remotely** (read-only `execute_sql`). So `190000`'s `ADD COLUMN … DEFAULT 'organizational'` will land on a _fresh_ table when the chain is eventually applied — there is **no existing remote row** to backfill incorrectly today.
2. **The only seeded definition** is `onboarding.tenant` `1.0.0` (inserted by `170000`), which takes the `organizational` DEFAULT. That is the correct intent for a tenant-corporate journey.
3. **The owner-confirm flag:** when the chain is applied, the single `onboarding.tenant` definition will be `organizational` — meaning the `ProtectedRoute` gate will require a valid org context for **every** user, including a personal (PF) operator with no organization. If the product intends any journey (e.g. a personal profile onboarding) to be `personal`-scope, the owner must explicitly set `scope='personal'` for those definitions via the service role — the fail-closed DEFAULT will not infer it. **This is a deliberate, documented fail-closed choice, not a defect; it is flagged so the owner confirms the scope assignment for each journey before the chain is promoted.**

---

## Appendix — probes used (pass-with-evidence)

| Probe      | Target                                                            | Result                             |
| ---------- | ----------------------------------------------------------------- | ---------------------------------- |
| A1         | mid-flight `active_organization_id` swap, membership re-validated | PASS (no leak)                     |
| A2         | member-of-both active-org scoping                                 | PASS (correct run, no cross-allow) |
| A3         | NULL `target_organization_id` wildcard                            | PASS (no wildcard)                 |
| A4         | delegated org-A auth → subject org-B                              | PASS (no bleed)                    |
| A5         | two live active runs → ambiguous                                  | PASS                               |
| A6         | ambiguity count vs pick disagree on version                       | PASS (version-filtered)            |
| A7a/b      | backdate `completed_at` (step + born-completed run)               | PASS (server-stamped)              |
| A8i/iii/iv | runs `completed_at`/`run_state` guard bypass                      | PASS (all `42501`)                 |
| A9         | expired delegation authorizes nothing                             | PASS (helper=false, write denied)  |
| A10a/b/c   | corpse sweep + live `23505` + re-activation                       | PASS                               |
| A11        | `completed_at` immutability vs `set_updated_at` order             | PASS                               |
| A12        | scope DEFAULT fail-closed                                         | PASS                               |
| —          | merge: live body markers + wrong-order + no stale body            | PASS                               |
| —          | JS suite `ProtectedRoute.test.jsx`                                | 18/18 PASS                         |

Probe sources were written under the OS temp dir (`audit2_probes*.sql`), not in the repo; both disposable DBs were dropped after the run. No repo files were modified except this report; no commits, pushes, or remote-state changes were made (the only remote call was a read-only `execute_sql` inventory).
