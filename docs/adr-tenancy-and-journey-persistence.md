<!--
  Copyright IBM Corp. 2026
  This source code is licensed under the Apache-2.0 license found in the
  LICENSE file in the root directory of this source tree.
-->

# ADR 0001 — Tenancy model & journey persistence

> **Status:** DRAFT for owner review (no migration applied; forward-only/additive only,
> validated on disposable PostgreSQL 17.11 before any remote request).
> Relates: `fase0-preflight-report.md`, `fase-minus1-spec-control-plane-plan.md`, Fase A/B,
> `red-team-audit-readiness-generator.md` (DEFECT 3), `ui-rebuild/master-directive.md` §6,
> `red-team-audit-provisioning-readiness-cycle.md` (P1-4 org-scoping; P2-1..P2-5 hardening).
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

### 2.12 Organizational scope contract for readiness (resolves red-team P1-4)

The independent red team reproduced (`red-team-audit-provisioning-readiness-cycle.md`
P1-4) that `resolve_onboarding_readiness` selected the caller's **latest run for the
wizard with no `target_organization_id` filter**, so a completed run in organization A
yielded `allow` while the caller operated in organization B — a cross-tenant bleed of
completion state in both directions (and, inversely, a newer incomplete B run shadowing
an older complete A run). The owner decided the normative contract below; it is recorded
here verbatim and is **decided, not pending**.

Every published journey definition declares exactly one **scope** —
`personal | organizational` — from server-managed normative config
(`onboarding_journey_definitions.scope`, writable only by `service_role`), never from
browser parameters. Scope is an axis **orthogonal to mode** (§2.8): mode says **who**
may complete steps; scope says **in which organizational context** completion counts.
The fail-closed default for an undeclared scope is `organizational`.

#### 2.12.1 The contract (normative, owner-decided)

| #   | Situation                                                                       | Decision (normative)                                                                                                   |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `personal` journey, explicitly-declared global scope                            | Evaluate the subject's progress **globally** per policy (no organization context is resolved or required).             |
| 2   | `organizational` journey, active context A, a run completed for A               | May allow **ONLY A** (when every other policy in §2.9 passes).                                                         |
| 3   | `organizational` journey, active context B, only a run completed for A exists   | MUST NOT allow because of A's run. (Without a live B run the outcome is `require_steps` for B, never A's `allow`.)     |
| 4   | `organizational` journey, no valid target organization context                  | **`unavailable` / `org_context_missing`** — never a permissive fallback (rationale in §2.12.2).                        |
| 5   | Caller without membership/authorization in the active context                   | **`blocked` / `org_membership_required`** — an affirmative policy denial, never allow.                                 |
| 6   | Multiple eligible live runs for the same context, no unambiguous selection rule | **`unavailable` / `ambiguous_runs`** until the ambiguity is resolved — never an arbitrary latest-wins pick.            |
| 7   | `NULL target_organization_id`                                                   | Is **never** a wildcard for "any organization"; a NULL-target run never matches an organizational context.             |
| 8   | Delegated-actor authorization                                                   | Never silently becomes the subject's personal or organizational authorization (§2.8, §2.10 attribution still governs). |

Run selection is a function of exactly five dimensions, all server-resolved:
**principal** (`actor_id`/`subject_user_id` = `auth.uid()`), **journey**
(`wizard_key`), **version** (`wizard_version`), **organizational context** (§2.12.3),
and the **delegation rules** of §2.8/§2.10. No other signal (recency alone, run
existence, e-mail, `persons.account_type`) may influence selection.

#### 2.12.2 Missing org context is `unavailable`, not `blocked` — rationale

Situation 4 resolves to **`unavailable` / `org_context_missing`** (Worker A's
implementation choice in migration `20261026190000_readiness_org_scoping.sql`, ratified
here). The distinction preserves the §2.9 taxonomy's meaning:

- `unavailable` certifies "_the configuration or state could not be resolved safely_."
  An absent active-organization pointer is precisely that: the system cannot determine
  **which** context to evaluate, so no safe decision exists. Nothing has been denied;
  the principal may simply not have selected (or been provisioned) a context yet.
