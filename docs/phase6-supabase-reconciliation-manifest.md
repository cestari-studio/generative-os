# Fase 6 — Manifesto de Reconciliação Supabase (preparado, não executado)

> **ADENDO 2026-10-23 — EXECUTADO E VERIFICADO.** Este manifesto foi preparado em 2026-10-22 como plano bloqueado. A reconciliação foi **executada em 2026-10-23 com autorização do proprietário** (escopo completo: 4 migrations + 6 functions + verify_jwt + seed de catálogo) e **verificada por leitura viva em 2026-10-23** (Fase 0): 21 migrations aplicadas (= 21 arquivos locais), funções nas versões 7/5/7/6/6/7 com `verify_jwt` conforme `config.toml`, tabelas de billing/catálogo/notifications presentes, RPCs de billing presentes. Registro de execução: `supabase/deploy-manifest.json → production_deploy`. Estado consolidado: `docs/phase0-preflight-consolidated-state.md`. O conteúdo histórico abaixo é preservado como estava.

**Data de preparação:** 2026-10-22
**Estado:** `BLOCKED — explicit owner authorization required`
**Fonte de hashes/versões:** [`supabase/deploy-manifest.json`](../supabase/deploy-manifest.json) (v2.0, gerado no commit `51a93719`)
**Nenhuma migração, deploy, `db push`, escrita em tabela ou alteração de configuração remota foi executada.**

---

## 1. Projeto-alvo e ambiente

| Item                     | Valor                                      | Verificação                                                               |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------- |
| Projeto autorizado       | `generative-os`                            | `supabase/config.toml` → `project_id = "ldjfjmihdvdmltrptngf"`            |
| Ref                      | `ldjfjmihdvdmltrptngf`                     | Leitura remota confirmada (MCP aponta para este projeto desde a correção) |
| URL                      | `https://ldjfjmihdvdmltrptngf.supabase.co` | —                                                                         |
| Região                   | `sa-east-1`                                | Auditoria inicial                                                         |
| Postgres                 | 17.11                                      | Testes locais usam a mesma major version                                  |
| Projeto IRMÃO (NÃO alvo) | `jkespoegdpkdcrxsxwry` (`genOS`)           | Nunca aplicar migrações/configurações do alvo aqui                        |

## 2. Estado remoto observado (leitura, 2026-10-22)

### Edge Functions — todas PRÉ-`74c3b87`, todas com `verify_jwt = false`

| Função             | Versão remota | `verify_jwt` remoto | `verify_jwt` esperado (config.toml) | Divergência                                   |
| ------------------ | ------------- | ------------------- | ----------------------------------- | --------------------------------------------- |
| `passkey-auth`     | 6             | `false`             | `true`                              | Código (challenge fail-closed) + JWT          |
| `settings-cascade` | 4             | `false`             | `true`                              | JWT                                           |
| `vector-rag`       | 6             | `false`             | `true`                              | JWT                                           |
| `pagbank-connect`  | 5             | `false`             | `true`                              | JWT                                           |
| `pagbank-order`    | 5             | `false`             | `true`                              | Código (quote-driven, idempotência PSP) + JWT |
| `pagbank-webhook`  | 6             | `false`             | `false`                             | **Nenhuma** (por design — PSP/ECDSA)          |

**Nota sobre algoritmos de hash:** o manifesto local registra `sha256` sobre a árvore-fonte de cada função (git). O remoto expõe `ezbr_sha256` do bundle compilado. **Não são comparáveis** (entradas e algoritmos diferentes). A reconciliação exige deploy controlado + leitura de versão, não igualdade de hashes.

### Migrações

