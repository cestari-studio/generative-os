#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Generates the registry_allowlist seed SQL from the code-owned registries
 * (src/config/runtime-registries.js). The output is deterministic (stable
 * ordering, stable formatting) and carries provenance + checksum; the CI
 * drift test regenerates and compares byte-for-byte.
 *
 * Usage:
 *   node scripts/generate-registry-allowlist-sql.mjs [--check]
 *
 *   (default)  writes supabase/seed/registry-allowlist.sql
 *   --check    exits 1 if the checked-in file differs from a fresh render
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listRegistryAllowlistEntries, REGISTRY_VERSION } from '../src/config/runtime-registries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'supabase', 'seed', 'registry-allowlist.sql');

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function renderAllowlistSql() {
  const entries = listRegistryAllowlistEntries();
  const checksumInput = entries.map((e) => `${e.kind}|${e.key}|${e.status}`).join('\n');
  const checksum = createHash('sha256').update(checksumInput).digest('hex');

  const lines = [];
  lines.push('-- GENERATED FILE — DO NOT HAND-EDIT.');
  lines.push('-- Source of authority: src/config/runtime-registries.js');
  lines.push(`-- Registry version: ${REGISTRY_VERSION}`);
  lines.push(`-- Content checksum (sha256 over kind|key|status rows): ${checksum}`);
  lines.push('-- Regenerate: node scripts/generate-registry-allowlist-sql.mjs');
  lines.push('');
  lines.push('-- Upsert-only sync: referenced entries are never deleted by regeneration.');
  lines.push('-- Removing a stale entry is a deliberate admin operation (FK-guarded).');
  for (const entry of entries) {
    lines.push(
      `INSERT INTO public.registry_allowlist (kind, key, status, registry_version, content_checksum) VALUES (${sqlLiteral(entry.kind)}, ${sqlLiteral(entry.key)}, ${sqlLiteral(entry.status)}, ${sqlLiteral(REGISTRY_VERSION)}, ${sqlLiteral(checksum)}) ON CONFLICT (kind, key) DO UPDATE SET status = EXCLUDED.status, registry_version = EXCLUDED.registry_version, content_checksum = EXCLUDED.content_checksum, synced_at = now();`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const rendered = renderAllowlistSql();
  if (process.argv.includes('--check')) {
    let current = null;
    try {
      current = readFileSync(OUT_PATH, 'utf8');
    } catch {
      current = null;
    }
    if (current !== rendered) {
      console.error('registry-allowlist.sql is STALE — run: node scripts/generate-registry-allowlist-sql.mjs');
      process.exit(1);
    }
    console.log('registry-allowlist.sql is in sync with src/config/runtime-registries.js');
  } else {
    writeFileSync(OUT_PATH, rendered);
    console.log(`wrote ${OUT_PATH} (${rendered.split('\n').length} lines)`);
  }
}