- `blocked` certifies "_policy denies the operation/access_" — an affirmative verdict
  **about the principal**. That is situation 5: the caller names an active context and
  the membership check fails (`org_membership_required`).

Mapping a not-yet-established context to `blocked` would misreport a resolvable state
as a policy denial (and the UI would show a "contact your administrator" denial surface
to a user who merely has no active org). Mapping it to `require_steps` or `allow` would
be a permissive fallback, which this contract forbids. Both failure surfaces remain
fail-closed: neither renders the private route nor opens the wizard (§2.13.5).

#### 2.12.3 Org-context mechanism (server-trusted, never a client argument)

- The readiness RPC keeps its `(wizard_key, version)` signature — **the browser never
  passes an organization id**. The active organization context is resolved
  **server-side** from `persons.active_organization_id` for `auth.uid()`.
- The stored pointer is **never blindly trusted**: membership is independently
  re-validated at evaluation time (`app_private.is_org_member`). A stale or forged
  pointer degrades to `blocked` / `org_membership_required` (situation 5), never to
  `allow`. The pointer's only sanctioned writer
  (`public.switch_active_context`) itself validates membership before writing — the RPC
  re-checks because stored state can drift.
- The consumer (`ProtectedRoute`) MUST re-resolve readiness when the active
  organization changes (`activeOrganizationId`), not only on user-identity change —
  closing the client half of P1-4 (implemented in
  `src/components/auth/ProtectedRoute.jsx`).

#### 2.12.4 Fail-closed invariants (extension of §2.9)

The following MUST NEVER yield `allow`: absent/unpublished/empty definition
(`journey_definition_missing` / `journey_definition_empty`); missing org context on an
organizational journey (`org_context_missing`); ambiguous eligible runs
(`ambiguous_runs`); unauthenticated caller (`authentication_required`); any
query/permission failure (`resolution_error`); and every `blocked` reason
(`run_blocked`, `run_state_blocked`, `policy_denied`, `org_membership_required`). A
completed run in the current context is superseded (the gate was already passed for
that context) and a fresh run is offered — completion in context A never satisfies
context B.

### 2.13 P2 hardening decisions (time, state and route-gate integrity)

The owner decided to close the red team's five P2 hardening items. The normative
decisions are recorded here with the implementing artifacts named per item. Worker B's
implementing migration (`20261026200000_p2_time_state_integrity.sql`) and SQL suite
(`supabase/tests/p2_time_state_integrity.sql`) are in the local tree; nothing is
applied remotely. The merge coordination point with Worker A's org-scoping migration
is recorded in §2.13.6.

#### 2.13.1 `completed_at` is server-controlled — no backdating (red-team P2-1) — decided and implemented

`completed_at` MUST be server-stamped **only on a valid transition INTO a completed
state**; any client-supplied value is discarded (overwritten, never preserved); the
stamp is immutable while the row stays completed (a client rewrite attempt is ignored)
and is cleared on regression out of completed. This holds for **both**
`onboarding_step_states.completed_at` (attribution trigger rewrite) and
`onboarding_runs.completed_at` — the latter joins the P1-1 server-authoritative guard
set, so a direct authenticated UPDATE cannot change it at all, and server-side
transitions stamp/clear it with `clock_timestamp()`. Re-completion restamps.
Supersedes the backdatable `IF NEW.completed_at IS NULL` behavior of
`20261026150000:325-327`. Implemented in `20261026200000_p2_time_state_integrity.sql`
(P2-1a/P2-1b, Worker B).

#### 2.13.2 Expired delegations never authorize and never corpse-block (red-team P2-2) — decided and implemented

- An expired delegation MUST NOT authorize anything — enforced by **revalidation on
  use**: `app_private.can_complete_step` re-checks `status='active'` AND expiry on every
  write-path call (the RLS call sites), so an expired (or corpse) delegation never
  authorizes regardless of the stored `status`.
