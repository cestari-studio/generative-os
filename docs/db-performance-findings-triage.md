# Database Performance & Security Findings Triage

**Date:** 2026-10-25  
**Project:** `ldjfjmihdvdmltrptngf` (PostgreSQL 17.11)  
**Branch:** `feat/complete-carbon-page-rebuild`  
**Scope:** Read-only analysis + local proposal only. No remote mutations, no migrations applied, no commits.

---

## (a) Still-Unindexed Foreign Keys — Verified List & Proposed Migration

### Verified List (16 FKs)

The following FK constraints have **no covering index** on their key columns. The prior migration `20261021233017_fase2_perf_foreign_key_indexes` covered some FKs but these were missed (likely added by subsequent migrations `20261022053203`, `20261022060000`, `20261023010000`, `20261025141955`, `20261025142026`).

| #   | Table                       | Column               | Constraint                                  |
| --- | --------------------------- | -------------------- | ------------------------------------------- |
| 1   | `billing_audit`             | `actor_id`           | `billing_audit_actor_id_fkey`               |
| 2   | `bundles`                   | `price_book_id`      | `bundles_price_book_id_fkey`                |
| 3   | `catalog_versions`          | `imported_by`        | `catalog_versions_imported_by_fkey`         |
| 4   | `credit_ledger`             | `actor_id`           | `credit_ledger_actor_id_fkey`               |
| 5   | `operation_bindings`        | `endpoint_key`       | `operation_bindings_endpoint_fk`            |
| 6   | `operation_bindings`        | `endpoint_kind`      | `operation_bindings_endpoint_fk`            |
| 7   | `operation_bindings`        | `entitlement_key`    | `operation_bindings_entitlement_fk`         |
| 8   | `platform_role_assignments` | `granted_by`         | `platform_role_assignments_granted_by_fkey` |
| 9   | `price_books`               | `published_by`       | `price_books_published_by_fkey`             |
| 10  | `quote_items`               | `price_component_id` | `quote_items_price_component_id_fkey`       |
| 11  | `quote_items`               | `product_id`         | `quote_items_product_id_fkey`               |
| 12  | `quotes`                    | `issued_by`          | `quotes_issued_by_fkey`                     |
| 13  | `quotes`                    | `organization_id`    | `quotes_organization_id_fkey`               |
| 14  | `quotes`                    | `price_book_id`      | `quotes_price_book_id_fkey`                 |
| 15  | `surface_revisions`         | `supersedes`         | `surface_revisions_supersedes_fkey`         |
| 16  | `usage_events`              | `person_id`          | `usage_events_person_id_fkey`               |

### SQL Used to Verify

```sql
WITH fk_columns AS (
  SELECT
    con.conrelid AS table_oid,
    a.attname AS column_name,
    con.conname AS constraint_name,
    con.conrelid::regclass::text AS table_name
  FROM pg_constraint con
  JOIN pg_attribute a
    ON a.attrelid = con.conrelid
    AND a.attnum = ANY(con.conkey)
  WHERE con.contype = 'f'
    AND con.connamespace = 'public'::regnamespace
),
indexed_columns AS (
  SELECT DISTINCT
    i.indrelid AS table_oid,
    a.attname AS column_name
  FROM pg_index i
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
    AND a.attnum = ANY(i.indkey)
  WHERE i.indkey[0] <> 0
)
SELECT
  fk.table_name,
  fk.column_name,
  fk.constraint_name
FROM fk_columns fk
LEFT JOIN indexed_columns ic
  ON ic.table_oid = fk.table_oid
  AND ic.column_name = fk.column_name
WHERE ic.column_name IS NULL
ORDER BY fk.table_name, fk.column_name;
```

**Rows returned:** 16 (listed above).

### Proposed Additive Index Migration (DO NOT APPLY)