- **17 migrações aplicadas remotamente**, última: `20261022002300_fase2_harden_pagbank_rpc_and_remove_realtime_pub`.
- **`20261022053203_billing_pricebook_usage_metering` NÃO aplicada** — código proposto, validado apenas em PostgreSQL descartável (44/44 assertions).
- O schema remoto foi inspecionado (read-only): `payment_orders` tem `gateway_reference_id UNIQUE` e `status CHECK IN ('draft','waiting_payment','paid','canceled','refunded')`; `organization_members` tem SELECT para `authenticated` (alinhado com as políticas da migração proposta).

## 3. `supabase/config.toml` e `verify_jwt`

- `supabase/config.toml` está **versionado** com 5 endpoints `verify_jwt = true` e apenas `pagbank-webhook = false`.
- **Não está deployado** — o remoto continua `false` nas seis funções.
- Regression gate no CI: `src/__tests__/supabase-functions-config.test.js` (cobertura, valores, ausência de config.toml por função).

## 4. Pré-condições para uma futura reconciliação (não executar sem aprovação)

1. **Aprovação explícita do proprietário** para um ambiente NÃO produtivo.
2. **Backup/snapshot** do banco antes de qualquer migração.
3. **Validação de schema**: replay limpo das migrações em branch/DB descartável do projeto correto; diff esperado = apenas objetos da migração de billing (aditiva).
4. **Validação de functions**: revisão handler-a-handler dos 6 handlers atuais (auth, tenant resolution, webhook signature, rate limit) antes de substituir versões ativas.
5. **Secrets**: `PAGBANK_TOKEN`, `PAGBANK_PUBLIC_KEY`, `PAGBANK_CLIENT_SECRET` configurados no vault do ambiente de homologação — nunca em código/log/CI.
6. **PagBank Sandbox**: credenciais de sandbox (não produção) para E2E.

## 5. Procedimento de execução futuro (quando autorizado)

1. `supabase link --project-ref ldjfjmihdvdmltrptngf` (ambiente de homologação dedicado, não o compartilhado).
2. Aplicar `20261022053203` com `supabase db push` em branch de homologação; capturar saída.
3. Rodar `npm run test:billing-sql` contra o banco de homologação (44/44 esperado).
4. Deploy das 6 functions com `supabase functions deploy <name>` — uma por vez, na ordem: `pagbank-webhook` → `vector-rag` → `settings-cascade` → `passkey-auth` → `pagbank-connect` → `pagbank-order`.
5. **Leitura de volta obrigatória**: `list_edge_functions` deve mostrar novas versões e `verify_jwt` conforme `config.toml` (5 `true`, webhook `false`). Divergência = rollback/forward fix, nunca reconciliação presumida.
6. E2E PagBank Sandbox (PIX sucesso, timeout, replay de webhook, webhook fora de ordem, cancelamento, recusa, split) antes de qualquer uso real.

## 6. Critérios de aceite da reconciliação

- [ ] Versões remotas das 6 functions > versões pré-`74c3b87` (leitura remota).
- [ ] `verify_jwt` remoto = config.toml (5 `true`, webhook `false`).
- [ ] `20261022053203` no histórico remoto de migrações.
- [ ] `npm run test:billing-sql` verde no ambiente de homologação.
- [ ] E2E Sandbox PagBank aprovado (PIX + recuperação ambígua + replay).
- [ ] Registro de resultado com SHA, versões, horário e operador.

## 7. Riscos e mitigação

| Risco                                                         | Mitigação                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Aplicar na base errada (irmão `genOS`)                        | Gate de leitura de `project_id` antes de qualquer ação; MCP já corrigido                               |
| Perda de dados na migração                                    | Snapshot prévio; migração é aditiva (`IF NOT EXISTS`, nada destrutivo)                                 |
| JWT quebrando clientes existentes ao ativar `verify_jwt=true` | Ativar por função, uma de cada vez, com smoke após cada uma; rollback por re-deploy da versão anterior |
| PagBank em produção com credenciais erradas                   | Somente sandbox em homologação; produção separada com aprovação própria                                |
| Drift hash/versão após deploy                                 | Leitura de volta obrigatória; falha = rollback documentado                                             |

