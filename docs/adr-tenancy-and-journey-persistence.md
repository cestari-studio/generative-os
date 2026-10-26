<!--
  Copyright IBM Corp. 2026
  This source code is licensed under the Apache-2.0 license found in the
  LICENSE file in the root directory of this source tree.
-->

# ADR 0001 — Tenancy model & journey persistence

> **Status:** DRAFT for owner review (no migration applied; forward-only/additive only,
> validated on disposable PostgreSQL 17.11 before any remote request).
> Relates: `fase0-preflight-report.md`, `fase-minus1-spec-control-plane-plan.md`, Fase A/B,
> `red-team-audit-readiness-generator.md` (DEFECT 3), `ui-rebuild/master-directive.md` §6.
>
> **Blocking note (actor/subject):** the readiness gate MUST NOT be considered complete
> until §2.7–§2.10 (actor/subject semantics, modes, readiness decision, completion
> attribution) are implemented in an additive migration and tested per §5. Any journey
> whose semantics depend on the actor/subject distinction stays blocked for release
> until then. See §3 (Consequences) for the explicit blocked set.

## 1. Context

- Active tenancy model: `organizations` (42 cols) + `organization_members` + `workspaces` + `projects`.
  `parent_organization_id` exists; **no** `tenant_kind`, **no** `authority_level` column.
- `persons.account_type` (`individual`/`organization_member`) is a **person classification**, currently
  misused as a "create organization" trigger and as a proxy for "onboarding complete".
- Legacy `tenants` (16 cols), `tenant_users` (7), `tenant_settings` (7) exist with **0 rows** — a
  parallel, unused model with its own `tenant_id`/`super_admin` claims policies.
- Onboarding progress lives in `persons.additional_property.onboarding` (generic JSON, holds PII).
- `audit_actions` is an **audit log** (`object_type`, `previous_value`, `result`, `error`,
  `start_time`) — **not** a workflow/run entity. **No** `action_frames`/`onboarding_runs`/
  `onboarding_step_states`/`outbox` table exists.
- Four documented failure states (FS1–FS4): three rival onboarding ledgers; provisioning at step 0
  before confirm; non-authoritative resume; direct-route gate bypass.

## 2. Decision

### 2.1 Separate the concepts (never conflate)

| Concept                         | Meaning                                       | Source of truth                                                                |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| identity/session                | who is authenticated                          | Supabase Auth JWT                                                              |
| `persons.account_type`          | person legal classification (PF/PJ)           | `persons.account_type` — **never** an authorization or tenant trigger          |
| `organizations.tenant_kind`     | organizational nature                         | new column (additive)                                                          |
| `organizations.authority_level` | place in the authority tree                   | new column (additive)                                                          |
| parent                          | validated parent org                          | `organizations.parent_organization_id` + depth/cycle guard                     |
| membership + role + policy      | what a user may do in an org/context          | `organization_members` (+ platform roles) — never inferred from e-mail/creator |
| product/capability/entitlement  | what is enabled for an org                    | catalog (normative) + effective entitlement (future)                           |
| workspace/project               | work context                                  | `workspaces`/`projects` — does not confer tenant authority                     |
| settings cascade                | `organization → workspace → project → person` | `setting_definitions`/`scoped_settings` — a different axis from authority      |

### 2.2 Tenancy columns (additive)

- `organizations.tenant_kind` — enum `platform_operator, creative_agency, holding, network, client, unit, sandbox`; default `client`; NOT NULL after backfill.
- `organizations.authority_level` — enum `master, agency, tenant`; default `tenant`; NOT NULL after backfill.
- Parent/authority are **server-derived and validated** (depth ≤ 3, no cycles, parent authority ≥ child).

### 2.3 Journey ledger (additive, new tables)

- `onboarding_runs` — one row per wizard run: `run_id`, `wizard_key`, `wizard_version`, `schema_version`,
  `actor_id`, `subject_user_id`, `target_organization_id?`, `context_snapshot jsonb`,
  `policy_snapshot jsonb`, `current_step_key`, `run_state` (enum), `idempotency_key` (unique),
  `correlation_id`, `created_at`, `updated_at`, `expires_at`, `completed_at`.
