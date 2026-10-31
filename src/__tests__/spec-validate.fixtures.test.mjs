/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Fixtures for the G1 spec validator (scripts/spec-validate.mjs), per the
 * Fase -1 reviewer condition: every rule (V1-V10) and every verdict
 * (VALID / NEEDS_REVIEW / BLOCKED) is covered. Runs the validator as a
 * subprocess against a temp specs tree, so fixtures never touch the real specs/.
 */
import { test, expect, describe } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const VALIDATOR = join(ROOT, 'scripts/spec-validate.mjs');

function makeSpecsTree() {
  const dir = mkdtempSync(join(tmpdir(), 'spec-fix-'));
  for (const d of ['schemas', 'journeys', 'steps', 'fields', 'operations', 'policies', 'surfaces']) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  return dir;
}

function runValidator(specsDir) {
  try {
    const out = execFileSync('node', [VALIDATOR], {
      env: { ...process.env, SPEC_MODE: 'plan', SPEC_DIR_OVERRIDE: specsDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out, findings: parse(out) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? ''), findings: parse(e.stdout ?? '') };
  }
}
function parse(out) {
  return out
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l));
}

// Minimal valid building blocks
const journey = {
  spec_key: 'journey.x',
  spec_version: '1.0.0',
  journey_key: 'x',
  title: 'x',
  steps: [{ step_key: 'a', ref: 'step.a' }],
  readiness: { decision_values: ['allow'] },
};
const step = {
  spec_key: 'step.a',
  spec_version: '1.0.0',
  step_key: 'a',
  title: 'a',
  fields: [],
  completion: { predicate_ref: 'policy.p', server_authoritative: true },
};
const policy = { spec_key: 'policy.p', spec_version: '1.0.0', policy_key: 'p', effect: 'allow', predicate: 'true' };

function seed(dir, files) {
  // always copy the real schemas so V1 can run
  for (const s of ['journey', 'step', 'field', 'operation', 'policy', 'surface', 'evidence', 'envelope']) {
    writeFileSync(
      join(dir, 'schemas', `${s}.schema.json`),
      readFileSync(join(ROOT, 'specs/schemas', `${s}.schema.json`)),
    );
  }
  writeFileSync(join(dir, 'baseline.json'), readFileSync(join(ROOT, 'specs/baseline.json')));
  for (const [sub, name, obj] of files) {
    writeFileSync(join(dir, sub, name), JSON.stringify(obj, null, 2));
  }
}

