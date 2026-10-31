# RPC Grants + SECURITY DEFINER Audit

| Field         | Value                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date          | 2026-10-25                                                                                                                                                             |
| Auditor       | Worker D (subagent, read-only analysis + local proposal)                                                                                                               |
| Repo / branch | `/Users/cestari/generative-os` @ `feat/complete-carbon-page-rebuild`, HEAD `dc61055` (2026-10-25)                                                                      |
| Target DB     | Supabase project `ldjfjmihdvdmltrptngf`, PostgreSQL **17.11** (confirmed via `current_setting('server_version')`)                                                      |
| Mode          | **READ-ONLY.** No remote mutation, no migration applied, no commit. The migration in §5 is a _proposal_ requiring explicit owner approval per `AGENTS.md` hard rule 1. |

Applied migrations on the remote (25, via MCP `list_migrations`): `20261016144033` … `20261025142026` (latest `20261025142026_web_surface_configuration`). Notably already applied and relevant here: `20261021022752_revoke_anon_execute_security_definer_rpcs`, `20261021231106_fase0_security_definer_and_tenant_hardening`, `20261021233211_fase1_revoke_anon_from_app_private`, `20261022002300_fase2_harden_pagbank_rpc_and_remove_realtime_pub`, `20261022053203_billing_pricebook_usage_metering`, `20261024064601_org_hierarchy_security_definer_fix`.

---

## 1. Method

### 1.1 Live introspection SQL (exact statements run via `tools.supabase.execute_sql`, read-only)

**Q1 — signatures, security mode, owner, `search_path`, raw ACL, effective EXECUTE privileges** (run twice: once for the 3 reported-anon RPCs, once for the 13 DEFINER functions):

```sql
SELECT p.oid::regprocedure::text AS signature,
       n.nspname AS schema,
       p.prosecdef AS security_definer,
       r.rolname AS owner,
       p.proconfig,
       p.proacl::text AS proacl,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_exec,
       has_function_privilege('public',        p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r     ON r.oid = p.proowner
WHERE p.proname IN ( /* 'create_or_update_corporate_tenant','save_onboarding_progress','resolve_effective_settings' */
                     /* or the 13 SECURITY DEFINER names */ )
  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\' AND n.nspname <> 'information_schema'
ORDER BY 1;
```

Note: `has_function_privilege` requires the pseudo-role keyword as lowercase `'public'`; uppercase `'PUBLIC'` errors with `42704: role "PUBLIC" does not exist` on this server.

**Q2 — bodies** (per batch): `SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','app_private') AND p.proname IN (...)` — bodies were read in full; `auth.uid()` / membership markers below were verified against the returned text, not guessed.

**Q3 — default privileges (root cause of the anon/PUBLIC exposure)**:

```sql
SELECT pg_get_userbyid(d.defaclrole) AS for_role, COALESCE(n.nspname,'(all schemas)') AS schema,
       d.defaclobjtype, d.defaclacl::text AS default_acl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclobjtype = 'f' ORDER BY 1, 2;
```

Returned (functions rows):

| for_role              | schema                                            | default_acl (functions)                                                                                          |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `postgres`            | `public`                                          | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`                         |
| `postgres`            | `storage`                                         | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`                         |
| `supabase_admin`      | `public`                                          | `{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}` |
| `supabase_admin`      | `graphql`, `graphql_public`, `supabase_functions` | same shape as above                                                                                              |
| `supabase_admin`      | `cron`, `extensions`                              | `{postgres=X*/supabase_admin}`                                                                                   |
| `supabase_auth_admin` | `auth`                                            | `{postgres=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}`                                          |
| `supabase_admin`      | `realtime`                                        | `{postgres=X/supabase_admin,dashboard_user=X/supabase_admin}`                                                    |

**Root cause confirmed live:** Supabase default privileges auto-grant `EXECUTE` on every new `public` function to `anon`, `authenticated`, `service_role`, and PostgreSQL additionally grants `EXECUTE` to `PUBLIC` on functions by default. Any function created without an explicit `REVOKE ... FROM PUBLIC, anon` in the same (or a later applied) migration ships **anon-executable by default**. All 3 RPCs in §2 exhibit exactly this materialized ACL shape.

**Q4 — version confirmation:** `SELECT current_setting('server_version')` → `17.11`.

### 1.2 Consumers

Found by ripgrep over the repo (no `node_modules`): each RPC name across `src/`, `supabase/functions/`, `supabase/tests/`, `supabase/migrations/`, `specs/`. Citations are `file:line`.

---

