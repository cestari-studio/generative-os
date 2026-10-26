<!--
  Copyright IBM Corp. 2026
  This source code is licensed under the Apache-2.0 license found in the
  LICENSE file in the root directory of this source tree.
-->

# ADR 0001 — Tenancy model & journey persistence

> **Status:** DRAFT for owner review (no migration applied; forward-only/additive only,
> validated on disposable PostgreSQL 17.11 before any remote request).
> Relates: `fase0-preflight-report.md`, `fase-minus1-spec-control-plane-plan.md`, Fase A/B.

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

## 3. Consequences

- Requires owner-authorized additive migrations (tenancy columns, run/step ledger, possibly RPC grant
  tightening for the three `anon`-executable INVOKER RPCs). **None applied here.**
- PII in `additional_property.onboarding` must be minimized/redacted/TTL'd; canonical records hold
  legal data; no PII in logs/analytics/CI artifacts.
- Readiness/provisioning authority is server-side; the browser presents the flow and sends answers.

## 4. Migration plan (draft — see `supabase/migrations/` draft when authorized to draft locally)

1. `tenancy_columns`: add `tenant_kind`, `authority_level` enums + columns + parent validation trigger.
2. `journey_ledger`: `onboarding_runs` + `onboarding_step_states` + RLS + indexes + TTL function +
   `resolve_onboarding_readiness` RPC (SECURITY INVOKER, `auth.uid()` checked in body).
3. Backfill `tenant_kind`/`authority_level` for existing orgs (default `client`/`tenant`; the seed
   `generative-os-enterprise` org → `client`/`tenant` until owner reclassifies).
4. Data migration: `additional_property.onboarding` → ledger (idempotent, forward-compatible).
