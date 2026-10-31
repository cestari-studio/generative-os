<!--
  Copyright IBM Corp. 2026
  Licensed under the Apache-2.0 license found in the LICENSE file in the
  root directory of this source tree.
-->

# Red-Team Audit — Readiness RPC + Spec Generator

- **Auditor:** Agent 7 (independent; did **not** implement the fixes under review).
- **Branch / HEAD:** `feat/complete-carbon-page-rebuild` @ `dc61055`.
- **Scope:** (1) `resolve_onboarding_readiness` server-side required-step resolution
  (`supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql`);
  (2) spec generator spec_key resolution (`scripts/spec-generate.mjs`).
- **Method:** read-only analysis + reproduction against a disposable PostgreSQL 17
  instance and temp spec trees. No commits, no pushes, no remote mutation, no
  migrations applied to the shared project. The disposable test DB (`redteam_jl`)
  and all temp spec trees were dropped after the run.

## Test-run results (observed)

| Suite                                                                            | Result                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `scripts/test-journey-ledger-sql.sh` (PG 17, role `authenticated`, RLS enforced) | **PASS — 11/11 assertions** (`=== ALL 11 ASSERTIONS PASSED ===`) |
| `npx vitest run src/__tests__/spec-generate-semantic.test.mjs`                   | **PASS — 4/4 tests**                                             |
| `npm run spec:check` (committed tree)                                            | **PASS — exit 0** (`generated/ is up to date.`)                  |

The two fixes' own claims are **largely substantiated**. I was able to reproduce
**one real defect (P1)** and **two lower-severity hardening gaps (P2)**. No P0.

---

## DEFECT 1 — P1 — Spec generator emits duplicate TypeScript type identifiers for duplicate `field_key`

- **File:** `scripts/spec-generate.mjs:95-99` (the `types/spec-types.ts` artifact
  maps each field to `export type ${f.field_key.replace(...)}`), interacting with
  the new `fieldBySpecKey` Map at `scripts/spec-generate.mjs:115`.
- **Claim attacked (B-a):** "resolves step fields by spec_key via a Map, emits
  ref+field_key+metadata." The Map is keyed by **`spec_key`** (unique), so the
  _form-definition_ resolves correctly. But the **types artifact keys the exported
  type by `field_key`** and performs **no deduplication**. Two field specs that
  share a `field_key` (legitimate aliases: distinct `spec_key`, same physical
  column) produce two `export type <same_name>` lines.
- **Reproduction:**
  - Built a temp spec tree = real `specs/` plus one extra field
    `field.person.full-name-alias` with `spec_key` distinct but
    `field_key: "person.full_name"` (same as `field.person.full-name`).
  - `SPEC_DIR_OVERRIDE=<tree> node scripts/spec-validate.mjs` → `0 BLOCKED`
    (G1 has **no rule** against duplicate `field_key`; V10 only guards duplicate
    `spec_key`).
  - `SPEC_DIR_OVERRIDE=<tree> SPEC_GEN_OVERRIDE=<out> node scripts/spec-generate.mjs`
    → exit 0, and the generated `types/spec-types.ts` contains:
    ```ts
    export type person_full_name = string; // line 12
    export type person_full_name = string; // line 13  (duplicate)
    ```
  - `npx tsc --noEmit --strict <out>/types/spec-types.ts` →
    `error TS2300: Duplicate identifier 'person_full_name'.` (×2).
- **Observed impact:** the generator **silently** produces an **uncompilable**
  TypeScript artifact. The byte-stable `--check` passes (the file is
  deterministically wrong), so CI's `spec:check` is green while `types/spec-types.ts`
  cannot be imported by any TS consumer.
- **Do the current tests catch it?** **No.** The semantic test
  (`src/__tests__/spec-generate-semantic.test.mjs`) has no duplicate-`field_key`
  coverage, and the current committed `specs/` tree has **no** duplicate
  `field_key` (verified: each of `person.full_name` / `person.tax_id` /
  `person.birth_date` appears exactly once), so the committed `generated/` is clean.
  The defect only fires when a contributor adds an alias field — exactly the kind
  of change the generator is supposed to make safe.
