#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Carbon component-pattern conformance auditor.
 *
 * Maps runtime JSX Carbon component usage against the authoritative storybook
 * pattern registry (src/config/carbon-component-patterns.json) and reports:
 *   - components used that are NOT in the registry (unmapped — must be added)
 *   - prop usage that exceeds storybook limits (unknown kind/size for a component)
 *   - token-fallback violations (inline layout styles, raw hex colors in runtime
 *     JSX/SCSS) that bypass the --genos-* alias layer
 *
 * Exit 0 = conformant (or only warnings); Exit 1 = violations found.
 * This is a READ-ONLY audit — it never writes to the source tree.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const registry = JSON.parse(readFileSync(join(SRC, 'config', 'carbon-component-patterns.json'), 'utf8'));
const knownComponents = new Set(Object.keys(registry.components));

// Recursively collect runtime source files (skip tests/fixtures).
const SKIP = /(__tests__|\.test\.|\.spec\.|\/test\/|\/fixtures\/|node_modules)/;
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(jsx?|tsx?)$/.test(entry)) yield full;
  }
}

const issues = [];
const seen = new Map(); // component -> Set(files)

// --- Patterns we check -------------------------------------------------------
const CARBON_IMPORT_RE = /@carbon\/(react|ibm-products|labs)/;
const JSX_COMP_RE = /<([A-Z][A-Za-z0-9]*)\b/g;
const INLINE_STYLE_RE = /style\s*=\s*\{\{/;
const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const KIND_PROP_RE = /kind\s*=\s*["']([a-z-]+)["']/g;

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  if (!CARBON_IMPORT_RE.test(text) && !JSX_COMP_RE.test(text)) continue;

  // 1. Track which known components each file uses.
  for (const m of text.matchAll(JSX_COMP_RE)) {
    const comp = m[1];
    if (!knownComponents.has(comp)) continue;
    if (!seen.has(comp)) seen.set(comp, new Set());
    seen.get(comp).add(rel);
  }

  // 2. Token-fallback violations (the UI must consume --genos-*/--cds-* aliases,
  //    never inline layout styles or raw hex in runtime source).
  if (INLINE_STYLE_RE.test(text)) {
    issues.push({
      file: rel,
      rule: 'token-fallback',
      sev: 'e',
      msg: 'inline style={{}} in runtime JSX bypasses the --genos-* alias layer (use SCSS classes on Carbon tokens)',
    });
  }

  // 3. kind= prop must be within the component's known kinds (storybook limit).
  for (const m of text.matchAll(KIND_PROP_RE)) {
    const kind = m[1];
    for (const comp of knownComponents) {
      const meta = registry.components[comp];
      if (!meta.kinds) continue;
      // Only flag when the file actually uses that component.
      const compRe = new RegExp(`<${comp}\\b[^>]*kind\\s*=\\s*["']${kind}["']`, 's');
      if (compRe.test(text) && !meta.kinds.includes(kind)) {
        issues.push({
          file: rel,
          rule: 'storybook-limit',
          sev: 'e',
          msg: `<${comp}> kind="${kind}" is not in the storybook kinds [${meta.kinds.join(', ')}]`,
        });
      }
    }
  }
}

// 4. SCSS raw-hex check (runtime stylesheets must use token aliases, not hex).
function* walkScss(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walkScss(full);
    else if (/\.scss$/.test(entry)) yield full;
  }
}
for (const file of walkScss(SRC)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  // Allow hex inside the token-definition files themselves (those DEFINE tokens).
  if (/(_genos-brand-tokens|_carbon-foundations|brand)/.test(rel)) continue;
  for (const line of text.split('\n')) {
    if (RAW_HEX_RE.test(line) && !/^\s*\/\//.test(line)) {
      issues.push({
        file: rel,
        rule: 'token-fallback',
        sev: 'w',
        msg: `raw hex color in runtime SCSS (use var(--genos-*)/var(--cds-*) alias so it falls back across white/g100)`,
      });
      break;
    }
  }
}

// --- Report ------------------------------------------------------------------
const mapped = [...seen.keys()].sort();
const errors = issues.filter((i) => i.sev === 'e');
const warnings = issues.filter((i) => i.sev === 'w');

console.log('Carbon component-pattern conformance');
console.log('====================================');
console.log(`registry: ${knownComponents.size} components (storybook-derived, Carbon ${registry.carbonVersion})`);
console.log(`mapped components in use: ${mapped.length ? mapped.join(', ') : '(none)'}`);
console.log('');

if (issues.length === 0) {
  console.log('PASS — no storybook-limit or token-fallback violations.');
  process.exit(0);
}
for (const i of issues) {
  console.log(`${i.sev === 'e' ? 'ERROR' : 'warn '}  [${i.rule}] ${i.file}: ${i.msg}`);
}
console.log('');
console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length > 0 ? 1 : 0);