## 2. (a) The 3 anon-executable RPCs — live findings

All three live in schema `public`, are owned by `postgres`, are **`SECURITY INVOKER`** (`prosecdef = false`, single overload each), have `proconfig = {search_path=""}` (empty search_path already set — good), and carry the **identical materialized ACL**:

```
proacl = {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

`=X/postgres` (empty grantee) = **PUBLIC has EXECUTE**. `has_function_privilege` confirmed live: `anon_exec=true`, `authenticated_exec=true`, `service_role=true`, `public_exec=true` for all three. None of the versioned migrations grants `anon` or `PUBLIC` on these functions (`20261018225420:108,282` grants only `authenticated` for two of them; `resolve_effective_settings` has no GRANT line at all) — the grants come from the default privileges in §1.1 Q3 plus the PostgreSQL PUBLIC function default.

### 2.1 `public.resolve_effective_settings(uuid, uuid, uuid, uuid)`

| Aspect               | Live finding                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode                 | `SECURITY INVOKER`, `STABLE`, `plpgsql`, `SET search_path TO ''`                                                                                                                                                                                                                                                                                              |
| Grants (live)        | `PUBLIC`, `anon`, `authenticated`, `service_role` — **anon/PUBLIC executable**                                                                                                                                                                                                                                                                                |
| `auth.uid()` in body | Only as fallback: `per_s.person_id = COALESCE(p_person_id, (SELECT auth.uid()))`. **No membership check** — read path relies entirely on RLS of `setting_definitions` / `scoped_settings`                                                                                                                                                                     |
| Consumers            | Browser: `src/context/TenantContext.jsx:171` (`loadEffectiveSettings`, user JWT). Edge: `supabase/functions/settings-cascade/index.ts:101` (`supabaseUser` = caller JWT). **No anon consumer in the repo.**                                                                                                                                                   |
| Declared auth        | `authenticated` — `src/config/runtime-registries.js:204`; `operation_bindings` expectation `authenticated` (`supabase/tests/phase2_normative_surface_tests.sql:167`)                                                                                                                                                                                          |
| Body behavior        | Read-only resolution over `setting_definitions` (public-read policy `USING (true) TO anon, authenticated` — migration `20261017231645:1005`) + `scoped_settings` (member-scoped RLS)                                                                                                                                                                          |
| Risk                 | **Low–moderate.** An anonymous caller can resolve, for any org UUID it knows, the _default values_ and full definition metadata of the 12 settings (org/workspace/project/person overrides are filtered out by `scoped_settings` RLS under INVOKER). Contradicts the declared `authenticated` contract; needless anon attack surface (error/behavior oracle). |
| Proposed action      | **Revoke anon + PUBLIC, grant authenticated** (migration §5). Keep INVOKER; do **not** move to a private schema (legitimate browser + Edge consumption).                                                                                                                                                                                                      |

### 2.2 `public.save_onboarding_progress(text, text, integer, jsonb, boolean)`

| Aspect               | Live finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode                 | `SECURITY INVOKER`, VOLATILE, `plpgsql`, `SET search_path TO ''`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Grants (live)        | `PUBLIC`, `anon`, `authenticated`, `service_role` — **anon/PUBLIC executable**                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `auth.uid()` in body | **Yes** — `v_user_id := (SELECT auth.uid()); IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;` then updates **only** the caller's own `persons` row (`WHERE id = v_user_id`)                                                                                                                                                                                                                                                                              |
| Consumers            | Browser: `src/context/TenantContext.jsx:420` (`saveOnboardingProgress`, onboarding wizard, user JWT). Registry declares `authenticated` (`src/config/runtime-registries.js:214`). Planned negative test: `planned:save_onboarding_progress.anon-denial` (`generated/tests/validation-test-list.md:3`, `specs/operations/onboarding.save-progress.json:16`)                                                                                                                                                     |
| Risk                 | **Low today, structural.** Anon calls are defanged by the body check (42501 before any write), but the PUBLIC grant means _any_ present or future DB role can execute it; exposure contradicts the declared contract; and the function persists PII-adjacent `step_data` into `persons.additional_property.onboarding` (already flagged in `docs/onboarding-wizard-steps-and-passkey-plan.md:180`). A body check is not a substitute for a grant boundary (`docs/fase-minus1-spec-control-plane-plan.md:516`). |
| Proposed action      | **Revoke anon + PUBLIC, grant authenticated** (migration §5). PII allowlist/TTL is a separate, already-tracked work item.                                                                                                                                                                                                                                                                                                                                                                                      |

### 2.3 `public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text)`

Full signature (13 args): `p_name text, p_identifier text, p_legal_name text, p_tax_id text, p_country_code text DEFAULT 'BR', p_size_category text DEFAULT 'MICRO', p_revenue_range text DEFAULT NULL, p_registration_number text DEFAULT NULL, p_industry_code text DEFAULT NULL, p_address jsonb DEFAULT '{}', p_in_language text DEFAULT 'pt-BR', p_workspace_name text DEFAULT 'Core Workspace', p_project_name text DEFAULT 'Default Project'`.

| Aspect                       | Live finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode                         | `SECURITY INVOKER`, VOLATILE, `plpgsql`, `SET search_path TO ''`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Grants (live)                | `PUBLIC`, `anon`, `authenticated`, `service_role` — **anon/PUBLIC executable**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `auth.uid()` in body         | **Yes** — raises `42501 'Authentication required.'` when NULL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Consumers                    | Browser: `src/context/TenantContext.jsx:483` (`createOrUpdateCorporateTenant`, onboarding PJ step, user JWT). No other repo consumer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Body behavior (read in full) | 1) `INSERT INTO public.organizations … ON CONFLICT (identifier) DO UPDATE` — **upsert keyed on the browser-supplied `identifier`**, setting `legal_representative_id = v_user_id` on _both_ the insert and the conflict-update path; 2) `INSERT INTO public.organization_members … role_name='org_owner' … ON CONFLICT (organization_id, member_id) DO UPDATE SET role_name='org_owner'` — **promotes the caller to `org_owner` even on the conflict path**; 3) provisions `core` workspace + `workspace_admin` membership; 4) provisions `main` project + `project_owner` membership; 5) flips the caller's `persons` active context                                                                                                                                                                                                  |
| Risk                         | **Highest of the three.** Any _authenticated_ caller can attempt to take over/update an existing tenant by re-submitting its `identifier` (a CNPJ/slug — low entropy, often public): overwrite legal data, replace `legal_representative_id` with themselves, and self-promote to `org_owner`. Being INVOKER, actual exploitability is gated by the RLS `UPDATE`/`INSERT` policies on `organizations`/`organization_members` — and the ledger documents a known InitPlan fragility in `organizations_insert_policy` (`docs/release-evidence-ledger.md:68`, root cause of the `20261024064601` DEFINER conversion of `create_organization_hierarchy`). Today anon is blocked only by the body check. The shape is already flagged: `docs/onboarding-wizard-steps-and-passkey-plan.md:177` ("separar create de update"), `:181`, `:279`. |
| Proposed action              | (1) **Revoke anon + PUBLIC, grant authenticated** (migration §5 — this audit's scope). (2) **Separate owner-approved follow-up** (out of scope here): split `create` from `update`, stop the conflict-path `org_owner` promotion and `legal_representative_id` overwrite, and re-verify the RLS policies exercised by the conflict path with happy+negative tests as `authenticated`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## 3. (b) The 13 SECURITY DEFINER functions — matrix

All 13 are `SECURITY DEFINER`, owner `postgres`, `proconfig = {search_path=""}` (empty search_path — satisfies `AGENTS.md` rule 5 form), language `plpgsql`, schema `public`. Live ACL for every one of them: `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — i.e. **`anon` and `PUBLIC` already revoked** (earlier hardening migrations `20261021022752`, `20261021231106`, `20261022002300`, `20261022053203`, `20261024064601` are effective live). Related but out of the 13: `app_private.has_platform_role(text,uuid)` — DEFINER, `search_path=''`, ACL `{postgres=X/postgres, service_role=X/postgres}` (service_role only; correct).

