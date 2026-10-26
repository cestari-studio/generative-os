# Red-Team Audit — Onda 1 Security Corrections (Independent Reproduction)

**Auditor:** independent subagent (no implementation involvement). **Date:** 2026-10-26.
**Scope:** Master Directive v2.1 Onda 6 — independent reproduction of the Onda-1 critical corrections at HEAD `ba0f063` (+ uncommitted Worker A/C test edits).
**Method:** read-only source analysis; live-remote policy/grant reads via Supabase MCP; disposable PG 17.11 probes built from scratch (`audit_onda6_*` DBs, probe SQL under the opencode tmp dir — nothing written to the repo outside this file). Worker harnesses were run as-is only to confirm they pass; all verdicts below rest on independent probes.

---

## VERDICT 1 — The persons InitPlan question (Worker C Finding 1): **(b) — the UPDATE works; there is no silent no-op and no takeover via that path.**

**Exact live policy text** (read from `pg_policies` on the live remote 2026-10-26, matching migration `20261017231645:977`):

```
persons_update_policy  FOR UPDATE TO authenticated
  USING      (id = ( SELECT auth.uid() AS uid))
  WITH CHECK (id = ( SELECT auth.uid() AS uid))
```

**Reproduction** (disposable PG 17.11, full live policy set incl. `persons_select_policy`, in-DO `SET ROLE authenticated` + `set_config('request.jwt.claims', …)` methodology):

| Probe | Statement                                                                                        | Rows matched | Result                                          |
| ----- | ------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------- |
| L1    | `UPDATE persons SET active_organization_id=X WHERE id=<A>` as A                                  | **1**        | write landed (`active_organization_id` updated) |
| L2    | `UPDATE persons SET … WHERE id = (SELECT auth.uid())` as B (exact `switch_active_context` shape) | **1**        | write landed                                    |
| L3    | A attempts to UPDATE B's row                                                                     | **0**        | cross-user isolation holds                      |
| L4    | A attempts row-move (`SET id = <B>`)                                                             | —            | **42501** RLS violation (WITH CHECK works)      |

**Why it is NOT the DEFECT-A class:** DEFECT-A (`organizations_insert_policy`, `WITH CHECK ((SELECT auth.uid()) IS NOT NULL)`) references **no table column** — the planner evaluates it as a bare one-time InitPlan. `persons_update_policy`'s expression is `id = (SELECT auth.uid())` — the InitPlan result is **compared per-row against a real column**, and `EXPLAIN VERBOSE` confirms the evaluation context (`One-Time Filter: ((InitPlan 2).col1 = '<uuid>')`) sees `request.jwt.claims`. In my reproduction the InitPlan evaluates `auth.uid()` correctly; the row comparison proceeds. (Fixture note: an earlier probe iteration of mine showed a spurious 0-row no-op — root cause was a missing `persons_select_policy` in that fixture (RLS default-deny on the UPDATE's scan), not the InitPlan bug. With the full live policy set, the UPDATE matches 1 row.)

**Security implication (verdict b):** legitimate context switches via direct UPDATE **work**, and `switch_active_context` (the sanctioned writer, SECURITY INVOKER, live-verified `prosecdef=false`) **does validate `app_private.is_org_member(p_organization_id)` before writing** (live body read via `pg_get_functiondef`, 2026-10-26). A context **hijack** via the persons UPDATE is therefore bounded by what the pointer is _used_ for — see Finding P2-1 below for the residual gap.

**Negative test that catches a regression:** run L1/L3/L4 (probe `audit_onda6_persons_live.sql`): any future change that turns the USING clause into a bare-InitPlan form (e.g. `USING ((SELECT auth.uid()) IS NOT NULL)`) makes L1 match 0 rows → caught.

---

## VERDICT 2 — Legacy-stub BEFORE proof fidelity: **the stub is a FAITHFUL mirror of the real body, but the PERMISSIVE policy surface it is proven against never existed on live.**

