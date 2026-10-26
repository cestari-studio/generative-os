# Provisioning Commands Contract (Master Directive §10)

> **Status:** NORMATIVE (contract/spec work only — no RPC bodies, no migrations, no remote state changes).
> **Scope:** Defines the explicit, separate business commands for secure tenancy provisioning per Master Directive §10.1–§10.4.
> **Replaces:** the single generic upsert (`create_or_update_corporate_tenant`), which conflated create/update/takeover semantics (Defects A + B, migration 20261026140000 header).
> **Maturity legend:** `DEFINED` = operation spec exists and references a real endpoint · `NORMATIVE_ONLY` = contract defined here, endpoint/gap named, not yet implemented — **do not invent**.

---

## 0. Global invariants (all commands)

These hold for every command in this document. They are non-negotiable.

1. **The browser never sets authoritative values** (AGENTS.md rule 3). The client may supply _descriptive_ data (names, slugs, message text). The server must derive or validate: `id`, `authority_level`, `owner`, `membership`, `identifier` uniqueness, parent linkage, quotas, entitlements, and every role.
2. **Authorization = authenticated identity + membership + policy/entitlement** (AGENTS.md rule 4). Never `user_metadata` as authority; never per-request email comparison; roles resolve via `organization_members` / `platform_role_assignments` + RLS/PBAC, server-side.
3. **A conflict on `identifier` is never proof of ownership** (§10.3). Identity of the requester and permissioning are criteria _separate_ from identifier uniqueness.
4. **No partial success visible as ready** (§10.4). Any failure leaves no organization/membership/context/audit row that appears complete to the user. A recoverable pending state, if returned, is _distinct_ from full success.
5. **Atomicity.** Each command is one logical operation: all its required resources are created and linked in one transaction, or none are. External non-transactional effects (e.g. sending email) follow an explicit recovery pattern; no parallel infrastructure (outbox) without a demonstrated requirement (§10.2).
6. **Negative authorization tests are part of the contract**, declared per command below and in the operation specs (`specs/operations/`), and executed as `authenticated` with RLS enforced on disposable databases before any implementation lands.

### Explicit NON-goals (§10.1–§10.3, binding)

- ❌ **Never infer authority from email address, `account_type`, a client-supplied identifier, or the act of org creation.** Creation grants `org_owner` _only_ because the server assigns it on a fresh create — never because the client asked for it.
- ❌ **Never promote a caller to `org_owner` on conflict.** On an identifier conflict the caller's existing role is _read_, never written. (This was Defect B.)
- ❌ **Never let the browser choose its own role or authority level.** No `role_name`, `authority_level`, `is_default`, `member_id`, `owner_id`, or `legal_representative_id` is accepted from the client.
- ❌ **Never treat one generic function as several business commands.** Create/update/invite/join/request-access/unit/sandbox/agency have _different authority semantics_ and stay separate (§10.1).
- ❌ **Never use a client-supplied user id** for any membership/ownership FK — always `auth.uid()` re-checked in the body.
- ❌ **Never expose success-audit rows for denied effects** (§10.3): denied attempts produce no partial records, no membership, no context switch, no success audit.

---

## 1. Command: `create-tenant` — DEFINED (real endpoint)

|                      |                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operation spec**   | `specs/operations/provisioning.create-tenant.json` (`operation.provisioning.create-tenant`)                                                                                                               |
| **Policy spec**      | `specs/policies/provisioning.create-tenant.json` (`policy.provisioning.create-tenant`)                                                                                                                    |
| **Endpoint**         | `rpc provision_corporate_tenant` (migration `20261026140000_provision_corporate_tenant_safe.sql`) — **real**                                                                                              |
| **Auth**             | `authenticated` (EXECUTE granted to `authenticated` only; revoked from `PUBLIC`/`anon`)                                                                                                                   |
| **Tenant context**   | none — creates the caller's first corporate tenant context                                                                                                                                                |
| **Idempotency**      | `natural` on `identifier` (unique slug): a replay with the caller's own existing identifier performs an idempotent **read-back** (returns `provisioned:false, already_existed:true`) with **no mutation** |
| **Normative source** | `catalog_operations.tenant-provision-request` ("Provisionar Master, Agency, Tenant ou Workspace por tipo e template aprovado")                                                                            |

### Preconditions

