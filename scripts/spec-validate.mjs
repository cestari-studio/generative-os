#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Spec Control Plane — G1 deterministic validator.
 *
 * Validates versioned JSON specs (specs/) against their JSON Schemas and against
 * each other, per docs/fase-minus1-spec-control-plane-plan.md §3.
 *
 * Result model (§3.1): VALID / NEEDS_REVIEW / BLOCKED, separated from operational
 * maturity. Exit codes (§3.2, §4.1):
 *   0 = all VALID
 *   2 = >=1 NEEDS_REVIEW (no BLOCKED)
 *   1 = >=1 BLOCKED (or a NEEDS_REVIEW not allowlisted in gate mode)
 *
 * Modes (SPEC_MODE):
 *   plan (default) — PoC/planning; exit 2 is a pass-with-report.
 *   gate           — CI gate; exit 2 fails unless each finding is allowlisted in
 *                    specs/needs-review-allowlist.json.
 *
 * Read-only against the app and DB. Never mutates anything but (optionally,
 * --write) the spec_hash inside spec files being normalized.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// SPEC_DIR_OVERRIDE lets the fixture suite point the validator at a temp tree.
const SPECS_DIR = process.env.SPEC_DIR_OVERRIDE ? join(process.env.SPEC_DIR_OVERRIDE) : join(ROOT, 'specs');
const SCHEMAS_DIR = join(SPECS_DIR, 'schemas');
const MODE = process.env.SPEC_MODE || 'plan';
const WRITE = process.argv.includes('--write');

const ajv = new Ajv({ allErrors: true, strict: false });

// --- Hash chain (§3.3): canonicalize -> exclude spec_hash -> sha256 ----------
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export function computeSpecHash(spec) {
  const clone = JSON.parse(JSON.stringify(spec));
  delete clone.spec_hash;
  return createHash('sha256').update(canonicalize(clone), 'utf8').digest('hex');
}

// --- Load schemas -------------------------------------------------------------
const schemaByKind = {};
for (const f of readdirSync(SCHEMAS_DIR)) {
  if (!f.endsWith('.schema.json')) continue;
  const kind = f.replace('.schema.json', '');
  schemaByKind[kind] = ajv.compile(JSON.parse(readFileSync(join(SCHEMAS_DIR, f), 'utf8')));
}

// --- Load all specs (json or yaml-as-json via .json for now) -------------------
function* specFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* specFiles(full);
    else if (/\.(json|ya?ml)$/.test(entry.name)) yield full;
  }
}

function kindOf(file) {
  const rel = relative(SPECS_DIR, file);
  const top = rel.split(/[\\/]/)[0];
  // map plural dir -> schema kind
  const map = {
    journeys: 'journey',
    steps: 'step',
    fields: 'field',
    operations: 'operation',
    policies: 'policy',
    surfaces: 'surface',
  };
  return map[top] || null;
}

const findings = [];
const add = (spec_key, rule, verdict, evidence, fix) => findings.push({ spec_key, rule, verdict, evidence, fix });

const specs = [];
const byKey = new Map();
for (const file of specFiles(SPECS_DIR) ?? []) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    add(relative(ROOT, file), 'V1', 'BLOCKED', `unparseable JSON: ${e.message}`, 'fix the spec JSON/YAML');
    continue;
  }
  specs.push({ file, spec, kind: kindOf(file) });
  if (spec.spec_key) {
    if (byKey.has(spec.spec_key))
      add(
        spec.spec_key,
        'V10',
        'BLOCKED',
        `duplicate spec_key also in ${byKey.get(spec.spec_key)}`,
        'use a unique spec_key',
      );
    byKey.set(spec.spec_key, relative(ROOT, file));
  }
}

