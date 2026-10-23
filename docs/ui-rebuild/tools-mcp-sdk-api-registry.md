# Registry de Integrações — MCP / SDK / API / ADI / provider / Edge Functions

**Data:** 2026-10-22
**Classificação por integração:** `documentada` · `presente no código` · `instalada/configurada localmente` · `conectada/autenticada` · `validada por teste` · `ativa no runtime remoto`
**Regra:** MCP instalado ≠ conectado; endpoint acessível ≠ autorização correta; SDK no package ≠ usado. Nunca registrar valores de secret — apenas nomes de referência.

---

## 1. MCP (Model Context Protocol) — ferramentas do agente

| integration_key | tipo | fornecedor/endpoint                                             | estado                   | evidência                                                                                                                                   |
| --------------- | ---- | --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp.carbon`    | MCP  | `https://mcp.carbondesignsystem.com/mcp`                        | `conectada/autenticada`  | `code_search` real retornou ProgressIndicator v11 (score), `docs_search`, `code_audit` disponíveis                                          |
| `mcp.supabase`  | MCP  | `https://mcp.supabase.com/mcp?project_ref=ldjfjmihdvdmltrptngf` | `conectada/autenticada`  | `list_tables`, `execute_sql`, `list_edge_functions`, `list_migrations` executados com leitura real (corrigido do projeto irmão para o alvo) |
| `mcp.vercel`    | MCP  | `https://mcp.vercel.com`                                        | `conectada parcialmente` | `get_git_deployment_context` (linkedProjects []), list_projects OK; leitura de projeto por ID/nome 404/403 — acesso limitado do conector    |
| `mcp.github`    | MCP  | GitHub API                                                      | `conectada/autenticada`  | PRs, branches, check-runs, tags lidos/criados nesta sessão                                                                                  |

## 2. SDKs / bibliotecas clientes

| integration_key                     | tipo     | versão (lockfile) | consumer                                           | estado                                                                                |
| ----------------------------------- | -------- | ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `@supabase/supabase-js`             | SDK      | 2.118.0           | browser + Edge clients                             | `presente no código` + `conectada` (browser client SSR, Edge admin)                   |
| `@supabase/ssr`                     | SDK      | 0.12.7            | SSR server (request-scoped cookies)                | `presente no código` + `validada por teste` (SSR auth por request)                    |
| `@carbon/react`                     | SDK UI   | 1.117.0           | toda UI                                            | `presente no código` + `validada por teste`                                           |
| `@carbon/ibm-products`              | SDK UI   | 2.100.0           | PageHeader, CreateFullPage, EmptyStates, Tearsheet | `presente no código` (em transição — substituição componente a componente registrada) |
| `@carbon-labs/react-ui-shell`       | SDK UI   | 0.106.0           | Profile.Root, ProfilePanel                         | `presente no código`                                                                  |
| `@carbon-labs/react-theme-settings` | SDK UI   | 0.30.0            | ThemeSwitcher, ThemeMenuComplement                 | `presente no código`                                                                  |
| `@carbon/charts(-react)`            | SDK UI   | 1.27.21           | DashboardCharts                                    | `presente no código` (mocked em testes jsdom)                                         |
| `@carbon/pictograms-react`          | SDK UI   | 11.113.0          | ilustrações                                        | `presente no código`                                                                  |
| `@ibm/plex`                         | fontes   | 6.4.1             | tipografia global                                  | `presente no código`                                                                  |
| `i18next` + `react-i18next`         | SDK i18n | 26.4.2 / 17.0.16  | i18n global (6 locales)                            | `presente no código` + `validada por teste` (locale parity)                           |
| `react-router`                      | SDK      | 8.4.0             | roteamento + SSR                                   | `presente no código`                                                                  |
| `vite`                              | build    | 8.3.3             | client+SSR build                                   | `presente no código`                                                                  |

## 3. APIs / RPCs internas (Supabase do destino)

| integration_key                                                                                                                                                 | tipo   | auth model                                                   | estado                                                                                 | evidência                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `rpc.resolve_effective_settings`                                                                                                                                | RPC    | SECURITY (verificar)                                         | `ativa no runtime remoto`                                                              | consumida por TenantContext/settings                                                            |
| `rpc.apply_setting_cascade`                                                                                                                                     | RPC    | SECURITY DEFINER (advisor flag)                              | `ativa no runtime remoto`                                                              | consumida por settings; advisor `authenticated_security_definer_function_executable` registrado |
| `rpc.save_onboarding_progress`                                                                                                                                  | RPC    | SECURITY INVOKER                                             | `ativa no runtime remoto`                                                              | consumida por onboarding (persistência bloqueante)                                              |
| `rpc.create_or_update_corporate_tenant`                                                                                                                         | RPC    | SECURITY (verificar)                                         | `ativa no runtime remoto`                                                              | onboarding PJ                                                                                   |
| `rpc.create_organization_hierarchy`                                                                                                                             | RPC    | SECURITY (verificar)                                         | `ativa no runtime remoto`                                                              | WorkspaceSwitcher create-org                                                                    |
| `rpc.switch_active_context`                                                                                                                                     | RPC    | SECURITY (verificar)                                         | `ativa no runtime remoto`                                                              | context switching                                                                               |
| `rpc.get_tenant_payment_kpis`                                                                                                                                   | RPC    | SECURITY DEFINER (advisor flag)                              | `ativa no runtime remoto`                                                              | payments KPIs; advisor flag registrado                                                          |
| `rpc.record_media_object`                                                                                                                                       | RPC    | SECURITY DEFINER (advisor flag)                              | `ativa no runtime remoto`                                                              | media upload; advisor flag registrado                                                           |
| `rpc.create_pagbank_order`                                                                                                                                      | RPC    | SECURITY DEFINER (advisor flag)                              | `ativa no runtime remoto`                                                              | ordens PagBank; advisor flag registrado                                                         |
| `rpc.issue_quote` / `issue_manual_quote` / `consume_quote` / `release_consumed_quote` / `record_usage_event` / `claim_pagbank_order` / `attach_psp_idempotency` | RPC    | SECURITY DEFINER **justificado** (sem client write policies) | `presente no código` + `validada por teste` (44/44 SQL) — **NÃO aplicada remotamente** | migração `20261022053203` (não aplicada)                                                        |
| `fn.has_platform_role` (caller-only)                                                                                                                            | função | SECURITY DEFINER justificado                                 | `presente no código` + `validada por teste` — **NÃO aplicada remotamente**             | A-contra-B testado                                                                              |

