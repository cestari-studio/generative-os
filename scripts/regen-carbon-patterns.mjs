#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Carbon component-pattern registry — regen / drift validator.
 *
 * The registry (src/config/carbon-component-patterns.json) is CURATED: the
 * storybook path segment, scope, and conformance rules are maintained by hand
 * because the Carbon MCP index mixes feature-flag stories and fuzzy matches.
 * This script re-pulls the authoritative storybook variant data from the MCP
 * export (CARBON_PATTERNS_MCP_JSON) and:
 *
 *   --check (default): read-only drift report. Exit 1 if any curated component
 *                      is missing from the MCP data or its variant list drifted
 *                      beyond additions (i.e. a curated variant no longer exists
 *                      upstream). Additions upstream are reported as info.
 *   --write:           refresh ONLY the auto-derivable fields (variants[] and
 *                      generatedAt) from the MCP data, preserving every curated
 *                      field (storybookPath, scope, rules, kinds, sizes,
 *                      defaultVariant, tokenFallback). Never touches curation.
 *
 * Input: CARBON_PATTERNS_MCP_JSON must point to a JSON file produced from the
 * Carbon MCP code_search results, shaped as:
 *   { "ComponentName": { "variants": ["id", ...], "storybook_url": "..." } }
 * A companion helper (scripts/export-carbon-mcp.mjs) documents how to produce it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY_PATH = join(ROOT, 'src/config', 'carbon-component-patterns.json');
const mode = process.argv.includes('--write') ? 'write' : 'check';

const mcpPath = process.env.CARBON_PATTERNS_MCP_JSON;
if (!mcpPath) {
  console.error('ERROR: set CARBON_PATTERNS_MCP_JSON to the MCP export JSON (see scripts/export-carbon-mcp.mjs).');
  process.exit(2);
}

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
let mcp;
try {
  mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
} catch (e) {
  console.error(`ERROR: cannot read MCP export at ${mcpPath}: ${e.message}`);
  process.exit(2);
}

const drift = [];
const info = [];
let changed = false;

for (const [name, meta] of Object.entries(registry.components)) {
  const upstream = mcp[name];
  if (!upstream) {
    drift.push(`${name}: MISSING from MCP export (registry may reference a removed component)`);
    continue;
  }
  const upstreamVariants = new Set(upstream.variants ?? []);
  const curatedVariants = new Set(meta.variants ?? []);

  // Curated variants that no longer exist upstream = real drift (stale registry).
  const removed = [...curatedVariants].filter((v) => !upstreamVariants.has(v));
  // Upstream variants not yet curated = info (new Carbon stories to consider).
  const added = [...upstreamVariants].filter((v) => !curatedVariants.has(v));

  if (removed.length > 0) {
    drift.push(`${name}: curated variants no longer upstream -> [${removed.join(', ')}]`);
  }
  if (added.length > 0) {
    info.push(`${name}: ${added.length} new upstream variant(s) to review -> [${added.join(', ')}]`);
  }

  if (mode === 'write') {
    // Merge: keep curated order, append genuinely-new upstream variants, drop removed ones.
    const kept = (meta.variants ?? []).filter((v) => upstreamVariants.has(v));
    const merged = [...kept, ...added];
    if (JSON.stringify(merged) !== JSON.stringify(meta.variants)) {
      meta.variants = merged;
      changed = true;
    }
  }
}

console.log(`Carbon pattern registry — ${mode === 'write' ? 'REGEN' : 'DRIFT CHECK'}`);
console.log('=================================================');
for (const line of info) console.log(`info   ${line}`);
for (const line of drift) console.log(`DRIFT  ${line}`);

if (mode === 'write') {
  if (changed) {
    registry.generatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    console.log('\nRegistry variants refreshed (curation preserved).');
  } else {
    console.log('\nNo variant changes; registry already current.');
  }
  process.exit(0);
}

// check mode
if (drift.length > 0) {
  console.log(`\nFAIL — ${drift.length} drift item(s). Run with --write after reviewing, or fix curation.`);
  process.exit(1);
}
console.log(`\nPASS — registry variants match upstream (0 drift). ${info.length} addition(s) to review.`);
process.exit(0);