- An expired-but-`status='active'` delegation MUST NOT block a fresh grant for the
  same `(run_id, actor_id)`: on any delegation INSERT or (re)activation, a trigger
  sweeps **other** active-but-expired rows for the same `(run_id, actor_id)` to
  `status='expired'` (wall-clock corpse test), freeing the partial-unique-index slot.
  Two genuinely **live** active delegations still collide (`23505`) — the constraint
  is preserved. Expiration is always derived from `expires_at`, never trusted from the
  stored `status` alone. Implemented in `20261026200000_p2_time_state_integrity.sql`
  (`app_private.sweep_expired_delegations`, Worker B).

#### 2.13.3 Temporal reference per operation — `now()` vs `clock_timestamp()` (red-team P2-3) — decided and implemented

Normative rule, as implemented by Worker B and ratified here:

- **`clock_timestamp()` (wall clock) is REQUIRED** wherever the comparison is an
  **expiry / authorization boundary or an audit-trail write time**: delegation expiry
  in `can_complete_step`, run expiry in `resolve_onboarding_readiness`, the
  delegation corpse sweep, and every `completed_at` stamp. Rationale: an
  authorization boundary is a wall-clock fact — a delegation or run that expires
  mid-transaction MUST stop being honored immediately, and in a long transaction that
  completes several steps each row MUST carry its own true write time, not the shared
  transaction-start time.
- **`now()` (transaction time) is KEPT** for bookkeeping inside one transaction
  (`created_at`, `updated_at`, `set_updated_at()`): transaction-consistent values are
  intended there and they feed no expiry/TTL/authorization decision.
- The choice MUST be documented at the function. Implemented in
  `20261026200000_p2_time_state_integrity.sql` (P2-3a/P2-3b, Worker B).

#### 2.13.4 Deterministic run selection — tie-breaker + ambiguity rejection (red-team P2-4) — decided and implemented

- **Ambiguity rejection:** more than one **eligible live ACTIVE run** for the
  selection dimensions yields `unavailable` / `ambiguous_runs` — never an arbitrary
  pick (expired/terminal runs are not eligible and never poison the count). Present
  in both Worker A's org-scoped body and Worker B's hardening body.
- **Tie-breaker:** latest-run selection MUST order by
  `ORDER BY created_at DESC, id DESC` — the `(created_at, id)` pair is unique (`id` is
  the PK), so the pick is fully deterministic and independent of insertion order or
  plan choices. Implemented in `20261026200000_p2_time_state_integrity.sql` (P2-4,
  Worker B); the merge into the org-scoped body is §2.13.6.

#### 2.13.5 `ProtectedRoute` fail-closed contract (red-team P2-5) — decided and implemented

The route gate's contract is **fail-closed on the server decision**, superseding the
previous "session-only" intent:

- Children render **only** on an explicit server `decision = 'allow'`.
- Every other outcome — `checking`, `require_steps` (the onboarding flow opens; the
  private surface renders nothing), `blocked`, `unavailable`, `unavailable_backend`,
  `unknown`, malformed payload, network timeout — renders an explicit non-authorized
  state (Carbon `InlineNotification`), **never children**.
- The gate re-resolves on **both** user-identity change and `activeOrganizationId`
  change (§2.12.3).

Implemented in `src/components/auth/ProtectedRoute.jsx` (Worker C). The server-side
`blocked` decision introduced by `20261026170000_readiness_blocked_decision.sql` is
now actually enforced in the UI: it neither opens the wizard nor renders the route.

#### 2.13.6 Merge coordination point — one `resolve_onboarding_readiness` body (OPEN)

Migrations `20261026190000` (Worker A, org-scoping) and `20261026200000` (Worker B,
P2-3/P2-4) **both `CREATE OR REPLACE public.resolve_onboarding_readiness`** — last
writer wins the function body. Worker B's file intentionally carries the
**non-org-filtered** variant (170000 base) because the org filter is Worker A's owned
change, and Worker B verified empirically that naive last-writer-wins **reverts** the
org-scoping. The merge MUST produce ONE function body combining, and the application
order (or a single reconciled migration) MUST be fixed before any remote apply:

