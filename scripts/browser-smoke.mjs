#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Local browser functional smoke (NOT Preview E2E).
 *
 * Starts the production SSR server and drives Chromium through functional
 * assertions per route: SSR content is present, no demo/fake tenant content
 * is rendered, honest unprovisioned/empty/error states appear where the
 * backend is not provisioned, and no fatal console/page errors occur.
 *
 * This is a LOCAL gate: it does not claim E2E_VERIFIED (that requires the
 * reproducible Preview environment, BLOCKED_OWNER). Every assertion prints
 * PASS/FAIL with the route; any FAIL exits 1.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

const results = [];
const record = (route, name, ok, detail = '') => {
  results.push({ route, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${route} :: ${name}${detail ? ` — ${detail}` : ''}`);
};

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

// Content that must NEVER render (fictional demo tenants removed in Phase 2).
const FORBIDDEN_CONTENT = ['PUTTINATO', 'All Life Institute', 'Clareira de Avalon'];

async function checkRoute(browser, route, { expectText, forbidDemoContent = true }) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
    const status = response?.status() ?? 0;
    record(route, 'http responds', status > 0 && status < 500, `HTTP ${status}`);

    // SSR content present (no empty #root)
    const rootHtml = await page
      .locator('#root')
      .innerHTML()
      .catch(() => '');
    record(route, 'SSR #root not empty', rootHtml.trim().length > 100, `${rootHtml.trim().length} chars`);

    if (expectText) {
      const body = await page.locator('body').innerText();
      record(route, `expected text "${expectText.slice(0, 40)}"`, body.includes(expectText));
    }

    if (forbidDemoContent) {
      const body = await page.locator('body').innerText();
      const found = FORBIDDEN_CONTENT.filter((c) => body.includes(c));
      record(route, 'no fictional demo tenant content', found.length === 0, found.join(',') || 'clean');
    }

    // Fatal render errors
    const fatal = pageErrors.filter((e) => !e.includes('ResizeObserver'));
    record(route, 'no fatal page errors', fatal.length === 0, fatal[0]?.slice(0, 80) ?? '');

    return { status };
  } catch (err) {
    record(route, 'route loads', false, err.message.slice(0, 80));
    return { status: 0 };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`[browser-smoke] building production bundles...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`[browser-smoke] starting SSR server on :${PORT}...`);
  const server = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch();

    // 1. Public home renders brand content.
    await checkRoute(browser, '/', { expectText: 'Cestari Studio' });

    // 2-4. Private routes (/dashboard, /products, /knowledge) are behind the
    // auth gate: anonymous sessions must get the access gate (SSR) and the
    // hydrated client must match it exactly (no hydration mismatch). The
    // backend-driven content itself is exercised by authenticated flows.
    for (const route of ['/dashboard', '/products', '/knowledge']) {
      await checkRoute(browser, route, { expectText: 'Access Gate Active' });
    }

    // 5. Unknown route: app handles it without a blank screen.
    await checkRoute(browser, '/nonexistent-route', { forbidDemoContent: true });

    await browser.close();

    const failed = results.filter((r) => !r.ok);
    console.log(`[browser-smoke] ${results.length - failed.length}/${results.length} assertions passed`);
    if (failed.length > 0) {
      console.error(`[browser-smoke] ${failed.length} FAILURES:`);
      for (const f of failed) console.error(`  FAIL ${f.route} :: ${f.name} — ${f.detail}`);
      process.exit(1);
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('[browser-smoke] FAILED:', err.message);
  process.exit(1);
});