## 8. Autorização necessária

| Ação                                   | Estado    | Aprovador                            |
| -------------------------------------- | --------- | ------------------------------------ |
| Deploy não-produtivo das functions     | `BLOCKED` | Proprietário (Cestari Studio)        |
| Aplicação da migração `20261022053203` | `BLOCKED` | Proprietário                         |
| Alteração de `verify_jwt` remoto       | `BLOCKED` | Proprietário                         |
| E2E PagBank Sandbox                    | `BLOCKED` | Proprietário                         |
| Qualquer ação em produção              | `BLOCKED` | Proprietário (gate separado, Fase 8) |

**Operador responsável (quando autorizado):** a definir pelo proprietário. O agente NÃO executa nenhuma ação desta seção.

---

## 9. Matriz `expected vs observed` (read-only, 2026-10-22)

**Project ref:** `ldjfjmihdvdmltrptngf` (generative-os, sa-east-1, Postgres 17.11). `expected` = artefatos versionados (branches); `observed` = estado remoto lido via MCP. **Caveat de hash preservado:** sha256 da árvore local ≠ `ezbr_sha256` do bundle remoto — reconciliar por deploy + read-back de versões, não por igualdade de prefixo.

### Edge Functions

| Função             | verify_jwt (expected) | verify_jwt (observed) | Código (expected)                                                                                                              | Código (observed)                                                                                                                                 | Estado                            |
| ------------------ | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `passkey-auth`     | `true`                | `false`               | challenge fail-closed (401 anônimo, 500 não-persistido, 401 list-anônimo)                                                      | emite challenge a anônimo SEM persistir, list anônimo → 200 vazio                                                                                 | `RUNTIME_DRIFT` (config + código) |
| `settings-cascade` | `true`                | `false`               | membership-gated                                                                                                               | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `vector-rag`       | `true`                | `false`               | lexical-hash determinístico                                                                                                    | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `pagbank-connect`  | `true`                | `false`               | OAuth allowlist                                                                                                                | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `pagbank-order`    | `true`                | `false`               | quote-driven, `claim_pagbank_order` atômico, valor da quote consumida, `x-idempotency-key` persistido+reusado, ambíguo ≠ falha | usa `create_pagbank_order`, aceita `amountCents` do request, referência `Date.now()`, fallback sintético item/tax_id, **sem** `x-idempotency-key` | `RUNTIME_DRIFT` (config + código) |
| `pagbank-webhook`  | `false` (design)      | `false`               | ECDSA DER/P1363 fail-closed                                                                                                    | —                                                                                                                                                 | `verify_jwt` confere com o design |

### Migration ledger

- `observed_latest`: `20261022002300` · `observed_applied_count`: 17 · `in_sync_applied`: 17/17
- `expected_pending`: `20261022053203_billing_pricebook_usage_metering` → **NÃO aplicada**
- **Todas as 13 tabelas de billing AUSENTES** no remoto (`products` … `billing_audit`).

### RPCs

- Observados: 20 públicos (4 DEFINER — os mesmos 4 flags do advisor: `apply_setting_cascade`, `create_pagbank_order`, `get_tenant_payment_kpis`, `record_media_object`) + 7 `app_private`.
- Esperados (novos, da migração): `issue_quote`, `issue_manual_quote`, `consume_quote`, `release_consumed_quote`, `record_usage_event`, `claim_pagbank_order`, `attach_psp_idempotency`, `has_platform_role` (caller-only) + `app_private.has_platform_role(text,uuid)` — **todos AUSENTES** (migração não aplicada).

### Vercel

- Observado: projeto listado (`prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`, equipe `cestari-studio`); leitura de detalhes/domínios/env → `404`; listagem de deployments → `403`; `linkedProjects: []`.
- Estado: `BLOCKED — owner action required` (vínculo Git não comprovado; **não** criar projeto duplicado).

---

