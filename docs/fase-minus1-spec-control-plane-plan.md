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
3. **Fail-closed honesty.** Validity ≠ maturity (§3.1). A missing field/operation/role/route is
   `BLOCKED`; an unproven grant/binding is `NEEDS_REVIEW`; a false availability claim is `BLOCKED`.
   A `NORMATIVE_ONLY` spec may be `VALID` — absence of a binding blocks **availability claims**, not
   normative authorship. Absence of evidence is never read as success (§3.4).
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
        "purpose": { "type": "string", "minLength": 1 },
        "minimization": { "type": "string", "description": "why only the minimum necessary data is collected" },
        "persistence": {
          "type": "object",
          "additionalProperties": false,
          "required": ["entity", "retention"],
          "properties": {
            "entity": { "type": "string", "description": "canonical entity key (never a generic/free payload)" },
            "retention": { "type": "string", "description": "retention/TTL policy" }
          }
        }
      }
    },
    "tests": { "type": "array", "items": { "type": "string" } }
  },
  "allOf": [
    {
      "if": {
        "properties": { "privacy": { "properties": { "classification": { "enum": ["confidential", "restricted"] } } } },
        "required": ["privacy"]
      },
      "then": {
        "properties": {
          "privacy": { "required": ["minimization", "persistence"] }
        }
      }
    }
  ]
}
```

**V9 conditional validation (AJV 6.15.0-compatible):** the `allOf/if/then` construct above is
draft-07 and supported by `ajv@6.15.0`. When `privacy.classification ∈ {confidential,restricted}`,
`minimization` and `persistence` become required — schema-level, not just a V9 rule note. A restricted
field missing either fails schema validation (V1 `BLOCKED`) before V9 even runs; V9 then separately
verifies the field is not referenced by any `step.persist.payload_allowlist` or generic payload.

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
- **`evidence.schema.json`** — required: `{spec_key, spec_version, spec_hash, generator_version, commit_sha, evidence_class∈{validation.local,validation.ci,integration,e2e,approval.human}, verdicts{}, maturity, blockers[], recorded_at}`. **Optional (only when they exist):** `workflow_run_id?`, `deployment_id?`, `approval?{approver,decision,at}`, `test_results?{}`, `migration_set?[]`. Absence of an optional class is recorded as its own state (§3.4) and is **never** treated as success.
- **`envelope.schema.json`** (agent task envelope): `{task_id, target{repository,branch,baseline_sha}, specs[], mode: local_changes_only, allowed[], forbidden[], required_evidence[], acceptance_criteria[], stop_conditions[]}` — `forbidden` always includes `mutate_remote_database, change_remote_auth_or_rls, push_or_merge, deploy_or_promote, modify_protected_identity_record`.

---

## 3. Deterministic validation criteria (the G1 gate)

### 3.1 Result model — separate _spec validity_ from _operational maturity_

The validator **never collapses** these two axes. Each spec gets a **validity** verdict, and
maturity is a separate, evidence-bound state — never inferred from validity.

**Validity verdicts (spec as a contract):**

| Verdict        | Meaning                                                                                                                                                        | Gate behavior                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `VALID`        | Structurally consistent: schema OK, all `*_ref` resolve, no rule violated.                                                                                     | proceed                                                                            |
| `NEEDS_REVIEW` | A dependency or decision is pending (unresolved binding, over-exposed grant, unproven API, `verified_binding_required`).                                       | proceed **flagged**; recorded; blocks any maturity claim above `MAPPED_UNVERIFIED` |
| `BLOCKED`      | A mandatory prerequisite is absent or a rule is violated (missing required ref, schema failure, invented endpoint/role/route, PII rule broken, hash mismatch). | **exit 1** — does not reach the generator                                          |

**Operational maturity (separate axis, evidence-bound):**
`NORMATIVE_ONLY → MAPPED_UNVERIFIED → CONFIGURED → WIRED → INTEGRATION_VERIFIED → E2E_VERIFIED`.
A `NORMATIVE_ONLY` spec **can be `VALID`** — a binding's absence blocks **availability claims**, not
the authorship of a normative spec. Maturity states require their own evidence (§3.4) and are never
granted by the spec validator.

### 3.2 Rules V1–V10

`spec-validate.mjs` emits structured output per finding: `{spec_key, rule, verdict, evidence, fix}`.
Exit codes: `0` = all `VALID`; `2` = ≥1 `NEEDS_REVIEW` (no `BLOCKED`); `1` = ≥1 `BLOCKED`.

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verdict on violation                                          | Why                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------- |
| V1  | Every spec validates against its JSON Schema (`ajv@6.15.0`).                                                                                                                                                                                                                                                                                                                                                                                            | `BLOCKED`                                                     | Well-formedness.              |
| V2  | Every `*_ref` resolves to an existing spec (`step`, `field`, `operation`, `policy`, `surface`, `template`, `route`, `predicate`).                                                                                                                                                                                                                                                                                                                       | `BLOCKED`                                                     | No dangling references.       |
| V3a | `operation.endpoint.target` **exists** in the live baseline (RPC in `pg_proc`, edge fn in `ENDPOINT_ALLOWLIST`, projection table in `pg_tables`) OR is explicitly `client_auth`/`client_session`.                                                                                                                                                                                                                                                       | `BLOCKED`                                                     | No invented endpoints.        |
| V3b | For each existing endpoint, check **privilege + auth context** (`EXECUTE` grants, `anon` exposure, DEFINER/INVOKER, expected auth). A target that exists but is **over-exposed** for the declared `operation.auth` (e.g. `save_onboarding_progress` `EXECUTE` to `anon`, or an unproven external API) is **not** auto-approved by a body-level `auth.uid()` check.                                                                                      | `NEEDS_REVIEW` (or `BLOCKED` if the security policy marks it) | Existence ≠ authorization.    |
| V3c | Every privileged/mutating operation has a **negative authorization test** declared in `tests[]` (e.g. cross-tenant / anon denial).                                                                                                                                                                                                                                                                                                                      | `NEEDS_REVIEW`                                                | No unverified privileged ops. |
| V4  | `field.data.path` resolves against the live schema (introspected columns) **and** the resolved table's RLS/grants permit the declared access; otherwise `verified_binding_required`.                                                                                                                                                                                                                                                                    | `NEEDS_REVIEW`                                                | No invented bindings.         |
| V5  | `policy.roles_ref[]` ⊆ the real role registry (`organization_members.role_name` values + platform roles).                                                                                                                                                                                                                                                                                                                                               | `BLOCKED`                                                     | No invented roles.            |
| V6  | `surface.route_ref` ⊆ physical ROUTE_ALLOWLIST; `surface.template_ref` + `allowed_components[]` ⊆ COMPONENT_REGISTRY.                                                                                                                                                                                                                                                                                                                                   | `BLOCKED`                                                     | No new routes/components.     |
| V7  | **Test declaration ≠ test execution.** Every `operation` must declare ≥1 resolvable test in `tests[]` (a test file/case id that resolves in the repo, or an explicitly `planned:`-prefixed id). A **required** test id that does not resolve is a finding. A test that exists but **has not been executed** is a **maturity/evidence** gap (§3.4), **not** a validity finding — it never blocks spec validity, only maturity above `MAPPED_UNVERIFIED`. | `NEEDS_REVIEW`                                                | No untested operations.       |
| V8  | **Availability honesty (maturity axis, not validity).** A spec may _author_ `NORMATIVE_ONLY`. A spec may **not** assert `CONFIGURED                                                                                                                                                                                                                                                                                                                     | WIRED                                                         | INTEGRATION_VERIFIED          | E2E_VERIFIED`for a binding/surface while its evidence axis is empty (DB row count 0 / no tested binding). Asserting availability without evidence =`BLOCKED`; merely being unimplemented = the spec stays `VALID`+`NORMATIVE_ONLY`. | `BLOCKED` only on false availability claim | No availability-without-binding, but normative authorship allowed. |
| V9  | **Privacy (classification + purpose + minimization + persistence policy).** Every field with `privacy.classification ∈ {confidential,restricted}` must declare `purpose`, a `minimization` note, and a `persistence` policy (canonical entity + retention/TTL). Such fields are **never** allowed in a generic/free payload. Binding to a canonical entity does **not** waive authorization, minimization, or retention controls.                       | `BLOCKED`                                                     | PII minimization (FS/PII).    |
| V10 | Hash integrity: recomputed `spec_hash` == stored (per §3.3); duplicate `spec_key` across files.                                                                                                                                                                                                                                                                                                                                                         | `BLOCKED`                                                     | Integrity + uniqueness.       |

Cross-checks reuse (not duplicate) the existing gates: `check:matrices`, `check:carbon-patterns`,
`registry:check`. V6 shells out to `registry:check` for allowlist drift.

### 3.3 Reproducible hash chain (`spec_hash`)

`spec_hash` is **computed by the validator, not required beforehand**:

1. **Canonicalization:** serialize the spec with sorted object keys, stable list order preserved,
   UTF-8, LF newlines, no trailing whitespace. (Deterministic across platforms.)
2. **Exclusion:** the `spec_hash` field itself is removed before hashing (a spec never hashes its own hash).
3. **Algorithm:** `sha256` over the canonical bytes, hex.
4. **Cross-spec references:** references are by `spec_key` (logical), **not** embedded content, so a
   referenced spec's hash change does not silently rewrite the referrer; a `--lock` mode can pin
   `ref@spec_version` when immutability is required.
5. **Authoring flow:** authors omit `spec_hash`; `spec-validate --write` computes and writes it; CI
   uses `--check` to verify recomputed == stored (mismatch = V10 `BLOCKED`).

### 3.4 Evidence classes (separate; absence ≠ success)

| Class              | Meaning                                                 | Required fields                                          |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| `validation.local` | G1 ran locally and its verdict                          | `commit_sha`, `spec_hash`, `generator_version`, verdicts |
| `validation.ci`    | G1 ran in CI on a SHA                                   | + `workflow_run_id`                                      |
| `integration`      | operation/binding tested against a real, authorized env | + env ref, test ids, result                              |
| `e2e`              | browser/journey E2E on a specific deployment            | + `deployment_id`, run ids                               |
| `approval.human`   | a human reviewed and approved                           | + `approval{approver,decision,at}`                       |

`workflow_run_id`, `deployment_id`, `approval` are **optional and only present when they exist**.
**Absence of evidence is never read as success** — a missing class maps to the corresponding
`NORMATIVE_ONLY`/`MAPPED_UNVERIFIED` state, and maturity above that requires the matching class.

---

## 4. Proof of concept — `onboarding.person` (declarative generation only)

**Goal:** prove the mechanism end-to-end on the smallest real slice, **without changing app behavior**.
Scope is **declarative generation only** — the generator emits data/artifacts, **never** React
components, and **never** alters application behavior in this phase.

1. **Author** (plan → spec, on implementation):
   - `specs/journeys/onboarding.person.yaml` — steps 1,2,4,5 (PF path of the current wizard).
   - `specs/steps/*` for each, referencing `specs/fields/*` (full_name, tax_id, national_identity, birth_date, address.*, country, language).
   - `specs/operations/onboarding.save-progress.yaml` → `endpoint {kind: rpc, target: save_onboarding_progress}`, `auth: authenticated`, `idempotency {strategy: key}`, plus a declared **anon-denial negative test** (V3c).
   - `specs/policies/onboarding.readiness.yaml` → `effect: require_step`, `predicate` over person+membership.
   - `specs/surfaces/onboarding.person.yaml` → `route_ref: /onboarding`, `template_ref: carbon.wizard.progress-indicator`.
2. **Validate** — run G1; expected findings (from Fase 0), each emitted as `{spec_key, rule, verdict, evidence, fix}`:
   - `save_onboarding_progress` is `anon`-executable → **V3b `NEEDS_REVIEW`** (exists but over-exposed for `auth: authenticated`).
   - Persistence entity = `persons.additional_property.onboarding` (JSON blob, no run/step ledger) → **V4 `NEEDS_REVIEW`** (not a canonical ledger; points to the ADR `onboarding_runs`/`onboarding_step_states`).
   - `field.data.path` for fiscal/PII fields → `verified_binding_required` (`NEEDS_REVIEW`) until the tenancy ADR picks the canonical entity; PII fields must satisfy V9 (purpose + minimization + persistence, never in the generic payload).
3. **Generate (declarative only)** — the deterministic generator emits into `generated/`:
   **TS types**, a **declarative `form-definition`** (JSON describing fields/labels/validators — _not
   executable UI_, **no React**), a **traceability row set**, a task **envelope**, and a **validation
   test list**. Nothing here imports or renders a component.
4. **Check** — `spec-check-generated.mjs --check` passes (no hand edits to `generated/`).
5. **Record** — `evidence-record.mjs` appends an `validation.local` entry linking `spec_hash`,
   `generator_version`, `commit_sha`, verdicts, and `maturity: NORMATIVE_ONLY` (no app change, no DB publish).

**PoC acceptance:** (a) G1 exits with the expected codes (`2` for the flagged `NEEDS_REVIEW` items,
no unexpected `BLOCKED`); (b) findings are structured with `spec_key`/`rule`/`evidence`/`fix`;
(c) generator output is byte-reproducible (`--check` green); (d) **zero** changes to runtime code,
DB, or the PR; (e) `TenantContext.jsx` uncommitted change and the passkey plan doc are **untouched**;
(f) evidence entry written.

### 4.1 CI integration (no rule duplication) — explicit exit-code policy

`spec-validate.mjs` runs as a **new step in the existing `quality` job**, placed **before** the
build/test steps so an invalid spec blocks code early. It reuses — never re-implements — the existing
gates (`check:matrices`, `check:carbon-patterns`, `registry:check`); V6 shells out to `registry:check`.
Output is structured (JSON lines `{spec_key, rule, verdict, evidence, fix}`) with deterministic exit
codes (`0`/`2`/`1` per §3.2), so the job can surface findings without guessing.

**Exit-code policy by context (no masking of blocks):**

| Context                                                | `0` (all VALID) | `2` (≥1 NEEDS_REVIEW)                                                                                                                                           | `1` (≥1 BLOCKED) |
| ------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **PoC / planning mode** (this phase, `SPEC_MODE=plan`) | pass            | **pass + report** (PoC explicitly expects known Fase-0 gaps)                                                                                                    | **fail**         |
| **CI gate** (`SPEC_MODE=gate`, the quality job)        | pass            | **fail** unless the finding's `spec_key`+`rule` is on the reviewed, versioned **allowlist** (`specs/needs-review-allowlist.json` with owner sign-off per entry) | **fail**         |

The gate must **never** convert a `BLOCKED` into a pass, and a `2` only passes when every finding is
individually allowlisted with an owner decision recorded. The allowlist is itself a versioned spec
(audited by the same hash chain), so a rubber-stamp allowlist is a reviewable diff, not a silent bypass.

---

## 5. What this plan explicitly does NOT do

- No `specs/`, `generated/`, `artifacts/`, or `scripts/spec-*` are created (design only).
- No migration, no DB publish, no remote mutation, no deploy/merge/promote, no config/grant/RLS/Auth/domain change.
- PR #7 stays **blocked** pending human review.
- Bindings/surfaces/settings-map remain **NORMATIVE_ONLY**; nothing is declared implemented.
- `cestari-studio/genOS` stays read-only.

## 6. Review outcome (2026-10-25) — approved with 4 mandatory adjustments + 2 refinements

The architecture was **approved with adjustments**. All 4 mandatory adjustments and both refinements
are incorporated into this document:

| Adjustment                                                                                                                                                                                                                                                                                                                                          | Where applied                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **1. V8 — separate spec validity from operational maturity.** A `NORMATIVE_ONLY` spec can be `VALID`; absence of a binding blocks availability claims, not authorship.                                                                                                                                                                              | §3.1 (result model: `VALID`/`NEEDS_REVIEW`/`BLOCKED` validity vs `NORMATIVE_ONLY→…→E2E_VERIFIED` maturity), V8 rewritten. |
| **2. V3/V5 — distinguish existence from authorization.** RPC existence ≠ safe ≠ callable by the expected user; check `EXECUTE` grants, `anon` exposure, DEFINER/INVOKER, and require negative authorization tests. `save_onboarding_progress` `anon`-executable → `NEEDS_REVIEW`/`BLOCKED`, never auto-approved by a body-level `auth.uid()` check. | V3 split into V3a (existence), V3b (privilege+auth context), V3c (negative auth test).                                    |
| **3. V9 — privacy is classification + purpose + minimization + persistence policy.** Canonical-entity binding does **not** waive authorization/minimization/retention. Restricted fields never enter generic payloads.                                                                                                                              | V9 rewritten.                                                                                                             |
| **4. Reproducible hash chain + evidence classes.** `spec_hash` is validator-computed (canonicalize → exclude self → sha256 → logical refs); evidence split into `validation.local/ci`, `integration`, `e2e`, `approval.human`; `workflow_run_id`/`deployment_id`/`approval` optional and **absence ≠ success**.                                     | §3.3 (hash chain), §3.4 (evidence classes), §2.6 evidence schema.                                                         |
| **Refinement 1 — PoC scope:** declarative generation only (types, traceability, envelope, test list); `form-definition` is declarative JSON, **no React**, **no** app-behavior change.                                                                                                                                                              | §4.                                                                                                                       |
| **Refinement 2 — CI integration:** reuse existing gates without duplicating rules; structured output `{spec_key, rule, verdict, evidence, fix}` + deterministic exit codes `0`/`2`/`1`.                                                                                                                                                             | §3.2, §4.1.                                                                                                               |

## 7. Final review (2026-10-25) — approved for local implementation with 3 P0 adjustments

Items 2–4 **approved** with three final mandatory adjustments (all incorporated):

| #        | Adjustment                                                                                                                                                                                                                                                                             | Where applied                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **P0-1** | **V7 — test declaration ≠ test execution.** An operation with **no declared** tests (or an unresolvable required test id) is a finding; a test that exists but is unexecuted is a **maturity/evidence** gap (§3.4), never a validity block.                                            | §3.2 V7 rewritten.                    |
| **P0-2** | **Exit-code policy explicit by context.** `2` passes only in PoC/plan mode (`SPEC_MODE=plan`); the CI gate (`SPEC_MODE=gate`) fails `2` unless each finding is on the reviewed, versioned `specs/needs-review-allowlist.json`. `1` always fails.                                       | §4.1 exit-code policy table.          |
| **P0-3** | **V9 enforced at the schema.** `purpose`/`minimization`/`persistence` required for `confidential`/`restricted` via draft-07 `allOf/if/then` (verified working under `ajv@6.15.0`: positive/negative/control all correct); restricted fields also excluded from generic payloads by V9. | §2.3 field schema + conditional note. |

**Implementation conditions (from the reviewer):**

1. The 8 schemas must compile and validate positive + negative examples (missing refs, bad hashes, disallowed properties).
2. G1 V1–V10 must have fixtures covering each rule and each verdict (`VALID`, `NEEDS_REVIEW`, `BLOCKED`).
3. The `onboarding.person` PoC must produce reproducible declarative artifacts and record real gaps without declaring non-existent integration.
4. Baseline confirmed (target SHA + local change state) before starting; `TenantContext.jsx` and the passkey doc preserved.
5. Local-only changes: specs, scripts, generated artifacts, and the tests needed for Fase −1. **No** app-behavior change, remote DB, deploy, or PR #7 change.

**Scope of this approval:** local Fase −1 implementation only. It does **not** authorize migrations,
DB publish, merge, push, or deploy.
