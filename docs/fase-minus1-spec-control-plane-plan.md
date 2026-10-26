<!--
  Copyright IBM Corp. 2026
  This source code is licensed under the Apache-2.0 license found in the
  LICENSE file in the root directory of this source tree.
-->

# Fase −1 — Spec Control Plane: architecture (ADR) + initial schemas + PoC plan

> **Status:** PLANNING ONLY (owner-authorized planning; **implementation blocked** until
> this design is approved). **No** code, generator, validator, migration, or CI change is
> implemented by this document. Baseline: `docs/fase0-preflight-report.md` @ SHA `a919bc0`.
> Target repo `cestari-studio/generative-os`; normative `cestari-studio/genOS` read-only.

---

## 1. ADR — Spec Control Plane

### 1.1 Status

Proposed (for owner review). Supersedes: none. Relates: `fase0-preflight-report.md`,
`phase1-configuration-contract.md`, `phase2-review-package.md`.

### 1.2 Context

Fase 0 confirmed: the only journey with a UI (`onboarding.*`) has **no** server run/step ledger;
bindings/surfaces/settings-map are **NORMATIVE_ONLY** (all 0 rows); four wizard/provisioning failure
states (FS1–FS4) exist; and prior work repeatedly shipped claims that did not match artifacts
(wrong Carbon version, conflated wizards, error-collapsed helpers). The root cause is structural:
**there is no single, machine-checked contract linking intent → code → tests → DB → evidence.**
Today the "contract" lives in prose docs and the agent's memory, both of which drift.

Existing deterministic assets to **reuse, not duplicate** (Fase 0 §1.4, `package.json`):

- `scripts/validate-matrices.mjs` (`npm run check:matrices`) — ontology/route matrix gate.
- `scripts/carbon-pattern-conformance.mjs` (`npm run check:carbon-patterns`) — Carbon conformance gate.
- `scripts/generate-registry-allowlist-sql.mjs --check` (`npm run registry:check`) — registry drift gate.
- `ajv@6.15.0` is installed (JSON Schema draft-06/07 class validator).
- Phase 2 tables `surface_definitions`, `surface_revisions`, `operation_bindings`,
  `setting_normative_map(_terms)`, `message_registry`, `registry_allowlist` (all empty) — the DB home for **published, validated** spec outputs (Camada B), already gated by a fail-closed publication validator.

### 1.3 Decision

Adopt a **Spec Control Plane**: versioned JSON-Schema specifications are the _single source of truth_
for journeys, steps, fields, operations, policies, surfaces, and evidence. A **deterministic
validator** checks specs against each other and against the live baseline. A **generator** produces
task envelopes + derived artifacts. A **CI gate** blocks code changes whose specs are invalid.
**The spec layer is code-owned first** (in-repo), and is published to the existing Phase 2 tables
**only** after contracts are tested and owner-authorized — never a second source of truth, and
**never** activating `NORMATIVE_ONLY` rows as if implemented.

### 1.4 Principles (non-negotiable)

1. **Spec defines what must exist; generators produce the repetitive; code implements behavior;
   tests prove it; approvals gate publishing.** AI interprets/implements/debugs; deterministic tools verify.
2. **No second source of truth.** The repo holds the canonical specs. The DB holds only _published,
   validated, hashed_ snapshots of them (Camada B), linked by `spec_key`, `spec_version`, `spec_hash`,
   `generator_version`, `commit_sha`, `workflow_run_id`, `approval`, `status`.
3. **Fail-closed honesty.** A spec referencing a missing field/operation/role/component/binding is
   **invalid** → `BLOCKED`/`NEEDS_REVIEW`, never `VERIFIED`. `NORMATIVE_ONLY` stays `NORMATIVE_ONLY`
   until a real, tested binding exists.
4. **Code never executes arbitrary DB content.** The DB stores declarative config (keys, versions,
   hashes, predicates) — never JSX/JS/SQL/URLs that become an execution channel (matches the existing
   Phase 2 publication validator).