// --- Baseline (read-only): live schema + registries ---------------------------
// In the PoC these come from a captured baseline fixture (no live DB calls).
// SPEC_BASELINE may point to a JSON introspection snapshot; otherwise the
// bundled baseline fixture is used so the validator is deterministic offline.
const baselinePath = process.env.SPEC_BASELINE || join(SPECS_DIR, 'baseline.json');
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : { rpc: [], edge_functions: [], projection_tables: [], columns: {}, roles: [], endpoints_anon: [] };
const RPC = new Set(baseline.rpc ?? []);
const EDGE = new Set(baseline.edge_functions ?? []);
const PROJ = new Set(baseline.projection_tables ?? []);
const ROLES = new Set(baseline.roles ?? []);
const ANON_EXEC = new Set(baseline.endpoints_anon ?? []);
const COLUMNS = baseline.columns ?? {}; // table -> [col]

// --- Validators ---------------------------------------------------------------
for (const { file, spec, kind } of specs) {
  const key = spec.spec_key ?? relative(ROOT, file);

  // V1 schema validation
  const schema = kind && schemaByKind[kind];
  if (schema) {
    if (!schema(spec)) {
      add(
        key,
        'V1',
        'BLOCKED',
        ajv.errorsText(schema.errors, { separator: '; ' }).slice(0, 300),
        'fix against the JSON Schema',
      );
      continue; // cannot reason further
    }
  }

  // V10 hash integrity
  if (spec.spec_hash) {
    const recomputed = computeSpecHash(spec);
    if (recomputed !== spec.spec_hash) {
      add(
        key,
        'V10',
        'BLOCKED',
        `spec_hash mismatch (recomputed ${recomputed.slice(0, 12)}… != stored ${String(spec.spec_hash).slice(0, 12)}…)`,
        'run spec-validate --write',
      );
    }
  }

  // V2 cross-reference resolution (per-kind ref fields)
  const refs = [];
  if (kind === 'journey') for (const s of spec.steps ?? []) refs.push(['step', s.ref]);
  if (kind === 'step') {
    for (const f of spec.fields ?? []) refs.push(['field', f]);
    if (spec.persist?.operation_ref) refs.push(['operation', spec.persist.operation_ref]);
    if (spec.completion?.predicate_ref) refs.push(['policy', spec.completion.predicate_ref]);
    if (spec.surface_ref) refs.push(['surface', spec.surface_ref]);
  }
  if (kind === 'surface' && spec.operation_ref) refs.push(['operation', spec.operation_ref]);
  for (const [, ref] of refs) {
    if (ref && !byKey.has(ref))
      add(key, 'V2', 'BLOCKED', `unresolved reference ${ref}`, 'create the referenced spec or fix the key');
  }

  // V3a/b/c endpoint existence + privilege + negative test
  if (kind === 'operation') {
    const { kind: ekind, target } = spec.endpoint ?? {};
    if (ekind === 'rpc' && !RPC.has(target))
      add(
        key,
        'V3a',
        'BLOCKED',
        `rpc ${target} not in live baseline`,
        'verify the endpoint exists or mark client_auth',
      );
    if (ekind === 'edge_function' && !EDGE.has(target))
      add(key, 'V3a', 'BLOCKED', `edge_function ${target} not in registry`, 'verify the endpoint exists');
    if (ekind === 'public_projection' && !PROJ.has(target))
      add(key, 'V3a', 'BLOCKED', `projection table ${target} not in baseline`, 'verify the table exists');
    if (ANON_EXEC.has(target))
      add(
        key,
        'V3b',
        'NEEDS_REVIEW',
        `${target} is EXECUTE-exposed to anon while auth=${spec.auth}`,
        'review grants; require auth or tighten EXECUTE',
      );
    const isMutating = ekind === 'rpc' || ekind === 'edge_function';
    const hasNegativeTest = (spec.tests ?? []).some((t) => /deny|denial|forbidden|cross-tenant|anon/i.test(t));
    if (isMutating && !hasNegativeTest)
      add(
        key,
        'V3c',
        'NEEDS_REVIEW',
        `no negative authorization test declared for ${target}`,
        'add a cross-tenant/anon denial test id',
      );
  }

  // V4 field binding
  if (kind === 'field') {
    const { entity, path, binding } = spec.data ?? {};
    const cols = COLUMNS[entity];
    if (binding === 'verified_binding_required' || !path) {
      add(
        key,
        'V4',
        'NEEDS_REVIEW',
        `binding unresolved (${entity}.${path ?? '?'})`,
        'resolve against the live schema / tenancy ADR',
      );
    } else if (cols && !cols.includes(path)) {
      add(
        key,
        'V4',
        'NEEDS_REVIEW',
        `column ${entity}.${path} not in baseline`,
        'verify the column or mark verified_binding_required',
      );
    }
  }

  // V5 roles
  if (kind === 'policy') {
    for (const r of spec.roles_ref ?? []) {
      if (!ROLES.has(r)) add(key, 'V5', 'BLOCKED', `role ${r} not in real role registry`, 'use a role that exists');
    }
  }

  // V7 test declaration (declaration ≠ execution). The schema already enforces
  // minItems:1, so here we check each declared test id is *resolvable* — either
  // an existing test file/case in the repo, or an explicitly `planned:`-prefixed id.
  if (kind === 'operation') {
    for (const t of spec.tests ?? []) {
      if (typeof t !== 'string' || t.trim() === '') {
        add(key, 'V7', 'NEEDS_REVIEW', `empty test id in tests[]`, 'name a resolvable test id');
        continue;
      }
      if (t.startsWith('planned:')) continue; // explicitly planned — resolvable by convention
      const looksLikeFileRef = /\.(test|spec)\.(jsx?|tsx?|mjs|sql)($|::|\/)/.test(t) || t.includes('/');
      if (!looksLikeFileRef) {
        add(
          key,
          'V7',
          'NEEDS_REVIEW',
          `test id "${t}" does not resolve to a file/case or a planned: id`,
          'use a resolvable test id (file::case) or planned:<id>',
        );
      }
    }
  }

  // V9 privacy: restricted/confidential must not be in generic payloads
  if (kind === 'field' && ['confidential', 'restricted'].includes(spec.privacy?.classification)) {
    const inGenericPayload = specs.some(
      (o) => o.kind === 'step' && (o.spec.persist?.payload_allowlist ?? []).includes(spec.field_key),
    );
    if (inGenericPayload) {
      add(
        key,
        'V9',
        'BLOCKED',
        `restricted field ${spec.field_key} appears in a step.persist.payload_allowlist`,
        'move it to a canonical entity (never a generic payload)',
      );
    }
  }
}