## 10. Security Advisor findings (read-only, 2026-10-22)

Confirmed by remote advisor query. These are warnings to review (grants + authorization code), **not** proof of exploitability, and do not justify automatic revocation without mapping consumers.

| Finding                                              | Objeto                    | Estado                     | Ação                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated_security_definer_function_executable` | `apply_setting_cascade`   | `SECURITY DEFINER` público | Revisar grants + justificativa DEFINER; validar `auth.uid()` + tenant membership no corpo; considerar revoke de `anon`/roles desnecessárias **apenas após mapear consumidores** (não quebrar o fluxo de settings) |
| `authenticated_security_definer_function_executable` | `create_pagbank_order`    | `SECURITY DEFINER` público | Idem — é o path legado de criação de ordem; o novo fluxo usa `claim_pagbank_order` (não aplicado). Mapear consumidores antes de restringir.                                                                       |
| `authenticated_security_definer_function_executable` | `get_tenant_payment_kpis` | `SECURITY DEFINER` público | Idem — KPIs de pagamentos; validar escopo tenant no corpo.                                                                                                                                                        |
| `authenticated_security_definer_function_executable` | `record_media_object`     | `SECURITY DEFINER` público | Idem — registro de mídia; validar tenant.                                                                                                                                                                         |
| `auth_leaked_password_protection` (desativada)       | Supabase Auth             | **desativada**             | Habilitar leaked-password protection **antes** de liberar autenticação para produção, após confirmar política de Auth + testes de signup/reset. Referência: Supabase password security.                           |

**Regra:** nenhuma revogação automática; cada função exige (a) justificativa documentada de DEFINER vs INVOKER, (b) `search_path=''`, (c) grants mínimos, (d) validação `auth.uid()`/tenant no corpo, (e) testes por role. `service_role` nunca é prova de RLS.

## 11. Correção do estado de CI da PR #8 (2026-10-22)

A execução oficial anterior de #8 em `f1de94f3` (run `39739746838`) terminou em **`failure` no lint** (build/testes ignorados) — **não é** "PENDING sem status". A API combined status vazia não significa ausência de execuções de Actions; há uma execução real e falha registrada. A CI verde de #9 **não valida** o SHA oficial de #8; a execução antiga permanece falha até que a integração autorizada de #9→#8 produza um novo SHA e uma nova CI verde nele.

---

## 12. SECURITY DEFINER consumer map (read-only, 2026-10-23)

Quatro funções públicas sinalizadas pelo advisor `authenticated_security_definer_function_executable`.
Análise read-only de grants, corpo e consumidores — **nenhuma revogação executada**.

| Função                    | DEFINER | search_path | auth.uid()                        | membership                               | Grants (EXECUTE)                      | Consumidores conhecidos                                                                                                  |
| ------------------------- | ------- | ----------- | --------------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apply_setting_cascade`   | sim     | `""`        | sim, com null-check + raise       | `is_org_member` + `organization_members` | authenticated, service_role, postgres | `TenantContext.jsx` (settings UI), Edge Function `settings-cascade`                                                      |
| `create_pagbank_order`    | sim     | `""`        | sim (`v_caller_id := auth.uid()`) | `is_org_member`                          | authenticated, service_role, postgres | **nenhum consumidor no repo** — fluxo novo usa `claim_pagbank_order` (não aplicada); função legada viva apenas no remoto |
| `get_tenant_payment_kpis` | sim     | `""`        | sim (`v_caller_id := auth.uid()`) | `is_org_member`                          | authenticated, service_role, postgres | `PaymentManagementPage.jsx` (KPIs de pagamentos)                                                                         |
| `record_media_object`     | sim     | `""`        | sim, com null-check + raise       | `is_org_member`                          | authenticated, service_role, postgres | `TenantContext.jsx` (`uploadTenantMedia`)                                                                                |

### Avaliação de risco