Consumers were located by grep; "SQL tests" = `supabase/tests/billing_pricebook_rls.sql` (44/44 local SQL suite). "Browser" = `getSupabaseBrowserClient()` user-JWT call; "service" = `supabaseAdmin` (service_role) inside an Edge Function.

| #   | Function (exact signature)                                                                               | Security                  | Consumers (file:line)                                                                                                     | Privilege needed (declared/observed)                                                 | Live EXECUTE grants                                                                                                                                                                                                    | auth check present?                                                                                                                                                  | Risk                                                                                                                                                                                                                                                                                                                                                      | Proposed action                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apply_setting_cascade(uuid,setting_level_type,text,jsonb,cascade_rule_type,uuid,uuid,uuid,boolean)`     | DEFINER, `search_path=''` | Browser `src/context/TenantContext.jsx:523`; Edge (user JWT) `supabase/functions/settings-cascade/index.ts:76`            | authenticated + membership + per-level role (`phase1-configuration-contract.md:151`) | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` (42501) + org membership + per-level role (`org_owner`/`org_admin`/`workspace_admin`), LOCKED-rule enforcement; 16 explicit denial exceptions | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified** (per-row RLS cannot express cross-tier LOCKED cascade writes; documented)                                                       |
| 2   | `attach_psp_idempotency(uuid,uuid,text,text)`                                                            | DEFINER, `search_path=''` | service `supabase/functions/pagbank-order/index.ts:231`                                                                   | service_role-only per versioned migration `20261022053203:992-994`                   | `authenticated`, `service_role` — **DRIFT: `authenticated` not granted by any versioned migration** (origin untraceable in repo migrations; likely a re-timestamped remote variant from the 2026-10-23 reconciliation) | **No** — no `auth.uid()`, no membership; validates only order↔org consistency + first-writer-wins key/fingerprint                                                    | **High** — any authenticated session that learns `order_id`+`org_id` UUIDs can win the race and attach a garbage key/fingerprint, permanently breaking the victim's PSP confirmation flow (`'Order % already has a different PSP idempotency key/payload'`)                                                                                               | **Revoke `authenticated`** to match the versioned migration (service_role-only) in a separate owner-approved migration; do not add browser callers |
| 3   | `claim_pagbank_order(uuid,uuid,uuid,uuid,text,uuid,jsonb,jsonb)`                                         | DEFINER, `search_path=''` | service `supabase/functions/pagbank-order/index.ts:150`                                                                   | service_role-only per versioned migration `20261022053203:938-940`                   | `authenticated`, `service_role` — **same DRIFT as #2**                                                                                                                                                                 | **No** — no `auth.uid()`, no membership; validates quote↔org, `status='accepted'`, reference non-empty; atomic first-writer-wins `ON CONFLICT (quote_id)`            | **High** — an authenticated insider (or anyone obtaining a consumed-but-unclaimed `quote_id`+`org_id`) can claim the quote with their own reference during the consume→claim window, DoS-ing the tenant's payment (`'Quote % is already claimed by another payment reference'`) and writing attacker-controlled `customer_snapshot` into the victim order | **Revoke `authenticated`** (same follow-up migration as #2)                                                                                        |
| 4   | `consume_quote(uuid,uuid,text)`                                                                          | DEFINER, `search_path=''` | service `supabase/functions/pagbank-order/index.ts:85`                                                                    | authenticated + org + idempotency (`phase1…:154`); service_role                      | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership + tenant ownership + status/expiry/single-use CAS (7 explicit exceptions)                                                    | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified** (AGENTS.md rule 3 quote flow)                                                                                                   |
| 5   | `create_organization_hierarchy(text,text,text,text,text)`                                                | DEFINER, `search_path=''` | Browser `src/context/TenantContext.jsx:392`                                                                               | authenticated (hardened `20261024064601`)                                            | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` (42501), caller's own id for every owner FK, slug/name validation                                                                             | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified** (6-table atomic bootstrap; ledger-documented)                                                                                   |
| 6   | `create_pagbank_order(uuid,uuid,uuid,bigint,text,jsonb,jsonb)`                                           | DEFINER, `search_path=''` | **None in versioned code** (`docs/owner-approval-packets.md` §9); only legacy note in `supabase/deploy-manifest.json:159` | authenticated (legacy pre-quote flow)                                                | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org access check (pt-BR messages)                                                                                                           | Medium — legacy path accepting caller-supplied `amount_cents` (pre-`consume_quote` vocabulary), zero consumers                                                                                                                                                                                                                                            | **Deprecate/revoke** — owner decision already pending (`BLOCKED_OWNER`); keep code until decision, then drop or revoke `authenticated`             |
| 7   | `get_tenant_payment_kpis(uuid)`                                                                          | DEFINER, `search_path=''` | Browser `src/pages/payments/PaymentManagementPage.jsx:96`                                                                 | authenticated + org (`phase1…:153`)                                                  | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org access check                                                                                                                            | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified**                                                                                                                                 |
| 8   | `has_platform_role(text)`                                                                                | DEFINER, `search_path=''` | DB-internal: RLS policies (billing/catalog); SQL tests `billing_pricebook_rls.sql:118,132`                                | authenticated (caller-only /1)                                                       | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()`-scoped self-role read; vulnerable `/2` dropped (asserted 0 remaining in tests `:142-148`); recursion-free                                     | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified** (PBAC helper; role authority stays in `platform_role_assignments` per AGENTS.md rule 4)                                         |
| 9   | `issue_manual_quote(uuid,bigint,text,text,text,interval)`                                                | DEFINER, `search_path=''` | Browser `src/pages/payments/PaymentManagementPage.jsx:168`; tests `src/__tests__/PaymentManagementPage.test.jsx:18,203`   | authenticated + org + idempotency                                                    | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership (+ `has_platform_role` reference)                                                                                            | Low–Med (browser-supplied `amount_cents` is the _by-design_ operator-issued manual quote; quote-first contract pinned by test `2464d70`)                                                                                                                                                                                                                  | **Keep-justified**                                                                                                                                 |
| 10  | `issue_quote(uuid,uuid,jsonb,text,interval,bigint)`                                                      | DEFINER, `search_path=''` | SQL tests `billing_pricebook_rls.sql:64-110` (no browser consumer yet)                                                    | authenticated + org + idempotency                                                    | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership + published-pricebook/component/tier validation                                                                              | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified**                                                                                                                                 |
| 11  | `record_media_object(uuid,uuid,uuid,text,text,text,text,bigint)`                                         | DEFINER, `search_path=''` | Browser `src/context/TenantContext.jsx:589`                                                                               | authenticated + org                                                                  | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership + ws/prj hierarchy consistency + bucket allowlist + size guard                                                               | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified**                                                                                                                                 |
| 12  | `record_usage_event(text,uuid,text,numeric,uuid,uuid,uuid,text,text,text,text,timestamp with time zone)` | DEFINER, `search_path=''` | SQL tests `billing_pricebook_rls.sql:92-95`; registry only (`runtime-registries.js:212`) — no browser consumer yet        | authenticated + org                                                                  | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership (+ `has_platform_role` reference); idempotent replay                                                                         | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified**                                                                                                                                 |
| 13  | `release_consumed_quote(uuid,text)`                                                                      | DEFINER, `search_path=''` | SQL tests `billing_pricebook_rls.sql:175-217,336`; ops path referenced in `pagbank-order/index.ts:291`                    | authenticated + org                                                                  | `authenticated`, `service_role`                                                                                                                                                                                        | **Yes** — `auth.uid()` + org membership + consumed-status + no-active-order guards                                                                                   | Low                                                                                                                                                                                                                                                                                                                                                       | **Keep-justified**                                                                                                                                 |

