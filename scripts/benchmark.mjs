#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * LAB benchmark per route (NOT field data).
 *
 * Builds the production bundles, serves the SSR server, and measures
 * LCP / CLS / TTFB / load timings per route with Chromium tracing via
 * PerformanceObserver entries collected in-page. INP cannot be measured
 * without real user interaction — this harness reports TBT (total blocking
 * time) as a diagnostic proxy and labels it as such.
 *
 * Methodology is recorded in the output: environment, repetitions, warmup,
 * median + p75 per metric. Results are LAB data only; Core Web Vitals field
 * assessment requires RUM (not available — no Preview, no real users).
 *
 * Output: docs/ui-rebuild/benchmark/<sha>/results.json (gitignored artifact)
 * plus a console table. This does not fail the build — budgets are checked
 * separately once a baseline exists.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, platform, arch } from 'node:os';

const PORT = 5188;
const BASE = `http://localhost:${PORT}`;
const SHA = execSync('git rev-parse --short HEAD').toString().trim();
const OUT_DIR = join('docs', 'ui-rebuild', 'benchmark', SHA);

const ROUTES = ['/', '/dashboard', '/settings', '/knowledge', '/payments', '/products'];
const REPETITIONS = 5;
const WARMUP = 1;

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

const percentile = (sorted, p) => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
};

async function measureRoute(browser, route) {
  const samples = [];
  for (let i = 0; i < REPETITIONS + WARMUP; i += 1) {
    const page = await browser.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
      // Let LCP/CLS settle.
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out = { lcp: null, cls: 0, ttfb: null, fcp: null, domContentLoaded: null, load: null, tbt: 0 };
            try {
              const nav = performance.getEntriesByType('navigation')[0];
              if (nav) {
                out.ttfb = nav.responseStart;
                out.domContentLoaded = nav.domContentLoadedEventEnd;
                out.load = nav.loadEventEnd;
              }
              const paint = performance.getEntriesByType('paint');
              const fcp = paint.find((p) => p.name === 'first-contentful-paint');
              if (fcp) out.fcp = fcp.startTime;

              let lastLcp = null;
              new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) lastLcp = entries[entries.length - 1];
              }).observe({ type: 'largest-contentful-paint', buffered: true });

              let clsValue = 0;
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) clsValue += entry.value;
                }
              }).observe({ type: 'layout-shift', buffered: true });

              let tbt = 0;
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  tbt += Math.max(0, entry.duration - 50);
                }
              }).observe({ type: 'longtask', buffered: true });

              setTimeout(() => {
                out.lcp = lastLcp ? lastLcp.startTime : null;
                out.cls = clsValue;
                out.tbt = tbt;
                resolve(out);
              }, 300);
            } catch (err) {
              resolve({ ...out, error: String(err) });
            }
          }),
      );
      if (i >= WARMUP) samples.push(metrics);
    } catch (err) {
      if (i >= WARMUP) samples.push({ error: err.message.slice(0, 80) });
    } finally {
      await page.close();
    }
  }
  const valid = samples.filter((s) => !s.error && s.lcp !== null);
  const errors = samples.filter((s) => s.error);
  const summarize = (key) => {
    const values = valid
      .map((s) => s[key])
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    return {
      median: percentile(values, 50),
      p75: percentile(values, 75),
      min: values[0] ?? null,
      max: values[values.length - 1] ?? null,
      n: values.length,
    };
  };
  return {
    route,
    samples: valid.length,
    errors: errors.length,
    lcp_ms: summarize('lcp'),
    cls: summarize('cls'),
    ttfb_ms: summarize('ttfb'),
    fcp_ms: summarize('fcp'),
    load_ms: summarize('load'),
    tbt_ms_diagnostic: summarize('tbt'),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[benchmark] building production bundles...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`[benchmark] starting SSR server on :${PORT}...`);
  const server = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch();
    const results = {
      sha: SHA,
      measured_at: new Date().toISOString(),
      methodology: {
        type: 'LAB (synthetic, not field/RUM)',
        environment: `${platform()} ${arch()} (${hostname()})`,
        browser: 'Chromium (Playwright)',
        repetitions: REPETITIONS,
        warmup: WARMUP,
        network: 'localhost (no throttling)',
        note: 'LCP/CLS/TTFB from in-page PerformanceObserver; TBT reported as diagnostic proxy — INP requires real interaction and cannot be measured synthetically. Core Web Vitals field targets (p75: LCP 2.5s, INP 200ms, CLS 0.1) are NOT assessed by this lab run.',
      },
      routes: [],
    };

    for (const route of ROUTES) {
      const r = await measureRoute(browser, route);
      results.routes.push(r);
      const lcp = r.lcp_ms.p75 !== null ? `${Math.round(r.lcp_ms.p75)}ms` : 'n/a';
      const cls = r.cls.p75 !== null ? r.cls.p75.toFixed(3) : 'n/a';
      const ttfb = r.ttfb_ms.p75 !== null ? `${Math.round(r.ttfb_ms.p75)}ms` : 'n/a';
      console.log(
        `  ${route.padEnd(14)} LCP p75 ${lcp.padStart(8)}  CLS p75 ${String(cls).padStart(6)}  TTFB p75 ${ttfb.padStart(8)}  (n=${r.samples}, errors=${r.errors})`,
      );
    }

    await browser.close();
    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`[benchmark] results written to ${join(OUT_DIR, 'results.json')}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('[benchmark] FAILED:', err.message);
  process.exit(1);
});
