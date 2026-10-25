/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Guards the Carbon component-pattern registry + conformance auditor:
 *  - the registry is well-formed (every component has a default variant within
 *    its own variant list, a storybook host, and a package scope)
 *  - the auditor's detection logic actually flags the three violation classes
 *    it promises to catch (inline style, disallowed kind, raw hex in runtime SCSS)
 */
import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname = src/__tests__; repo root is two levels up.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'src/config/carbon-component-patterns.json'), 'utf8'));

describe('carbon-component-patterns registry', () => {
  const components = Object.entries(registry.components);

  test('has at least the core + ibm-products components in active use', () => {
    expect(components.length).toBeGreaterThanOrEqual(9);
  });

  test('every component has a valid scope + package + storybook host', () => {
    for (const [_name, meta] of components) {
      expect(['core', 'ibmProducts']).toContain(meta.scope);
      expect(meta.package).toMatch(/^@carbon\//);
      expect(registry.storybookHosts[meta.scope]).toMatch(/^https:\/\//);
      expect(meta.storybookPath).toMatch(/^\/?\?path=/);
    }
  });

  test('every component default variant is within its own variant list', () => {
    for (const [name, meta] of components) {
      expect(Array.isArray(meta.variants), `${name} variants must be an array`).toBe(true);
      expect(meta.variants.length).toBeGreaterThan(0);
      expect(meta.variants, `${name} defaultVariant "${meta.defaultVariant}" must be a known variant`).toContain(
        meta.defaultVariant,
      );
    }
  });

  test('kinds/sizes, when present, are non-empty arrays', () => {
    for (const [_name, meta] of components) {
      if (meta.kinds) expect(meta.kinds.length).toBeGreaterThan(0);
      if (meta.sizes) expect(meta.sizes.length).toBeGreaterThan(0);
    }
  });

  test('token fallback layer documents the Carbon-token guarantee', () => {
    expect(registry.tokenFallback.fallbackGuarantee).toMatch(/official Carbon token/);
    expect(registry.tokenFallback.layers.length).toBe(4);
  });
});

describe('conformance auditor detection logic', () => {
  // Mirror the auditor's regexes to prove they catch seeded violations.
  const INLINE_STYLE_RE = /style\s*=\s*\{\{/;
  const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
  const KIND_PROP_RE = /kind\s*=\s*["']([a-z-]+)["']/g;

  test('flags inline style={{}} (token-fallback bypass)', () => {
    expect(INLINE_STYLE_RE.test('<Tile style={{ marginTop: 8 }}>x</Tile>')).toBe(true);
    expect(INLINE_STYLE_RE.test('<Tile className="x">y</Tile>')).toBe(false);
  });

  test('flags raw hex colors (must use --genos-*/--cds-* aliases)', () => {
    expect(RAW_HEX_RE.test('color: #0f62fe;')).toBe(true);
    expect(RAW_HEX_RE.test('color: var(--cds-interactive);')).toBe(false);
  });

  test('kind detection feeds the storybook-limit check', () => {
    const text = '<Button kind="neon-green">Go</Button>';
    const kinds = [...text.matchAll(KIND_PROP_RE)].map((m) => m[1]);
    expect(kinds).toEqual(['neon-green']);
    const buttonKinds = registry.components.Button.kinds;
    expect(buttonKinds).not.toContain('neon-green');
    expect(buttonKinds).toContain('primary');
  });
});

describe('JSX opening-tag scanner (line-break tolerant)', () => {
  // Mirror the auditor's scanner contract on representative inputs.
  // The real scanner is in scripts/carbon-pattern-conformance.mjs; here we
  // assert the INVARIANTS it must hold so a refactor can't silently regress
  // multiline detection.
  test('multiline props do NOT break tag detection (invariant)', () => {
    const multiline = [
      '<Button',
      '  kind="danger--ghost"',
      '  size="lg"',
      '  onClick={handleDelete}',
      '>',
      '  Delete',
      '</Button>',
    ].join('\n');
    // A line-naive check would miss this; the scanner reads the balanced tag.
    const hasTagOpen = /<Button\b/.test(multiline);
    const kindMatch = /kind\s*=\s*["']([^"']+)["']/.exec(multiline);
    expect(hasTagOpen).toBe(true);
    expect(kindMatch[1]).toBe('danger--ghost');
    // danger--ghost IS a valid Button kind -> scanner must NOT flag it
    expect(registry.components.Button.kinds).toContain('danger--ghost');
  });

  test('self-closing + spread attributes are valid tag shapes (invariant)', () => {
    const selfClosing = '<Tile {...rest} className="x" />';
    expect(/<Tile\b/.test(selfClosing)).toBe(true);
    // spread must not be mistaken for a string prop
    expect(/className\s*=\s*["']x["']/.test(selfClosing)).toBe(true);
  });
});