### 3.1 Findings beyond the matrix

- **F-1 (root cause, recurring class).** Default privileges (§1.1 Q3) auto-grant `EXECUTE` on new `public` functions to `anon`/`authenticated`/`service_role`, and PostgreSQL adds `PUBLIC`. Every new function ships anon-executable unless its migration explicitly revokes. The 3 RPCs in §2 are instances of this class, not one-off mistakes.
- **F-2 (grant drift).** `claim_pagbank_order` and `attach_psp_idempotency` are `authenticated`-executable live, but the versioned migration grants them **service_role-only** (`20261022053203:938-940, 992-994`). The `authenticated` grant has no traceable origin in repo migrations — consistent with a re-timestamped remote-applied variant during the 2026-10-23 reconciliation (several applied versions differ from repo filenames, e.g. `20261024064601` vs repo `20261024000000`, `20261025141955` vs repo `20261023120000`). Combined with the **absence of `auth.uid()`/membership checks in both bodies** (defs read in full, §6 appendix), this is the audit's most acute live finding.
- **F-3 (already-correct comparators).** `20261021022752`, `20261021231106:406-419`, `20261022002300:139`, `20261024064601` (repo `20261024000000:206-208`), and `20261021233211` (app_private blanket revoke) show the repo already knows the correct pattern; §2's three functions simply predate or missed it.
- **F-4.** `create_pagbank_order` remains authenticated-executable with zero versioned consumers — deprecation decision already pending owner (`docs/owner-approval-packets.md` §9). No new action from this audit.

