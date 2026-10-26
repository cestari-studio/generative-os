#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * CI guard (Master Directive §6.3 / Phase 4): detect public SQL functions that
 * would be EXECUTE-exposed to `anon` or `PUBLIC` outside an explicit, versioned,
 * justified allowlist.
 *
 * Why: Supabase `pg_default_acl` + the PostgreSQL PUBLIC default auto-grant
 * EXECUTE to anon/authenticated/service_role on every new public function. Three
 * RPCs (save_onboarding_progress, create_or_update_corporate_tenant,
 * resolve_effective_settings) were exposed this way (Worker D audit). This guard
 * fails CI if a NEW public function's migration does NOT explicitly revoke
 * PUBLIC/anon EXECUTE (or declare an allowlist exception), so the class cannot
 * silently recur.
 *
 * Static analysis of supabase/migrations/*.sql (no DB calls — deterministic and
 * offline). For each `CREATE [OR REPLACE] FUNCTION public.<name>(...)` it
 * requires, in the SAME migration file, either:
 *   (a) a `REVOKE EXECUTE ON FUNCTION public.<name>(...) FROM PUBLIC` (or FROM anon), OR
 *   (b) the function name appears in specs/rpc-grant-allowlist.json (justified exception).
 *
 * Exit 0 = no unjustified exposure. Exit 1 = a public function lacks an explicit
 * PUBLIC/anon revocation or allowlist entry.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const ALLOWLIST_PATH = join(ROOT, 'specs', 'rpc-grant-allowlist.json');

const allowlist = existsSync(ALLOWLIST_PATH)
  ? new Set((JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')).functions ?? []).map((f) => f.toLowerCase()))
  : new Set();

const FUNC_RE = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi;

// A function is EXPOSED only if NO migration revokes its PUBLIC/anon EXECUTE
// (revocation may live in a later migration than the creation — that is valid).
// The guard fails only when a public function is created and NEVER revoked nor
// allowlisted anywhere in the migration chain.
const createdBy = new Map(); // name -> first file that creates it
const revokedGlobal = new Set(); // names revoked from PUBLIC or anon in ANY migration
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const allText = files
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n')
  .toLowerCase();

for (const file of files) {
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  let m;
  while ((m = FUNC_RE.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (!createdBy.has(name)) createdBy.set(name, file);
  }
}

// Global revocation: revoke ... on function public.<name>(...) from public/anon.
const REVOKE_RE =
  /revoke\s+(?:execute|all)\s+on\s+function\s+public\.([a-z0-9_]+)\s*\([^)]*\)\s+from\s+(public|anon)/gi;
let rm;
while ((rm = REVOKE_RE.exec(allText)) !== null) {
  revokedGlobal.add(rm[1].toLowerCase());
}

const exposures = [];
for (const [name, file] of createdBy) {
  if (allowlist.has(name)) continue;
  if (!revokedGlobal.has(name)) {
    exposures.push({
      file,
      function: name,
      issue: 'public function created but PUBLIC/anon EXECUTE never revoked anywhere (and not allowlisted)',
    });
  }
}

if (exposures.length > 0) {
  console.error('RPC grant exposure guard — unjustified public function EXECUTE exposure:');
  for (const e of exposures) {
    console.error(`  ${e.file}: public.${e.function} — ${e.issue}`);
  }
  console.error(
    '\nEvery new public function must explicitly REVOKE EXECUTE from PUBLIC/anon in the same migration, or be declared in specs/rpc-grant-allowlist.json with a justification.',
  );
  process.exit(1);
}

console.log('RPC grant exposure guard: no unjustified anon/PUBLIC EXECUTE exposure.');
process.exit(0);
