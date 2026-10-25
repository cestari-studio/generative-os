#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * axe-core automated accessibility audit against a live Vercel Preview
 * deployment (protected). Uses the Deployment Protection automation bypass
 * secret via the `x-vercel-protection-bypass` header (never printed).
 *
 * This is PREVIEW E2E a11y (not local): the deployed artifact at an exact
 * SHA. Fails on any 'critical' or 'serious' violation. Results written to
 * docs/ui-rebuild/axe/preview-<sha>/results.json (gitignored).
 *
 * Required env: PREVIEW_URL, VERCEL_AUTOMATION_BYPASS_SECRET.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PREVIEW_URL = process.env.PREVIEW_URL;
const TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!PREVIEW_URL || !TOKEN) {
  console.error(
    '[preview-axe] FAILED: PREVIEW_URL and VERCEL_AUTOMATION_BYPASS_SECRET are required (never print the secret).',
  );
  process.exit(1);
}

const SHA = execSync('git rev-parse --short HEAD').toString().trim();
const OUT_DIR = join('docs', 'ui-rebuild', 'axe', `preview-${SHA}`);
const ROUTES = ['/', '/dashboard', '/settings', '/knowledge', '/payments', '/products'];
const FAIL_IMPACTS = new Set(['critical', 'serious']);

async function main() {
  const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const results = { url: PREVIEW_URL, sha: SHA, audited_at: new Date().toISOString(), routes: [] };
  let failures = 0;

  for (const route of ROUTES) {
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-vercel-protection-bypass': TOKEN },
    });
    const page = await context.newPage();
    try {
      await page.goto(`${PREVIEW_URL}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.addScriptTag({ content: axeSource });
      const axeResults = await page.evaluate(async () => {
        return await window.axe.run(document, { resultTypes: ['violations'] });
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
      await context.close();
    }
  }

  await browser.close();
  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`[preview-axe] results written to ${join(OUT_DIR, 'results.json')}`);

  if (failures > 0) {
    console.error(`[preview-axe] FAILED: ${failures} critical/serious violation(s)`);
    process.exit(1);
  }
  console.log(`[preview-axe] OK: no critical/serious violations on ${ROUTES.length} routes`);
}

main().catch((err) => {
  console.error('[preview-axe] FAILED:', err.message);
  process.exit(1);
});
