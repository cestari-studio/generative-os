# Red-Team Audit — Provisioning + Readiness Cycle

**Auditor:** Agent 7 (independent red team; no implementation involvement)
**Target:** branch `feat/complete-carbon-page-rebuild`, commits `608f545` + `ef4e5c5` (HEAD `ef4e5c52353e`)
**Scope:** `provision_corporate_tenant` (migration 20261026140000), consumer migration (TenantContext / OnboardingTearsheet / OnboardingFullPage), actor/subject delegation (20261026150000), readiness `blocked` (20261026170000), journey ledger (20261026120000), and their SQL suites + race harness.
**Method:** independent adversarial probes (8 probe scripts, disposable PG 17.11 DBs `audit_probe_1..8`), NOT a re-run of the dev suites. Dev baselines were re-run once for calibration: adversarial 27/27, delegation 22/22, readiness 10/10, two-session race PASS, JS readiness/ProtectedRoute 22/22 — all reproduce as claimed.

**Findings by severity: 0 P0 · 4 P1 · 5 P2** (9 total). One behavior note (context-switch) is graded P1.

---

## P1 — real weaknesses

### P1-1. `policy_snapshot.deny` is client-erasable — the `policy_denied` block is advisory, not authoritative

**Severity:** P1
**Where:** `supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql:102-106` (RLS `onboarding_runs_actor_all FOR ALL ... WITH CHECK (actor OR subject)`) interacting with `supabase/migrations/20261026170000_readiness_blocked_decision.sql:123-136` (the `policy_denied` branch).

**Reproduction (audit probe 4, DB `audit_probe_4`):**

```sql
-- actor creates a run; service then records a deny verdict server-side:
RESET ROLE;
UPDATE public.onboarding_runs
  SET policy_snapshot = '{"deny": true, "policy": "tenant_country_unsupported"}'
  WHERE id = '<run>';
-- readiness -> blocked / policy_denied   (control: OK)

-- the CLIENT (run actor) now erases the server verdict via the actor write policy:
SET ROLE authenticated; -- jwt = run actor
UPDATE public.onboarding_runs SET policy_snapshot = '{}'::jsonb WHERE id = '<run>';
-- readiness -> require_steps / required_steps_incomplete   (blocked evaporates)
```

**Expected:** a `deny` verdict "recorded server-side when the run was snapshotted" (20261026170000 header, lines 30-32) cannot be overwritten by the subject of the denial.
**Observed:** the run-actor UPDATE policy covers **every column**, so the person the policy denied can erase the denial and convert `blocked` back to `require_steps`. The same channel lets the client write arbitrary `run_state` transitions (verified: actor flipped own run to `completed`/`blocked`/`active` at will — probe 4, P4.2) and arbitrary `context_snapshot`.

**Why it's P1, not P0:** the client cannot escalate to `allow` this way — erasing a deny only re-opens their _own_ onboarding wizard (self-service: they still must complete the steps). It does, however, defeat the stated purpose of `policy_denied` (e.g. "tenant_country_unsupported"): a user the business wanted to keep out of the tenant flow can simply clear the flag and proceed through onboarding. That is an authorization-relevant bypass of a server policy verdict by its target.

**Negative test that would catch it:**

```sql
-- as run actor, after a service-side deny snapshot:
UPDATE public.onboarding_runs SET policy_snapshot='{}' WHERE id='<run>';
-- MUST raise 42501 (or match 0 rows). Currently: UPDATE 1.
```

**Fix direction (not applied):** column-level write restriction — either a `WITH CHECK` that preserves `policy_snapshot`/`run_state` (`WITH CHECK (policy_snapshot IS NOT DISTINCT FROM OLD...)` is not expressible in RLS; practical route: a BEFORE UPDATE trigger that rejects changes to `policy_snapshot`, `run_state`, `idempotency_key`, `actor_id`, `subject_user_id` when `auth.uid()` is not `service_role`), or move run-state/policy writes into a SECURITY DEFINER RPC and revoke UPDATE on those columns from `authenticated`.

---

### P1-2. Subject-only steps are completable by delegates through the RLS path — the `p_step_type='subject'` guard is unreachable