**Stub-vs-body fidelity (Priority 4):** I diffed the stub (`supabase/tests/_prereq_rpc_grants.sql:32-119`) against the real body (`20261018225420_onboarding_pf_pj_multi_country_and_chinese.sql:111-280`). The diff is whitespace/comments only; semantics are identical: SECURITY INVOKER + `search_path=''`; same auth.uid() NULL body check; same `INSERT … ON CONFLICT (identifier) DO UPDATE` with the identical SET list (incl. `legal_representative_id = EXCLUDED.legal_representative_id`); same `organization_members` upsert promoting the caller to `org_owner, is_default=true`; same workspace/project provisioning; same persons context-switch (`works_for_id/active_organization_id/…, account_type='organization_member'`). **The stub faithfully reproduces the conflict-update + owner-promotion + context-switch behavior — neither stronger nor weaker.**

**Surface fidelity (the caveat):** the BEFORE proof runs with `alter_policies=true` → `organizations_select_policy USING(true)` + `organizations_update_policy USING(true)/WITH CHECK(true)`. The live migration history shows `organizations_update_policy` was **`has_org_admin_role` from creation (`20261017231645:968`) and was never altered** (20261021233121 touched only SELECT policies; live `pg_policies` confirms `has_org_admin_role` today). I re-ran the identical attack on the hardened (live-equivalent) surface (`alter_policies=false`): the legacy call **aborts at the first statement — `SQLSTATE 42501: new row violates row-level security policy for table "organizations"`** (the ON CONFLICT arbiter UPDATE is checked against the UPDATE policy's WITH CHECK). Consequences on the live surface: no data overwrite, no legal-rep replacement, no promotion, no context bind (all verified false; A remains sole owner). The BEFORE proof therefore demonstrates a **latent code-level defect** (the body _would_ take over if RLS ever allowed it) — valid justification for the grant-layer restriction — but it is **not a reproduction of a live-exploitable takeover**. The migration's own DEFECT-B comment (`20261026140000:21-24`) already characterizes this correctly; the audit trail should note the proof's surface is synthetic-permissive, not historical-live.

**AFTER proof:** passes 6/6 — on the same permissive surface, `20261026210000` closes the call at the grant layer (`42501 permission denied for function`). Harness reproduced green.

---

## VERDICT 3 — `provision_corporate_tenant` takeover: **HOLDS** (independent vectors, not Worker C's suite).

Probe (`audit_onda6_takeover.sql`, disposable DB with the real migration `20261026140000` body):

| Vector                                                                                                                  | Result                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Zero-width-space / en-dash / leading-space / trailing-space identifier variants                                         | **22023** (slug validation rejects before the guard)                                                                                 |
| `audit--victim` (double hyphen — valid distinct slug)                                                                   | fresh create allowed; touches **no** victim row (correct — distinct identifier)                                                      |
| Exact-identifier takeover by non-member B                                                                               | **42501** takeover denial                                                                                                            |
| B membership rows in victim org after all attempts                                                                      | **0**                                                                                                                                |
| Victim org data / legal rep after attempts                                                                              | intact (read with privilege)                                                                                                         |
| **Admin read-back with hostile payload** (B made `org_admin` of victim, re-provisions with `HOSTILE LEGAL/TAX-HOSTILE`) | returns `provisioned=false, already_existed=true`; **org data untouched** (verified with privilege) — the read-back cannot overwrite |
| Admin read-back leaking org shape to a **non-admin**                                                                    | non-admins never reach read-back (42501 first); B's own fresh create returns **B's** org only                                        |
| Caller with no `sub` claim                                                                                              | **42501** body-level                                                                                                                 |

Worker C's suite (30/30) reproduced green as well.

## VERDICT 4 — PagBank anti-hijack: **the REAL bodies HOLD; Worker A's grant-layer proof is valid but its behavioral assertions run against STUBS that lack the anti-hijack logic.**

- Worker A's suite (9/9) reproduces green and its grant-layer proof is rigorous (asserts `RETURNED_SQLSTATE=42501` AND `MESSAGE_TEXT='permission denied for function <name>'`).
- **However**, `_prereq_pagbank_grants.sql` stubs both functions: the stub `claim_pagbank_order` is a plain INSERT (no tenant check, no quote-status check, no server-derived amount, no `ON CONFLICT (quote_id)`), and the stub `attach_psp_idempotency` lacks the different-key guard. Assertions 7-9 (replay/anti-hijack) therefore exercise stub behavior, not the live bodies.
- My independent probe against the **verbatim real bodies** from `20261022053203` (+ the `payment_orders_quote_id_key` partial unique index) — `audit_onda6_pagbank.sql`: cross-tenant claim (wrong org) → **42501**; different-key attach → **22023**; wrong-org attach → **42501**; different-reference re-claim → **22023**; same-reference replay → idempotent (`claimed=false`, same order id); draft-quote claim → **22023**; cross-tenant claim of B's quote as A → **42501**; amount is server-derived from the quote (returned 2000 = quote total; the caller never supplies it). The anti-hijack logic is **real, not vacuous** — it just was not what Worker A's suite executed. Residual trust note: service_role is the platform-wide trusted principal (bypasses RLS via `payment_orders_service_all`); tenant isolation inside the RPCs rests on the `organization_id` equality checks, which hold.

## VERDICT 5 — Concurrency race: **the barrier is a REAL simultaneous release; the 23505 loser path is the safe outcome and masks no partial write.**

- Harness reproduced green (8 rounds × 6 invariants; both racers recorded per round — e.g. round 1: A `error 23505` / B `provisioned`; round 2 inverted).
- Barrier verified independently via `pg_locks`/`pg_stat_activity`: the holder shows `granted=t`, each racer shows `granted=f, wait_event_type=Lock` until release; post-race `recorded_at` timestamps land within **0.4 ms** of each other. Not serialized.
- Loser always gets **23505** (never 42501/read-back) in the raced window because both lookups precede the winner's commit; the loser's INSERT blocks on the uncommitted unique key and fails on commit. This is the safe outcome: the org INSERT is the function's **first** write, so 23505 there means zero partial state (whole plpgsql block rolls back atomically — consistent with Worker C's T4 atomicity proof). The other acceptable outcome (42501) was exercised separately: a sequential probe (winner committed before the loser's lookup) yields the 42501 takeover denial as designed.

---

## Findings

### P2-1 — `persons_update_policy` has no membership check on `active_organization_id` (direct-bind gap). **Severity: P2**

- **Reproduction:** as `authenticated` B (non-member of org X): `UPDATE public.persons SET active_organization_id = X WHERE id = <B>` — **matches 1 row** (probe `audit_onda6_direct_bind.sql`, D1). The policy checks only `id = auth.uid()`; the membership validation lives only in `switch_active_context`, which direct SQL bypasses.
- **Expected vs observed:** expected — context binding should be membership-gated at the RLS layer; observed — any authenticated user can point `active_organization_id` (and `works_for_id`) at any org uuid they can guess/enumerate.
- **Why it is not a live takeover:** (i) `organizations_select_policy` and every org-scoped policy are membership-table-based (`is_org_member`), not pointer-based — the forged pointer grants **no reads** (D2: 0 rows). (ii) `resolve_onboarding_readiness` (20261026190000) re-validates `is_org_member` at evaluation and degrades to `blocked/org_membership_required`. (iii) persons cross-visibility (D3) returns only the caller's own row. **Residual:** the trigger `app_private.sync_person_context_to_auth` (20261017231645:727-761, SECURITY DEFINER) fires on the forged UPDATE and writes `organization_id = X` (with `role='org_member'` default) into the caller's `auth.users.raw_app_meta_data`. Nothing in SQL reads `raw_app_meta_data` (grep-verified), and AGENTS.md rule 4 forbids it as authority — but any future consumer trusting that claim would be fooled. Browser-side UI that hydrates "current org" from app metadata (before RLS-filtered queries) could also display a foreign org id/name-less shell.
- **Negative test that catches it:** D1 (assert the direct UPDATE matches 0 rows or raises). Today it matches 1 — i.e. the test currently _documents the gap_.
- **Candidate fix direction (not applied):** a WITH CHECK on `active_organization_id`/`works_for_id` (`IS NULL OR app_private.is_org_member(…)`), noting the InitPlan-safety of the DEFINER helper.

### P2-2 — Onda-1 corrections are validated but NOT deployed; the live remote still exposes the pre-fix grant surface. **Severity: P2 (informational/exposure tracking)**

- **Reproduction (live reads, 2026-10-26):** `supabase_migrations.schema_migrations` tops out at `20261025142026`; live function grants: `create_or_update_corporate_tenant` = **anon+authenticated EXECUTE**; `claim_pagbank_order`/`attach_psp_idempotency` = **authenticated EXECUTE**; `switch_active_context` = **anon EXECUTE**; `provision_corporate_tenant` **absent** on live.
- **Expected vs observed:** per AGENTS.md hard rule 1 this is by design (no deployment without owner approval); observed exposure is therefore expected — but the audit record should state plainly that the Onda-1 protections are disposable-PG-verified only.
- **Why the live exposure is bounded today:** the legacy RPC's takeover path is blocked by the _hardened live RLS_ (Verdict 2: first statement → 42501 for a non-member); anon is blocked by the body's auth.uid() NULL check; pagbank RPCs are SECURITY DEFINER with tenant/ownership checks in the body (Verdict 4). So the residual live risk until deployment is lower than the BEFORE proofs imply — but it is nonzero and unmonitored.
- **Negative test that catches drift:** re-run the live grant read; any of {anon, authenticated} retaining EXECUTE after the corresponding migration version appears in `schema_migrations` = failed deployment.

### P2-3 — Fixture fidelity notes (test-harness accuracy, not product defects). **Severity: P2 (test-quality)**

1. **Legacy BEFORE surface** (`alter_policies=true`) is synthetic-permissive and never matched live UPDATE policy (Verdict 2). The proof remains valid as a _code-defect_ demonstration; it should be labeled as such in the ledger to avoid over-stating the historical live exposure.
2. **Worker A pagbank suite** executes stub bodies lacking the anti-hijack logic (Verdict 4); behavioral anti-hijack coverage exists only in this audit's independent probe. Recommend either applying the real bodies in the prereq or importing this audit's PA1-PA6 vectors into the suite.
3. **T8a mechanism mislabel** (`provision_tenant_adversarial.sql`): on the fixture, the direct org INSERT fails at the **table-GRANT layer** (`42501 permission denied for table organizations` — the prereq never grants authenticated INSERT on organizations), not the InitPlan RLS bug it is labeled with. The behavioral conclusion (direct INSERT blocked; DEFINER RPC works) is correct either way, and on live (where authenticated _has_ the INSERT grant) the InitPlan bug is the real blocker per the ledger — but the fixture does not prove the InitPlan mechanism.

No P0 or P1 findings.

---

## Summary

- **Findings by severity:** **0 P0 · 0 P1 · 3 P2** (P2-1 persons direct-bind gap; P2-2 corrections not yet deployed; P2-3 three fixture-fidelity notes).
- **Persons-InitPlan verdict (2 sentences):** Verdict **(b)** — the live `persons_update_policy` (`USING/WITH CHECK (id = (SELECT auth.uid()))`) **matches 1 row** on an own-row UPDATE as `authenticated` (reproduced on disposable PG 17.11 with the full live policy set; `EXPLAIN` shows the InitPlan result compared per-row, so `auth.uid()` evaluates with the JWT visible), so legitimate context switches work and the InitPlan no-op class does **not** apply here. The actual takeover control is the membership check — present in `switch_active_context` (verified in the live body) but **absent from the RLS policy itself**, leaving a bounded direct-bind gap (P2-1) mitigated by membership-based org policies and re-validation in `resolve_onboarding_readiness`.
- **Legacy-stub BEFORE proof fidelity:** the stub is a **faithful** semantic mirror of the real `create_or_update_corporate_tenant` body (conflict-update + owner-promotion + context-switch identical), but the full takeover is proven against a **synthetic PERMISSIVE policy surface**; on the hardened live-equivalent surface the identical attack dies at the first statement with 42501 — so the proof demonstrates a latent code defect, not a historically live-exploitable takeover.

**Areas that held, with probes:** provision_corporate_tenant takeover resistance (unicode/space/double-hyphen/exact-identifier/admin-read-back/no-sub — `audit_onda6_takeover.sql`); PagBank real-body anti-hijack incl. tenant confusion, key/fingerprint mismatch, reference mismatch, draft quote, server-derived amount (`audit_onda6_pagbank.sql`); concurrency race barrier reality (`pg_locks` wait events; sub-millisecond simultaneity) and loser safety (23505 first-write conflict, atomic rollback; sequential 42501 path exercised separately); all Worker A/C harnesses re-run green (9/9 pagbank grants, 8/8 rpc grants, 30/30 adversarial, 7+6 legacy takeover BEFORE/AFTER, legacy restrict, 8 rounds × 6 race invariants).
