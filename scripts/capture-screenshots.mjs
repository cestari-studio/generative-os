#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Local screenshot capture per route/viewport (Fase 7).
 * Starts the production SSR server, captures each route at desktop/tablet/
 * mobile viewports into docs/ui-rebuild/screenshots/<sha>/, and writes a
 * manifest with SHA, route, viewport, file and result. No PII/secrets.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const SHA = execSync('git rev-parse --short HEAD').toString().trim();
const OUT_DIR = join('docs', 'ui-rebuild', 'screenshots', SHA);

const ROUTES = [
  '/',
  '/dashboard',
  '/settings',
  '/knowledge',
  '/payments',
  '/onboarding',
  '/products',
  '/nonexistent-route',
];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

function waitForServer(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return resolve();
      } catch {
        // Server not ready yet — retry below.
      }
      n += 1;
      if (n >= attempts) return reject(new Error('server did not start'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[screenshots] building production bundles...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`[screenshots] starting SSR server on :${PORT}...`);
  const server = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch();
    const manifest = { sha: SHA, captured_at: new Date().toISOString(), routes: [] };

    for (const route of ROUTES) {
      for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        const page = await browser.newPage({ viewport: vp });
        let result = 'captured';
        try {
          const response = await page.goto(`${BASE}${route}`, {
            waitUntil: 'networkidle',
            timeout: 45000,
          });
          const status = response?.status();
          // settle theme/layout
          await page.waitForTimeout(800);
          const file = `${route === '/' ? 'home' : route.slice(1).replace(/\//g, '_')}.${vpName}.png`;
          await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
          manifest.routes.push({ route, viewport: vpName, http_status: status, file, result });
          console.log(`  ✓ ${route} [${vpName}] → ${file} (HTTP ${status})`);
        } catch (err) {
          result = `error: ${err.message.slice(0, 80)}`;
          manifest.routes.push({ route, viewport: vpName, http_status: null, file: null, result });
          console.log(`  ✗ ${route} [${vpName}] → ${result}`);
        }
        await page.close();
      }
    }

    await browser.close();
    writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`[screenshots] manifest written to ${join(OUT_DIR, 'manifest.json')}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('[screenshots] FAILED:', err.message);
  process.exit(1);
});