describe('G1 spec validator — fixtures per rule and verdict', () => {
  test('VALID: a complete, resolvable spec set passes with exit 0', () => {
    const dir = makeSpecsTree();
    seed(dir, [
      ['journeys', 'x.json', journey],
      ['steps', 'a.json', step],
      ['policies', 'p.json', policy],
    ]);
    const r = runValidator(dir);
    expect(r.findings.filter((f) => f.verdict === 'BLOCKED')).toHaveLength(0);
  });

  test('V1 BLOCKED: a spec violating its JSON Schema (disallowed property)', () => {
    const dir = makeSpecsTree();
    const bad = { ...journey, unexpected: 1 };
    seed(dir, [['journeys', 'x.json', bad]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V1' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('V2 BLOCKED: journey referencing a missing step', () => {
    const dir = makeSpecsTree();
    seed(dir, [['journeys', 'x.json', { ...journey, steps: [{ step_key: 'z', ref: 'step.zzz' }] }]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V2' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('V3a BLOCKED: operation endpoint not in baseline', () => {
    const dir = makeSpecsTree();
    const op = {
      spec_key: 'operation.x',
      spec_version: '1.0.0',
      operation_key: 'x',
      endpoint: { kind: 'rpc', target: 'nonexistent_rpc' },
      auth: 'authenticated',
      idempotency: { strategy: 'key' },
      errors: {},
      tests: ['x.deny'],
    };
    seed(dir, [['operations', 'x.json', op]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V3a' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('V3b NEEDS_REVIEW: anon-exposed endpoint for an authenticated op', () => {
    const dir = makeSpecsTree();
    const op = {
      spec_key: 'operation.x',
      spec_version: '1.0.0',
      operation_key: 'x',
      endpoint: { kind: 'rpc', target: 'save_onboarding_progress' },
      auth: 'authenticated',
      idempotency: { strategy: 'key' },
      errors: {},
      tests: ['x.anon-denial'],
    };
    seed(dir, [['operations', 'x.json', op]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V3b' && f.verdict === 'NEEDS_REVIEW')).toBe(true);
  });

  test('V3c NEEDS_REVIEW: mutating op without a negative authorization test', () => {
    const dir = makeSpecsTree();
    const op = {
      spec_key: 'operation.x',
      spec_version: '1.0.0',
      operation_key: 'x',
      endpoint: { kind: 'rpc', target: 'apply_setting_cascade' },
      auth: 'authenticated',
      idempotency: { strategy: 'key' },
      errors: {},
      tests: ['x.happy-path'],
    };
    seed(dir, [['operations', 'x.json', op]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V3c' && f.verdict === 'NEEDS_REVIEW')).toBe(true);
  });

  test('V5 BLOCKED: policy referencing a role not in the registry', () => {
    const dir = makeSpecsTree();
    seed(dir, [['policies', 'p.json', { ...policy, roles_ref: ['super_mega_admin'] }]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V5' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('V7 NEEDS_REVIEW: operation declares an unresolvable test id (declaration ≠ execution)', () => {
    const dir = makeSpecsTree();
    const op = {
      spec_key: 'operation.x',
      spec_version: '1.0.0',
      operation_key: 'x',
      endpoint: { kind: 'rpc', target: 'resolve_effective_settings' },
      auth: 'authenticated',
      idempotency: { strategy: 'none' },
      errors: {},
      tests: ['some-unresolvable-name'],
    };
    seed(dir, [['operations', 'x.json', op]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V7' && f.verdict === 'NEEDS_REVIEW')).toBe(true);
  });

  test('V9 BLOCKED: restricted field present in a generic payload_allowlist', () => {
    const dir = makeSpecsTree();
    const field = {
      spec_key: 'field.person.tax-id',
      spec_version: '1.0.0',
      field_key: 'person.tax_id',
      data: { entity: 'persons', path: 'tax_id', type: 'string' },
      ui: { component: 'TextInput', label_key: 'l' },
      rules: {},
      privacy: {
        classification: 'restricted',
        purpose: 'fiscal',
        minimization: 'min',
        persistence: { entity: 'person_fiscal', retention: '90d' },
      },
      tests: [],
    };
    const badStep = {
      spec_key: 'step.a',
      spec_version: '1.0.0',
      step_key: 'a',
      title: 'a',
      fields: ['field.person.tax-id'],
      persist: { payload_allowlist: ['person.tax_id'] },
      completion: { predicate_ref: 'policy.p', server_authoritative: true },
    };
    seed(dir, [
      ['fields', 'f.json', field],
      ['steps', 'a.json', badStep],
      ['policies', 'p.json', policy],
    ]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V9' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('V10 BLOCKED: spec_hash mismatch', () => {
    const dir = makeSpecsTree();
    seed(dir, [['journeys', 'x.json', { ...journey, spec_hash: '0'.repeat(64) }]]);
    const r = runValidator(dir);
    expect(r.findings.some((f) => f.rule === 'V10' && f.verdict === 'BLOCKED')).toBe(true);
  });

  test('exit code: BLOCKED -> 1', () => {
    const dir = makeSpecsTree();
    seed(dir, [['journeys', 'x.json', { ...journey, unexpected: 1 }]]);
    expect(runValidator(dir).code).toBe(1);
  });

  test('exit code: only NEEDS_REVIEW (plan mode) -> 2', () => {
    const dir = makeSpecsTree();
    const op = {
      spec_key: 'operation.x',
      spec_version: '1.0.0',
      operation_key: 'x',
      endpoint: { kind: 'rpc', target: 'save_onboarding_progress' },
      auth: 'authenticated',
      idempotency: { strategy: 'key' },
      errors: {},
      tests: ['x.anon-denial'],
    };
    seed(dir, [['operations', 'x.json', op]]);
    expect(runValidator(dir).code).toBe(2);
  });

  test('exit code: all VALID -> 0', () => {
    const dir = makeSpecsTree();
    seed(dir, [
      ['journeys', 'x.json', journey],
      ['steps', 'a.json', step],
      ['policies', 'p.json', policy],
    ]);
    expect(runValidator(dir).code).toBe(0);
  });
});