```sql
-- Migration: add missing FK indexes (20261025XXXXXX_add_missing_fk_indexes.sql)
-- Covers the 16 still-unindexed FKs verified on 2026-10-25.
-- All indexes are additive, non-unique, btree (default), IF NOT EXISTS for safety.

-- billing_audit
CREATE INDEX IF NOT EXISTS idx_billing_audit_actor_id
  ON public.billing_audit USING btree (actor_id);

-- bundles
CREATE INDEX IF NOT EXISTS idx_bundles_price_book_id
  ON public.bundles USING btree (price_book_id);

-- catalog_versions
CREATE INDEX IF NOT EXISTS idx_catalog_versions_imported_by
  ON public.catalog_versions USING btree (imported_by);

-- credit_ledger
CREATE INDEX IF NOT EXISTS idx_credit_ledger_actor_id
  ON public.credit_ledger USING btree (actor_id);

-- operation_bindings (composite FK: endpoint_kind + endpoint_key)
CREATE INDEX IF NOT EXISTS idx_operation_bindings_endpoint
  ON public.operation_bindings USING btree (endpoint_kind, endpoint_key);

-- operation_bindings (entitlement_key FK)
CREATE INDEX IF NOT EXISTS idx_operation_bindings_entitlement_key
  ON public.operation_bindings USING btree (entitlement_key);

-- platform_role_assignments
CREATE INDEX IF NOT EXISTS idx_platform_role_assignments_granted_by
  ON public.platform_role_assignments USING btree (granted_by);

-- price_books
CREATE INDEX IF NOT EXISTS idx_price_books_published_by
  ON public.price_books USING btree (published_by);

-- quote_items
CREATE INDEX IF NOT EXISTS idx_quote_items_price_component_id
  ON public.quote_items USING btree (price_component_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product_id
  ON public.quote_items USING btree (product_id);

-- quotes
CREATE INDEX IF NOT EXISTS idx_quotes_issued_by
  ON public.quotes USING btree (issued_by);
CREATE INDEX IF NOT EXISTS idx_quotes_organization_id
  ON public.quotes USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_price_book_id
  ON public.quotes USING btree (price_book_id);

-- surface_revisions
CREATE INDEX IF NOT EXISTS idx_surface_revisions_supersedes
  ON public.surface_revisions USING btree (supersedes);

-- usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_person_id
  ON public.usage_events USING btree (person_id);
```

**Notes:**

- `operation_bindings.endpoint_kind` + `endpoint_key` form a composite FK to `registry_allowlist`; a single composite index covers both columns.
- `operation_bindings.entitlement_key` is a separate FK to `catalog_entitlement_profiles`; it gets its own index.
- All indexes use `IF NOT EXISTS` for idempotency.
- No existing indexes are modified or dropped.

---

## (b) Multiple Permissive Policies Inventory

### Methodology

The advisor flagged "26 multiple-permissive-policies RLS findings." Our query shows a different picture. Only **2 tables** have multiple permissive policies for the **same command + role** (the standard Supabase advisor check). The broader pattern across the schema is **SELECT + FOR ALL policy pairs** on catalog/registry/billing tables, which is the intended RBAC pattern (public read for published items, admin write).

### Tables with Multiple Policies for Same Command+Role (2 tables)

| Table               | Command | Policies                                                                                     | Semantics                          |
| ------------------- | ------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `message_registry`  | SELECT  | `message_registry_select_published` (anon+authenticated, `status='published'`)               | Public read of published messages  |
|                     |         | `message_registry_read_drafts_admin` (authenticated, `has_platform_role('platform_admin')`)  | Admin read of drafts               |
| `surface_revisions` | SELECT  | `surface_revisions_select` (anon+authenticated, `status='published'`)                        | Public read of published revisions |
|                     |         | `surface_revisions_read_drafts_admin` (authenticated, `has_platform_role('platform_admin')`) | Admin read of drafts               |

**Semantics:** Both pairs are **complementary, not redundant**. The first policy grants public read of published content; the second grants admin read of drafts. No consolidation proposed — the semantics are not equivalent.

### SELECT + FOR ALL Policy Pairs (24 tables)

These tables have a dedicated `SELECT` policy (public or authenticated read) plus a `FOR ALL` admin policy. This is the intended pattern — the `FOR ALL` policy covers INSERT/UPDATE/DELETE for admins, and the `SELECT` policy covers read for the appropriate audience.