- **Auth:** `auth.uid()` IS NOT NULL (re-checked inside the SECURITY DEFINER body).
- **Actor permission:** any authenticated user may create a _fresh_ tenant. On identifier conflict, the caller must **already** be `org_owner` or `org_admin` of the conflicting org — otherwise `42501` takeover denial.
- **Parent authority:** none (root organization; `parent_organization_id` stays NULL for this command).
- **Product/entitlement:** none required at this tier (org is created `plan_tier='free'`, `status='active'`). Entitlement-gated templates are out of scope for this command.
- **Limits/policy:** `p_name` non-empty; `p_identifier` must match `^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$`.

### Client MAY supply

`name`, `identifier` (proposed slug — uniqueness validated server-side), `legal_name`, `tax_id`, `country_code`, `size_category`, `revenue_range`, `registration_number`, `industry_code`, `address` (jsonb), `in_language`, `workspace_name`, `project_name`.

### Server MUST derive/validate

`organization_id`, `workspace_id`, `project_id` (all generated), `legal_representative_id = auth.uid()`, owner membership (`role_name='org_owner'` on fresh create only), `workspace_admin` / `project_owner` memberships, `identifier` uniqueness + conflict authorization, `works_for_id` / `active_organization_id` / `active_workspace_id` / `active_project_id` on `persons`, `status`, `plan_tier`.

### Transactional shape

One function = one transaction: `organizations` INSERT → `organization_members` (org_owner) → `workspaces` (core) → `workspace_members` (workspace_admin) → `projects` (main) → `project_members` (project_owner) → `persons` UPDATE (active context). Any failure rolls back all. Conflict path: **read-back only** — no INSERT, no UPDATE of org data, no role write.

### Error/failure map

| Class                                          | Carbon state  |
| ---------------------------------------------- | ------------- |
| 401 / 42501 (anon, takeover denial)            | `forbidden`   |
| 22023 (invalid name/slug)                      | `failed`      |
| 23505 (unique race between check and insert)   | `failed`      |
| 5xx / timeout                                  | `unavailable` |
| conflict + caller is admin (read-back success) | `ready`       |

### Declared negative authorization tests