- **from Worker A (org-scoping):** scope resolution
  (`persons.active_organization_id` re-validated via `app_private.is_org_member`), the
  `target_organization_id` predicate on BOTH the live-run count AND the latest-run
  selection, the `org_context_missing` / `org_membership_required` reasons, and the
  fail-closed `EXCEPTION WHEN OTHERS → unavailable/resolution_error` wrapper.
- **from Worker B (hardening):** `ORDER BY created_at DESC, id DESC`, the
  `>1 live ACTIVE run → unavailable/ambiguous_runs` rejection, and
  `clock_timestamp()` for every run-expiry comparison.

Until that single reconciled body exists and both suites
(`readiness_org_scoping.sql` + `p2_time_state_integrity.sql`) pass against it per §5,
the merged readiness RPC is **not verified** and MUST NOT be applied remotely. This is
an engineering coordination point (owned by Workers A+B together), not a pending
product decision.

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

### 3.2 Org-scope + P2 hardening — implementation status (local tree only)

The §2.12 org-scope contract, the §2.13.1–§2.13.4 hardening, and the §2.13.5 route
gate are implemented in the local tree (migrations
`20261026190000_readiness_org_scoping.sql` + `20261026200000_p2_time_state_integrity.sql`,
suites `supabase/tests/readiness_org_scoping.sql` + `supabase/tests/p2_time_state_integrity.sql`,
and `src/components/auth/ProtectedRoute.jsx`). **Two coordination gates remain before
any of this is verified:** (a) the §2.13.6 merge of the two readiness-RPC bodies into
one, and (b) both §5 suites passing against the merged body on a disposable PostgreSQL
with RLS enforced as non-superuser roles. **None of this is applied remotely** (owner
authorization required), and no org-scope or P2 behavior may be presented as released
until both gates clear.

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
6. **(new, additive) `readiness_org_scoping`** (`20261026190000_readiness_org_scoping.sql`,
   local tree): implement §2.12 — `scope` column on `onboarding_journey_definitions`
   (default `organizational`, fail-closed) + org-scoped `resolve_onboarding_readiness`
   (server-derived, membership-revalidated context; `ambiguous_runs` rejection). Forward-only;
   never edits step 2 or step 5.
7. **(new, additive) P2 hardening** (`20261026200000_p2_time_state_integrity.sql`,
   local tree): implement §2.13.1–§2.13.4 — server-stamped `completed_at` on valid
   completed transitions only (steps + runs), expired-delegation corpse sweep +
   revalidation on use, `clock_timestamp()` for expiry/authorization boundaries, and
   the `id DESC` tie-breaker. Forward-only; never edits prior steps. **Open merge:**
   steps 6 and 7 both `CREATE OR REPLACE public.resolve_onboarding_readiness` — a
   single reconciled body (§2.13.6) MUST be produced before any remote apply.

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

**Organizational scope (§2.12) — implemented in `supabase/tests/readiness_org_scoping.sql` (Worker A)**

21. Org-A completed run, evaluating in org B → NOT `allow` (core P1-4; `require_steps`/`no_active_run` for B).
22. Delegated run (actor≠subject) in org A, evaluating in org B → NOT `allow`.
23. `scope='personal'` journey evaluates globally (no org context required).
24. `organizational` journey, no active org context → `unavailable`/`org_context_missing`.
25. Active org the caller is not a member of (stale/forged pointer) → `blocked`/`org_membership_required`.
26. Multiple eligible live runs in the same context → `unavailable`/`ambiguous_runs`.
27. `NULL target_organization_id` never matches an organizational context.
28. A delegated-actor's org-A authorization never satisfies the subject's org-B gate.

**P2 hardening (§2.13) — implemented in `supabase/tests/p2_time_state_integrity.sql` (Worker B), except where noted**

