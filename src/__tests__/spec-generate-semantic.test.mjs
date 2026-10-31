/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Semantic integrity for the spec generator — independent of the generator's own
 * reproducibility. Asserts the generated form-definition matches the normative
 * spec source (fields resolved by spec_key, metadata preserved), and that a
 * broken reference fails explicitly.
 */
import { test, expect, describe } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('spec generator — semantic integrity', () => {
  test('every step field reference resolves to a field spec (no unresolved:true)', () => {
    const form = JSON.parse(readFileSync(join(ROOT, 'generated/form-definitions/onboarding.person.form.json'), 'utf8'));
    for (const f of form.forms) {
      for (const field of f.fields) {
        expect(field.unresolved, `unresolved in ${f.step_key}`).toBeFalsy();
        expect(field.ref).toMatch(/^field\./);
        expect(field.field_key).toBeTruthy();
      }
    }
  });

  test('resolved fields carry metadata from the normative spec (component, label, required, classification)', () => {
    const form = JSON.parse(readFileSync(join(ROOT, 'generated/form-definitions/onboarding.person.form.json'), 'utf8'));
    const fullNameSpec = JSON.parse(readFileSync(join(ROOT, 'specs/fields/person.full-name.json'), 'utf8'));
    const taxIdSpec = JSON.parse(readFileSync(join(ROOT, 'specs/fields/person.tax-id.json'), 'utf8'));

    const allFields = form.forms.flatMap((f) => f.fields);
    const fullName = allFields.find((f) => f.ref === 'field.person.full-name');
    const taxId = allFields.find((f) => f.ref === 'field.person.tax-id');

    expect(fullName.field_key).toBe(fullNameSpec.field_key);
    expect(fullName.component).toBe(fullNameSpec.ui.component);
    expect(fullName.label_key).toBe(fullNameSpec.ui.label_key);
    expect(fullName.required).toBe(fullNameSpec.rules.required_when);
    expect(fullName.classification).toBe(fullNameSpec.privacy.classification);

    expect(taxId.field_key).toBe(taxIdSpec.field_key);
    expect(taxId.classification).toBe('restricted');
  });

  test('a broken field reference fails generation explicitly (not silently accepted)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'specgen-neg-'));
    cpSync(join(ROOT, 'specs'), dir, { recursive: true });
    const stepPath = join(dir, 'steps', 'onboarding.person.identity.json');
    const step = JSON.parse(readFileSync(stepPath, 'utf8'));
    step.fields.push('field.does.not.exist');
    writeFileSync(stepPath, JSON.stringify(step, null, 2));
    const r = run('scripts/spec-generate.mjs', [], {
      SPEC_DIR_OVERRIDE: dir,
      SPEC_GEN_OVERRIDE: join(tmpdir(), 'gen-neg-' + Date.now()),
    });
    expect(r.code).toBe(1);
  });

  test('spec:check is deterministic after regeneration', () => {
    const r = run('scripts/spec-generate.mjs', ['--check']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/up to date/);
  });

  test('duplicate field_key aliases emit each TS identifier once (red-team DEFECT 1, no TS2300)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'specgen-alias-'));
    cpSync(join(ROOT, 'specs'), dir, { recursive: true });
    // Add an alias field spec: same field_key as person.full_name, different spec_key.
    const alias = JSON.parse(readFileSync(join(ROOT, 'specs/fields/person.full-name.json'), 'utf8'));
    alias.spec_key = 'field.person.display-name';
    writeFileSync(join(dir, 'fields', 'person.display-name.json'), JSON.stringify(alias, null, 2));
    const genDir = mkdtempSync(join(tmpdir(), 'gen-alias-'));
    const r = run('scripts/spec-generate.mjs', [], { SPEC_DIR_OVERRIDE: dir, SPEC_GEN_OVERRIDE: genDir });
    expect(r.code).toBe(0);
    const types = readFileSync(join(genDir, 'types/spec-types.ts'), 'utf8');
    const occurrences = (types.match(/^export type person_full_name/gm) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