5. **Remote mutations stay gated.** Publishing specs to the DB, any migration, deploy, merge,
   promote, or config/grant/RLS/Auth/domain change requires explicit owner authorization.

### 1.5 Architecture (proposed layout — **not yet created**)

```
specs/
  schemas/            # versioned JSON Schemas (draft-07)
    journey.schema.json      step.schema.json    field.schema.json
    operation.schema.json    policy.schema.json  surface.schema.json
    evidence.schema.json     envelope.schema.json
  journeys/           # journey specs (YAML) — e.g. onboarding.person.yaml
  steps/  fields/  operations/  policies/  surfaces/  registries/
scripts/
  spec-validate.mjs        # G1: schema + cross-ref + baseline-compat validator
  spec-generate.mjs        # envelope + artifact generator (deterministic)
  spec-check-generated.mjs # CI: generated artifacts are up-to-date (no drift)
  evidence-record.mjs      # appends a run to the evidence ledger
generated/            # derived artifacts (regenerated; never hand-edited)
  types/  form-definitions/  traceability/  docs/  tests/  envelopes/
artifacts/evidence/   # per-SHA evidence ledger entries (json)
```

`specs/`, `generated/`, `artifacts/evidence/` are **new** and do not exist yet; this plan does not create them.

### 1.6 Consequences

- **Positive:** intent↔code↔test↔DB↔evidence become machine-checkable; the recurring
  claim-vs-artifact drift class is eliminated structurally; CI can block invalid specs before code.
- **Cost:** upfront schema + validator + generator work; a learning curve for spec authorship.
- **Boundaries:** the PoC (§4) is read/plan-only against the app — it must not change app behavior,
  touch the DB, or auto-generate migrations. Binding/surface rows remain `NORMATIVE_ONLY`.

---

## 2. Initial JSON Schemas (design — to be validated on implementation)

These are the **minimal** schemas for the PoC scope (journey, step, field, operation, policy,
surface, evidence, envelope). Draft-07, `additionalProperties:false`, every object carries
`spec_key`, `spec_version`, `spec_hash` (sha256 of canonical content, computed at validate time).

### 2.1 `journey.schema.json`