---

## 4. Prior risk note (context for §5)

`docs/release-evidence-ledger.md:22` tracks `BLK-rpc-anon-exec` for exactly these three functions ("security hardening → owner reviews + authorizes grant-tightening migration → negative anon test + tightened grants live"). This document supplies the review evidence and the exact migration text; **applying it still requires explicit owner approval** (AGENTS.md hard rule 1).

---

## 5. (c) PROPOSED additive migration — **DO NOT APPLY** (owner approval required)

File name (assign the next free timestamp at authoring time; must sort **after** the latest repo migration `20261026120000_journey_ledger_onboarding_runs.sql`):

```
supabase/migrations/20261027000000_revoke_anon_public_execute_onboarding_settings_rpcs.sql
```

```sql
-- 20261027000000_revoke_anon_public_execute_onboarding_settings_rpcs.sql
--
-- Tighten EXECUTE grants on the three INVOKER RPCs that are currently
-- executable by PUBLIC and anon (audit: docs/rpc-grants-security-definer-audit.md §2).
--
-- Why this is needed:
--   * Supabase default privileges (pg_default_acl, verified live 2026-10-25)
--     grant EXECUTE on new public functions to anon/authenticated/service_role,
--     and PostgreSQL grants EXECUTE to PUBLIC on functions by default.
--   * All three functions are declared `auth: authenticated` in
--     src/config/runtime-registries.js and specs; anon executability contradicts
--     the contract (BLK-rpc-anon-exec, docs/release-evidence-ledger.md:22).
--
-- Scope discipline:
--   * Additive + forward-only (AGENTS.md rule 8): REVOKE/GRANT only.
--     No DROP, no body changes, no CREATE OR REPLACE (which would preserve ACLs
--     anyway — but DROP+CREATE of these functions in any future migration would
--     re-materialize the default grants; future migrations touching these
--     functions MUST re-assert the REVOKEs below).
--   * Exact signatures taken from live pg_proc (single overload each, verified).
--   * claim_pagbank_order / attach_psp_idempotency authenticated-grant drift
--     (audit §3.1 F-2) is intentionally NOT handled here; separate owner decision.
--
-- Expected live effect: has_function_privilege('anon'|'public', <fn>, 'EXECUTE')
-- becomes false; 'authenticated' and 'service_role' remain true.
-- REVOKE from a role lacking the privilege and GRANT of an already-held
-- privilege are both no-ops — the statements are safe to apply on the live
-- project and on a fresh replay of all migrations.

-- 1. resolve_effective_settings (STABLE, read-only settings resolution)
REVOKE EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) TO service_role;

-- 2. save_onboarding_progress (onboarding wizard persistence)
REVOKE EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO service_role;

-- 3. create_or_update_corporate_tenant (onboarding PJ tenant bootstrap)
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO service_role;

-- PostgREST picks up ACL changes on schema cache reload.
NOTIFY pgrst, 'reload schema';
```