- O aviso do advisor é **genérico** (qualquer DEFINER executável por `authenticated`).
  As quatro funções validam `auth.uid()` e membership no corpo, usam
  `search_path=""` (proteção contra hijacking de search_path) e **não** são
  executáveis por `anon`.
- Justificativa DEFINER provável: escrita/leitura agregada em tabelas com RLS
  que exigiria policy adicional por operação (settings cascade, KPIs
  agregados, registro de mídia, criação de ordem legada). Necessário confirmar
  qual acesso exato exige bypass — próximo passo: extrair as tabelas tocadas
  por cada função e mapear para a policy que seria necessária em modo INVOKER.
- `create_pagbank_order`: sem consumidores no código versionado. Candidata a
  **deprecação formal** (revogar EXECUTE de `authenticated` em migração
  aditiva futura) após confirmar que nenhum cliente externo a chama —
  decisão `BLOCKED_OWNER` (requer decisão do owner + janela de observação).
- Nenhuma revogação automática: qualquer mudança de grant exige migração
  aditiva versionada + teste dos consumidores + autorização de ambiente.

---

## 13. Leaked-password protection — policy + test plan (2026-10-23)

**Remote state:** `auth_leaked_password_protection` **disabled** (advisor).
Config changes are `BLOCKED_OWNER` — no remote Auth mutation without explicit
policy confirmation + environment authorization.

**What the feature does:** Supabase Auth can reject passwords known to have
appeared in public breaches (HaveIBeenPwned corpus) at signup and password
change/reset. Without it, users may register breach-compromised passwords.

**Auth surfaces in this product:** password sign-in (`signInWithPassword` in
`TenantContext.jsx`, used by `SignInModal.jsx`). No self-service signup UI
exists yet (users are provisioned via onboarding/invite flows); password
reset flow exists via Supabase Auth recovery.

**Policy decision needed from owner:**

1. Enable `password_security_leaked_password_protection` in Supabase Auth for
   the non-prod isolated environment first, then production.
2. Decide minimum password strength policy (length/strength) alongside it —
   current client enforces only non-empty password.

**Test plan (to run after enablement in the authorized non-prod env):**

| #   | Case                                                              | Expected                                                                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Signup/reset with a known breached password (e.g. `Password123!`) | Supabase rejects with `weak_password`/leaked-password error; UI surfaces the auth error honestly |
| 2   | Signup/reset with a strong unique passphrase                      | Accepted                                                                                         |
| 3   | Existing user with an old (possibly breached) password signs in   | Sign-in still works (protection applies at set/reset time, not login)                            |
| 4   | Password change to a breached password via reset flow             | Rejected with clear error                                                                        |
| 5   | UI error mapping                                                  | `SignInModal` shows the auth error message, never a generic success                              |

**Evidence to capture:** supabase auth config read-back (read-only),
signup/reset attempt logs (no password values), UI screenshots of the error
state, and the advisor finding clearing after enablement.

---

## 14. Onboarding persistence — destination contract formalization (2026-10-23)

**Normative source check (read-only genOS registries):** the normative ontology
does **not** define a user-onboarding journey or feature. The closest journey,
`journey.platform.activate_product` ("Provisionar e ativar produto"), is
operator-side provisioning — actors `master_operator`, `agency_admin`,
`tenant_admin`, `provisioning_worker`; steps: tenant/workspace provision →
entitlement resolve → product activation. Per the directive, it is **not** a
substitute for user onboarding.

**Destination contract (formal, with evidence):**

