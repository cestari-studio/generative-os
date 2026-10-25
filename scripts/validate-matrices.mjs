/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Matrix consistency validator (CI gate).
 *
 * Enforces the master directive §16.3:
 *  - registry-coverage-matrix.json counters must be internally consistent
 *    (e.g. with + without === total for each binding dimension);
 *  - canonical_counts entries must be MATCH with declared === reconciled;
 *  - route-page-matrix.md must not claim E2E_VERIFIED / ACCEPTED as an
 *    achieved status for any route (E2E requires a reproducible Preview +
 *    browser run, which is gated; prose mentions in negated context are
 *    allowed — this checks table-status cells only);
 *  - no status token may appear without the matrix files being in sync on
 *    the headline counters (features/pages/operations).
 *
 * Exit 0 on success, 1 with a clear message on any violation.
 */
import { readFileSync } from 'node:fs';

const failures = [];
const fail = (msg) => failures.push(msg);

// --- 1. registry-coverage-matrix.json internal consistency -----------------
const coverage = JSON.parse(readFileSync('docs/ui-rebuild/registry-coverage-matrix.json', 'utf8'));

const fbc = coverage.feature_binding_coverage;
if (!fbc) {
  fail('registry-coverage-matrix.json: feature_binding_coverage missing');
} else {
  const checks = [
    ['page_keys', fbc.with_page_keys, fbc.without_page_keys],
    ['operation_ids', fbc.with_operation_ids, fbc.without_operation_ids],
  ];
  for (const [name, w, wo] of checks) {
    if (typeof w !== 'number' || typeof wo !== 'number' || w + wo !== fbc.features_total) {
      fail(
        `feature_binding_coverage: with_${name} (${w}) + without_${name} (${wo}) !== features_total (${fbc.features_total})`,
      );
    }
  }
}

for (const [name, entry] of Object.entries(coverage.canonical_counts ?? {})) {
  // Status may carry an explanatory suffix (e.g. "MATCH (not in canonical 8)")
  // — what matters mechanically is that it asserts a match AND the counts agree.
  if (!String(entry.status).startsWith('MATCH') || entry.declared !== entry.reconciled) {
    fail(
      `canonical_counts.${name}: status=${entry.status} declared=${entry.declared} reconciled=${entry.reconciled} (expected MATCH with equal counts)`,
    );
  }
}

// --- 2. route-page-matrix.md: no achieved E2E_VERIFIED / ACCEPTED ----------
const rpm = readFileSync('docs/ui-rebuild/route-page-matrix.md', 'utf8');
// Status cells look like: | ... | **E2E_VERIFIED** | or **ACCEPTED**
const statusCellPattern = /\|\s*\*\*(E2E_VERIFIED|ACCEPTED)\*\*\s*\|/g;
const achieved = [...rpm.matchAll(statusCellPattern)];
if (achieved.length > 0) {
  fail(
    `route-page-matrix.md: ${achieved.length} route(s) claim achieved E2E_VERIFIED/ACCEPTED status. ` +
      'E2E requires a reproducible Preview environment and browser run (BLOCKED_OWNER). ' +
      'Downgrade to the honest status or attach per-SHA artifact evidence.',
  );
}

// --- 3. Headline counters agree between the two matrix files ---------------
const crosswalk = readFileSync('docs/ui-rebuild/functional-crosswalk.md', 'utf8');
const crosswalkCounters = crosswalk.match(/(\d+)\/225/g) ?? [];
const expectedCounters = new Set([`${fbc?.with_page_keys}/225`, `${fbc?.with_operation_ids}/225`]);
for (const counter of crosswalkCounters) {
  if (!expectedCounters.has(counter)) {
    fail(
      `functional-crosswalk.md mentions counter ${counter} that disagrees with registry-coverage-matrix.json ` +
        `(expected one of: ${[...expectedCounters].join(', ')}). Recompute, do not hand-edit.`,
    );
  }
}

// --- 4. feature-binding-ledger.json: statuses + evidence rules --------------
const ALLOWED_STATUSES = new Set([
  'UNMAPPED',
  'MAPPED_UNVERIFIED',
  'IMPLEMENTED',
  'INTEGRATION_VERIFIED',
  'E2E_VERIFIED',
  'BLOCKED_OWNER',
  'BLOCKED_SCHEMA',
  'DEFERRED_ADR',
]);

try {
  const ledger = JSON.parse(readFileSync('docs/ui-rebuild/feature-binding-ledger.json', 'utf8'));
  for (const slice of ledger.implemented_slices ?? []) {
    if (!ALLOWED_STATUSES.has(slice.status)) {
      fail(`feature-binding-ledger: slice "${slice.slice}" has invalid status "${slice.status}"`);
    }
    if (slice.status === 'E2E_VERIFIED') {
      fail(
        `feature-binding-ledger: slice "${slice.slice}" claims E2E_VERIFIED — E2E requires the reproducible Preview environment (BLOCKED_OWNER). Downgrade or attach per-SHA Preview artifact evidence.`,
      );
    }
    if (!Array.isArray(slice.tests) || slice.tests.length === 0) {
      fail(`feature-binding-ledger: slice "${slice.slice}" has no test evidence listed`);
    }
    if (!slice.last_verified_sha) {
      fail(`feature-binding-ledger: slice "${slice.slice}" missing last_verified_sha`);
    }
  }
  // Summary counters must match the actual slices
  const summary = ledger.summary ?? {};
  const actualSlices = (ledger.implemented_slices ?? []).length;
  if (summary.slices_implemented_destination !== actualSlices) {
    fail(
      `feature-binding-ledger: summary.slices_implemented_destination (${summary.slices_implemented_destination}) !== actual slices (${actualSlices})`,
    );
  }
  const actualE2E = (ledger.implemented_slices ?? []).filter((s) => s.status === 'E2E_VERIFIED').length;
  if (summary.slices_e2e_verified !== actualE2E) {
    fail(
      `feature-binding-ledger: summary.slices_e2e_verified (${summary.slices_e2e_verified}) !== actual (${actualE2E})`,
    );
  }
} catch (err) {
  if (err.code === 'ENOENT') {
    fail('feature-binding-ledger.json missing (required by directive §11)');
  } else {
    throw err;
  }
}

// --- Report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error('Matrix validation FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `Matrix validation OK: features ${fbc.with_page_keys}/${fbc.features_total} with pages, ` +
    `${fbc.with_operation_ids}/${fbc.features_total} with operations; ` +
    `${Object.keys(coverage.canonical_counts).length} canonical counts all MATCH; ` +
    'no achieved E2E_VERIFIED/ACCEPTED statuses claimed.',
);