- **Fix direction:** dedupe type-alias emission by `field_key` (or by the
  sanitized identifier) before emitting `types/spec-types.ts`, and/or add a G1
  rule flagging duplicate `field_key` across field specs.

---

## DEFECT 2 — P2 — Readiness gate returns `allow` for a _published_ definition with **zero** required steps

- **File:** `supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql:137`
  (`required_step_keys text[] NOT NULL DEFAULT '{}'` — no `array_length(...) > 0`
  CHECK) combined with the RPC at `:226-244`.
- **Claim attacked (A-c):** "`no_active_run -> require_steps` with
  `next_step = v_required[1]` breaks if `required_step_keys` is empty." It does
  **not crash** — PL/pgSQL returns NULL for an out-of-bounds array index, so
  `v_required[1]` is NULL, not an error. The RPC is robust to the empty array.
  **However**, the empty array creates a permissive state:
  - With an **active run** for that wizard, the `LEFT JOIN ... WHERE st.id IS NULL`
    over `unnest('{}')` yields zero incomplete rows → `array_length IS NULL` →
    **`decision: allow`** (`reason: required_steps_completed`).
  - Reproduced: inserted a `published` definition
    `('onboarding.empty','1.0.0', ARRAY[]::text[])`, created an active run, called
    `resolve_onboarding_readiness('onboarding.empty','1.0.0')` →
    `{"decision":"allow","reason":"required_steps_completed",...}`.
- **Severity rationale (P2, not P0/P1):** the definition table is
  **service-managed** — `GRANT SELECT` only to `authenticated`; INSERT/UPDATE/DELETE
  require `service_role` (verified: a non-admin authenticated role gets
  `permission denied for table onboarding_journey_definitions` on all three). So a
  remote attacker **cannot** create this state; only a service operator
  misconfiguration can. It is a **foot-gun / defense-in-depth gap**, not an
  exploitable bypass. The migration's own header promise — "config absent is NEVER
  silently allow" — covers a **missing** definition, but a **present-but-empty**
  one is silently `allow`, which is arguably the same failure class.
- **Do the current tests catch it?** **No.** `journey_ledger_rls.sql` seeds a
  definition with two steps and never exercises the empty-array case.
- **Fix direction:** add `CHECK (array_length(required_step_keys,1) > 0)` (or a
  trigger / RPC guard that treats empty required steps as `unavailable`), so a
  zero-requirement _published_ definition cannot flip the gate to unconditional
  `allow`.

---

## DEFECT 3 — P2 — Readiness gate proves _someone with run access_ completed steps, not the gated user (actor/subject shared write)