```json
{
  "$id": "https://genos.cestari.studio/specs/journey.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["spec_key", "spec_version", "journey_key", "title", "steps", "readiness"],
  "properties": {
    "spec_key": { "type": "string", "pattern": "^journey\\.[a-z0-9_.-]+$" },
    "spec_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "spec_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "journey_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
    "title": { "type": "string", "minLength": 1 },
    "audience": {
      "type": "array",
      "items": { "enum": ["person_pf", "person_pj", "member", "tenant_admin", "agency_admin", "master"] }
    },
    "steps": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["step_key", "ref"],
        "properties": {
          "step_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
          "ref": { "type": "string", "pattern": "^step\\.[a-z0-9_.-]+$" },
          "required_for_dashboard": { "type": "boolean", "default": false },
          "include_when": { "type": "string", "description": "predicate ref (policy.*) gating conditional steps" }
        }
      }
    },
    "readiness": {
      "type": "object",
      "additionalProperties": false,
      "required": ["decision_values"],
      "properties": {
        "decision_values": {
          "type": "array",
          "items": { "enum": ["allow", "require_steps", "blocked", "unavailable"] }
        },
        "required_steps": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### 2.2 `step.schema.json`

```json
{
  "$id": "https://genos.cestari.studio/specs/step.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["spec_key", "spec_version", "step_key", "title", "fields", "completion"],
  "properties": {
    "spec_key": { "type": "string", "pattern": "^step\\.[a-z0-9_.-]+$" },
    "spec_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "spec_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "step_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
    "title": { "type": "string", "minLength": 1 },
    "surface_ref": { "type": "string", "pattern": "^surface\\.[a-z0-9_.-]+$" },
    "fields": { "type": "array", "items": { "type": "string", "pattern": "^field\\.[a-z0-9_.-]+$" } },
    "persist": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation_ref": { "type": "string", "pattern": "^operation\\.[a-z0-9_.-]+$" },
        "entity": { "type": "string", "description": "canonical entity/table key" },
        "payload_allowlist": { "type": "array", "items": { "type": "string" } },
        "redact": {
          "type": "array",
          "items": { "type": "string" },
          "description": "PII keys never stored in the generic payload"
        },
        "ttl_seconds": { "type": "integer", "minimum": 0 }
      }
    },
    "completion": {
      "type": "object",
      "additionalProperties": false,
      "required": ["predicate_ref"],
      "properties": {
        "predicate_ref": { "type": "string", "pattern": "^policy\\.[a-z0-9_.-]+$" },
        "server_authoritative": { "type": "boolean", "const": true }
      }
    },
    "transitions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["to"],
        "properties": { "to": { "type": "string" }, "when": { "type": "string" } }
      }
    }
  }
}
```

### 2.3 `field.schema.json`

```json
{
  "$id": "https://genos.cestari.studio/specs/field.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["spec_key", "spec_version", "field_key", "data", "ui", "rules", "privacy"],
  "properties": {
    "spec_key": { "type": "string", "pattern": "^field\\.[a-z0-9_.-]+$" },
    "spec_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "spec_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "field_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": ["entity", "type"],
      "properties": {
        "entity": { "type": "string" },
        "path": { "type": "string", "description": "column or canonical data path" },
        "type": { "enum": ["string", "text", "boolean", "integer", "date", "enum", "jsonb"] },
        "binding": { "type": "string", "description": "verified_binding_required until resolved against live schema" }
      }
    },
    "ui": {
      "type": "object",
      "additionalProperties": false,
      "required": ["component", "label_key"],
      "properties": {
        "component": {
          "enum": ["TextInput", "PasswordInput", "Select", "Checkbox", "ContentSwitcher", "DatePicker", "TextArea"]
        },
        "label_key": { "type": "string" },
        "help_key": { "type": "string" }
      }
    },
    "rules": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "required_when": { "type": "string" },
        "visible_when": { "type": "string" },
        "read_only_when": { "type": "string" },
        "validation": { "type": "string" }
      }
    },
    "privacy": {
      "type": "object",
      "additionalProperties": false,
      "required": ["classification", "purpose"],
      "properties": {
        "classification": { "enum": ["public", "internal", "confidential", "restricted"] },
        "purpose": { "type": "string" }
      }
    },
    "tests": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 2.4 `operation.schema.json`

```json
{
  "$id": "https://genos.cestari.studio/specs/operation.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["spec_key", "spec_version", "operation_key", "endpoint", "auth", "idempotency", "errors", "tests"],
  "properties": {
    "spec_key": { "type": "string", "pattern": "^operation\\.[a-z0-9_.-]+$" },
    "spec_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "spec_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "operation_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
    "endpoint": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "target"],
      "properties": {
        "kind": { "enum": ["rpc", "edge_function", "public_projection", "client_auth"] },
        "target": { "type": "string" }
      }
    },
    "auth": { "type": "string", "description": "e.g. authenticated+membership, jwt_gateway, client_session" },
    "tenant_context": { "type": "string" },
    "idempotency": {
      "type": "object",
      "additionalProperties": false,
      "required": ["strategy"],
      "properties": {
        "strategy": { "enum": ["none", "key", "claim", "quote", "natural"] },
        "key_field": { "type": "string" }
      }
    },
    "errors": {
      "type": "object",
      "additionalProperties": true,
      "description": "failure_map: error class -> carbon state (ready|empty|forbidden|unavailable|failed|partial)"
    },
    "tests": { "type": "array", "minItems": 1, "items": { "type": "string" } }
  }
}
```