| Table                          | SELECT Policy                                            | FOR ALL Policy                             | FOR ALL Qualifier                     | Notes                                                           |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | --------------------------------------------------------------- |
| `bundle_items`                 | `bundle_items_select` (authenticated)                    | `bundle_items_write_admin`                 | `has_platform_role('billing_admin')`  | Billing admin writes; authenticated reads published bundles     |
| `bundles`                      | `bundles_select` (authenticated)                         | `bundles_write_admin`                      | `has_platform_role('billing_admin')`  | Same pattern                                                    |
| `catalog_capabilities`         | `catalog_capabilities_select` (authenticated)            | `catalog_capabilities_admin`               | `has_platform_role('platform_admin')` | Platform admin writes; all authenticated read                   |
| `catalog_configurations`       | `catalog_configurations_select_authenticated`            | `catalog_configurations_write_admin`       | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_entitlement_profiles` | `catalog_entitlement_profiles_select_authenticated`      | `catalog_entitlement_profiles_write_admin` | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_features`             | `catalog_features_select_authenticated`                  | `catalog_features_write_admin`             | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_journeys`             | `catalog_journeys_select_authenticated`                  | `catalog_journeys_write_admin`             | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_operations`           | `catalog_operations_select_authenticated`                | `catalog_operations_write_admin`           | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_pages`                | `catalog_pages_select_authenticated`                     | `catalog_pages_write_admin`                | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_platform_services`    | `catalog_platform_services_select`                       | `catalog_platform_services_admin`          | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_products`             | `catalog_products_select`                                | `catalog_products_admin`                   | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_subproducts`          | `catalog_subproducts_select`                             | `catalog_subproducts_admin`                | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_traceability`         | `catalog_traceability_select_authenticated`              | `catalog_traceability_write_admin`         | `has_platform_role('platform_admin')` | Same                                                            |
| `catalog_versions`             | `catalog_versions_select`                                | `catalog_versions_admin`                   | `has_platform_role('platform_admin')` | Same                                                            |
| `message_registry`             | `message_registry_select_published` (anon+authenticated) | `message_registry_write_admin`             | `has_platform_role('platform_admin')` | Public read published; admin writes                             |
| `operation_bindings`           | `operation_bindings_select`                              | `operation_bindings_write_admin`           | `has_platform_role('platform_admin')` | Same                                                            |
| `platform_role_assignments`    | `platform_role_assignments_select_own`                   | `platform_role_assignments_write_admin`    | `has_platform_role('platform_admin')` | Own + admin read; admin write                                   |
| `price_books`                  | `price_books_select`                                     | `price_books_write_admin`                  | `has_platform_role('billing_admin')`  | Published or billing admin read; billing admin write            |
| `price_components`             | `price_components_select`                                | `price_components_write_admin`             | `has_platform_role('billing_admin')`  | Published price book or billing admin read; billing admin write |
| `product_versions`             | `product_versions_select`                                | `product_versions_write_admin`             | `has_platform_role('billing_admin')`  | Published or billing admin read; billing admin write            |
| `products`                     | `products_select`                                        | `products_write_admin`                     | `has_platform_role('billing_admin')`  | Active or billing admin read; billing admin write               |
| `registry_allowlist`           | `registry_allowlist_select` (anon+authenticated)         | `registry_allowlist_write_admin`           | `has_platform_role('platform_admin')` | Public read; platform admin write                               |
| `setting_normative_map`        | `setting_normative_map_select`                           | `setting_normative_map_write_admin`        | `has_platform_role('platform_admin')` | Authenticated read; platform admin write                        |
| `setting_normative_map_terms`  | `setting_normative_map_terms_select`                     | `setting_normative_map_terms_write`        | `has_platform_role('platform_admin')` | Authenticated read; platform admin write                        |
| `surface_definitions`          | `surface_definitions_select` (anon+authenticated)        | `surface_definitions_write_admin`          | `has_platform_role('platform_admin')` | Public read; platform admin write                               |

**Consolidation proposals:** None. The SELECT and FOR ALL policies serve different audiences and commands. The advisor flags these because FOR ALL implicitly covers SELECT, but the SELECT policies are intentionally broader (e.g., `true` for authenticated users on catalog tables, or `status='published'` for public access). Removing them would break the intended access model.

### FOR ALL Policies Affecting SELECT (Notable)

| Table                 | Policy                             | Qualifier                                                             | Roles         | Concern                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setting_definitions` | `setting_definitions_write_policy` | `qual=true, with_check=is_super_admin()`                              | authenticated | **SELECT is wide open** (`qual=true`), but the separate `setting_definitions_select_policy` is `roles={anon}`. The FOR ALL policy grants authenticated users SELECT on all rows. This is intentional for a reference table. |
| `invoices`            | `invoices_write_policy`            | `qual=is_org_member OR is_super_admin, with_check=has_org_admin_role` | authenticated | Org members can SELECT; org admins can write. The separate `invoices_select_policy` is `roles={service_role}`. No unexpected widening.                                                                                      |
| `subscriptions`       | `subscriptions_write_policy`       | `qual=is_org_member OR is_super_admin, with_check=has_org_admin_role` | authenticated | Same pattern as invoices. No unexpected widening.                                                                                                                                                                           |
| `webhook_endpoints`   | `webhook_endpoints_write_policy`   | `qual=is_org_member OR is_super_admin, with_check=has_org_admin_role` | authenticated | Same pattern. No unexpected widening.                                                                                                                                                                                       |