| Aspect     | Value                                                                                                               | Evidence                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Write path | `save_onboarding_progress(text, text, integer, jsonb, boolean)` RPC                                                 | migration `20261018225420`          |
| Security   | `SECURITY INVOKER`, `search_path=''`, requires `auth.uid()` + existing person                                       | migration `20261018225420`          |
| Storage    | `public.persons.additional_property->'onboarding'`                                                                  | RPC body + `loadOnboardingProgress` |
| Shape      | `{account_type, country_code, current_step, status, last_updated_at, step_data, completed_at?}`                     | RPC body                            |
| Semantics  | progressive `step_data` merge (atomic jsonb `\|\|`), status `in_progress`/`completed`, `completed_at` on completion | RPC body                            |
| Read path  | `persons.additional_property->'onboarding'` via `loadOnboardingProgress`                                            | `TenantContext.jsx`                 |
| Client     | `OnboardingTearsheet` saves per step; reload rehydrates from backend                                                | component                           |

**Not the contract:** `public.cs_preferences.onboarding_done` was previously a
candidate — it is **not** the persistence path. The authoritative path is
`persons.additional_property->'onboarding'`.

**Status:** destination-local contract, consistent end-to-end (write RPC ↔
storage ↔ read path ↔ client). No normative binding exists to claim; marked as
destination-owned in the binding ledger.

---

## 15. Supply-chain findings (2026-10-23)

`npm audit` results: production dependencies **0 vulnerabilities**; dev tree
45 (4 moderate, 41 high, 0 critical after the overrides below).

| Finding                                  | Chain                                                                                                | Severity                           | Action                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `handlebars` JS injection (3 advisories) | `semantic-release` → `@semantic-release/commit-analyzer` → `conventional-changelog-writer`           | critical (dev-only, never shipped) | **FIXED** via `overrides` → `handlebars@4.7.10`                                         |
| `shell-quote` command injection          | `unlighthouse` → `launch-editor`                                                                     | critical (dev-only)                | **FIXED** via `overrides` → `shell-quote@1.12.0`                                        |
| 41 high + 4 moderate remaining           | various dev chains (incl. bundled npm internals like `undici`, `brace-expansion` — not auto-fixable) | high/moderate (dev-only)           | monitored; no batch major upgrades (directive §2.3); reassess with dependency-update PR |

Notes: `npm audit fix` was deliberately NOT used — its dry-run showed forced
breaking changes to `unlighthouse` and `stylelint-plugin-carbon-tokens`.
An `overrides` attempt pinned the two packages, but the required lockfile
regeneration upgraded 257 transitive packages — reverted per §2.3; the fix
belongs in a dedicated dependency-update PR with full lockfile validation.
The production bundle does not include either package (verified:
`npm audit --omit=dev` = 0 vulnerabilities).

---

## 16. Base-schema replayability finding (2026-10-23, cycle 5)