### 5.1 Per-function negative test notes

Testing protocol per `AGENTS.md`: disposable Postgres 17.x matching the remote major, statements applied as owner, tests executed as **non-superuser** (`SET ROLE anon` / `SET ROLE authenticated`), never on the shared project before owner approval. Distinguish the two denial layers: **grant denial** = `42501: permission denied for function <name>` (new, from the migration) vs **body denial** = `42501: Authentication required.` (pre-existing, from the function body).

**`resolve_effective_settings(uuid,uuid,uuid,uuid)`**

- _Negative (anon):_ `SET ROLE anon; SELECT * FROM public.resolve_effective_settings('<any-org-uuid>'::uuid);` → expect `42501 permission denied for function resolve_effective_settings`. Via PostgREST/anon key: `supabase.rpc('resolve_effective_settings', {p_organization_id: …})` → 401/403 wrapped `permission denied`. (Before the migration the same call succeeded with defaults-only rows — this is a behavior change by design.)
- _Negative (cross-tenant, authenticated):_ unchanged — INVOKER + `scoped_settings` RLS still filters override rows; assert an authenticated non-member still sees defaults-only for an org it does not belong to.
- _Positive:_ `SET ROLE authenticated;` (+ JWT claims) → returns the 12-definition resolution set; browser consumer `TenantContext.jsx:171` and Edge consumer `settings-cascade/index.ts:101` (user JWT) unaffected; unit suites `TenantApplySettingCascade.test.jsx`, `TenantMultiTenant.test.jsx` stay green (mocked client; grant-independent).

**`save_onboarding_progress(text,text,integer,jsonb,boolean)`**

- _Negative (anon):_ `SET ROLE anon; SELECT public.save_onboarding_progress('individual','BR',2,'{}'::jsonb,false);` → expect `42501 permission denied for function save_onboarding_progress`. **Assert the new error text** — before the migration the same call reached the body and failed with `42501: Authentication required.`; the test must prove the grant layer now fires first (this is the planned `save_onboarding_progress.anon-denial` test, `generated/tests/validation-test-list.md:3`).
- _Positive:_ as `authenticated` with claims set (`SET request.jwt.claims` / real session), insert+update own progress twice → second call merges `step_data` (idempotent resume), row lands only on `persons.id = auth.uid()`; `OnboardingFullPage.test.jsx::persists step progress` stays green.
- _Cross-tenant:_ authenticated caller cannot pass another person's id (function has no person parameter and writes `WHERE id = v_user_id`) — assert unchanged.