29. `completed_at` with a backdated client value → rewritten to server `clock_timestamp()` on a valid completed transition (steps and runs); immutable while completed; cleared on regression; direct authenticated UPDATE of run `completed_at` raises 42501 (P2-1).
30. Re-delegation for the same `(run_id, actor_id)` after expiry → succeeds (corpse swept to `expired`); two live active delegations still collide (23505); expired delegation never authorizes on the write path (P2-2).
31. Delegation/run expiry crossing a boundary mid-transaction → stops authorizing immediately (`clock_timestamp()` semantics per §2.13.3) (P2-3).
32. Two runs with identical `created_at`, different states → deterministic selection (`id DESC` tie-breaker); >1 live ACTIVE run → `unavailable`/`ambiguous_runs` (P2-4). Assertions 31–32 run against Worker B's body; they MUST be re-run against the §2.13.6 merged body.
33. `ProtectedRoute` renders children **only** on `decision='allow'`; `blocked`/`unavailable`/`unknown`/`unavailable_backend` render the non-authorized state (P2-5; implemented in `src/components/auth/ProtectedRoute.jsx`, Worker C).
34. **Merged body (§2.13.6):** assertions 21–28 AND 31–32 MUST all pass against the single reconciled `resolve_onboarding_readiness` before any remote apply.

If any assertion depends on an interpretation not yet decided, it is recorded as PENDING (§6);
the expectation MUST NOT be adjusted to make the suite pass.

## 6. PENDING decisions (require the product owner / competent authority)

The following are explicitly **PENDING** and block the corresponding scope until decided.
They are decisions of policy, not of engineering, and are therefore not made in this ADR.

**Decided since this table was first written (no longer pending):**

- **Readiness org-scoping (red-team P1-4):** DECIDED — the §2.12 contract (scope axis,
  context binding, `org_context_missing`/`org_membership_required`/`ambiguous_runs`
  taxonomy, NULL-is-never-a-wildcard, five-dimension run selection). Owner-decided;
  recorded 2026-10-26.
- **P2 hardening (red-team P2-1..P2-5):** DECIDED — §2.13 (server-stamped
  `completed_at`, expired-delegation revalidation without corpse-block, the
  `now()`/`clock_timestamp()` rule, deterministic tie-breaker + ambiguity rejection,
  `ProtectedRoute` fail-closed). Owner-decided; recorded 2026-10-26.
- **P4 (partial):** the **context-binding** half of P4 is DECIDED by §2.12 — readiness
  is certified for one principal **in one organizational context**, per the
  five-dimension selection, and a delegated-actor authorization never silently becomes
  the subject's personal or organizational authorization. The remaining half — which
  principal the gate certifies **for each delegated wizard** (subject-always vs
  policy-per-step, §2.8/§2.9) — is still PENDING below.

### 6.1 Owner decisions on the delegation model (recorded 2026-10-26)

The owner resolved P2, P3 and the certified-principal half of P4 for the delegation
model encoded by `20261026150000_onboarding_actor_subject_delegation.sql`. These are
**normative content decisions** for the `onboarding_journey_definitions` /
`subject_step_keys` config the migrations encode — they are recorded here and MUST be
reflected in the deployed normative config (see §6.2 for the config-gap reconciliation).

- **P2 (delegation policy / mode) — DECIDED: `onboarding.tenant` is `self_service`.**
  actor==subject is enforced server-side for this wizard; **no delegation is
  permitted** for it. Its delegation policy is therefore empty (no delegator/delegate
  pairs, no delegable steps). This is the most restrictive assignment and matches the
  current zero-delegation reality: today no wizard is `delegated`. Any future wizard
  that requires delegation is a **new** decision (its own P2 entry), not an inference
  from this one. Rationale: the only deployed wizard is tenant provisioning, which is
  inherently a self-service act by the person establishing their own tenant.
- **P3 (sensitive-declaration set) — DECIDED for `onboarding.tenant`: the
  `identity` and `organization` steps are sensitive declarations** (legal-identity /
  CPF-CNPJ attestation and the legal-representation declaration, respectively) that
  MUST be completed by the subject personally — `subject_step_keys =
{identity, organization}`. They are never delegate-satisfiable. The `workspace`
  step is not a sensitive declaration. (Under P2's `self_service` mode ALL steps are
  subject-only anyway; this P3 set governs the completion rules should any future
  `delegated` wizard reuse these step types, and it is the normative content of the
  `subject_step_keys` mechanism.)
