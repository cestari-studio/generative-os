#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * axe-core automated accessibility audit per route (LOCAL gate — not the
 * manual WCAG 2.2 AA review, which remains a human gate for ACCEPTED).
 *
 * Starts the production SSR server, injects axe-core into each route, and
 * fails on any 'critical' or 'serious' violation. Minor/moderate findings
 * are reported but do not fail the gate. Results are written to
 * docs/ui-rebuild/axe/<sha>/results.json with per-route violation counts.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 5189;
const BASE = `http://localhost:${PORT}`;
const SHA = execSync('git rev-parse --short HEAD').toString().trim();
const OUT_DIR = join('docs', 'ui-rebuild', 'axe', SHA);

const ROUTES = ['/', '/dashboard', '/settings', '/knowledge', '/payments', '/onboarding', '/products'];
const FAIL_IMPACTS = new Set(['critical', 'serious']);

function waitForServer(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return resolve();
      } catch {
        // not ready
      }
      n += 1;
      if (n >= attempts) return reject(new Error('server did not start'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function main() {
  const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[axe] building production bundles...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`[axe] starting SSR server on :${PORT}...`);
  const server = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch();
    const results = { sha: SHA, audited_at: new Date().toISOString(), routes: [] };
    let failures = 0;

    for (const route of ROUTES) {
      const page = await browser.newPage();
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(800);
        await page.addScriptTag({ content: axeSource });
        const axeResults = await page.evaluate(async () => {
          // axe runs inside the page context
          return await window.axe.run(document, {
            resultTypes: ['violations'],
          });
        });
        const violations = axeResults.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length,
        }));
        const blocking = violations.filter((v) => FAIL_IMPACTS.has(v.impact));
        const nonBlocking = violations.filter((v) => !FAIL_IMPACTS.has(v.impact));
        failures += blocking.length;
        results.routes.push({ route, blocking, non_blocking: nonBlocking });
        console.log(
          `  ${blocking.length === 0 ? 'PASS' : 'FAIL'} ${route} — ${blocking.length} critical/serious, ${nonBlocking.length} minor/moderate`,
        );
        for (const v of blocking) {
          console.log(`      [${v.impact}] ${v.id}: ${v.description} (${v.nodes} nodes)`);
        }
      } catch (err) {
        failures += 1;
        results.routes.push({ route, error: err.message.slice(0, 120) });
        console.log(`  FAIL ${route} — audit error: ${err.message.slice(0, 120)}`);
      } finally {
        await page.close();
      }
    }

    await browser.close();
    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`[axe] results written to ${join(OUT_DIR, 'results.json')}`);

    if (failures > 0) {
      console.error(`[axe] FAILED: ${failures} critical/serious violation(s) across routes`);
      process.exit(1);
    }
    console.log(`[axe] OK: no critical/serious violations on ${ROUTES.length} routes`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('[axe] FAILED:', err.message);
  process.exit(1);
});
