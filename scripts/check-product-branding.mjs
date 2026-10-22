#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Product branding & hardcoded-content gate (CI).
 *
 * Scans product source, locales and public assets for prohibited demo
 * identities, credentials, template copy and fabricated financial defaults.
 * Legal notices (LICENSE, copyright headers), dependency metadata and the
 * technical package names are allowlisted — we never rewrite license or
 * attribution text.
 *
 * Exit code 1 with path/line on any violation. Never prints secret values.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

/** Directories that hold product-facing code and copy. */
const SCAN_ROOTS = ['src', 'public'];

/** File extensions considered product surface. */
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.scss', '.css', '.md']);

/**
 * Allowlisted path fragments — legal notices, dependency metadata, test
 * fixtures and this gate itself. Matching is done on the POSIX relative path.
 */
const ALLOWLIST = [
  /(^|\/)LICENSE/,
  /(^|\/)NOTICE/,
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)node_modules\//,
  /(^|\/)src\/test\/fixtures\//,
  /(^|\/)scripts\/check-product-branding\.mjs$/,
  /(^|\/)docs\/ui-rebuild\//, // historical audit docs; governed separately
];

/**
 * Prohibited patterns. Each entry: [id, regex, message]. Regexes must be
 * specific enough to avoid matching legitimate technical references.
 */
const PROHIBITED = [
  ['demo-credential', /Carbon2026!/, 'hardcoded demo password'],
  ['demo-email', /architect@ibm\.com|anne\.profile@ibm\.com|ruth\.leach@ibm\.com/, 'demo identity email'],
  ['ibmid', /\bIBMid\b/, 'IBMid branding in product copy'],
  ['demo-identity-name', /\bRuth Leach\b|\bAnne Profile\b/, 'demo identity name'],
  ['demo-financial', /\bAcme Customer\b|customer@example\.com/, 'fabricated financial default'],
  ['demo-fetch-section', /An example of data fetching|Run the template/, 'starter-template copy'],
];

const violations = [];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (!SCAN_EXTENSIONS.has(extname(file))) continue;
    if (ALLOWLIST.some((re) => re.test(rel))) continue;

    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Copyright/license header lines are always allowlisted.
      if (/copyright|licensed under|apache-2\.0/i.test(line)) return;
      for (const [id, re, message] of PROHIBITED) {
        if (re.test(line)) {
          violations.push({ id, file: rel, line: idx + 1, message });
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`Product branding gate failed with ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  [${v.id}] ${v.file}:${v.line} — ${v.message}`);
  }
  process.exit(1);
}

console.log(
  'Product branding gate passed: no demo identities, credentials, template copy or fabricated defaults found.',
);