- **P4 (certified principal) — DECIDED: `policy-per-step`.** The readiness gate
  certifies the principal named by each step's completion rules (§2.8/§2.10): a
  subject-only step certifies the **subject**; a delegable step certifies the
  principal the policy authorized **for that step**. The gate never certifies a
  principal whom the step's own rules did not authorize. This supersedes the
  "subject-always" alternative and completes the P4 item (the context-binding half
  was already decided by §2.12).

- **Readiness scope — DECIDED 2026-10-31: `onboarding.tenant` is `personal`.**
  This self-service journey creates the first organization/workspace context, so
  readiness must be resolvable before the subject has an active organization
  membership. Migration `20261026190000_readiness_org_scoping.sql` sets this
  explicit per-wizard value; the default remains `organizational` for every
  other wizard. Personal scope does not grant membership, role, or entitlement;
  those remain independently checked by provisioning, RLS, and route policy.

### 6.2 Config-gap reconciliation (normative config MUST match §6.1)

The `onboarding.tenant` v1.0.0 seed in `20261026170000_readiness_blocked_decision.sql`
predates §6.1: it sets `required_step_keys = {identity, organization, workspace}` but
**no `mode` and no `subject_step_keys` content**. The migration's own defaults apply
on apply: `mode` (added by `20261026150000`, default `self_service`) yields P2's
decision correctly, and `subject_step_keys` (added by `20261026180000`, default `{}`)
yields **no** sensitive declarations — which does NOT match P3 (`{identity,
organization}`). **Reconciliation (additive, owner-authorized at apply time):** the
deployed definition MUST be brought to `mode='self_service'` (the default — no change
needed) **and `subject_step_keys = {identity, organization}`** (a forward-only UPDATE
to the seeded definition, e.g. appended to `20261026180000` or a small additive
migration). Until that config is written, P3 is **decided-but-not-encoded** and the
`subject_step_keys` guard for `onboarding.tenant` is vacuous. This is flagged for the
Stage-2 apply/verification step, not silently assumed.

| #   | Decision                                                                                                                                                                                        | Status / scope                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Which wizards are `delegated` vs `self_service`** — the per-wizard mode assignment. (Scope assignment `personal`/`organizational` is decided in §2.12, fail-closed `organizational` default.) | **PARTIALLY DECIDED:** `onboarding.tenant` = `self_service` (§6.1, P2). Other/future wizards remain PENDING per-wizard.                                                                                                                 |
| P2  | **The delegation policy content** — who may act for whom, which steps are delegable, evidence, denial rules (§2.8).                                                                             | **DECIDED for `onboarding.tenant`** (§6.1): `self_service`, no delegation (empty policy). Future `delegated` wizards need their own P2 entry — PENDING per-wizard.                                                                      |
| P3  | **Which steps are "sensitive declarations"** per wizard.                                                                                                                                        | **DECIDED for `onboarding.tenant`** (§6.1): `subject_step_keys = {identity, organization}`; encoded in `20261026180000` (§6.2). Future wizards PENDING.                                                                                 |
| P4  | **Which principal the readiness gate certifies for each delegated wizard** (subject-always vs policy-per-step).                                                                                 | **DECIDED (§6.1): policy-per-step** (context-binding half already by §2.12).                                                                                                                                                            |
| P5  | **`trusted_verifier` set** — which backend verifiers may complete steps without being the subject, and under what rules.                                                                        | **PENDING** — no `trusted_verifier` step exists yet; decision deferred until one is introduced.                                                                                                                                         |
| P6  | **Backfill confirmation** — pre-existing runs as `self_service`; seed-org classification; scope backfill for personal-scope journeys.                                                           | **PARTIALLY DECIDED:** `onboarding.tenant` scope is `personal` (2026-10-31) and is encoded in `20261026190000`; inspect existing rows before applying if remote journey tables/data ever exist. Other journey backfills remain pending. |

No PENDING item is resolved by inference from code, reports, or the permissive behavior of
the currently-applied migration. Each requires an explicit, recorded decision. Items marked
"decided" above were decided explicitly by the product owner and are recorded in the cited
sections; they are listed only to keep the ledger complete.