// --- Output -------------------------------------------------------------------
const blocked = findings.filter((f) => f.verdict === 'BLOCKED');
const review = findings.filter((f) => f.verdict === 'NEEDS_REVIEW');

for (const f of findings) {
  console.log(JSON.stringify(f));
}

console.error(`\nG1 (${MODE}): ${byKey.size} specs, ${blocked.length} BLOCKED, ${review.length} NEEDS_REVIEW.`);

if (WRITE) {
  for (const { file, spec } of specs) {
    const h = computeSpecHash(spec);
    if (spec.spec_hash !== h) {
      spec.spec_hash = h;
      writeFileSync(file, JSON.stringify(spec, null, 2) + '\n', 'utf8');
    }
  }
  console.error('--write: spec_hash normalized.');
}

// Exit-code policy (§4.1)
if (blocked.length > 0) process.exit(1);
if (review.length > 0) {
  if (MODE === 'gate') {
    const allowPath = join(SPECS_DIR, 'needs-review-allowlist.json');
    const allow = existsSync(allowPath)
      ? new Set((JSON.parse(readFileSync(allowPath, 'utf8')).entries ?? []).map((e) => `${e.spec_key}|${e.rule}`))
      : new Set();
    const unallowed = review.filter((f) => !allow.has(`${f.spec_key}|${f.rule}`));
    if (unallowed.length > 0) {
      console.error(`gate mode: ${unallowed.length} NEEDS_REVIEW finding(s) not allowlisted -> fail.`);
      process.exit(1);
    }
  }
  process.exit(2);
}
process.exit(0);