`planned:provision_corporate_tenant.anon-denial` · `planned:provision_corporate_tenant.takeover-denial-cross-tenant` (User B replays User A's identifier → 42501, zero mutation) · `planned:provision_corporate_tenant.conflict-no-promotion` (B never gains `org_owner` on conflict; org data, legal rep unchanged) · `planned:provision_corporate_tenant.fresh-create-grants-owner` · `planned:provision_corporate_tenant.idempotent-read-back`.

The §10.3 abuse matrix is covered: re-create with A's identifier ❌ · overwrite legal data ❌ · change legal representative ❌ · self-promote to `org_owner` ❌ · switch active context without membership ❌ (context is only ever set on fresh create).

---

## 2. Command: `invite` — NORMATIVE_ONLY

|                      |                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy spec**      | `specs/policies/provisioning.invite.json` (`policy.provisioning.invite`)                                                                                                                                                                                                                                                                                |
| **Planned endpoint** | `edge_function tenant-membership-invite` — **does not exist**                                                                                                                                                                                                                                                                                           |
| **Gap**              | No invitation table (token hash, expiry, intent), no edge function, no notification intent wiring. Normative basis exists: `catalog_operations.tenant-membership-invite` ("Criar convite idempotente, role inicial, expiração e intenção de notificação", access `authenticated`) + `catalog_features.platform.identity_tenancy.membership_invitation`. |
| **Auth**             | `authenticated` + membership in target org                                                                                                                                                                                                                                                                                                              |
| **Tenant context**   | organization (caller must hold `org_owner` or `org_admin` in the target organization)                                                                                                                                                                                                                                                                   |
| **Idempotency**      | `key` — client-supplied `idempotency_key` scoped to (inviter, target org)                                                                                                                                                                                                                                                                               |

### Preconditions

- **Auth:** authenticated.
- **Actor permission:** `org_owner` or `org_admin` of the target org (server-resolved via `organization_members`).
- **Parent authority:** n/a.
- **Product/entitlement:** target org active.
- **Limits/policy:** invited role must be **strictly below or equal to** the inviter's authority and must be one of the invitable set: `org_member`, `workspace_admin`, `workspace_member`, `project_owner`, `project_editor`, `project_member`. **Inviting a new `org_owner`/`org_admin` is out of scope for this command** (ownership transfer is a separate, step-up-gated command, not part of §10).

### Client MAY supply

invitee email (delivery address — **never** an authorization input), invited role (from the invitable set), optional message, `idempotency_key`.

### Server MUST derive/validate

invitation `id`, target org resolution, inviter authority, role-escalation check, token (random, stored **hashed**), expiry, duplicate-membership check, notification intent.

### Transactional shape

One transaction: invitation row (hashed token, role, expiry, inviter, org) + notification intent. Email send is an external non-transactional effect — recovery pattern: the invitation row is the source of truth; send failure leaves the invitation retrievable/resendable, never deletes it.

### Error/failure map

401/403/42501/rls_denied/inviter_lacks_authority/role_escalation_attempt → `forbidden` · 22023/23505/invitee_already_member → `failed` · 5xx/timeout → `unavailable`.

### Declared negative tests

`planned:tenant-membership-invite.anon-denial` · `.non-admin-denial` (org_member cannot invite) · `.cross-tenant-denial` (admin of org A cannot invite into org B) · `.role-escalation-denial` (org_admin cannot invite an org_owner) · `.idempotent-replay`.

---

## 3. Command: `join` (accept invitation) — NORMATIVE_ONLY

|                      |                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy spec**      | `specs/policies/provisioning.join.json` (`policy.provisioning.join`)                                                                                                                                                                                                         |
| **Planned endpoint** | `edge_function tenant-membership-accept` — **does not exist**                                                                                                                                                                                                                |
| **Gap**              | Same missing invitation infrastructure as `invite`. Normative basis: `catalog_operations.tenant-membership-accept` ("Aceitar convite após validação de token, identidade e estado", access `public` — resolved server-side via token, never via client-supplied membership). |
| **Auth**             | `authenticated` (the accepting session); the invitation token is validated server-side                                                                                                                                                                                       |
| **Tenant context**   | organization **derived from the invitation token**, never from the client                                                                                                                                                                                                    |
| **Idempotency**      | `natural` on `invitation_token` — single-use; replay after consumption → `token_consumed`                                                                                                                                                                                    |

### Preconditions

- **Auth:** authenticated session whose identity matches the invitation's intended subject (server-side check; normative "public" access class means the _endpoint_ is reachable without prior membership, not that it is anonymous-authoritative).
- **Actor permission:** holder of a valid, unexpired, unconsumed invitation token.
- **Parent authority:** n/a.
- **Product/entitlement:** target org active.
- **Limits/policy:** invitee must not already be a member of the target org.

### Client MAY supply

the invitation token (opaque), display-name confirmation.

### Server MUST derive/validate

token validity (hash match, expiry, consumption state), identity match, target org, role (**from the invitation row, never the client**), membership `id`, default-context wiring, token consumption (single-use), audit.

### Transactional shape

One transaction: validate + consume token → `organization_members` INSERT (role from invitation) → optional default-workspace/project memberships → person context UPDATE (only if the person has no active org) → audit. Token consumption and membership insert are atomic — a failure after token consumption without membership is impossible.

### Error/failure map

401/403/42501/token_invalid/identity_mismatch → `forbidden` · token_expired/token_consumed/already_member → `failed` · 5xx/timeout → `unavailable`.

### Declared negative tests

`planned:tenant-membership-accept.anon-denial` · `.invalid-token-denial` · `.expired-token-denial` · `.cross-tenant-denial` (token for org A cannot create membership in org B) · `.replay-consumed-token-denial`.

---

## 4. Command: `request-access` — NORMATIVE_ONLY

|                      |                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy spec**      | `specs/policies/provisioning.request-access.json` (`policy.provisioning.request-access`)                                                                                                                                                                                                                                                                                                                                      |
| **Planned endpoint** | `edge_function tenant-access-request` — **does not exist**                                                                                                                                                                                                                                                                                                                                                                    |
| **Gap**              | No access-request table/workflow exists, and — unlike invite/join — **no normative operation exists in the catalog either** (the normative membership lifecycle is inviter-driven: `tenant-membership-invite`/`accept`/`revoke`). `request-access` is required by Master Directive §10.1 ("Solicitar acesso"), so the contract is defined here, but its adoption also requires a normative-catalog addition (owner decision). |
| **Auth**             | `authenticated`                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Tenant context**   | organization (the target the caller requests access to)                                                                                                                                                                                                                                                                                                                                                                       |
| **Idempotency**      | `key` — `idempotency_key` scoped to (requester, target org); duplicate pending request → `already_pending`                                                                                                                                                                                                                                                                                                                    |

### Preconditions

- **Auth:** authenticated.
- **Actor permission:** any authenticated user **without** membership in the target org.
- **Parent authority:** n/a.
- **Product/entitlement:** target org active and discoverable (discovery policy itself is out of scope here).
- **Limits/policy:** no existing membership; no existing pending request by the same requester.

### Client MAY supply

target org identifier, optional justification message, `idempotency_key`.

### Server MUST derive/validate

request `id`, requester identity (`auth.uid()`), target org resolution, membership/pending-request checks, initial role on approval (**granted by an approving admin at approval time — the request carries NO role**), notification to org admins, audit.

### Transactional shape

One transaction: access-request row (requester, org, message, status `pending`). Approval/denial are **separate commands** executed by an org admin (approval maps onto `invite` semantics with the request as intent evidence).

### Error/failure map

401/403/42501 → `forbidden` · already_member/already_pending/org_not_found → `failed` · 5xx/timeout → `unavailable`.

### Declared negative tests

`planned:tenant-access-request.anon-denial` · `.cross-tenant-denial` (a member of org A cannot use request-access to fabricate membership anywhere) · `.already-member-denial` · `.idempotent-replay`.

---

## 5. Command: `create-unit` — NORMATIVE_ONLY

|                |                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Endpoint**   | none — **does not exist**                                                                                                                                                                                                                                                                                                                                                                  |
| **Gap**        | **No normative basis.** The operation catalog (100 ops) and feature registry (225 features) contain no "unit" concept; the org-hierarchy model (`organizations.parent_organization_id`, `create_organization_hierarchy`) has no unit tier; no endpoint exists. Per the task rule, this command is **not invented** — it is registered here as a §10.1-required command with its gap named. |
| **Spec files** | none (a spec without a normative or runtime anchor would fabricate the contract)                                                                                                                                                                                                                                                                                                           |

**If adopted (owner decision required):** a unit would be a child organization created under an authorized parent — preconditions would mirror `create-agency` (parent `org_owner`, template allows the child type, entitlement capability), with the server deriving `parent_organization_id` authority and forbidding hierarchy cycles (§10.4 "ciclo hierárquico"). Until the normative model defines the unit tier, no operation/policy spec is written.

---

## 6. Command: `create-sandbox` — NORMATIVE_ONLY

|                |                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Endpoint**   | none — **does not exist**                                                                                                                                                                                                                                                                   |
| **Gap**        | **No normative basis.** No sandbox operation/feature in the normative registries; no runtime concept (the `workspaces.environment_type` column exists — `provision_corporate_tenant` seeds `'production'` — but no sandbox provisioning command or entitlement model exists). Not invented. |
| **Spec files** | none                                                                                                                                                                                                                                                                                        |

**If adopted (owner decision required):** a sandbox would most plausibly be a `workspaces.environment_type='sandbox'` creation command gated by the caller's `org_owner`/`workspace_admin` role in the parent org and by an entitlement capability, with quota/limits server-derived. Until the normative model defines sandbox semantics (isolation, expiry, quotas), no operation/policy spec is written.

---

## 7. Command: `create-agency` (delegated-authority organization) — NORMATIVE_ONLY

|                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy spec**      | `specs/policies/provisioning.create-agency.json` (`policy.provisioning.create-agency`)                                                                                                                                                                                                                                                                                                                                                                    |
| **Planned endpoint** | typed variant of the provisioning path (normative `tenant-provision-request`: "Master, **Agency**, Tenant ou Workspace **por tipo e template aprovado**") — **no runtime endpoint exists** (`provision_corporate_tenant` creates root orgs only; it does not accept a parent or template type)                                                                                                                                                            |
| **Gap**              | No parent-delegation endpoint: `provision_corporate_tenant` never sets `parent_organization_id`; no template/entitlement capability check for delegated provisioning exists; the agency/member-delegation surface (cf. `onboarding_delegations`, which is run-scoped onboarding only) does not cover org-level delegated authority. Normative basis exists (the operation above), so a policy spec is defined; the operation spec waits for the endpoint. |
| **Auth**             | `authenticated` + `org_owner` of the **parent** tenant                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Tenant context**   | organization (parent) — the new agency is a **child** organization                                                                                                                                                                                                                                                                                                                                                                                        |
| **Idempotency**      | `natural` on (parent, child `identifier`)                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Preconditions

- **Auth:** authenticated.
- **Actor permission:** `org_owner` of the parent organization (server-resolved).
- **Parent authority:** parent org's approved template must allow an `agency` child type (`parent_tenant.template_allows('agency')` — server-side).
- **Product/entitlement:** parent must hold the `delegated_provisioning` capability (entitlement snapshot, server-resolved).
- **Limits/policy:** child `identifier` slug valid + unique; **hierarchy cycle check** (the new child can never be an ancestor of its parent); parent's depth/children limits per entitlement.

### Client MAY supply

child `name`, proposed child `identifier`, descriptive/legal fields (same set as `create-tenant`).

### Server MUST derive/validate

`parent_organization_id` (from the authorized parent — **never** client-supplied), delegated authority level of the child (capped below the parent's), owner membership of the caller in the child org, entitlement capability check, cycle check, quota consumption, audit.

### Transactional shape

Mirrors `create-tenant` (org → owner membership → core workspace → admin membership → main project → owner membership → context) **plus** parent linkage, entitlement capability validation, and cycle check in the same transaction. No partial child org may survive a failed capability or cycle check.

### Error/failure map

401/403/42501/not-parent-owner/template_disallowed/capability_missing/cycle_detected → `forbidden` · 22023/23505/quota_exceeded → `failed` · 5xx/timeout → `unavailable`.

### Declared negative tests

`planned:provision-agency.non-owner-denial` · `planned:provision-agency.cross-tenant-parent-denial` (owner of org A cannot attach a child to org B) · `planned:provision-agency.capability-missing-denial` · `planned:provision-agency.cycle-denial` · `planned:provision-agency.authority-cap` (child authority can never exceed parent's).

---

## 8. Summary matrix

| Command          | Normative basis                                              | Runtime endpoint                             | Operation spec                            | Policy spec | Status                                                 |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------ |
| `create-tenant`  | `tenant-provision-request`                                   | `rpc provision_corporate_tenant` ✅          | ✅ `operation.provisioning.create-tenant` | ✅          | **DEFINED**                                            |
| `invite`         | `tenant-membership-invite` + `membership_invitation` feature | ❌ (planned `edge tenant-membership-invite`) | — (gap: no endpoint)                      | ✅          | **NORMATIVE_ONLY**                                     |
| `join`           | `tenant-membership-accept` + same feature                    | ❌ (planned `edge tenant-membership-accept`) | — (gap: no endpoint)                      | ✅          | **NORMATIVE_ONLY**                                     |
| `request-access` | ❌ none (Directive §10.1 only — catalog addition needed)     | ❌ (planned `edge tenant-access-request`)    | — (gap: no endpoint, no catalog op)       | ✅          | **NORMATIVE_ONLY**                                     |
| `create-unit`    | ❌ none                                                      | ❌ none                                      | —                                         | —           | **NORMATIVE_ONLY** (no normative basis — not invented) |
| `create-sandbox` | ❌ none                                                      | ❌ none                                      | —                                         | —           | **NORMATIVE_ONLY** (no normative basis — not invented) |
| `create-agency`  | `tenant-provision-request` (typed: Agency)                   | ❌ (typed variant of provisioning path)      | — (gap: no endpoint)                      | ✅          | **NORMATIVE_ONLY**                                     |

## 9. Relationship to existing runtime

- `provision_corporate_tenant` (migration 20261026140000): the `create-tenant` endpoint. SECURITY DEFINER (justified in the migration header per AGENTS.md rule 5), takeover-safe conflict read-back.
- `create_or_update_corporate_tenant`: legacy generic upsert with Defects A + B. Deprecation/removal is a separate owner decision — this contract does not alter it.
- `create_organization_hierarchy` (20261024000000): the 6-table bootstrap precedent for the SECURITY DEFINER pattern; `create-tenant` supersedes its use for tenant creation.
- `onboarding_delegations` (20261026150000): run-scoped actor/subject delegation for onboarding steps. Related in spirit (delegated authority) but **not** an org-provisioning mechanism; agency-level delegation will need its own model.
- `tenant-context-switch` (normative) / `switch_active_context` (runtime RPC): context switching stays a separate command — no provisioning command switches context except on fresh `create-tenant`.

## 10. G1 validation state

`node scripts/spec-validate.mjs` (plan mode): **0 BLOCKED** from the specs introduced by this contract; the only NEEDS_REVIEW findings are pre-existing (`field.person.tax-id` V4 binding; `operation.onboarding.save-progress` V3b anon EXECUTE — both tracked outside this work). See §8 for which commands carry spec files.

_Implementation of any NORMATIVE_ONLY command requires owner review of this contract, then endpoint + migration work under the standard verification workflow (AGENTS.md "Verification workflow")._