### 2.5 `policy.schema.json`

```json
{
  "$id": "https://genos.cestari.studio/specs/policy.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["spec_key", "spec_version", "policy_key", "effect", "predicate"],
  "properties": {
    "spec_key": { "type": "string", "pattern": "^policy\\.[a-z0-9_.-]+$" },
    "spec_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "spec_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "policy_key": { "type": "string", "pattern": "^[a-z0-9_.-]+$" },
    "effect": { "enum": ["allow", "deny", "require_step", "step_up"] },
    "predicate": {
      "type": "string",
      "description": "declarative predicate over actor/context/entitlement — resolved server-side, never browser-trusted"
    },
    "roles_ref": {
      "type": "array",
      "items": { "type": "string" },
      "description": "real registry roles only (org_owner/org_admin/org_member/workspace_admin/project_owner/...)"
    }
  }
}
```

### 2.6 `surface.schema.json` + `evidence.schema.json` + `envelope.schema.json`

- **`surface.schema.json`**: `{spec_key, spec_version, spec_hash, surface_key, route_ref∈ROUTE_ALLOWLIST, template_ref∈COMPONENT_REGISTRY, allowed_components[] (must be in registry), operation_ref?, states[] (ready|loading|empty|forbidden|unavailable|failed)}`. Routes may only come from the **physical** allowlist (`/`, `/dashboard`, `/dashboard/:id`, `/products`, `/knowledge`, `/payments`, `/settings`, `/onboarding`, `/reset-password`, `*`).
- **`evidence.schema.json`**: `{spec_key, spec_version, spec_hash, generator_version, commit_sha, workflow_run_id, test_results{}, migration_set[], deployment_id?, approval?, status, blockers[], recorded_at}`.
- **`envelope.schema.json`** (agent task envelope): `{task_id, target{repository,branch,baseline_sha}, specs[], mode: local_changes_only, allowed[], forbidden[], required_evidence[], acceptance_criteria[], stop_conditions[]}` — `forbidden` always includes `mutate_remote_database, change_remote_auth_or_rls, push_or_merge, deploy_or_promote, modify_protected_identity_record`.

---

## 3. Deterministic validation criteria (the G1 gate)

`spec-validate.mjs` must **fail (exit 1)** on any of:

| #   | Rule                                                                                                                                                                                                                 | Why                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| V1  | Every spec validates against its JSON Schema (`ajv@6.15.0`).                                                                                                                                                         | Well-formedness.           |
| V2  | Every `*_ref` resolves to an existing spec (`step_ref`, `field`, `operation`, `policy`, `surface`, `template`, `route`, `predicate`).                                                                                | No dangling references.    |
| V3  | `operation.endpoint.target` exists in the **live baseline** (RPC in `pg_proc`, edge fn in `runtime-registries.ENDPOINT_ALLOWLIST`, projection table in `pg_tables`) OR is explicitly `client_auth`/`client_session`. | No invented endpoints.     |
| V4  | `field.data.path` resolves against the live schema (introspected columns) or is marked `verified_binding_required` (→ `NEEDS_REVIEW`, not VERIFIED).                                                                 | No invented bindings.      |
| V5  | `policy.roles_ref[]` ⊆ the real role registry (`organization_members.role_name` values + platform roles).                                                                                                            | No invented roles.         |
| V6  | `surface.route_ref` ⊆ physical ROUTE_ALLOWLIST; `surface.template_ref` + `allowed_components[]` ⊆ COMPONENT_REGISTRY.                                                                                                | No new routes/components.  |
| V7  | Every `operation` has ≥1 `tests[]`; every journey step has a `completion.predicate_ref`.                                                                                                                             | No untested operations.    |
| V8  | No spec may assert `status: WIRED                                                                                                                                                                                    | INTEGRATION_VERIFIED       | E2E_VERIFIED`or`configured` for a binding/surface while the corresponding DB row count is 0 (NORMATIVE_ONLY). | No availability-without-binding. |
| V9  | `field.privacy.classification ∈ {confidential,restricted}` ⇒ the field must appear in `step.persist.redact[]` or have a canonical entity (never a generic PII dump).                                                 | PII minimization (FS/PII). |
| V10 | `spec_hash` recomputed == stored; duplicate `spec_key` across files → fail.                                                                                                                                          | Integrity + uniqueness.    |