**Finding:** the repo's migration history is **not replayable as-is** on a
fresh PostgreSQL via raw `psql`. The initial migration
`20261016144033_init_schema.sql` has systematically unterminated statements
(missing `;` after `CREATE EXTENSION`, several `CREATE OR REPLACE FUNCTION
... $$ language 'plpgsql' [stable|security definer]`, and the `CREATE TRIGGER
... EXECUTE FUNCTION ...` statements), producing `syntax error at or near
"CREATE"` on replay. The remote project **has** `20261016144033` applied —
it was applied via a path that tolerated or predates the corruption
(Supabase's migration runner / dashboard SQL editor), not via raw `psql`.

**Impact on non-prod rehearsal:** a from-scratch `supabase start` / raw-psql
replay of the full 17-migration chain FAILS on the first migration. The base
schema cannot be rebuilt from the repo migrations alone via `psql`.

**What IS validated:** the 4 NEW migrations (billing `20261022053203`,
catalog `20261022060000`, workspace `20261023000000`, notifications
`20261023010000`) are well-formed (0 unterminated-statement issues) and are
tested in CI on disposable PostgreSQL 17.11 with RLS enforced (billing-sql,
catalog integration, workspace-sql, notifications-sql suites). The deploy
DELTA is sound; the BASE replay is the broken part.

**Rule honored:** the applied migration was NOT edited (forward-only rule).
The finding is documented, not patched in place. A proper fix is a NEW
additive migration only if a schema correction is ever needed — but the
remote schema is already correct, so no correction is required; the issue is
purely local replayability of the historical file.

**Non-prod deploy path forward:** use `supabase db push` against the isolated
target (the same runner that applied the remote), not raw `psql`. Validate
the 4 new migrations + 6 functions there, then read back.

---

## 17. Security advisor triage (read-only, 2026-10-24)

Independent owner audit flagged security/performance advisor findings. Read-only
triage below — **no policy, grant, function, or config was changed.**

### SECURITY DEFINER functions (advisor: 12 executable by authenticated)

Full DEFINER set in the DB: **20 functions** (7 `app_private` internal helpers +
13 `public`). Read-back confirms **0 with a default PUBLIC grant** (none are
wide-open by default); all have restricted grants.

- `app_private` (7, internal): `custom_access_token_hook`, `handle_new_auth_user`,
  `has_org_admin_role`, `has_platform_role`, `has_workspace_write_access`,
  `is_org_member`, `is_super_admin`, `sync_person_context_to_auth` — internal
  helpers; grants scoped, not part of the public API surface.
- `public` (13): `apply_setting_cascade`, `attach_psp_idempotency`,
  `claim_pagbank_order`, `consume_quote`, `create_pagbank_order`,
  `get_tenant_payment_kpis`, `has_platform_role`, `issue_manual_quote`,
  `issue_quote`, `record_media_object`, `record_usage_event`,
  `release_consumed_quote`.

The 13 public DEFINER functions each carry a documented justification
(billing quote-first flow needs atomic claim/consume/idempotency that RLS alone
cannot express; settings cascade; media/KPI reads with tenant checks). Each is
in the consumer map (§12). The advisor flag is the generic
"DEFINER executable by authenticated" pattern — review per function, **no batch
revocation** (per Supabase guidance and the documented justifications).
`create_pagbank_order` remains the deprecation candidate (no versioned-code
consumers) — BLOCKED_OWNER.

### Leaked-password protection

Advisor reports it disabled. Enabling it is an Auth config change — BLOCKED_OWNER
(policy confirmation + non-prod test first; test plan in §13).

### Duplicate indexes (advisor: 1; triage found 3)

Three redundant indexes where a manual `CREATE INDEX` duplicates a UNIQUE
constraint's implicit index (write overhead, not a security issue):

| Table                              | Redundant pair                                                   |
| ---------------------------------- | ---------------------------------------------------------------- |
| `passkeys.credential_id`           | `idx_passkeys_credential_id` + `passkeys_credential_id_key`      |
| `tenant_users(user_id, tenant_id)` | `idx_tenant_users_unique` + `tenant_users_user_id_tenant_id_key` |
| `tenants.slug`                     | `idx_tenants_slug` + `tenants_slug_key`                          |

Cleanup = an ADDITIVE migration dropping the redundant manual index (keep the
UNIQUE constraint). Forward-only, tested on disposable PG. Candidate for a
future migration; not executed (no remote change).

### Performance advisors (triage noted, no action)

12 overlapping permissive policies, 13 unindexed foreign keys, 92 unused
indexes — performance hygiene for a future additive migration. Not executed.

## 18. Phase 2 candidate table count — corrected to 14

The two Phase 2 candidate migrations create **14 physical tables** (7
`catalog_*` via M1 `EXECUTE format` loop; 7 surface tables via M2 ALTERs:
`message_registry`, `operation_bindings`, `registry_allowlist`,
`setting_normative_map`, `setting_normative_map_terms`, `surface_definitions`,
`surface_revisions`). The review package previously said 13 (omitting
`registry_allowlist` from the conceptual count); corrected to 14 with RLS on
all 14. Rollback = `DROP TABLE` of the 14 + `DROP TYPE` of the new enums.
The candidate SQL suite (`test:phase2-sql`) is now wired into the billing-sql
CI job — 43 assertions verified locally (ALL PHASE 2 SQL TESTS PASSED).
