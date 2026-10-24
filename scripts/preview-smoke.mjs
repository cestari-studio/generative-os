#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Preview E2E smoke against a live Vercel Preview deployment (protected).
 *
 * Drives Chromium against the Preview URL with the Deployment Protection
 * automation bypass secret via the `x-vercel-protection-bypass` header — the
 * documented method for automation against Vercel Authentication (SSO)
 * protected deployments. The secret is read from the environment
 * (VERCEL_AUTOMATION_BYPASS_SECRET) and NEVER printed or persisted.
 *
 * This is PREVIEW E2E (not local, not production): the deployed artifact at
 * an exact SHA, over the network, with the publishable Supabase env vars.
 * Assertions: HTTP status, non-empty SSR #root, expected anonymous content,
 * zero fictional demo tenant content, zero fatal page errors (incl. the
 * Supabase configuration error that must NOT appear).
 *
 * Required env:
 *   PREVIEW_URL                        the exact Preview deployment URL
 *   VERCEL_AUTOMATION_BYPASS_SECRET    the Deployment Protection automation
 *                                      bypass secret (never logged)
 */
import { chromium } from 'playwright';

const PREVIEW_URL = process.env.PREVIEW_URL;
const TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!PREVIEW_URL) {
  console.error('[preview-smoke] FAILED: PREVIEW_URL is required (the exact Preview deployment URL)');
  process.exit(1);
}
if (!TOKEN) {
  console.error(
    '[preview-smoke] FAILED: VERCEL_AUTOMATION_BYPASS_SECRET is required (Vercel Dashboard → Project Settings → Deployment Protection). Never print it.',
  );
  process.exit(1);
}

const results = [];
const record = (route, name, ok, detail = '') => {
  results.push({ route, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${route} :: ${name}${detail ? ` — ${detail}` : ''}`);
};

const FORBIDDEN_CONTENT = ['PUTTINATO', 'All Life Institute', 'Clareira de Avalon'];
// The Supabase config error from the env-var incident must never appear.
const FORBIDDEN_ERRORS = ['Supabase client configuration missing', 'configuration missing'];

async function checkRoute(browser, route, { expectText, forbidDemoContent = true }) {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': TOKEN,
    },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    const response = await page.goto(`${PREVIEW_URL}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    const status = response?.status() ?? 0;
    record(route, 'http responds', status > 0 && status < 500, `HTTP ${status}`);

    // Deployment protection must be bypassed (not stuck on the SSO page).
    const url = page.url();
    const onSso = url.includes('vercel.com/sso') || url.includes('/login');
    record(route, 'deployment protection bypassed', !onSso, onSso ? `stuck on ${url}` : 'app served');

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

    // Fatal errors: the Supabase config error + hydration failures must not appear.
    const fatal = pageErrors.filter((e) => !e.includes('ResizeObserver'));
    const configError = pageErrors.find((e) => FORBIDDEN_ERRORS.some((f) => e.includes(f)));
    record(route, 'no Supabase configuration error', !configError, configError ? 'CONFIG ERROR PRESENT' : 'clean');
    record(route, 'no fatal page errors', fatal.length === 0, fatal[0]?.slice(0, 80) ?? '');

    return { status };
  } catch (err) {
    record(route, 'route loads', false, err.message.slice(0, 80));
    return { status: 0 };
  } finally {
    await context.close();
  }
}

async function main() {
  console.log(`[preview-smoke] target: ${PREVIEW_URL}`);
  const browser = await chromium.launch();

  // 1. Public home renders brand content.
  await checkRoute(browser, '/', { expectText: 'Cestari Studio' });

  // 2-4. Private routes show the honest anonymous access gate.
  for (const route of ['/dashboard', '/products', '/knowledge']) {
    await checkRoute(browser, route, { expectText: 'Access Gate Active' });
  }

  // 5. Unknown route handled without a blank screen.
  await checkRoute(browser, '/nonexistent-route', { forbidDemoContent: true });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`[preview-smoke] ${results.length - failed.length}/${results.length} assertions passed`);
  if (failed.length > 0) {
    console.error(`[preview-smoke] ${failed.length} FAILURES:`);
    for (const f of failed) console.error(`  FAIL ${f.route} :: ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[preview-smoke] FAILED:', err.message);
  process.exit(1);
});