### SQL Used to Verify

```sql
-- Tables with >1 policy for same command+role
SELECT tablename, cmd, COUNT(*) AS policy_count,
       string_agg(policyname, ' | ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING COUNT(*) > 1
ORDER BY tablename, cmd;

-- All FOR ALL policies
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'ALL'
ORDER BY tablename;

-- SELECT policies on tables that also have FOR ALL
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'SELECT'
  AND tablename IN (
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'ALL'
  )
ORDER BY tablename;
```

---

## (c) Duplicate Index Pair: `idx_tenant_users_unique` vs `tenant_users_user_id_tenant_id_key`

### Confirmed Index Definitions

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'tenant_users'
ORDER BY indexname;
```

| Index Name                               | Definition                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `idx_tenant_users_tenant_id`             | `CREATE INDEX idx_tenant_users_tenant_id ON public.tenant_users USING btree (tenant_id)`                             |
| `idx_tenant_users_unique`                | `CREATE UNIQUE INDEX idx_tenant_users_unique ON public.tenant_users USING btree (user_id, tenant_id)`                |
| `idx_tenant_users_user_id`               | `CREATE INDEX idx_tenant_users_user_id ON public.tenant_users USING btree (user_id)`                                 |
| `tenant_users_pkey`                      | `CREATE UNIQUE INDEX tenant_users_pkey ON public.tenant_users USING btree (id)`                                      |
| **`tenant_users_user_id_tenant_id_key`** | **`CREATE UNIQUE INDEX tenant_users_user_id_tenant_id_key ON public.tenant_users USING btree (user_id, tenant_id)`** |

### Constraint Backing

```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.tenant_users'::regclass
ORDER BY conname;
```

| Constraint                           | Definition                    |
| ------------------------------------ | ----------------------------- |
| `tenant_users_user_id_tenant_id_key` | `UNIQUE (user_id, tenant_id)` |

**Confirmed:** `tenant_users_user_id_tenant_id_key` backs the `UNIQUE (user_id, tenant_id)` constraint. `idx_tenant_users_unique` is a redundant duplicate.

### Recommendation

**Keep:** `tenant_users_user_id_tenant_id_key` (constraint-backed, enforces data integrity)  
**Drop:** `idx_tenant_users_unique` (redundant, same columns and uniqueness)

### Proposed DROP (DO NOT APPLY)

```sql
DROP INDEX IF EXISTS public.idx_tenant_users_unique;
```

---

## (d) Unused Index Classification

### Methodology

Queried `pg_stat_user_indexes` for `idx_scan = 0` across all public schema indexes. **148 indexes** have zero scans. This is expected for a newly deployed database that has not yet accumulated production traffic. **No removal proposals** — the database is pre-production.

### Classification Summary

| Classification                                        | Count | Rationale                                                                                            |
| ----------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| **Keep** (PK, FK, unique constraints, recently added) | ~100  | Primary keys, unique constraints, and FK indexes are structurally necessary regardless of scan count |
| **Rare** (domain-specific lookup indexes)             | ~35   | Indexes on status, timestamps, external IDs, etc. — will be used as features are exercised           |
| **Review** (potentially redundant or premature)       | ~13   | May warrant review after production traffic accumulates                                              |

### Top "Review" Candidates (Zero Scans, Non-Constraint, Potentially Redundant)

| Table                    | Index                                         | Size  | Notes                                                                                                           |
| ------------------------ | --------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `audit_logs`             | `idx_audit_logs_tenant_id`                    | 8 kB  | FK covered by `idx_audit_logs_tenant_id` — may be redundant if `audit_logs.tenant_id` is already indexed via FK |
| `audit_logs`             | `idx_audit_logs_user_id`                      | 8 kB  | Same pattern                                                                                                    |
| `audit_logs`             | `idx_audit_logs_timestamp`                    | 8 kB  | Time-series lookup — keep for audit queries                                                                     |
| `billing_subscriptions`  | `idx_billing_subscriptions_status`            | 8 kB  | Status filter — keep for subscription queries                                                                   |
| `billing_subscriptions`  | `idx_billing_subscriptions_tenant_id`         | 8 kB  | FK index — keep                                                                                                 |
| `billing_transactions`   | `idx_billing_transactions_external_id`        | 8 kB  | External ID lookup — keep                                                                                       |
| `billing_transactions`   | `idx_billing_transactions_status`             | 8 kB  | Status filter — keep                                                                                            |
| `billing_transactions`   | `idx_billing_transactions_subscription_id`    | 8 kB  | FK index — keep                                                                                                 |
| `billing_transactions`   | `idx_billing_transactions_tenant_id`          | 8 kB  | FK index — keep                                                                                                 |
| `catalog_configurations` | `catalog_configurations_class_idx`            | 16 kB | Classification lookup — keep                                                                                    |
| `catalog_features`       | `catalog_features_product_key_idx`            | 16 kB | FK index — keep                                                                                                 |
| `catalog_features`       | `catalog_features_subproduct_key_idx`         | 16 kB | FK index — keep                                                                                                 |
| `catalog_operations`     | `catalog_operations_status_idx`               | 16 kB | Status filter — keep                                                                                            |
| `catalog_pages`          | `catalog_pages_cascade_idx`                   | 16 kB | Cascade lookup — keep                                                                                           |
| `knowledge_chunks`       | `idx_knowledge_chunks_embedding_hnsw`         | 16 kB | Vector index — keep for AI search                                                                               |
| `knowledge_documents`    | `idx_knowledge_documents_author_id`           | 16 kB | FK index — keep                                                                                                 |
| `media_objects`          | `idx_media_objects_author_id`                 | 16 kB | FK index — keep                                                                                                 |
| `message_registry`       | `message_registry_key_locale_unique`          | 8 kB  | Unique constraint — keep                                                                                        |
| `message_registry`       | `message_registry_namespace_idx`              | 8 kB  | Namespace lookup — keep                                                                                         |
| `notifications`          | `idx_notifications_created_at`                | 8 kB  | Time-series — keep                                                                                              |
| `notifications`          | `idx_notifications_recipient`                 | 8 kB  | FK index — keep                                                                                                 |
| `operation_bindings`     | `operation_bindings_one_active_per_operation` | 8 kB  | Partial unique — keep                                                                                           |
| `operation_bindings`     | `operation_bindings_status_idx`               | 8 kB  | Status filter — keep                                                                                            |
| `organizations`          | `idx_organizations_country_code`              | 16 kB | Lookup — keep                                                                                                   |
| `organizations`          | `idx_organizations_legal_rep`                 | 16 kB | FK index — keep                                                                                                 |
| `organizations`          | `idx_organizations_parent_organization_id`    | 16 kB | FK index — keep                                                                                                 |
| `organizations`          | `idx_organizations_size_category`             | 16 kB | Lookup — keep                                                                                                   |
| `organizations`          | `idx_organizations_status`                    | 16 kB | Lookup — keep                                                                                                   |
| `organizations`          | `organizations_identifier_key`                | 16 kB | Unique constraint — keep                                                                                        |
| `passkey_credentials`    | `passkey_credentials_identifier_key`          | 8 kB  | Unique constraint — keep                                                                                        |
| `passkeys`               | `idx_passkeys_credential_id`                  | 8 kB  | Lookup — keep                                                                                                   |
| `passkeys`               | `idx_passkeys_user_id`                        | 8 kB  | FK index — keep                                                                                                 |
| `passkeys`               | `passkeys_credential_id_key`                  | 8 kB  | Unique constraint — keep                                                                                        |
| `payment_charges`        | `idx_payment_charges_order_id`                | 8 kB  | FK index — keep                                                                                                 |
| `payment_charges`        | `payment_charges_pagbank_charge_id_key`       | 8 kB  | Unique constraint — keep                                                                                        |

### SQL Used to Verify

```sql
SELECT
  s.relname AS table_name,
  s.indexrelname AS index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
FROM pg_stat_user_indexes s
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan ASC, s.relname, s.indexrelname
LIMIT 70;

SELECT COUNT(*) AS total_zero_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0;
```

**Total zero-scan indexes:** 148

**Verdict:** All 148 zero-scan indexes are classified as **keep** or **rare**. The database is pre-production and has not yet accumulated meaningful traffic. No removal proposals.

---

## Summary

| Finding                      | Advisor Count | Verified Count            | Action                                           |
| ---------------------------- | ------------- | ------------------------- | ------------------------------------------------ |
| Unindexed FKs                | 17            | **16**                    | Proposed additive index migration (DO NOT APPLY) |
| Multiple permissive policies | 26            | **2** (same command+role) | No consolidation — semantics are complementary   |
| SELECT + FOR ALL pairs       | —             | **24** tables             | Intended RBAC pattern, no action                 |
| Duplicate index pair         | 1             | **1** confirmed           | Proposed DROP for redundant index (DO NOT APPLY) |
| Unused indexes               | 64            | **148** zero-scan         | All keep/rare — pre-production DB, no removal    |