- `onboarding_step_states` — one row per `(run_id, step_key)`: `state` (enum
  `locked|available|in_progress|valid|completed|invalid|skipped|expired|blocked|failed`),
  `payload_minimized jsonb` (allowlisted, schema-validated, **no secrets/PII dump**), `validation_state`,
  `revision` (optimistic concurrency), `saved_at`, `verified_at`, `completed_at`, `error_code`, `retryable`.
- RLS by actor/context; TTL/expiry; audit events recorded to `audit_actions` (reuse, no new audit infra).
- Migrate `persons.additional_property.onboarding` forward-compatibly (preserve history; legacy read-only fallback).

### 2.4 Readiness (server-authoritative)

- `resolve_onboarding_readiness(p_actor)` → `{decision: allow|require_steps|blocked|unavailable,
reason, context, incomplete_steps[], required_steps[], next_step_key, run_id}`. Consumed by
  `ProtectedRoute`, sign-in, session restore, context switch (closes FS4). Completing a step never
  grants role/membership/entitlement.

### 2.5 Provisioning

- Move tenant creation to an explicit, idempotent, transactional confirm action (org + parent link +
  owner membership + workspace/project + entitlement snapshot + `audit_actions`), backend-generated
  identifier/slug + idempotency key (closes FS2). Separate `create` vs `update`. Never elevate to
  `org_owner` on an identifier conflict.

### 2.6 Legacy `tenants*`

Document as legacy. Migration/deprecation is a **separate ADR**. No populate/drop now.

### 2.7 Actor/subject — normative definitions (resolves red-team DEFECT 3)

The red team reproduced (`red-team-audit-readiness-generator.md` DEFECT 3) that the
journey-ledger RLS (`actor_id = auth.uid() OR subject_user_id = auth.uid()` on runs and
steps) lets **either** principal complete steps and thereby flip the **other** principal's
readiness gate to `allow`. The gate, as migrated, attests "_someone with run access_
completed the required steps," not "_the specific gated principal_ completed them." That
ambiguity is resolved normatively here.

The following terms are normative for every journey, run, step, readiness call and
delegation rule in this system. The "authority source" column states **where the value
comes from**; any value arriving from the browser that contradicts it is discarded.

| Term                     | Definition (normative)                                                                                        | Authority source (never client-trusted)                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_id`               | The authenticated principal that initiates or executes an action on a run.                                    | Derived **server-side** from `auth.uid()` of the validated session at the moment of the action. **Never accepted as a client-supplied parameter.**       |
| `subject_user_id`        | The person whose onboarding/state the run is about (the principal whose access the readiness gate certifies). | Bound to the run at creation by a server-side operation that validates the binding against the run's mode (§2.8). Never inferred from e-mail or payload. |
| `completed_by`           | The principal that effectively executed the completion of a step.                                             | Derived **server-side** from `auth.uid()` at the moment of completion and recorded on the step row. A client-supplied `completed_by` is never trusted.   |
| `target_organization_id` | The organization the operation applies to, when applicable.                                                   | Validated server-side against membership, policy and the hierarchy; never chosen by the browser to bypass membership/hierarchy.                          |
| `run_id`                 | The identifier of one specific workflow execution.                                                            | Generated (or validated) backend-side; scoped to actor+subject+wizard.                                                                                   |
| readiness                | The access decision for **one principal in one context, now, per the applicable policy**.                     | Resolved server-side from published definitions and authorized state (§2.9). Consumed by `ProtectedRoute`, sign-in, session restore, context switch.     |

No authorization, membership, role, completion or authority may be inferred from e-mail,
name, `persons.account_type`, the existence of an organization, or the mere ability to
read a run.

### 2.8 Two explicit onboarding modes — and no inferred third mode

Every published journey definition declares exactly one mode. The mode and its
permissions come from **published normative config** (the `onboarding_journey_definitions`
table and the delegation policy it references), **never from browser parameters**.
Mixed flows, if ever needed, must be declared separately as their own mode with their own
policy; a third mode MUST NOT be inferred from the two below.

#### Mode `self_service` (default)

- **Rule: `actor_id` MUST equal `subject_user_id`.** Run creation MUST validate this
  equality server-side; a creation request naming a different subject is rejected.
- Required steps MUST be completed **by the subject** (`completed_by = subject_user_id =
actor_id`), except where a step's published completion rules name a `trusted_verifier`
  (e.g., an e-mail/identity verification step completed by a backend verifier).
- Another user MUST NOT be able to modify the run or complete its steps merely by
  knowing its `run_id` or `idempotency_key`.
- The readiness gate for a `self_service` wizard binds to the **subject**: it answers
  "has **this** principal completed **their own** required steps?" A completion recorded
  by any other principal MUST NOT satisfy it.

#### Mode `delegated`

- `actor_id` MAY differ from `subject_user_id`, **only** when a server-side authorized
  **delegation policy** explicitly permits it. The delegation policy MUST be stored
  server-side (normative config; writable only by `service_role`) and MUST scope:
  - **who** may act on behalf of **whom** (delegator → delegate, by identity/role);
  - **which workflows** (wizard keys/versions) allow delegation;
  - **which steps and actions** a delegate may perform;
  - **which principal the readiness gate treats as the completer** for each step;
  - **what delegation evidence** MUST be retained (reference, not payload dumps);
  - **which delegation attempts MUST be denied** (out-of-scope actor, step, or workflow).
- **Sensitive declarations MUST NOT be satisfiable by a delegate's checkbox.** Steps
  constituting consent, legal representation, legal-identity attestation or equivalent
  sensitive declarations MUST require completion by the **subject** (or by a
  `trusted_verifier` under published rules), regardless of an otherwise valid delegation.
  Each step's completion rules state which principal types may complete it:
  `subject`, `delegated_authorized`, or `trusted_verifier`.
- The readiness gate for a `delegated` wizard binds per the step's completion rules:
  a step completable only by the subject counts only when `completed_by =
