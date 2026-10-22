/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, describe } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_PATH = 'supabase/config.toml';
const FUNCTIONS_DIR = 'supabase/functions';

/** Minimal parser for `[functions.<name>]` sections and `verify_jwt` values. */
function parseFunctionsConfig(tomlText) {
  const result = {};
  let current = null;
  for (const rawLine of tomlText.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#') || line === '') continue;
    const sectionMatch = line.match(/^\[functions\.([a-z0-9-]+)\]$/i);
    if (sectionMatch) {
      current = sectionMatch[1];
      result[current] = {};
      continue;
    }
    if (line.startsWith('[')) {
      current = null;
      continue;
    }
    const kvMatch = line.match(/^verify_jwt\s*=\s*(true|false)$/i);
    if (kvMatch && current) {
      result[current].verify_jwt = kvMatch[1].toLowerCase() === 'true';
    }
  }
  return result;
}

function listFunctionDirs() {
  return readdirSync(FUNCTIONS_DIR).filter((entry) => {
    if (entry.startsWith('_') || entry.startsWith('.')) return false;
    return statSync(join(FUNCTIONS_DIR, entry)).isDirectory();
  });
}

describe('supabase/config.toml — per-function verify_jwt (regression gate)', () => {
  const toml = readFileSync(CONFIG_PATH, 'utf8');
  const config = parseFunctionsConfig(toml);

  test('project_id matches the generative-os target project', () => {
    expect(toml).toContain('project_id = "ldjfjmihdvdmltrptngf"');
  });

  test('every deployed function directory has an explicit config entry', () => {
    const dirs = listFunctionDirs();
    for (const dir of dirs) {
      expect(config, `missing [functions.${dir}] in supabase/config.toml`).toHaveProperty(dir);
      expect(typeof config[dir].verify_jwt, `verify_jwt not set for ${dir}`).toBe('boolean');
    }
  });

  test('authenticated user endpoints have verify_jwt = true', () => {
    for (const fn of ['passkey-auth', 'settings-cascade', 'vector-rag', 'pagbank-connect', 'pagbank-order']) {
      expect(config[fn]?.verify_jwt, `${fn} must require JWT`).toBe(true);
    }
  });

  test('only pagbank-webhook is unauthenticated at the JWT gateway', () => {
    expect(config['pagbank-webhook']?.verify_jwt).toBe(false);
    const openFunctions = Object.entries(config)
      .filter(([, v]) => v.verify_jwt === false)
      .map(([name]) => name);
    expect(openFunctions).toEqual(['pagbank-webhook']);
  });

  test('no redundant per-function config.toml files exist (single source of truth)', () => {
    for (const dir of listFunctionDirs()) {
      expect(
        existsSync(join(FUNCTIONS_DIR, dir, 'config.toml')),
        `remove supabase/functions/${dir}/config.toml — config belongs in supabase/config.toml`,
      ).toBe(false);
    }
  });
});
