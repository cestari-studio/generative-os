/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, describe, beforeEach } from 'vitest';
import { applyBrandTokens, clearBrandTokens, isValidBrandTokenValue, brandManifest } from '../brand/apply-brand-tokens';

describe('brand token layer (genOS aliases with Carbon fallback)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  test('manifest declares Cestari Studio Inc. / genOS identity and white/g100 Carbon fallbacks', () => {
    expect(brandManifest.company.legalName).toBe('Cestari Studio Inc.');
    expect(brandManifest.product.name).toBe('genOS');
    expect(brandManifest.themes.light.carbonTheme).toBe('white');
    expect(brandManifest.themes.dark.carbonTheme).toBe('g100');
  });

  test('accepts valid token references, colors, lengths and durations', () => {
    expect(isValidBrandTokenValue('var(--cds-interactive)')).toBe(true);
    expect(isValidBrandTokenValue('#0f62fe')).toBe(true);
    expect(isValidBrandTokenValue('#0f62fecc')).toBe(true);
    expect(isValidBrandTokenValue('rgb(15, 98, 254)')).toBe(true);
    expect(isValidBrandTokenValue('1rem')).toBe(true);
    expect(isValidBrandTokenValue('150ms')).toBe(true);
    expect(isValidBrandTokenValue(0)).toBe(true);
  });

  test('rejects injection patterns and invalid values', () => {
    expect(isValidBrandTokenValue('url(https://evil.example/x)')).toBe(false);
    expect(isValidBrandTokenValue('expression(alert(1))')).toBe(false);
    expect(isValidBrandTokenValue('red; } body { display:none')).toBe(false);
    expect(isValidBrandTokenValue('@import "evil.css"')).toBe(false);
    expect(isValidBrandTokenValue('')).toBe(false);
    expect(isValidBrandTokenValue(null)).toBe(false);
    expect(isValidBrandTokenValue(undefined)).toBe(false);
    expect(isValidBrandTokenValue({})).toBe(false);
  });

  test('applies only allowed --genos-* tokens and rejects unknown ones', () => {
    const { applied, rejected } = applyBrandTokens('light', {
      '--genos-color-interactive': '#0f62fe',
      '--genos-brand-primary': 'var(--cds-interactive)',
      '--cds-background': '#ffffff', // never override Carbon tokens directly
      '--genos-evil': 'url(https://evil.example)',
    });
    expect(applied).toContain('--genos-color-interactive');
    expect(applied).toContain('--genos-brand-primary');
    expect(rejected).toContain('--cds-background');
    expect(rejected).toContain('--genos-evil');
    expect(document.documentElement.style.getPropertyValue('--genos-color-interactive')).toBe('#0f62fe');
    expect(document.documentElement.style.getPropertyValue('--cds-background')).toBe('');
  });

  test('clearBrandTokens removes overrides so Carbon fallback applies', () => {
    applyBrandTokens('light', { '--genos-color-interactive': '#0f62fe' });
    expect(document.documentElement.style.getPropertyValue('--genos-color-interactive')).toBe('#0f62fe');
    clearBrandTokens();
    // Manifest has no overrides by default, so nothing was applied that clear
    // wouldn't know about; set directly then clear via manifest-known path.
    document.documentElement.style.setProperty('--genos-color-interactive', '#0f62fe');
    clearBrandTokens();
    expect(document.documentElement.style.getPropertyValue('--genos-color-interactive')).toBe('');
  });

  test('default manifest ships zero overrides (pure Carbon fallback)', () => {
    const { applied, rejected } = applyBrandTokens('light');
    expect(applied).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