subject_user_id`; a step completable by an authorized delegate counts when
  `completed_by` is a principal whose delegation the policy authorized **for that step**.

### 2.9 Readiness decision semantics (server-authoritative, fail-closed)

The readiness decision answers exactly one question:

> **"Can THIS principal access THIS context now, per the applicable policy?"**

Resolution MUST follow these steps, all server-side:

1. **Derive the principal** from the validated session (`auth.uid()`). An anonymous or
   unauthenticated caller never receives `allow`.
2. **Resolve context and permissions server-side** (organization, membership, role,
   policy) — never from client-supplied claims.
3. **Identify the published definition and version** for the wizard
   (`onboarding_journey_definitions`, `status = 'published'`).
4. **Evaluate required steps per the mode and per-step completion rules** (§2.8),
   counting only completions with valid attribution (§2.10).
5. **Validate membership/policy/authority independently of onboarding progress** —
   onboarding completion is never a substitute for membership, role or entitlement.
6. **Return a discriminated decision.**

Admissible decision values (closed union):

| Decision        | Meaning                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `allow`         | All applicable requirements are satisfied for this principal in this context.                   |
| `require_steps` | Required steps remain unsatisfied for this principal; the response names them and the next one. |
| `blocked`       | Policy denies the operation/access (e.g., delegation not permitted, step reserved to subject).  |
| `unavailable`   | The configuration or state could not be resolved safely.                                        |

**Fail-closed invariants (normative):** backend failure, absent definition, invalid
version, ambiguous policy, or unpublished configuration MUST NEVER yield `allow`. A
published definition with an empty required-step list is rejected at write time and
treated as `unavailable` at read time (red-team DEFECT 2). **Completing onboarding never
grants role, membership, entitlement or authority.**

### 2.10 Completion attribution (`completed_by` and provenance)

Every step whose state can influence a readiness decision MUST carry verifiable
attribution of who completed it:

| Field             | Rule (normative)                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `completed_by`    | Principal that completed the step; **derived server-side** from `auth.uid()` at completion. Never client-trusted.        |
| `completion_type` | One of `subject` \| `delegated_authorized` \| `trusted_verifier`; derived server-side from the mode + delegation policy. |
| `completed_at`    | Server timestamp of completion.                                                                                          |
| `policy_ref`      | Reference to the delegation policy that authorized the completion, when `completion_type = 'delegated_authorized'`.      |

The readiness RPC MUST count a required step as satisfied **only** when its attribution
satisfies the step's completion rules for the wizard's mode (§2.8):

- `self_service` wizard: only `completed_by = subject_user_id` (or a `trusted_verifier`
  named in the step's rules) counts.
- `delegated` wizard: a subject-only step counts only for `completed_by =
subject_user_id`; a delegable step counts when `completed_by` holds a delegation the
  policy authorized for that step.

**Data minimization (normative):** the ledger MUST NOT store unnecessary PII, secrets,
documents, or full authentication/session payloads. `context_snapshot` /
`policy_snapshot` / `payload_minimized` are allowlisted, schema-validated and minimized;
delegation evidence is a reference (policy id/version), not a payload dump.

### 2.11 Required additive changes implied by §2.7–§2.10 (proposal — not applied)

The current journey-ledger migration (`20261026120000_journey_ledger_onboarding_runs.sql`)
precedes this decision and does **not** yet implement it. Closing DEFECT 3 requires, at
minimum (final shape belongs to the persistence worker's additive migration):

1. `onboarding_journey_definitions.mode text NOT NULL DEFAULT 'self_service'` with
   `CHECK (mode IN ('self_service','delegated'))`, plus per-step completion rules
   (which principal types may complete each required step).
2. `onboarding_step_states.completed_by uuid`, `completion_type text`
   (`subject|delegated_authorized|trusted_verifier`), `policy_ref text` — server-written.
3. A server-side **delegation policy** store (normative config; `service_role`-writable)
   scoping delegator/delegate/workflow/steps/actions/evidence, per §2.8.
4. RLS and the readiness RPC tightened so that run/step **writes that complete steps**
   enforce the mode rules (a subject cannot complete a run they are not the subject of in
   `self_service`; a delegate can complete only delegable steps in `delegated`), and the
   readiness evaluation counts only validly-attributed completions (§2.9 step 4).
   Read access for actor/subject to their shared run remains as migrated.
5. `resolve_onboarding_readiness` extended to return `blocked` for policy denials
   (today it returns only `allow|require_steps|unavailable`).

All of the above are **additive** (new columns with safe defaults, new table, tightened
policies/RPC in a new forward-only migration). The already-applied migration MUST NOT be
edited; existing rows backfill to `mode = 'self_service'` semantics (actor==subject),
which is the restrictive default.

## 3. Consequences

- Requires owner-authorized additive migrations (tenancy columns, run/step ledger, possibly RPC grant
  tightening for the three `anon`-executable INVOKER RPCs). **None applied here.**
- PII in `additional_property.onboarding` must be minimized/redacted/TTL'd; canonical records hold
  legal data; no PII in logs/analytics/CI artifacts.
- Readiness/provisioning authority is server-side; the browser presents the flow and sends answers.

### 3.1 Blocked until §2.7–§2.10 are implemented **and** tested (actor/subject)

The readiness gate MUST NOT be considered complete, and the following MUST stay **blocked
for release**, until the additive changes of §2.11 are implemented and the §5 test
assertions pass on a disposable PostgreSQL with RLS enforced as non-superuser roles:

- **Any journey whose semantics depend on the actor/subject distinction** — concretely,
  every wizard that is (or could be configured as) `delegated`, including organization /
  corporate-tenant onboarding where an operator may act on behalf of another person.
- **The `allow` verdict of `resolve_onboarding_readiness` as a certification that "this
  principal completed their own onboarding"** — until the RPC counts only validly-attributed
  completions (§2.9 step 4), `allow` certifies only "a principal with run access completed
  the steps" (red-team DEFECT 3) and MUST NOT be consumed as a per-principal certification.
- **Any UI copy, checklist or audit readout that presents shared-run completion as
  personal completion.**

A permissive `allow` MUST NOT be used as a compatibility mechanism while this is open
(master-directive §8.3). `self_service` journeys whose runs all satisfy `actor_id =
subject_user_id` are **not** blocked by this item, because under §2.8 the migrated RLS
already confines run access to the single principal involved; the block applies to the
distinction itself, not to self-service flows that never exercise it.

## 4. Migration plan (draft — see `supabase/migrations/` draft when authorized to draft locally)

1. `tenancy_columns`: add `tenant_kind`, `authority_level` enums + columns + parent validation trigger.
2. `journey_ledger`: `onboarding_runs` + `onboarding_step_states` + RLS + indexes + TTL function +
   `resolve_onboarding_readiness` RPC (SECURITY INVOKER, `auth.uid()` checked in body). **(applied
   as `20261026120000_journey_ledger_onboarding_runs.sql`; predates §2.7–§2.10.)**
3. Backfill `tenant_kind`/`authority_level` for existing orgs (default `client`/`tenant`; the seed
   `generative-os-enterprise` org → `client`/`tenant` until owner reclassifies).
4. Data migration: `additional_property.onboarding` → ledger (idempotent, forward-compatible).
5. **(new, additive) `actor_subject_semantics`**: implement §2.11 — `mode` + per-step completion
   rules on `onboarding_journey_definitions`, `completed_by`/`completion_type`/`policy_ref` on
   `onboarding_step_states`, the delegation-policy store, tightened RLS + readiness RPC with the
   `blocked` decision. Backfill existing rows to `self_service`. Forward-only; never edits step 2.

## 5. Test plan (normative assertions — disposable PostgreSQL 17.11, non-superuser roles, RLS enforced)

The migration implementing §2.11 is accepted only with SQL tests covering, at minimum:

**Identity & delegation**

1. `self_service`, actor == subject, all requirements satisfied → permitted.
2. `self_service`, actor != subject at run creation → rejected server-side.
3. Delegation without an authorizing policy → denied.
4. Authorized delegation, delegate completes a **delegable** step → accepted; gate reflects it per policy.
5. Delegate attempts a **subject-reserved** step (consent/legal-identity) → denied; gate does not move.
6. Subject attempts to modify a delegated run outside their scope → denied.
7. Unrelated third party reads/writes the run → denied.
8. One person's completion never satisfies another person's journey.
9. `completed_by` reflects the effective server-derived principal, never a client-supplied value.
10. Readiness respects each mode's policy (`allow` only with validly-attributed completions).

**Integrity & failure (fail-closed)**

11. Absent/unpublished definition → `unavailable` (never `allow`).
12. Published definition with empty required steps → rejected at write; treated as `unavailable` at read.
13. Stale revision / invalid state transition → rejected (optimistic concurrency preserved).
14. Idempotent replay → no duplication.
15. Incompatible idempotency-key reuse → explicit, auditable error.
16. Concurrent completions → no silent lost update.
17. Expired run → documented, tested behavior; no unauthorized writes.
18. Injection in `wizard_key` / malformed versions → no crash, no authorization.
19. Cross-wizard completion → does not satisfy the target wizard.
20. Backend/policy resolution failure → fail-closed (`unavailable`), never `allow`.

If any assertion depends on an interpretation not yet decided, it is recorded as PENDING (§6);
the expectation MUST NOT be adjusted to make the suite pass.

## 6. PENDING decisions (require the product owner / competent authority)

The following are explicitly **PENDING** and block the corresponding scope until decided.
They are decisions of policy, not of engineering, and are therefore not made in this ADR.

| #   | Decision (PENDING)                                                                                                                                                                                            | Scope blocked until decided                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| P1  | **Which wizards are `delegated` vs `self_service`** — the per-wizard mode assignment in published normative config.                                                                                           | Any `delegated` wizard's release; the `mode` values written to `onboarding_journey_definitions`. |
| P2  | **The delegation policy content** — who may act for whom, which steps are delegable, required delegation evidence, and denial rules (§2.8).                                                                   | All `delegated` flows; the delegation-policy store's rows; assertion §5.4/§5.5 expectations.     |
| P3  | **Which steps are "sensitive declarations"** (consent, legal representation, legal-identity) that can never be delegate-satisfied, per wizard.                                                                | Step-level completion rules; legal/compliance sign-off.                                          |
| P4  | **Which principal the readiness gate certifies for each delegated wizard** (subject-always vs policy-per-step), where the directive leaves it to policy (§2.8, §2.9).                                         | Readiness verdict semantics for delegated wizards; the §5.10 expectation.                        |
| P5  | **`trusted_verifier` set** — which backend verifiers (e.g., e-mail/identity verification) may complete steps without being the subject, and under what rules.                                                 | Any step whose completion type is `trusted_verifier`.                                            |
| P6  | **Backfill confirmation** — that classifying every pre-existing run as `self_service` (actor==subject) is correct for the historical data, and the classification of the seed `generative-os-enterprise` org. | The step-5 migration's backfill; tenancy-column backfill (§4.3).                                 |

No PENDING item is resolved by inference from code, reports, or the permissive behavior of
the currently-applied migration. Each requires an explicit, recorded decision.