## 4. Edge Functions do destino (6)

| integration_key    | verify_jwt (repo config)   | estado runtime remoto                                               | estado código                                                                            |
| ------------------ | -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `passkey-auth`     | `true`                     | versão 6 pré-`74c3b87`, `verify_jwt=false` — `RUNTIME_DRIFT`        | challenge fail-closed (401 anônimo, 500 persistência); cerimônia WebAuthn **não pronta** |
| `settings-cascade` | `true`                     | versão 4 pré-`74c3b87`, `verify_jwt=false` — `RUNTIME_DRIFT`        | membership-gated                                                                         |
| `vector-rag`       | `true`                     | versão 6 pré-`74c3b87`, `verify_jwt=false` — `RUNTIME_DRIFT`        | pipeline lexical-hash determinístico (não embeddings semânticos)                         |
| `pagbank-connect`  | `true`                     | versão 5 pré-`74c3b87`, `verify_jwt=false` — `RUNTIME_DRIFT`        | OAuth allowlist                                                                          |
| `pagbank-order`    | `true`                     | versão 5 pré-`74c3b87`, `verify_jwt=false` — `RUNTIME_DRIFT`        | quote-driven, claim atômico, PSP idempotency, ambíguo ≠ falha                            |
| `pagbank-webhook`  | `false` (design PSP/ECDSA) | versão 6 pré-`74c3b87`, `verify_jwt=false` — drift apenas de código | ECDSA DER/P1363, fail-closed                                                             |

## 5. Providers externos

| integration_key     | tipo                         | auth                                                   | estado                                                | evidência                                                              |
| ------------------- | ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `pagbank.psp`       | API externa (PagBank Orders) | Bearer token (`PAGBANK_TOKEN`, sandbox/prod separados) | `configurada` — sandbox E2E pendente (`BLOCKED`)      | `x-idempotency-key` protocol implementado; `pagbank-webhook` signature |
| `granite/lm-studio` | provider IA (opcional)       | bridge/connector local                                 | `documentada` — **não conectada**                     | chat fora do MVP; bridge local exige pareamento explícito              |
| `vercel.hosting`    | plataforma                   | Git integration                                        | `conectada parcialmente` — **vínculo não comprovado** | `linkedProjects: []`, 404/403; sem deployment de `ui-rebuild-carbon`   |
| `github.ci`         | plataforma                   | Actions                                                | `conectada/autenticada`                               | workflows CI/release/billing-sql/ssr-smoke verdes                      |

## 6. Crosswalk — as 6 functions do destino vs as 12 bundles normativas

As 6 functions do destino são de **domínio específico** (auth/settings/RAG/pagamentos), não um mapa 1:1 das 12 bundles canônicas (`public-api`, `identity-api`, `tenant-api`, `action-api`, `admin-api`, `content-api`, `academy-api`, `schedule-api`, `reputation-api`, `client-api`, `knowledge-api`, `integration-webhooks`).

| destino            | bundle normativo mais próximo              | sobreposição de operações                                                                                    |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `passkey-auth`     | `identity-api` (parcial)                   | challenge/WebAuthn — cerimônia incompleta; `auth-context-resolve`, `auth-session-exchange` não implementados |
| `settings-cascade` | `tenant-api` (parcial)                     | settings cascade — `effective-config-resolve`/`entitlement-resolve` não implementados                        |
| `vector-rag`       | `knowledge-api` (parcial)                  | `knowledge-search`/`rag-query` (lexical-hash) — `citation-resolve`, ingestão worker não implementados        |
| `pagbank-connect`  | `integration-webhooks` (parcial) / fin-ops | OAuth provider — `billing-provider-event-ingest` não implementado                                            |
| `pagbank-order`    | `tenant-api`/fin-ops (parcial)             | cobrança — `usage-record-ingest` (interno), `billing-reconcile` (worker) não implementados                   |
| `pagbank-webhook`  | `integration-webhooks`                     | `billing-provider-event-ingest` (parcial) — replay/ordem monotônica a endurecer                              |

**Estado:** nenhuma das 12 bundles normativas está materializada como tal no destino; as 6 functions são uma camada de domínio distinta e mais estreita. A materialização das bundles é backlog (Fase 5+/8), não uma troca mecânica 6→12.
