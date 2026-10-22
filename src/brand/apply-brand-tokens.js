/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Applies authorized brand token overrides from the brand manifest.
 *
 * Only `--genos-*` custom properties may be overridden. Values are validated:
 * anything resembling CSS injection (`url(`, `expression(`, `;`, `{`, `}` or
 * `@`) is rejected, and invalid/unknown tokens are skipped so the alias layer
 * keeps falling back to the official Carbon tokens in both white and g100.
 */
import manifest from './brand-manifest.json';

const ALLOWED_TOKEN_RE = /^--genos-(color|space|radius|motion|brand)-[a-z0-9-]+$/;
const FORBIDDEN_VALUE_RE = /url\s*\(|expression\s*\(|[;{}@<>]/i;

export function isValidBrandTokenValue(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 128) return false;
  if (FORBIDDEN_VALUE_RE.test(trimmed)) return false;
  // Allow token references, colors, lengths, durations and plain keywords.
  return /^(var\(--[a-z0-9-]+\)|#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|-?\d+(\.\d+)?(px|rem|em|%|ms|s)?|[a-z-]+)$/i.test(
    trimmed,
  );
}

/**
 * @param {'light'|'dark'} mode - current theme mode
 * @param {object} [overrides] - optional override map (defaults to manifest)
 * @param {Element} [target] - element to receive the properties (defaults to document root)
 * @returns {{applied: string[], rejected: string[]}}
 */
export function applyBrandTokens(mode = 'light', overrides, target) {
  const applied = [];
  const rejected = [];
  if (typeof document === 'undefined') return { applied, rejected };

  const root = target ?? document.documentElement;
  const manifestOverrides = overrides ?? manifest.tokenOverrides?.[mode] ?? {};

  for (const [token, value] of Object.entries(manifestOverrides)) {
    if (!ALLOWED_TOKEN_RE.test(token) || !isValidBrandTokenValue(value)) {
      rejected.push(token);
      continue;
    }
    root.style.setProperty(token, String(value).trim());
    applied.push(token);
  }
  return { applied, rejected };
}

/** Removes all brand overrides so aliases fall back to Carbon tokens. */
export function clearBrandTokens(target) {
  if (typeof document === 'undefined') return;
  const root = target ?? document.documentElement;
  const knownTokens = new Set();
  for (const mode of ['light', 'dark']) {
    for (const token of Object.keys(manifest.tokenOverrides?.[mode] ?? {})) {
      knownTokens.add(token);
    }
  }
  // Also clear any --genos-* property currently set inline (e.g. applied this session).
  for (let i = root.style.length - 1; i >= 0; i -= 1) {
    const name = root.style.item(i);
    if (name.startsWith('--genos-')) knownTokens.add(name);
  }
  for (const token of knownTokens) {
    root.style.removeProperty(token);
  }
}

export const brandManifest = manifest;
