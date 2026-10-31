#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Spec Control Plane — evidence recorder.
 *
 * Appends an evidence entry (evidence.schema.json) to artifacts/evidence/,
 * linking spec_hash, generator_version, commit_sha, evidence_class, verdicts and
 * maturity. Optional fields (workflow_run_id, deployment_id, approval) are only
 * written when present — absence is recorded as its own state, never as success.
 *
 * Usage:
 *   node scripts/evidence-record.mjs --class validation.local --maturity NORMATIVE_ONLY \
 *     [--run <id>] [--deployment <id>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE_DIR = process.env.SPEC_EVIDENCE_OVERRIDE
  ? join(process.env.SPEC_EVIDENCE_OVERRIDE)
  : join(ROOT, 'artifacts/evidence');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const evidenceClass = get('--class') ?? 'validation.local';
const maturity = get('--maturity') ?? 'NORMATIVE_ONLY';

const commitSha =
  process.env.COMMIT_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const generatorVersion =
  JSON.parse(readFileSync(join(ROOT, 'generated/manifest.json'), 'utf8')).generator_version ?? 'unknown';
const specHash =
  JSON.parse(readFileSync(join(ROOT, 'generated/manifest.json'), 'utf8')).files?.[
    'form-definitions/onboarding.person.form.json'
  ] ?? null;

// Run G1 to capture verdicts
let verdicts = {};
try {
  const out = execFileSync('node', [join(ROOT, 'scripts/spec-validate.mjs')], {
    env: { ...process.env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  verdicts = {
    findings: out
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l)),
  };
} catch (e) {
  verdicts = {
    findings: (e.stdout ?? '')
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l)),
    exit: e.status,
  };
}

const entry = {
  spec_key: 'journey.onboarding.person',
  spec_version: '1.0.0',
  generator_version: generatorVersion,
  commit_sha: commitSha,
  evidence_class: evidenceClass,
  verdicts,
  maturity,
  blockers: (verdicts.findings ?? []).filter((f) => f.verdict === 'BLOCKED').map((f) => `${f.spec_key}:${f.rule}`),
  recorded_at: new Date().toISOString(),
};
if (specHash) entry.spec_hash = specHash;
if (get('--run')) entry.workflow_run_id = get('--run');
if (get('--deployment')) entry.deployment_id = get('--deployment');

// Validate against the evidence schema (fail-closed: never write invalid evidence)
const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(readFileSync(join(ROOT, 'specs/schemas/evidence.schema.json'), 'utf8'));
const validate = ajv.compile(schema);
if (!validate(entry)) {
  console.error('evidence entry failed schema validation:', ajv.errorsText(validate.errors));
  process.exit(1);
}

mkdirSync(EVIDENCE_DIR, { recursive: true });
const name = `${commitSha.slice(0, 12)}-${evidenceClass.replace(/\W+/g, '-')}.json`;
writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(entry, null, 2) + '\n', 'utf8');
console.log(`wrote ${join('artifacts/evidence', name)}`);