**`create_or_update_corporate_tenant`(13 args)**

- _Negative (anon):_ `SET ROLE anon; SELECT public.create_or_update_corporate_tenant('Acme','00.000.000/0001-00','Acme LTDA','…');` → expect `42501 permission denied for function create_or_update_corporate_tenant` (previously: body-raised `Authentication required.`).
- _Negative (authenticated, conflict-path abuse — pre-existing shape, NOT fixed by this migration):_ as authenticated user B (non-member of org A), call with org A's `identifier` → expected secure outcome is an RLS denial on the `organizations` UPDATE / `organization_members` upsert; **record the observed behavior as evidence for the follow-up split create/update + policy re-verification** (§2.3, `docs/onboarding-wizard-steps-and-passkey-plan.md:177`). Do not assert success.
- _Positive:_ authenticated first-time PJ onboarding creates org + `core` workspace + `main` project + memberships and flips active context (happy path of `TenantContext.jsx:483`).

### 5.2 Post-apply live verification (owner-authorized window only)

```sql
SELECT p.oid::regprocedure::text AS signature,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,          -- expect f
       has_function_privilege('public',        p.oid, 'EXECUTE') AS public_exec,        -- expect f
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec, -- expect t
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_exec   -- expect t
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('create_or_update_corporate_tenant','save_onboarding_progress','resolve_effective_settings');
```

Record PASS/FAIL with SHA in `docs/release-evidence-ledger.md` (closes `BLK-rpc-anon-exec`).

### 5.3 Recommended follow-ups (NOT in the proposed migration — separate owner decisions)

1. **F-2 drift correction:** `REVOKE EXECUTE ON FUNCTION public.claim_pagbank_order(uuid,uuid,uuid,uuid,text,uuid,jsonb,jsonb) FROM authenticated;` and same for `public.attach_psp_idempotency(uuid,uuid,text,text)` — restores the versioned service_role-only intent; the only consumer (`pagbank-order` Edge Function) uses service_role, so no client impact. Alternatively, if browser-direct use is ever desired, add `auth.uid()` + `organization_members` checks to the bodies first.
2. **F-1 recurrence guard:** add a SQL assertion (pattern of `billing_pricebook_rls.sql:137-148`) that fails CI when any `public` function is anon/PUBLIC-executable outside an explicit allowlist; and a migration-style rule: every `CREATE (OR REPLACE) FUNCTION` ships with its REVOKE/GRANT lines.
3. **§2.3 split:** separate `create` from `update` in `create_or_update_corporate_tenant`; remove conflict-path `org_owner` promotion; re-verify RLS on the conflict path (tracked in `docs/onboarding-wizard-steps-and-passkey-plan.md:177,181,279`).
4. **F-4:** owner decision on deprecating `create_pagbank_order` (`docs/owner-approval-packets.md` §9).

---

## 6. Appendix — exact rows returned (verbatim, live DB, 2026-10-25)

### 6.1 Q1 rows — the 3 RPCs

```json
[
  {
    "signature": "create_or_update_corporate_tenant(text,text,text,text,text,text,text,text,text,jsonb,text,text,text)",
    "schema": "public",
    "security_definer": false,
    "owner": "postgres",
    "proconfig": ["search_path=\"\""],
    "proacl": "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": true,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": true
  },
  {
    "signature": "resolve_effective_settings(uuid,uuid,uuid,uuid)",
    "schema": "public",
    "security_definer": false,
    "owner": "postgres",
    "proconfig": ["search_path=\"\""],
    "proacl": "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": true,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": true
  },
  {
    "signature": "save_onboarding_progress(text,text,integer,jsonb,boolean)",
    "schema": "public",
    "security_definer": false,
    "owner": "postgres",
    "proconfig": ["search_path=\"\""],
    "proacl": "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": true,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": true
  }
]
```

### 6.2 Q1 rows — the 13 DEFINER functions (+ `app_private.has_platform_role`)

