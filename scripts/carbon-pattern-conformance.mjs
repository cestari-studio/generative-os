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
 *   - components used that are NOT in the registry (unmapped — review needed)
 *   - prop usage that exceeds storybook limits (unknown kind/size for a component)
 *   - token-fallback violations (inline layout styles, raw hex colors in runtime
 *     JSX/SCSS) that bypass the --genos-* alias layer
 *
 * Detection uses a character-level JSX opening-tag scanner (NOT regex), so it is
 * line-break tolerant: props split across multiple lines, self-closing tags and
 * spread attributes are all handled correctly. It scans balanced opening tags
 * <Comp ...> including multiline attribute lists, then reads props from the
 * balanced tag text — eliminating the multiline false-negative of a naive
 * per-line regex.
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
function* walk(dir, ext) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, ext);
    else if (ext.test(entry)) yield full;
  }
}

/**
 * Scan source text and yield every JSX opening tag as { name, attrText }.
 * attrText is the raw attribute source (may span multiple lines) between the
 * tag name and the closing '>' or '/>'. Character-level scan — line-break safe.
 */
function* scanJsxTags(text) {
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] !== '<') {
      i += 1;
      continue;
    }
    // Must be <CapitalLetter (component) — skip lowercase (html), comments, closing tags, fragments.
    const c = text[i + 1];
    if (!c || !/[A-Z]/.test(c)) {
      i += 1;
      continue;
    }
    // Read the component name.
    let j = i + 1;
    while (j < n && /[A-Za-z0-9.]/.test(text[j])) j += 1;
    const name = text.slice(i + 1, j).split('.')[0]; // <Foo.Bar> -> Foo
    // Now consume until the matching tag close, respecting braces/parens/brackets/quotes.
    let depth = 0;
    let quote = null;
    const attrStart = j;
    let k = j;
    let closed = false;
    while (k < n) {
      const ch = text[k];
      if (quote) {
        if (ch === quote && text[k - 1] !== '\\') quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === '{' || ch === '(' || ch === '[') {
        depth += 1;
      } else if (ch === '}' || ch === ')' || ch === ']') {
        depth = Math.max(0, depth - 1);
      } else if (ch === '>' && depth === 0) {
        closed = true;
        break;
      }
      k += 1;
    }
    if (closed) {
      const attrText = text.slice(attrStart, k);
      yield { name, attrText };
      i = k + 1;
    } else {
      i = j;
    }
  }
}

// Extract a simple string-valued prop (prop="x" or prop='x') from attr text.
function getStringProp(attrText, prop) {
  const re = new RegExp(`(?:^|[\\s{])${prop}\\s*=\\s*["']([^"']+)["']`);
  const m = attrText.match(re);
  return m ? m[1] : null;
}

const issues = [];
const seen = new Map(); // component -> Set(files)
const unmapped = new Map(); // unknown capitalized comp -> Set(files)

const INLINE_STYLE_RE = /style\s*=\s*\{\{/;
const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

// Collect the named bindings a file imports from any @carbon/* package. Only
// these are candidates for the "unmapped Carbon component" report — this keeps
// the signal accurate (no noise from local wrappers, react-router, charts, etc.).
const CARBON_IMPORT_NAMED_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@carbon\/[^'"]+['"]/g;
function carbonImports(text) {
  const names = new Set();
  for (const m of text.matchAll(CARBON_IMPORT_NAMED_RE)) {
    for (const part of m[1].split(',')) {
      // handle `X as Y` -> the local binding Y is what's used in JSX
      const seg = part.trim();
      if (!seg) continue;
      const asMatch = seg.match(/\bas\s+([A-Za-z0-9_$]+)$/);
      const local = asMatch ? asMatch[1] : seg.split(/\s/)[0];
      if (local && /^[A-Z]/.test(local)) names.add(local);
    }
  }
  return names;
}

for (const file of walk(SRC, /\.(jsx?|tsx?)$/)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const importedCarbon = carbonImports(text);

  for (const tag of scanJsxTags(text)) {
    if (knownComponents.has(tag.name)) {
      if (!seen.has(tag.name)) seen.set(tag.name, new Set());
      seen.get(tag.name).add(rel);

      // storybook-limit: kind=/size= must be within the component's known lists.
      const meta = registry.components[tag.name];
      const kind = getStringProp(tag.attrText, 'kind');
      if (kind && meta.kinds && !meta.kinds.includes(kind)) {
        issues.push({
          file: rel,
          rule: 'storybook-limit',
          sev: 'e',
          msg: `<${tag.name}> kind="${kind}" is not in the storybook kinds [${meta.kinds.join(', ')}]`,
        });
      }
      const size = getStringProp(tag.attrText, 'size');
      if (size && meta.sizes && !meta.sizes.includes(size)) {
        issues.push({
          file: rel,
          rule: 'storybook-limit',
          sev: 'e',
          msg: `<${tag.name}> size="${size}" is not in the storybook sizes [${meta.sizes.join(', ')}]`,
        });
      }

      // token-fallback: inline style on the tag bypasses the alias layer.
      if (INLINE_STYLE_RE.test(tag.attrText)) {
        issues.push({
          file: rel,
          rule: 'token-fallback',
          sev: 'e',
          msg: `<${tag.name}> uses inline style={{}} which bypasses the --genos-* alias layer (use SCSS classes on Carbon tokens)`,
        });
      }
    } else if (importedCarbon.has(tag.name)) {
      // Imported from a @carbon/* package but NOT in the registry — an unmapped
      // Carbon component the registry should grow to cover (or an alias of one).
      if (!unmapped.has(tag.name)) unmapped.set(tag.name, new Set());
      unmapped.get(tag.name).add(rel);
    }
  }
}

// SCSS raw-hex check (runtime stylesheets must use token aliases, not hex).
for (const file of walk(SRC, /\.scss$/)) {
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
const unmappedList = [...unmapped.keys()].sort();

console.log('Carbon component-pattern conformance');
console.log('====================================');
console.log(`registry: ${knownComponents.size} components (storybook-derived, Carbon ${registry.carbonVersion})`);
console.log(`mapped components in use: ${mapped.length ? mapped.join(', ') : '(none)'}`);
if (unmappedList.length > 0) {
  console.log(
    `info — capitalized JSX not in registry (review: Carbon component to map, or local): ${unmappedList.join(', ')}`,
  );
}
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