**Severity:** P1
**Where:** `supabase/migrations/20261026150000_onboarding_actor_subject_delegation.sql:261` and `:270` — both RLS policies call `app_private.can_complete_step(run_id, step_key, NULL)`, hardcoding `NULL` for `p_step_type`. The helper's subject-reservation branch (lines 213-216) is therefore dead in every actual row write.

**Reproduction (audit probe 8, DB `audit_probe_8`):**

```sql
-- delegated run; delegate holds an active delegation listing the step:
SELECT app_private.can_complete_step('<run>', 'onboarding.person.identity', 'subject');
-- -> false  (helper correctly denies a delegate for a subject-reserved step)

-- ...but the RLS write path passes NULL, so the delegate's write succeeds:
INSERT INTO public.onboarding_step_states (run_id, step_key, state)
VALUES ('<run>', 'onboarding.person.identity', 'completed');
-- INSERT 0 1 — completed_by=delegate, completion_type='delegated_authorized'
```

**Expected:** a step that is subject-reserved (consent, legal representation, identity declarations — the migration's own comment, lines 174-176: "when p_step_type = 'subject', a delegate is NEVER allowed") cannot be completed by a delegate at the row level.
**Observed:** the row-level gate never passes `'subject'`, so any step the run-actor lists in `allowed_step_keys` is delegate-completable — and the run-actor writes that array themselves (see P1-3). The migration's own test only proves the guard at the _helper_ level with a direct call (`onboarding_delegation_rls.sql:161`), never through RLS.

**Why it's P1, not P0:** today the client never sends step metadata and there is no table of subject-reserved steps, so no _current_ flow is exploitable; but the mechanism the migration ships and documents as the defense for sensitive steps does not work where it matters (RLS). The first wizard that relies on it will have a silent hole.

**Negative test that would catch it:**

```sql
-- delegate with an active delegation for step S attempts the ROW WRITE for a
-- subject-reserved step S (not the helper call):
INSERT INTO public.onboarding_step_states (run_id, step_key, state)
VALUES ('<delegated-run>', 'onboarding.person.identity', 'completed');
-- MUST raise 42501. Currently: INSERT 0 1.
```

**Fix direction:** the step's requirement class must come from server-side config (e.g. `onboarding_journey_definitions` gains per-step `completion_class`), and the RLS policies must pass it: `can_complete_step(run_id, step_key, (SELECT completion_class ...))` — never `NULL`, never a client parameter.

---

### P1-3. Delegation `granted_by` is unauthenticated free text — audit-trail attribution is forgeable by the run actor

**Severity:** P1
**Where:** `supabase/migrations/20261026150000_onboarding_actor_subject_delegation.sql:65-79` (table def: `granted_by uuid REFERENCES auth.users(id)` with no derivation trigger) + RLS insert policy at :143-146 (checks only `run_actor(run_id) = auth.uid()`).

**Reproduction (audit probe 2, DB `audit_probe_2`):**

```sql
-- as the run actor (delegate 2222), grant myself a delegation and claim the
-- SUBJECT approved it:
INSERT INTO public.onboarding_delegations
  (run_id, actor_id, subject_user_id, allowed_step_keys, granted_by, status)
VALUES
  ('<run>', '<me>', '<subject>', ARRAY['onboarding.person.address'], '<subject>', 'active');
-- INSERT 0 1 — the row now records granted_by = <subject>, who never acted.
```

**Expected:** `granted_by` records the effective principal (like `completed_by` does — the migration's §6 trigger forces `completed_by = auth.uid()` "never the client value"), or at minimum cannot be set to a third party.
**Observed:** any value passes. The run actor can attribute the delegation to the subject, to an admin, or to a nonexistent-looking uuid (FK permitting). Combined with P1-2, the _entire_ delegation audit chain (who authorized → who completed → what class) is self-written by the actor being audited.

**Why P1:** it falsifies the compliance artifact the table exists to produce (ADR 0001 §2.2 "delegated" requires evidence of authorization). No privilege escalation beyond what the run actor already has (they can already manage delegations on their own run), but the _record_ of who granted it is meaningless.

**Negative test that would catch it:**

```sql
-- as run actor:
INSERT INTO public.onboarding_delegations (..., granted_by) VALUES (..., '<not-auth.uid()>');
-- MUST raise (trigger forces granted_by = auth.uid()). Currently: accepted.
```

**Fix direction:** a BEFORE INSERT trigger forcing `NEW.granted_by := auth.uid()` (mirroring `onboarding_step_attribution`), with `service_role` exempted for true server-side grants.

---

### P1-4. Context switch: readiness runs are not org-scoped — a completed org-A run yields `allow` while the user operates in org B

**Severity:** P1 (design gap with authorization-relevant consequences; the route gate relies on this RPC)
**Where:** `supabase/migrations/20261026170000_readiness_blocked_decision.sql:97-102` — run selection is `(actor_id = v_uid OR subject_user_id = v_uid) AND wizard_key = ...` with **no `target_organization_id` filter**, although the column exists (20261026120000:42). Client side: `ProtectedRoute.jsx:37-42` re-resolves only on **user identity** change, not on `activeOrganizationId` change (verified by its own test, `ProtectedRoute.test.jsx:263`, which models context switch as a _user_ switch).

**Reproduction (audit probe 7, DB `audit_probe_7`):**

```sql
-- user completes all 3 steps on a run whose target_organization_id = org A:
-- then "switches context" to org B (TenantContext.switchActiveContext).
SELECT public.resolve_onboarding_readiness('onboarding.tenant','1.0.0');
-- -> allow / required_steps_completed   (from the ORG-A run)
```

**Expected:** readiness is evaluated for the _active_ tenant context; a run targeting org A should not satisfy org B's gate.
**Observed:** the RPC has no organization parameter and no org filter, so the latest run for the wizard — regardless of target org — decides. Inverse shadowing also verified (probe 7, P7.2): a _newer incomplete_ org-B run hides an _older complete_ org-A run, so the gate flips to `require_steps` based on recency, not context. The outcome depends on run recency, not on which org the user is acting in.

**Why P1:** `ProtectedRoute` opens (or doesn't open) the onboarding flow from this decision; a tenant whose onboarding must be per-organization gets a cross-tenant bleed of completion state in both directions. It is not a data-confidentiality breach (RLS still isolates rows), hence not P0.

**Negative test that would catch it:**

```sql
-- complete run for org A; active context org B;
SELECT resolve_onboarding_readiness(...) MUST NOT return allow
-- (requires the RPC to accept/compare an org parameter). Currently: allow.
```

**Fix direction:** pass the active org into the RPC (`ProtectedRoute` has it in context) and filter runs by `target_organization_id` (NULL-target runs treated as global or excluded, per product decision); re-resolve on `activeOrganizationId` change.

---

## P2 — hardening / lower-severity

### P2-1. `completed_at` is client-backdatable — contradicts ADR §2.10 "Server timestamp of completion"

**Where:** `20261026150000_onboarding_actor_subject_delegation.sql:325-327` — the trigger sets `completed_at` only `IF NEW.completed_at IS NULL`.
**Reproduction (probe 3):** `INSERT ... state='completed', completed_at='1970-01-01'` persists 1970. **Observed vs expected:** the ADR's normative table says server timestamp; the trigger preserves client values. **Impact:** audit-trail time falsification by the completer (who is already entitled to complete the step — integrity, not authorization). **Negative test:** insert a completed step with `completed_at='1970-01-01'`; must be rewritten to ~now(). Currently: persists.

### P2-2. Expired-but-`status='active'` delegation blocks re-delegation (partial unique index DoS)

**Where:** `20261026150000:84-86` — `CREATE UNIQUE INDEX ... (run_id, actor_id) WHERE status='active'`; expiry is lazy (`can_complete_step` checks `expires_at > now()` but nothing flips `status`).
**Reproduction (probe 2, P2.4b):** expire a delegation (status stays `active`), then insert a fresh delegation for the same `(run, actor)` → `unique_violation`. **Impact:** availability — the run actor must know to `UPDATE status='revoked'` the corpse first; nothing in the schema or docs says so. **Negative test:** after expiry, re-insert an active delegation for the same delegate; must succeed. Currently: 23505.

### P2-3. `now()` in expiry checks is transaction-frozen (transaction-time, not statement-time)

**Where:** `can_complete_step` `(d.expires_at IS NULL OR d.expires_at > now())`.
**Reproduction (probe 8):** within one transaction, a delegation expiring mid-transaction still authorizes (`still_valid_within_txn = t`); a new transaction correctly denies. **Impact:** negligible under PostgREST (one request = one transaction) but should be documented; if a future server-side flow batches completions in one transaction, an expiry boundary can be crossed silently. **Negative test:** none strictly required if documented; if sub-transaction precision is wanted, use `clock_timestamp()`.

### P2-4. Readiness run selection has no tie-breaker (`ORDER BY created_at DESC` only)

**Where:** `20261026170000:97-102` (and same pattern at 20261026120000:221-228).
**Reproduction (probe 7 tie test):** two runs with identical `created_at` — selection is plan-dependent/nondeterministic; a `blocked` run and an `active` run created in the same second can be picked interchangeably. **Impact:** flaky gate decisions under bursty run creation. **Negative test:** create two same-`created_at` runs with different states; the decision must be deterministic (e.g. `ORDER BY created_at DESC, id DESC`).

### P2-5. `ProtectedRoute` renders children on every non-`require_steps` decision — `blocked`, `unavailable`, `unknown`, and `unavailable_backend` are all fail-open

**Where:** `src/components/auth/ProtectedRoute.jsx:61-66` (`if (user) { return children; }` — only `require_steps` triggers the onboarding effect at :46-51). Its own test (`ProtectedRoute.test.jsx:237-259`) asserts only that `blocked` doesn't open the wizard — it never asserts the private content is hidden.
**Reproduction (static + unit tests):** server returns `blocked/policy_denied` → child content renders; RPC 404 → renders; RPC throws → renders. **Expected vs observed:** the gate is documented as session-only (the adapter's "recorded dependency" comment, `useOnboardingReadiness.js:27-29`), so this is _consistent with intent_ — but the intent means the server-authoritative `blocked` decision the whole 20261026170000 migration exists to communicate is **not enforced anywhere in the UI**: it neither opens the wizard nor closes the route. If `blocked` is meant to keep a user out of tenant surfaces (the migration header says "the route gate must not open the onboarding flow on blocked" — it doesn't say what _should_ happen), the current contract silently renders the private surface. Graded P2 rather than P1 only because the documented intent is "session-only gate"; recommend the owner explicitly ratify or change that contract. **Negative test:** render `ProtectedRoute` with `decision:'blocked'`; assert children NOT in document. Currently: children render.

---

## Priorities that HELD (with the probe used)

**Takeover-by-identifier — HOLDS (13/13 probes).** Probe 1: Cyrillic homoglyph `аcme-corp`, zero-width-space, newline injection, uppercase, whitespace/hyphen trickery all rejected 22023 before the conflict lookup; exact-match guard keys on `identifier` only; non-admin conflict → 42501 with no org-data leak in the message (the message echoes only the caller-supplied identifier; existence-oracle is inherent to any slug namespace); fresh-owner of a _different_ org cannot read-back into the victim org; mere `org_member` (not admin) is denied the conflict read-back; `org_admin` read-back is idempotent, mutates nothing, and does not re-promote to owner; XSS-ish `p_name`/free-text payloads are stored verbatim (parameterized — no SQLi; render-layer escaping is the consumer contract, noted not failed); degenerate derived identifiers (`'---'`) rejected honestly. The dev suite's 27/27 corroborates but my probes were independently constructed.

**Post-conflict privilege — HOLDS.** No path promotes a conflicting caller (P1.3/P1.4 probes above); the only promotion is fresh-create.

**Expired delegation — HOLDS with P2 notes.** 1-microsecond-expired delegation denies (strict `> now()`); revoked denies; status check is server-side in the DEFINER helper with `search_path=''` (verified `proconfig={"search_path=\"\""}` for both `can_complete_step` and `run_actor`; a pg_temp shadow table does not fool the helper). Notes: lazy expiry + unique-index corpse (P2-2), transaction-time `now()` (P2-3).

**completed_by attribution — HOLDS (except backdating, P2-1).** Direct call of `onboarding_step_attribution()` errors (0A000, trigger-only); client-supplied `completed_by`/`completion_type` overwritten with the effective principal; regression to non-completed clears attribution; RLS evaluation order leaves no gap (WITH CHECK runs before BEFORE-triggers, trigger changes are to server-derived fields only); stranger cannot write; delegate without delegation cannot even draft (INSERT and UPDATE both denied — 42501, and the subject's draft cannot be tampered with).

**Empty required step — HOLDS.** Published-empty rejected by CHECK; draft/empty resolves `unavailable` (never allow); a bogus extra `completed` step does not satisfy a missing required one (exact-key LEFT JOIN); required steps resolve server-side only (client cannot pass a list — the RPC signature has none; verified in the ProtectedRoute test that no `p_required_step_keys` is sent).

**RPC failure — HOLDS.** With the RPC dropped, raw SQL raises `undefined_function` (42883; PostgREST surfaces PGRST202); the adapter maps it to `unavailable_backend`, never allow (unit-tested). Static sweep of all cycle suites: every `EXCEPTION WHEN` clause is SQLSTATE-specific (`insufficient_privilege`, `check_violation`, `unique_violation`, `22023`, `not_null_violation`) — no `WHEN OTHERS` can swallow a missing function into a vacuous pass. (The four `WHEN OTHERS` helpers in the repo live in _other_ suites — billing/notifications/phase2/workspace — and validate an error-message fragment; acceptable, outside this cycle.)

**Two-session race — HOLDS; harness is genuinely concurrent but narrow.** Re-ran `scripts/test-readiness-concurrency-race.sh` (PASS); inspection confirms real concurrency (session A holds the row lock in an open transaction; session B is a separate psql process that blocks and re-evaluates under READ COMMITTED; the `UPDATE 0` grep is robust; no serialization flaw in the harness itself). Races it misses, constructed independently: (a) readiness-vs-block race — decisions transition cleanly `require_steps → blocked`, no torn state; (b) fresh-vs-fresh same-revision race — exactly one winner (`completed|2`, loser `UPDATE 0`); (c) cross-user race is structurally prevented by RLS. Residual: same-`created_at` tie nondeterminism (P2-4) and the harness uses one uid throughout (fine for the lost-update property it tests).

**Context switch — DOES NOT HOLD (see P1-4).**

---

## Evidence inventory

- Baselines: `test-provision-adversarial-sql.sh` 27/27 · `test-onboarding-delegation-sql.sh` 22/22 · `test-readiness-blocked-sql.sh` 10/10 · `test-readiness-concurrency-race.sh` PASS · `vitest onboarding-readiness + ProtectedRoute` 22/22 (HEAD `ef4e5c5`).
- Independent probes (throwaway, not in repo): `audit_probe_1_provisioning.sql` (13 pass), `audit_probe_2_delegation.sql` (7 pass, findings P1-3/P2-2; P2.7 verified separately as `UPDATE 0` deny-by-invisibility), `audit_probe_3_attribution.sql` (6 pass, P2-1), `audit_probe_4_readiness.sql` (7 pass, P1-1), `audit_probe_5_rpcfail.sql` (pass), `audit_probe_6_race.sh` (races A/B clean), `audit_probe_7_context.sql` (P1-4 + tie note), `audit_probe_8_misc.sql` + interactive sessions (P2-3, P1-2).
- Static checks: `proconfig={"search_path=\"\""}` on both DEFINER helpers; anon EXECUTE = false on all five cycle functions; consumer seams reviewed in `TenantContext.jsx` (`createOrUpdateCorporateTenant` → `provision_corporate_tenant` with full 13-arg map), `OnboardingTearsheet.jsx:129-156` (step-3-only provisioning + 42501 surfacing — unit-tested), `OnboardingFullPage.jsx:404-421` (timestamp-suffixed identifier — avoids collisions entirely, no guard conflict), `useOnboardingReadiness.js` (discriminated adapter, fail-closed except as noted in P2-5).

_Read-only audit. Nothing in the repository, database remotes, or git state was modified._