```json
[
  {
    "signature": "app_private.has_platform_role(text,uuid)",
    "schema": "app_private",
    "security_definer": true,
    "owner": "postgres",
    "proconfig": ["search_path=\"\""],
    "proacl": "{postgres=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": false,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "apply_setting_cascade(uuid,setting_level_type,text,jsonb,cascade_rule_type,uuid,uuid,uuid,boolean)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "attach_psp_idempotency(uuid,uuid,text,text)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "claim_pagbank_order(uuid,uuid,uuid,uuid,text,uuid,jsonb,jsonb)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "consume_quote(uuid,uuid,text)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "create_organization_hierarchy(text,text,text,text,text)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "create_pagbank_order(uuid,uuid,uuid,bigint,text,jsonb,jsonb)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "get_tenant_payment_kpis(uuid)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "has_platform_role(text)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "issue_manual_quote(uuid,bigint,text,text,text,interval)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "issue_quote(uuid,uuid,jsonb,text,interval,bigint)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "record_media_object(uuid,uuid,uuid,text,text,text,text,bigint)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "record_usage_event(text,uuid,text,numeric,uuid,uuid,uuid,text,text,text,text,timestamp with time zone)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  },
  {
    "signature": "release_consumed_quote(uuid,text)",
    "security_definer": true,
    "proacl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "anon_exec": false,
    "authenticated_exec": true,
    "service_role_exec": true,
    "public_exec": false
  }
]
```

(All rows: `schema=public` except the first; all `owner=postgres`; all `proconfig=["search_path=\"\""]`.)

### 6.3 Body-verification markers (from `pg_get_functiondef`, read in full)

| Function                            | `auth.uid()` in body                                   | Membership/role markers                                   | Notable denial exceptions                                                                                     |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create_or_update_corporate_tenant` | ✅ (42501 gate)                                        | writes `organization_members` (self `org_owner` upsert)   | `Authentication required.`                                                                                    |
| `save_onboarding_progress`          | ✅ (42501 gate)                                        | own `persons` row only                                    | `Authentication required.`, `Person profile not found.`                                                       |
| `resolve_effective_settings`        | ⚠️ fallback only (`COALESCE(p_person_id, auth.uid())`) | none (RLS-reliant read)                                   | —                                                                                                             |
| `apply_setting_cascade`             | ✅                                                     | `organization_members`, `project_members`, per-level role | 16 exceptions incl. `callers may only update their own personal settings`, LOCKED enforcement                 |
| `attach_psp_idempotency`            | ❌                                                     | none                                                      | `Order % not found`, `does not belong to organization`, `already has a different PSP idempotency key/payload` |
| `claim_pagbank_order`               | ❌                                                     | none                                                      | `Quote % not found`, `must be consumed`, `already claimed by another payment reference`                       |
| `consume_quote`                     | ✅                                                     | `organization_members`, `has_platform_role`               | 7 exceptions incl. tenant ownership, expiry, single-use                                                       |
| `create_organization_hierarchy`     | ✅ (42501 gate)                                        | writes all 3 membership tables with caller id             | slug/name validation                                                                                          |
| `create_pagbank_order`              | ✅                                                     | org access check (pt-BR)                                  | `Acesso negado para criar pedidos nesta Organização`                                                          |
| `get_tenant_payment_kpis`           | ✅                                                     | org access check (pt-BR)                                  | `Acesso negado para consultar KPIs desta Organização`                                                         |
| `has_platform_role(text)`           | ✅                                                     | self-scope via `app_private.has_platform_role`            | —                                                                                                             |
| `issue_manual_quote`                | ✅                                                     | `organization_members`, `has_platform_role`               | positive amount, ISO 4217, membership                                                                         |
| `issue_quote`                       | ✅                                                     | `organization_members`, `has_platform_role`               | published pricebook, component/tier validation                                                                |
| `record_media_object`               | ✅                                                     | org member + ws/prj hierarchy                             | bucket allowlist, size guard                                                                                  |
| `record_usage_event`                | ✅                                                     | `organization_members`, `has_platform_role`               | membership                                                                                                    |
| `release_consumed_quote`            | ✅                                                     | `organization_members`, `has_platform_role`               | consumed-status, no-active-order                                                                              |

### 6.4 Migration-list excerpt (relevant applied hardening)

`20261021022752_revoke_anon_execute_security_definer_rpcs` · `20261021231106_fase0_security_definer_and_tenant_hardening` · `20261021233211_fase1_revoke_anon_from_app_private` · `20261022002300_fase2_harden_pagbank_rpc_and_remove_realtime_pub` · `20261022053203_billing_pricebook_usage_metering` · `20261024064601_org_hierarchy_security_definer_fix` (25 applied total; latest `20261025142026_web_surface_configuration`).

---

_End of audit. No remote state was modified. No migration was applied. No commit was made._
