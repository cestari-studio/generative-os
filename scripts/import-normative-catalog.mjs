#!/usr/bin/env node
/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Deterministic importer for the normative catalog (Phase 2).
 *
 * Reads the versioned registries of cestari-studio/genOS (READ-ONLY), validates
 * counts / key uniqueness / cross-references FAIL-CLOSED, and emits a
 * deterministic SQL seed for the seven normative catalog tables plus a
 * machine-readable report.
 *
 * Modes:
 *   node scripts/import-normative-catalog.mjs --source <genOS-clone-path>
 *       Validate + write supabase/seed/normative-catalog-seed.sql and
 *       docs/phase2-importer-report.json (mode: "generate").
 *
 *   node scripts/import-normative-catalog.mjs --source <path> --dsn <pg-uri> [--apply]
 *       Additionally diff against the target database (report mode "diff";
 *       with --apply, perform idempotent upserts). Running twice must report
 *       every record as "unchanged".
 *
 * Hard rules:
 *   - No network access; --source must be a local path.
 *   - The source repository is NEVER written to.
 *   - The source HEAD must equal the pinned SHA and the tree must be clean.
 *   - Existing target-native catalog tables (catalog_products/subproducts/
 *     capabilities/platform_services) are NEVER updated — divergences are
 *     reported as conflicts.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const PINNED_SOURCE_SHA = 'ffd97fa93ab425fff6bac5015d34944ef924090c';
const SOURCE_REPO = 'cestari-studio/genOS';

const EXPECTED = {
  catalog_features: 225,
  catalog_operations: 100,
  catalog_configurations: 200,
  catalog_pages: 60,
  catalog_journeys: 30,
  catalog_entitlement_profiles: 4,
  catalog_traceability: 225,
};

const SOURCE_FILES = {
  functionalCatalog: 'docs/specs/v0.9.0/genos-functional-catalog.v0.9.0.json',
  featureRegistry: 'docs/specs/v0.9.0/registries/feature-registry.json',
  productRegistry: 'docs/specs/v0.9.0/registries/product-registry.json',
  subproductRegistry: 'docs/specs/v0.9.0/registries/subproduct-registry.json',
  capabilityRegistry: 'docs/specs/v0.9.0/registries/capability-registry.json',
  serviceRegistry: 'docs/specs/v0.9.0/registries/platform-service-registry.json',
  journeyRegistry: 'docs/specs/v0.9.0/registries/journey-registry.json',
  entitlementRegistry: 'docs/specs/v0.9.0/registries/entitlement-registry.json',
  traceabilityMatrix: 'docs/specs/v0.9.0/registries/traceability-matrix.json',
  operationDisposition: 'docs/specs/v0.9.1/V010_OPERATION_DISPOSITION.v0.9.1.json',
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_OUT = join(__dirname, '..', 'supabase', 'seed', 'normative-catalog-seed.sql');
const REPORT_OUT = join(__dirname, '..', 'docs', 'phase2-importer-report.json');

function fail(message) {
  console.error(`IMPORT ABORTED (fail-closed): ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i];
    else if (arg === '--dsn') args.dsn = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (!args.source) fail('--source <genOS-clone-path> is required');
  if (/^https?:/i.test(args.source)) fail('--source must be a local path, never a URL');
  return args;
}

function git(sourceDir, gitArgs) {
  try {
    return execFileSync('git', ['-C', sourceDir, ...gitArgs], { encoding: 'utf8' }).trim();
  } catch (err) {
    fail(`git ${gitArgs.join(' ')} failed in ${sourceDir}: ${err.message}`);
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Stable stringify (sorted object keys, recursive) for canonical hashing. */
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function loadJson(sourceDir, relPath) {
  const full = join(sourceDir, relPath);
  let raw;
  try {
    raw = readFileSync(full, 'utf8');
  } catch {
    fail(`source file missing: ${relPath}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`source file is not valid JSON: ${relPath} (${err.message})`);
  }
}

function assertUnique(records, pickKey, label) {
  const seen = new Set();
  for (const record of records) {
    const key = pickKey(record);
    if (!key || typeof key !== 'string')
      fail(`${label}: record without a valid key (${JSON.stringify(record).slice(0, 120)})`);
    if (seen.has(key)) fail(`${label}: duplicate key "${key}"`);
    seen.add(key);
  }
  return seen;
}

