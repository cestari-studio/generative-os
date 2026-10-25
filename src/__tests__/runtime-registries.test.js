/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPONENT_REGISTRY,
  ENDPOINT_ALLOWLIST,
  listRegistryAllowlistEntries,
  ROUTE_ALLOWLIST,
  TEMPLATE_REGISTRY,
} from '../config/runtime-registries.js';
import { renderAllowlistSql } from '../../scripts/generate-registry-allowlist-sql.mjs';

describe('runtime registries (code-owned)', () => {
  it('keeps the physical route allowlist bounded to the existing surfaces', () => {
    expect(ROUTE_ALLOWLIST.map((r) => r.path)).toEqual([
      '/',
      '/dashboard',
      '/dashboard/:id',
      '/products',
      '/knowledge',
      '/payments',
      '/settings',
      '/onboarding',
      '/reset-password',
      '*',
    ]);
  });

  it('provides exactly the 9 authorized templates, all with implementations', () => {
    const templates = Object.entries(TEMPLATE_REGISTRY);
    expect(templates).toHaveLength(9);
    for (const [key, tpl] of templates) {
      expect(['implemented', 'tested']).toContain(tpl.status);
      expect(tpl.implementation).toBeTruthy();
      expect(Array.isArray(tpl.slots)).toBe(true);
      expect(key.startsWith('template.')).toBe(true);
    }
  });

  it('never marks a component implemented/tested without an implementation', () => {
    for (const [key, component] of Object.entries(COMPONENT_REGISTRY)) {
      if (['implemented', 'tested'].includes(component.status)) {
        expect(component.implementation, `${key} missing implementation`).toBeTruthy();
      }
    }
  });

  it('uses only key-safe identifiers across registries', () => {
    const keyPattern = /^[a-z0-9_./*:-]+$/;
    for (const entry of listRegistryAllowlistEntries()) {
      expect(entry.key).toMatch(keyPattern);
    }
  });

  it('keeps every route on an allowlisted template', () => {
    for (const route of ROUTE_ALLOWLIST) {
      expect(TEMPLATE_REGISTRY[route.templateKey], `${route.path} -> ${route.templateKey}`).toBeTruthy();
    }
  });

  it('endpoint allowlist only references real targets', () => {
    for (const [key, endpoint] of Object.entries(ENDPOINT_ALLOWLIST)) {
      expect(['edge_function', 'rpc', 'public_projection']).toContain(endpoint.kind);
      expect(endpoint.target).toBeTruthy();
      expect(key.endsWith(endpoint.target) || key.includes(endpoint.target)).toBe(true);
    }
  });
});

describe('registry_allowlist SQL mirror', () => {
  it('is byte-identical to a fresh regeneration (drift gate)', () => {
    const onDisk = readFileSync(join(__dirname, '..', '..', 'supabase', 'seed', 'registry-allowlist.sql'), 'utf8');
    expect(renderAllowlistSql()).toBe(onDisk);
  });
});
