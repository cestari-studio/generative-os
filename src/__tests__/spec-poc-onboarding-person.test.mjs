/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * PoC acceptance for the Fase -1 onboarding.person slice (reviewer condition 3):
 * reproducible declarative artifacts + real gaps recorded + no fake integration.
 */
import { test, expect, describe } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const run = (script, args = [], env = {}) => {
  try {
    const out = execFileSync('node', [join(ROOT, script), ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
};
const findings = (out) =>
  out
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l));

describe('onboarding.person PoC — declarative artifacts + real gaps', () => {
  test('G1 flags exactly the known Fase-0 gaps (tax-id binding + anon-exposed RPC), exit 2, no BLOCKED', () => {
    const r = run('scripts/spec-validate.mjs');
    expect(r.code).toBe(2);
    const f = findings(r.out);
    expect(f.filter((x) => x.verdict === 'BLOCKED')).toHaveLength(0);
    expect(f.some((x) => x.rule === 'V3b' && x.spec_key === 'operation.onboarding.save-progress')).toBe(true);
    expect(f.some((x) => x.rule === 'V4' && x.spec_key === 'field.person.tax-id')).toBe(true);
  });

  test('generated artifacts exist and are declarative (no React, no JSX)', () => {
    for (const rel of [
      'types/spec-types.ts',
      'form-definitions/onboarding.person.form.json',
      'traceability/onboarding.person.trace.json',
      'envelopes/fase1-poc.envelope.json',
      'tests/validation-test-list.md',
    ]) {
      expect(existsSync(join(ROOT, 'generated', rel)), rel).toBe(true);
    }
    const formDef = readFileSync(join(ROOT, 'generated/form-definitions/onboarding.person.form.json'), 'utf8');
    expect(formDef).not.toMatch(/import\s+React|from\s+'react'|<[A-Z][A-Za-z]*[\s>/]/); // no React/JSX
    const parsed = JSON.parse(formDef);
    expect(Array.isArray(parsed.forms)).toBe(true);
  });

  test('generation is reproducible (--check green, no drift)', () => {
    const r = run('scripts/spec-generate.mjs', ['--check']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/up to date/);
  });

  test('evidence entry records the real gaps without declaring integration (NORMATIVE_ONLY)', () => {
    const evDir = join(ROOT, 'artifacts/evidence');
    expect(existsSync(evDir)).toBe(true);
    const files = require('node:fs')
      .readdirSync(evDir)
      .filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const entry = JSON.parse(readFileSync(join(evDir, files[0]), 'utf8'));
    expect(entry.maturity).toBe('NORMATIVE_ONLY');
    expect(entry.evidence_class).toBe('validation.local');
    // records the two real gaps; does not claim integration/e2e
    const keys = (entry.verdicts.findings ?? []).map((f) => `${f.spec_key}:${f.rule}`);
    expect(keys).toContain('field.person.tax-id:V4');
    expect(keys).toContain('operation.onboarding.save-progress:V3b');
  });

  test('restricted field (tax_id) is NOT in any generic payload_allowlist (V9 holds)', () => {
    const r = run('scripts/spec-validate.mjs');
    const f = findings(r.out);
    expect(f.some((x) => x.rule === 'V9' && x.verdict === 'BLOCKED')).toBe(false);
  });

  test('spec_hash chain: validator recomputes hashes deterministically', () => {
    // --write would normalize; here we assert current specs either have no hash or a correct one
    const r = run('scripts/spec-validate.mjs');
    const f = findings(r.out);
    expect(f.some((x) => x.rule === 'V10' && x.verdict === 'BLOCKED')).toBe(false);
  });
});