- **File:** RLS policies at
  `supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql:103-118`
  (`USING/WITH CHECK (actor_id = auth.uid() OR subject_user_id = auth.uid())` on
  runs, and the step policy checks the parent run's actor **OR** subject), feeding
  the readiness resolution at `:204-254`.
- **Claim attacked (A-d):** "actor vs subject RLS — can either write ALL steps of
  a shared run (is that intended)?" **Yes.** Both the actor and the subject hold
  full read/write on the run and every step. Reproduced: actor A created a run for
  `onboarding.person` naming B as `subject_user_id`; subject B (not the actor)
  inserted both required steps as `completed`; the **actor's** readiness call then
  returned `{"decision":"allow","reason":"required_steps_completed"}`.
- **Interpretation:** this is the _delegated onboarding_ feature working as the
  schema intends (an actor filling on behalf of a subject). The integrity caveat
  is that the gate attests "**a principal with run access** completed the required
  steps," not "**the specific gated principal** completed them." If the dashboard
  gate is ever read as "this user finished onboarding," a subject (or actor) can
  confer that on the other party. Whether that is a defect depends on which
  principal the gate is meant to bind to — the migration does not document this,
  so it is flagged as a **design-integrity ambiguity** rather than a clear bug.
- **Do the current tests catch it?** **No.** The suite tests cross-_user_ denial
  (assertions 3-4) but never the actor-vs-subject shared-write path or which
  principal the readiness decision is attributed to.
- **Fix direction:** document the intended binding (who is gated), and if the gate
  must bind to a single principal, tighten the step-completion attribution (e.g.,
  record `completed_by` and have the RPC require the gated principal's own
  completion for non-delegated wizards).

---

## Areas attacked where I found NO reproducible defect

For completeness — I tried and could **not** refute these; the claims hold.

- **A-a (journey-definition RLS write):** an authenticated non-admin gets
  `permission denied` on INSERT / UPDATE / DELETE of
  `onboarding_journey_definitions` (including `status:'published'` and
  `required_step_keys:'{}'`). Only `service_role` can write. **Defended.**
- **A-b (cross-wizard step completion):** the completion join is
  `st.run_id = v_run.id`, so completing same-named steps on a _different_ wizard's
  run does **not** affect the target wizard's gate (verified: gate stayed
  `require_steps`). **Defended.**
- **A-e (idempotency_key global uniqueness):** `idempotency_key UNIQUE` is global,
  so a second actor reusing the same key gets `unique_violation`. This is a
  _robustness/availability_ nit (per-actor scoping `UNIQUE(actor_id,
idempotency_key)` is the conventional pattern) but **not a security defect** —
  noted here, not counted as a finding.
- **RPC robustness:** NULL `p_wizard_version`, and an injection-style
  `wizard_key` (`' OR '1'='1`), both safely return `unavailable` (parameterized,
  no crash, no allow). A `draft` (non-published) definition also returns
  `unavailable` (excluded by both the `status='published'` predicate and the RLS
  SELECT policy). A `completed` run is not selected as active
  (`run_state='active'` filter). **Defended.**
- **B-b (same field twice in one step):** emits the field twice in the form JSON,
  no crash, no metadata corruption — harmless. **No defect.**
- **B-d (determinism / spec:check):** two regenerations are byte-identical;
  flipping a journey step's `required_for_dashboard` after generating makes
  `--check` report the affected artifacts STALE and exit 1; committed tree exits 0.
  **Determinism is real.**

### Note on B-c (unresolvable-ref exit-1 reachability)

The generator's own `unresolvedRefs` exit-1 (`scripts/spec-generate.mjs:140-143`)
is **practically unreachable in real operation**: `spec-validate.mjs` (G1) rule V2
already flags an unresolved field reference as BLOCKED, so the generator aborts at
the G1 gate ("G1 has BLOCKED findings; refusing to generate") _before_ reaching its
own check. The vitest broken-ref test asserts only `exit === 1` and therefore
**cannot distinguish** G1's exit from the generator's own exit-1 — it does not
prove the generator's dedicated path fires. This is dead-but-harmless defensive
depth, not a defect, but the test gives weaker assurance than its name implies.

---

## Summary

| Severity | Count | Finding                                                                                                                                                     |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | 0     | —                                                                                                                                                           |
| P1       | 1     | DEFECT 1 — duplicate `field_key` → uncompilable `types/spec-types.ts` (TS2300)                                                                              |
| P2       | 2     | DEFECT 2 — empty published `required_step_keys` → unconditional `allow`; DEFECT 3 — readiness not bound to the gated principal (actor/subject shared write) |

**Most important:** **DEFECT 1 (P1).** It is the only finding that (a) is reachable
through a legitimate, expected contributor action (adding a field alias), (b) is
**silent** (generator exits 0, `--check` stays green), and (c) produces a **broken
build artifact** (`tsc` TS2300). The two P2s are hardening/defense-in-depth gaps
gated behind `service_role` (DEFECT 2) or a documented-design ambiguity (DEFECT 3).