function assertCount(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected exactly ${expected} records, found ${actual}`);
}

function main() {
  const args = parseArgs(process.argv);
  const sourceDir = resolve(args.source);

  // --- Source verification (read-only) -------------------------------------
  const headSha = git(sourceDir, ['rev-parse', 'HEAD']);
  if (headSha !== PINNED_SOURCE_SHA) {
    fail(`source HEAD ${headSha} does not equal pinned SHA ${PINNED_SOURCE_SHA}`);
  }
  const dirty = git(sourceDir, ['status', '--porcelain']);
  if (dirty !== '') fail(`source tree is not clean:\n${dirty}`);

  const blobShas = {};
  for (const [name, relPath] of Object.entries(SOURCE_FILES)) {
    blobShas[name] = git(sourceDir, ['hash-object', relPath]);
  }

  // --- Load ------------------------------------------------------------------
  const functionalCatalog = loadJson(sourceDir, SOURCE_FILES.functionalCatalog);
  const featureRegistry = loadJson(sourceDir, SOURCE_FILES.featureRegistry);
  const productRegistry = loadJson(sourceDir, SOURCE_FILES.productRegistry);
  const subproductRegistry = loadJson(sourceDir, SOURCE_FILES.subproductRegistry);
  const capabilityRegistry = loadJson(sourceDir, SOURCE_FILES.capabilityRegistry);
  const serviceRegistry = loadJson(sourceDir, SOURCE_FILES.serviceRegistry);
  const journeyRegistry = loadJson(sourceDir, SOURCE_FILES.journeyRegistry);
  const entitlementRegistry = loadJson(sourceDir, SOURCE_FILES.entitlementRegistry);
  const traceabilityMatrix = loadJson(sourceDir, SOURCE_FILES.traceabilityMatrix);

  const features = featureRegistry.features;
  const operations = functionalCatalog.operations;
  const configurations = functionalCatalog.configurations;
  const pages = functionalCatalog.pages;
  const journeys = journeyRegistry.journeys;
  const profiles = entitlementRegistry.profiles;
  const traceRows = traceabilityMatrix.rows;

  // --- Counts -----------------------------------------------------------------
  assertCount('features', features.length, EXPECTED.catalog_features);
  assertCount('operations', operations.length, EXPECTED.catalog_operations);
  assertCount('configurations', configurations.length, EXPECTED.catalog_configurations);
  assertCount('pages', pages.length, EXPECTED.catalog_pages);
  assertCount('journeys', journeys.length, EXPECTED.catalog_journeys);
  assertCount('entitlement_profiles', profiles.length, EXPECTED.catalog_entitlement_profiles);
  assertCount('traceability rows', traceRows.length, EXPECTED.catalog_traceability);

  // --- Key uniqueness -----------------------------------------------------------
  const featureKeys = assertUnique(features, (f) => f.feature_key, 'features');
  const operationKeys = assertUnique(operations, (o) => o['Operation ID'], 'operations');
  const configKeys = assertUnique(configurations, (c) => c.Key, 'configurations');
  assertUnique(pages, (p) => p.page_key, 'pages');
  assertUnique(journeys, (j) => j.journey_key || j.key, 'journeys');
  assertUnique(profiles, (p) => p.profile_key || p.key, 'entitlement_profiles');
  assertUnique(traceRows, (r) => r.feature_key, 'traceability rows');

  // --- Cross references ----------------------------------------------------------
  // Context registries are count-checked against the reconciliation table
  // (docs/phase2-source-reconciliation-report.md §2) and used for FK checks.
  assertCount('products (context)', productRegistry.products.length, 5);
  assertCount('subproducts (context)', subproductRegistry.subproducts.length, 30);
  assertCount('capabilities (context)', capabilityRegistry.capabilities.length, 9);
  assertCount('platform services (context)', serviceRegistry.services.length, 6);

  const productKeys = new Set(productRegistry.products.map((p) => p.product_key || p.key));
  const subproductKeys = new Set(subproductRegistry.subproducts.map((s) => s.subproduct_key || s.key));

  for (const feature of features) {
    if (feature.product_key && !productKeys.has(feature.product_key)) {
      fail(`feature ${feature.feature_key}: unknown product_key ${feature.product_key}`);
    }
    if (feature.subproduct_key && !subproductKeys.has(feature.subproduct_key)) {
      fail(`feature ${feature.feature_key}: unknown subproduct_key ${feature.subproduct_key}`);
    }
    for (const op of feature.operations || []) {
      const opId = typeof op === 'string' ? op : op?.operation_id || op?.['Operation ID'];
      if (opId && !operationKeys.has(opId)) {
        fail(`feature ${feature.feature_key}: unknown operation reference ${opId}`);
      }
    }
    for (const cfg of feature.configuration_keys || []) {
      if (!configKeys.has(cfg)) fail(`feature ${feature.feature_key}: unknown configuration_key ${cfg}`);
    }
  }
  for (const row of traceRows) {
    if (!featureKeys.has(row.feature_key)) fail(`traceability row references unknown feature_key ${row.feature_key}`);
  }

  // --- Records -------------------------------------------------------------------
  const provenanceFor = (fileKey, registryVersion) => ({
    source_repo: SOURCE_REPO,
    source_sha: headSha,
    source_path: SOURCE_FILES[fileKey],
    source_blob_sha: blobShas[fileKey],
    registry_version: registryVersion,
  });

  const records = {
    catalog_features: features.map((f) => ({
      key: f.feature_key,
      columns: {
        feature_key: f.feature_key,
        domain_type: f.domain_type || 'product',
        product_key: f.product_key || null,
        subproduct_key: f.subproduct_key || null,
        name: f.name,
        summary: (f.description || '').slice(0, 500) || null,
        payload: f,
        maturity: f.maturity || null,
      },
      content_hash: sha256(canonicalize(f)),
      source_provenance: provenanceFor('featureRegistry', featureRegistry.registry_version),
    })),
    catalog_operations: operations.map((o) => ({
      key: o['Operation ID'],
      columns: {
        operation_key: o['Operation ID'],
        domain: o['Domínio'] || null,
        access: o['Acesso'] || null,
        execution: o['Execução'] || null,
        bundle: o['Bundle/surface'] || null,
        summary: o['Responsabilidade'] || null,
        payload: o,
      },
      content_hash: sha256(canonicalize(o)),
      source_provenance: provenanceFor('functionalCatalog', functionalCatalog.catalog_version || '0.9.0'),
    })),
    catalog_configurations: configurations.map((c) => ({
      key: c.Key,
      columns: {
        config_key: c.Key,
        config_class: c['Classe'] || null,
        value_type: c['Tipo'] || null,
        default_value: c.Default === undefined || c.Default === null ? null : String(c.Default),
        allowed_scopes: c['Escopos permitidos'] || null,
        resolution: c['Resolução'] || null,
        purpose: c['Finalidade'] || null,
        payload: c,
      },
      content_hash: sha256(canonicalize(c)),
      source_provenance: provenanceFor('functionalCatalog', functionalCatalog.catalog_version || '0.9.0'),
    })),
    catalog_pages: pages.map((p) => ({
      key: p.page_key,
      columns: {
        page_key: p.page_key,
        route: p.route || null,
        label: p.label || null,
        purpose: p.purpose || null,
        cascade: p.cascade || null,
        payload: p,
      },
      content_hash: sha256(canonicalize(p)),
      source_provenance: provenanceFor('functionalCatalog', functionalCatalog.catalog_version || '0.9.0'),
    })),
    catalog_journeys: journeys.map((j) => ({
      key: j.journey_key || j.key,
      columns: {
        journey_key: j.journey_key || j.key,
        name: j.name || j.journey_key || j.key,
        summary: j.summary || j.description || null,
        payload: j,
      },
      content_hash: sha256(canonicalize(j)),
      source_provenance: provenanceFor('journeyRegistry', journeyRegistry.registry_version),
    })),
    catalog_entitlement_profiles: profiles.map((p) => ({
      key: p.profile_key || p.key,
      columns: {
        profile_key: p.profile_key || p.key,
        name: p.name || p.profile_key || p.key,
        summary: p.summary || p.description || null,
        payload: p,
      },
      content_hash: sha256(canonicalize(p)),
      source_provenance: provenanceFor('entitlementRegistry', entitlementRegistry.registry_version),
    })),
    catalog_traceability: traceRows.map((r) => ({
      key: r.feature_key,
      columns: {
        feature_key: r.feature_key,
        product_key: r.product_key || null,
        subproduct_key: r.subproduct_key || null,
        operation_keys: r.operation_keys || r.operations || [],
        page_keys: r.page_keys || r.pages || [],
        configuration_keys: r.configuration_keys || [],
        payload: r,
      },
      content_hash: sha256(canonicalize(r)),
      source_provenance: provenanceFor('traceabilityMatrix', traceabilityMatrix.registry_version),
    })),
  };

  // --- Deterministic SQL seed -----------------------------------------------------
  const jsonLit = (obj) => sqlLiteral(JSON.stringify(obj));
  const lines = [];
  lines.push('-- GENERATED FILE — DO NOT HAND-EDIT.');
  lines.push(`-- Source: ${SOURCE_REPO} @ ${headSha} (read-only)`);
  lines.push('-- Generator: scripts/import-normative-catalog.mjs');
  lines.push('-- Reconciliation: docs/phase2-source-reconciliation-report.md');
  lines.push('-- Idempotent: ON CONFLICT DO UPDATE only when content_hash differs.');
  lines.push('');

  const emitUpsert = (table, keyColumn, record) => {
    const cols = record.columns;
    const colNames = [...Object.keys(cols), 'content_hash', 'source_provenance'];
    const colValues = [
      ...Object.values(cols).map((v) => (v && typeof v === 'object' ? jsonLit(v) + '::jsonb' : sqlLiteral(v))),
      sqlLiteral(record.content_hash),
      jsonLit(record.source_provenance) + '::jsonb',
    ];
    const updates = colNames
      .filter((c) => c !== keyColumn)
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');
    lines.push(
      `INSERT INTO public.${table} (${colNames.join(', ')}) VALUES (${colValues.join(', ')}) ON CONFLICT (${keyColumn}) DO UPDATE SET ${updates} WHERE public.${table}.content_hash IS DISTINCT FROM EXCLUDED.content_hash;`,
    );
  };

  for (const [table, tableRecords] of Object.entries(records)) {
    const keyColumn = {
      catalog_features: 'feature_key',
      catalog_operations: 'operation_key',
      catalog_configurations: 'config_key',
      catalog_pages: 'page_key',
      catalog_journeys: 'journey_key',
      catalog_entitlement_profiles: 'profile_key',
      catalog_traceability: 'feature_key',
    }[table];
    lines.push(`-- ${table}: ${tableRecords.length} records`);
    const sorted = [...tableRecords].sort((a, b) => a.key.localeCompare(b.key));
    for (const record of sorted) emitUpsert(table, keyColumn, record);
    lines.push('');
  }

  writeFileSync(SEED_OUT, lines.join('\n'));

  const report = {
    mode: 'generate',
    generated_at: new Date().toISOString(),
    source: {
      repo: SOURCE_REPO,
      sha: headSha,
      blob_shas: blobShas,
      files: SOURCE_FILES,
    },
    validation: {
      counts: Object.fromEntries(Object.entries(records).map(([t, r]) => [t, r.length])),
      expected: EXPECTED,
      key_uniqueness: 'PASS',
      cross_references: 'PASS',
    },
    seed_file: 'supabase/seed/normative-catalog-seed.sql',
    seed_sha256: sha256(lines.join('\n')),
    diff: null,
  };

  // --- Optional DB diff/apply -------------------------------------------------------
  if (args.dsn) {
    report.mode = args.apply ? 'apply' : 'diff';
    report.diff = runDiff(args.dsn, records, args.apply).catch((err) => fail(`diff failed: ${err.message}`));
  }

  return report;
}

async function runDiff(dsn, records, apply) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dsn });
  await client.connect();
  try {
    const diff = {
      inserted: {},
      changed: {},
      unchanged: {},
      source_removed: {},
      conflicts: [],
    };
    const keyColumns = {
      catalog_features: 'feature_key',
      catalog_operations: 'operation_key',
      catalog_configurations: 'config_key',
      catalog_pages: 'page_key',
      catalog_journeys: 'journey_key',
      catalog_entitlement_profiles: 'profile_key',
      catalog_traceability: 'feature_key',
    };

    for (const [table, tableRecords] of Object.entries(records)) {
      const keyColumn = keyColumns[table];
      const existing = await client.query(`SELECT ${keyColumn} AS key, content_hash FROM public.${table}`);
      const existingByKey = new Map(existing.rows.map((r) => [r.key, r.content_hash]));
      const sourceKeys = new Set();

      for (const record of tableRecords) {
        sourceKeys.add(record.key);
        const existingHash = existingByKey.get(record.key);
        if (existingHash === undefined) {
          diff.inserted[table] = (diff.inserted[table] || 0) + 1;
        } else if (existingHash !== record.content_hash) {
          diff.changed[table] = (diff.changed[table] || 0) + 1;
        } else {
          diff.unchanged[table] = (diff.unchanged[table] || 0) + 1;
        }
      }
      for (const key of existingByKey.keys()) {
        if (!sourceKeys.has(key)) {
          diff.source_removed[table] = (diff.source_removed[table] || []).concat(key);
        }
      }
    }

    // Target-native tables: read-only reconciliation, never written.
    const nativeChecks = [
      ['catalog_products', 'key'],
      ['catalog_subproducts', 'key'],
      ['catalog_capabilities', 'key'],
      ['catalog_platform_services', 'key'],
    ];
    for (const [table, keyColumn] of nativeChecks) {
      const res = await client.query(`SELECT ${keyColumn} AS key FROM public.${table} ORDER BY 1`);
      diff.conflicts.push({ table, note: 'read-only reconciliation', existing_keys: res.rows.length });
    }

    if (apply) {
      const seedSql = readFileSync(SEED_OUT, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(seedSql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return diff;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const report = main();
    // diff is async when present; main() handles sync part only for generate mode.
    Promise.resolve(report.diff).then((resolved) => {
      if (resolved) report.diff = resolved;
      writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2) + '\n');
      console.log(`importer ${report.mode}: validation PASS`);
      console.log(`seed written: ${report.seed_file} (sha256 ${report.seed_sha256.slice(0, 16)}…)`);
      if (report.diff)
        console.log(
          `diff: ${JSON.stringify(report.diff.inserted)} inserted / ${JSON.stringify(report.diff.unchanged)} unchanged`,
        );
    });
  } catch (err) {
    fail(err.message);
  }
}