Cross-checks reuse (not duplicate) the existing gates: `check:matrices`, `check:carbon-patterns`,
`registry:check`. V6 shells out to `registry:check` for allowlist drift.

---

## 4. Proof of concept — `onboarding.person` (read/plan-only)

**Goal:** prove the mechanism end-to-end on the smallest real slice, **without changing app behavior**.

1. **Author** (plan → spec, on implementation):
   - `specs/journeys/onboarding.person.yaml` — steps 1,2,4,5 (PF path of the current wizard).
   - `specs/steps/*` for each, referencing `specs/fields/*` (full_name, tax_id, national_identity, birth_date, address.*, country, language).
   - `specs/operations/onboarding.save-progress.yaml` → `endpoint {kind: rpc, target: save_onboarding_progress}`, `auth: authenticated`, `idempotency {strategy: key}`.
   - `specs/policies/onboarding.readiness.yaml` → `effect: require_step`, `predicate` over person+membership.
   - `specs/surfaces/onboarding.person.yaml` → `route_ref: /onboarding`, `template_ref: carbon.wizard.progress-indicator`.
2. **Validate** — run G1; expected findings (from Fase 0):
   - `save_onboarding_progress` is `anon`-executable → **flag** (V3-note: present but over-exposed; `NEEDS_REVIEW`).
   - Persistence entity = `persons.additional_property.onboarding` (JSON blob, no run/step ledger) → **flag** (not a canonical ledger; `NEEDS_REVIEW` toward the ADR `onboarding_runs`/`onboarding_step_states`).
   - `field.data.path` for fiscal/PII fields → `verified_binding_required` until canonical entity is decided by the tenancy ADR.
3. **Generate** — the deterministic generator emits: TS types, a `form-definition` for the PF step, a
   traceability row set, a task **envelope**, and a **validation test list** — all into `generated/`.
4. **Check** — `spec-check-generated.mjs --check` passes (no hand edits to `generated/`).
5. **Record** — `evidence-record.mjs` appends an entry linking `spec_hash`, `generator_version`,
   `commit_sha`, validator result, and `status: NORMATIVE_ONLY` (no app change, no DB publish).

**PoC acceptance:** (a) G1 passes or flags exactly the known Fase-0 gaps (no silent unknowns);
(b) generator output is byte-reproducible (`--check` green); (c) **zero** changes to runtime code,
DB, or the PR; (d) `TenantContext.jsx` uncommitted change and the passkey plan doc are **untouched**;
(e) evidence entry written.

---

## 5. What this plan explicitly does NOT do

- No `specs/`, `generated/`, `artifacts/`, or `scripts/spec-*` are created (design only).
- No migration, no DB publish, no remote mutation, no deploy/merge/promote, no config/grant/RLS/Auth/domain change.
- PR #7 stays **blocked** pending human review.
- Bindings/surfaces/settings-map remain **NORMATIVE_ONLY**; nothing is declared implemented.
- `cestari-studio/genOS` stays read-only.

## 6. Deliverables to review before implementation

1. This ADR (§1) — approve/amend the architecture.
2. The 8 schemas (§2) — approve field/required sets and patterns.
3. The G1 validation rules V1–V10 (§3) — approve strictness (esp. V8 availability honesty).
4. The `onboarding.person` PoC plan (§4) — approve scope + acceptance.

**On approval,** implementation begins with §1.5 layout + `spec-validate.mjs` (G1) + the PoC —
still with **no** remote mutation and **no** app-behavior change.
