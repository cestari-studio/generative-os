#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Theme screenshots (light/g10 "white" + dark/g100) per route and viewport
 * against a live Vercel Preview deployment — Phase 7 evidence.
 *
 * Captures each route at desktop/tablet/mobile in BOTH themes, into
 * docs/ui-rebuild/screenshots/<sha>/theme-<light|dark>/, with a manifest of
 * SHA, URL, route, viewport, theme, file and result. The Deployment
 * Protection automation bypass secret authenticates access (never printed).
 *
 * Required env: PREVIEW_URL, VERCEL_AUTOMATION_BYPASS_SECRET.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PREVIEW_URL = process.env.PREVIEW_URL;
const TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!PREVIEW_URL || !TOKEN) {
  console.error(
    '[theme-shots] FAILED: PREVIEW_URL and VERCEL_AUTOMATION_BYPASS_SECRET are required (never print the secret).',
  );
  process.exit(1);
}

const SHA = execSync('git rev-parse --short HEAD').toString().trim();
const ROUTES = ['/', '/dashboard', '/settings', '/knowledge', '/payments', '/products'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};
// data-theme-setting values from src/utils/theme.js: 'light' (g10/white) and
// 'dark' (g100). Named for the manifest as white/dark per the Phase 7 gap.
const THEMES = { white: 'light', dark: 'dark' };

async function main() {
  const browser = await chromium.launch();
  const manifest = {
    sha: SHA,
    url: PREVIEW_URL,
    captured_at: new Date().toISOString(),
    themes: Object.keys(THEMES),
    routes: [],
  };

  for (const [themeName, themeValue] of Object.entries(THEMES)) {
    const OUT_DIR = join('docs', 'ui-rebuild', 'screenshots', SHA, `theme-${themeName}`);
    mkdirSync(OUT_DIR, { recursive: true });

    for (const route of ROUTES) {
      for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        const context = await browser.newContext({
          extraHTTPHeaders: { 'x-vercel-protection-bypass': TOKEN },
          viewport: vp,
        });
        const page = await context.newPage();
        let result = 'captured';
        const file = `${route === '/' ? 'home' : route.slice(1).replace(/\//g, '_')}.${vpName}.png`;
        try {
          await page.goto(`${PREVIEW_URL}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
          // Force the theme deterministically (cookie + attribute, as the app does).
          await page.evaluate((theme) => {
            document.documentElement.setAttribute('data-theme-setting', theme);
          }, themeValue);
          await page.waitForTimeout(700);
          await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
          manifest.routes.push({
            route,
            viewport: vpName,
            theme: themeName,
            theme_setting: themeValue,
            file: join(`theme-${themeName}`, file),
            result,
          });
          console.log(`  ✓ [${themeName}] ${route} [${vpName}] → ${file}`);
        } catch (err) {
          result = `error: ${err.message.slice(0, 80)}`;
          manifest.routes.push({ route, viewport: vpName, theme: themeName, file: null, result });
          console.log(`  ✗ [${themeName}] ${route} [${vpName}] → ${result}`);
        }
        await context.close();
      }
    }
  }

  await browser.close();
  const OUT_MANIFEST = join('docs', 'ui-rebuild', 'screenshots', SHA, 'theme-manifest.json');
  mkdirSync(join('docs', 'ui-rebuild', 'screenshots', SHA), { recursive: true });
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  const errors = manifest.routes.filter((r) => r.result !== 'captured').length;
  console.log(
    `[theme-shots] ${manifest.routes.length - errors}/${manifest.routes.length} captured; manifest → ${OUT_MANIFEST}`,
  );
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[theme-shots] FAILED:', err.message);
  process.exit(1);
});
