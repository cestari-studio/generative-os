# Fase 1 — Contrato de Configuração do `generative-os`

> **ADENDO 2026-10-23 (v1.1) — correções de reconciliação, aditivas e datadas** (histórico da v1 preservado abaixo):
>
> 1. **Contagem de configurações normativas = 200, não 209.** O número 209 referia-se a `registry.config_definitions` no **banco vivo** do genOS (auditoria 2026-08-07, linhas de bootstrap sem seed no repo). A fonte normativa versionada fecha em **200** chaves distintas (catálogo funcional = traceability = feature-registry, interseção total, 0 referências órfãs). Evidência completa: `docs/phase2-source-reconciliation-report.md`. Onde a v1 diz "209 ConfigDefinitions" (§1), leia-se: 209 = bootstrap do banco vivo do genOS (não importável); **200 = conjunto normativo importável**.
> 2. **Cardinalidade de `setting_normative_map` normalizada (Layer B passa a 6 tabelas).** A coluna única `normative_config_key` foi substituída por duas relações:
>    - `setting_normative_map` — **uma linha-pai por `term_code`** (única), com `equivalence ∈ {exact, partial, none}`, `status`, `rationale`. **Sem** coluna de chave normativa anulável.
>    - `setting_normative_map_terms` — **zero-a-muitas linhas-filhas** por mapa, cada uma com FK para `catalog_configurations` e `relationship_role`/nota explícitos; única `(mapping_id, normative_config_key)`. `none` ⇒ 0 filhas; `partial` ⇒ 1..n filhas (ex.: `i18n.in_language` → `platform.default_locale` + `content.default_language` com papéis distintos `ui-locale` vs `content-language`; `branding.color_scheme` → `brand_primary` + `brand_secondary`). Distinções semânticas preservadas: locale de UI ≠ idioma de conteúdo; passkey habilitada ≠ exigida; classe de modelo ≠ identificador concreto; meta global de acessibilidade ≠ booleano cascateável.
>
> **Status:** `v1.1 proposed_for_review` — desenho e análise apenas. **Nenhuma migration, tabela ou schema remoto foi criado ou alterado.** Nomes de objetos novos são propostas a fechar no preflight de schema da Fase 2.
> **Data:** 2026-10-23 · **SHA do alvo:** `c1bd70d88ce5c6ae88fac4befb4e820f92f41169` · **Fonte normativa:** `cestari-studio/genOS` main @ `ffd97fa93ab425fff6bac5015d34944ef924090c` (2026-10-09), registries `v0.9.0` + dispositions `v0.9.1`, lidas em clone temporário somente-leitura.
> **Base factual:** `docs/phase0-preflight-consolidated-state.md` + leituras vivas do schema (54 tabelas `public`, 30 funções, 12 `setting_definitions`, 11 `scoped_settings`, 6 Edge Functions).

---

## 1. Princípio de compatibilidade (decisão estrutural)

O modelo normativo do `genOS` e o modelo operacional do `generative-os` **não são equivalentes** e nenhum é subconjunto do outro:

| Dimensão             | genOS (normativo)                                                 | generative-os (operacional)                           |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Cascata de settings  | `platform → agency → tenant → workspace → user → session` (6 nós) | `organization → workspace → project → person` (4 nós) |
| Definições de config | 209 `ConfigDefinitions`                                           | 12 `setting_definitions` (schema.org `DefinedTerm`)   |
| Regras de cascata    | `locked` / `replace` / `inherit(...)`                             | `LOCKED` / `INHERIT_OVERRIDABLE` / `MERGE`            |
| Nó `project`         | **não existe**                                                    | existe e é persistido                                 |
| Nó `agency`          | existe                                                            | **não existe**                                        |
| Nó `platform`        | persistido (`scope_id=NULL`)                                      | implícito via `default_value` + `LOCKED`              |
| Sessão               | preview efêmero separado                                          | cookie de tema (não-autoritativo)                     |

**Decisão (alinhada à Diretiva §4.3):** as 12 `setting_definitions` e a RPC `resolve_effective_settings` continuam a **autoridade operacional exclusiva** de valores efetivos. As 200 configurações do `genOS` entram no banco **somente como metadados normativos** (Camada A), com equivalência registrada linha a linha (§9). Nenhum escopo do `genOS` é convertido por inferência; nenhuma configuração normativa vira valor efetivo sem mapeamento explícito + teste + autorização.

Equivalência de nós (única admitida, parcial): `tenant ≈ organization`, `workspace ≈ workspace`, `user ≈ person`. Sem equivalente: `platform`, `agency`, `session` (genOS) e `project` (alvo).

## 2. Camada A — Registros normativos materializados (extensão do `catalog_*`)

Reuso do padrão já existente (`key` natural + payload `jsonb` + `status` + `maturity` + `source_provenance`). Tabelas **novas** propostas, todas aditivas:

| Tabela proposta                | Conteúdo                                                                                                                           | Fonte normativa (path, versão)                                                                                              | Contagem |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| `catalog_features`             | 225 definições de funcionalidade (payload completo: atores, estados, entidades, operações, critérios de aceite…)                   | `docs/specs/v0.9.0/registries/feature-registry.json` v0.9.0                                                                 | 225      |
| `catalog_operations`           | 100 operações canônicas (domínio, acesso, execução, bundle, responsabilidade)                                                      | `genos-functional-catalog.v0.9.0.json → operations` (+ `V010_OPERATION_DISPOSITION` v0.9.1: 5 candidatos, nenhum promovido) | 100      |
| `catalog_configurations`       | 200 definições normativas de configuração (classe, tipo, default, escopos, resolução, finalidade) — **referência, não autoridade** | `genos-functional-catalog.v0.9.0.json → configurations`                                                                     | 200      |
| `catalog_pages`                | 60 `page_key`s normativos (rota, label, propósito, cascata) — **referência de rastreabilidade, não rotas físicas**                 | `genos-functional-catalog.v0.9.0.json → pages`                                                                              | 60       |
| `catalog_journeys`             | 30 jornadas                                                                                                                        | `registries/journey-registry.json` v0.9.0                                                                                   | 30       |
| `catalog_entitlement_profiles` | 4 perfis de entitlement                                                                                                            | `registries/entitlement-registry.json` v0.9.0                                                                               | 4        |
| `catalog_traceability`         | 225 linhas feature↔produto↔operação↔página                                                                                         | `registries/traceability-matrix.json` v0.9.0                                                                                | 225      |

Regras comuns a todas:

- **Chave estável** (`feature_key`, `operation_key`, `config_key`, `page_key`…) única por tabela; upsert idempotente por ela.
- `source_provenance` obrigatório: `{source_repo, source_sha, source_path, registry_version, imported_at}` — SHA `ffd97fa9…` na primeira importação.
- `status` ∈ enum de maturidade (§4); importação inicial grava `NORMATIVE_ONLY` em tudo, exceto onde já houver binding comprovado (hoje: nenhum — as 5/30/9/6 do catálogo-base não têm bindings de operação).
- `catalog_capabilities.feature_keys` e `catalog_subproducts.feature_keys` (já existentes, `jsonb`) passam a ser **validados** contra `catalog_features.feature_key` pelo validator da Fase 6 — sem mudança de schema.
- As tabelas `catalog_products/subproducts/capabilities/platform_services/versions` existentes **não são recriadas nem substituídas**; o importador reconcilia por `key` (reporta divergências de conteúdo em vez de sobrescrever silenciosamente).

**Não importado como dado:** `page-contracts` (Zod), `page-runtime`, `ui-carbon`, migrations, Edge bundles, providers locais e identidade do `genOS` — referência arquitetural apenas (o próprio `genOS` se declara `not runtime_ready` no audit de 2026-08-07; copiar seu runtime importaria mocks).

## 3. Camada B — Configuração operacional web (objetos novos)

Separação explícita entre **o que vive no código** (autoridade de implementação) e **o que vive no banco** (autoridade de composição/conteúdo):

### 3.1 Code-owned (versionado no repo, validado em CI)

| Registry               | Conteúdo                                                                                                                               | Por quê no código                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Route allowlist**    | as 10 entradas já existentes em `src/routes/config.js`                                                                                 | paths e lazy-imports não podem vir do banco (Diretiva §2.7/§4.4)                          |
| **Template catalog**   | 9 templates (§5) — cada um um componente React real e testado                                                                          | template novo exige evidência + aprovação de escopo                                       |
| **Component registry** | `component_key → implementação Carbon real + status (contract_only/mock/implemented/tested/deprecated) + props/slots permitidos`       | "implemented sem implementação real" é falha de CI, não de banco                          |
| **Endpoint allowlist** | `endpoint_key → {kind: rpc \| edge_function \| public_projection, target, auth, tenant_context, idempotency, request/response schema}` | o servidor resolve IDs para implementações revisadas; o banco nunca carrega URL/SQL livre |

### 3.2 DB-owned (novas tabelas propostas)

| Tabela                                                  | Propósito                                                                                | Colunas-chave                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface_definitions`                                   | identidade das superfícies físicas existentes                                            | `surface_key` (única, ex.: `route.dashboard`), `route_path` (FK lógica p/ allowlist de código), `template_key`, `status`, timestamps                                                                                                                                                                       |
| `surface_revisions`                                     | composição versionada de cada superfície                                                 | `surface_key` (FK), `revision`, `payload jsonb` (slots ordenados, componentes, bindings, message keys), `status ∈ {draft, published, archived}`, `published_at`, `published_by`, `supersedes`, `checksum`                                                                                                  |
| `operation_bindings`                                    | vínculo operação↔endpoint real (§7)                                                      | `operation_key` (FK `catalog_operations`), `endpoint_key` (allowlist de código), `auth_requirement`, `tenant_context`, `entitlement_key` (FK lógica `catalog_entitlement_profiles`), `idempotency_rule`, `cache_rule`, `failure_map jsonb`, `status`, `owner`, `evidence jsonb` (sha, run_id, verified_at) |
| `message_registry`                                      | copy autoritativa localizada (§6)                                                        | `message_key`, `locale`, `value`, `namespace`, `status ∈ {draft, published, deprecated}`, `version`, `provenance jsonb`, `updated_at`                                                                                                                                                                      |
| `setting_normative_map` + `setting_normative_map_terms` | equivalência 12 settings ↔ configurações normativas (§9) — **normalizado (adendo v1.1)** | pai: `term_code` (FK `setting_definitions`, única), `equivalence ∈ {exact, partial, none}`, `status`, `rationale`; filhas: FK para `catalog_configurations` + `relationship_role` + nota, única `(mapping_id, normative_config_key)`                                                                       |

Integridade e publicação:

- **Uma revisão `published` por superfície** — índice único parcial em `surface_revisions(surface_key) WHERE status='published'`.
- Publicar exige: `template_key` e todo `component_key` presentes nos registries de código; todo `endpoint_key` no allowlist; toda `message_key` com valor `published` no locale canônico; todo `operation_key` existente. Referência desconhecida/duplicada/incompatível **bloqueia a publicação** (CHECK de aplicação no publisher + validator CI — nunca confiar só no client).
- O banco **não armazena** JSX, imports, CSS, SQL, URLs livres ou funções — `payload` é um fechado de chaves/enumerações (`template_key`, `slot_key`, `component_key`, `density_key`, `theme_key`, `endpoint_key`, `message_key`, params tipados).
- RLS em todas: leitura de `published` para `authenticated` (e `anon` somente em superfícies públicas e mensagens publicadas); escrita restrita a papel administrativo via `has_platform_role` (já existente) ou service-side publisher.

## 4. Normativo ≠ operacional ≠ verificado (máquina de estados)

Três fatos independentes por feature/operação, nunca condensados:

1. **Existe na norma?** → linha em `catalog_features`/`catalog_operations` (Camada A).
2. **Está configurada?** → revisão publicada referenciando-a + binding declarado.
3. **Está comprovada no runtime do alvo?** → evidência de fluxo real no SHA exato.

`status` de feature/operação (enum obrigatório, transições só com evidência registrada):

| Estado                 | Significado                                             | Evidência exigida para entrar                                                                                   |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NORMATIVE_ONLY`       | importada da fonte; sem binding                         | importação com proveniência                                                                                     |
| `MAPPED_UNVERIFIED`    | mapeada a superfície/endpoint candidato                 | linha em `operation_bindings` (status inicial)                                                                  |
| `CONFIGURED`           | superfície com revisão `published` que a referencia     | publicação validada                                                                                             |
| `WIRED`                | binding ativo para endpoint existente e revisado        | read-back do endpoint + contrato request/response testado                                                       |
| `INTEGRATION_VERIFIED` | fluxo real ponta a ponta em ambiente controlado         | teste de integração (disposable PG + Edge local) verde no SHA: pageKey+resourceKey+operationId+RPC+result state |
| `E2E_VERIFIED`         | fluxo verde no Preview do SHA exato                     | browser E2E + estados (ready/empty/forbidden/unavailable/failed) + run id                                       |
| `BLOCKED`              | impedimento registrado (falta API, credencial, decisão) | razão + dono + data                                                                                             |
| `DEPRECATED`           | removida da norma ou substituída                        | referência da substituta                                                                                        |

Regras duras: uma feature `NORMATIVE_ONLY`/`MAPPED_UNVERIFIED` **não aparece como disponível** na UI e **não invoca API**; screenshot não é prova de query; erro/negativa de autorização nunca vira estado de sucesso; `E2E_VERIFIED` expira quando o SHA muda (mesma regra do ledger de release).

## 5. Templates autorizados e mapeamento das rotas existentes

Nove templates (nenhum novo criado por este contrato; cada um exige implementação real antes de `implemented`):

| Template                 | Rotas/superfícies atendidas                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| Public/Auth              | `/` (Welcome), `/reset-password`, modal de sign-in                        |
| Shared Private Shell     | shell global (header/nav/profile/workspace switcher) de todas as privadas |
| Data Overview            | `/dashboard`, `/dashboard/:id`                                            |
| Catalog Browser          | `/products`                                                               |
| Settings & Configuration | `/settings`                                                               |
| Multi-step Wizard        | `/onboarding`                                                             |
| Knowledge & Files        | `/knowledge`                                                              |
| Payments & Transactions  | `/payments`                                                               |
| Unavailable / Error      | `*` (404), acesso negado, serviço indisponível, config ausente            |

Cada superfície registra em `surface_definitions` seu `template_key`; a `payload` da revisão preenche **slots nomeados** do template (ex.: `header`, `filters`, `primary`, `secondary`, `state-region`) com `component_key`s do registry. Os 60 `page_key`s normativos **não geram rotas**: ficam em `catalog_pages` como rastreabilidade; quando uma página normativa corresponde a uma superfície real, registra-se a relação (ex.: `master.private.dashboard`-like → `route.dashboard`) na traceability da Fase 2 — sem criar path novo.

## 6. Mensagens, localização e SSR

**Autoridade de copy migra para `message_registry`** (banco), com snapshot de bootstrap:

1. `message_key` estável namespaced (`<surface>.<region>.<element>`, ex.: `dashboard.header.title`), `locale` BCP-47, `value`, `status`, `version`, `provenance`.
2. **Seed inicial (Fase 2):** as chaves hoje em `src/locales/*.json` entram como `published` com `provenance={source: repo, sha, path}` — o banco torna-se autoridade; os JSONs deixam de ser editáveis à mão.
3. **Snapshot SSR:** script de build gera `src/generated/messages-snapshot.json` **somente** a partir de linhas `published`, com `{revision, checksum sha256, generated_at, source: db}`. SSR serve a mesma `revision` ao client em `__INITIAL_I18N_STATE__` (mecanismo já existente em `entry-server.jsx`). DB alcançável → DB vence; DB indisponível + snapshot válido → snapshot; sem nenhum dos dois → **estado de configuração ausente, nunca texto inventado**.
4. **Sem fallbacks de copy:** `defaultLabel`/`defaultDescription` (hoje em `src/routes/config.js`, `ProtectedRoute.jsx`, `TenantCascadeSettings.jsx`, `ProductsCatalogPage.jsx`) e `defaultValue` de i18n são removidos na Fase 4; ausência de mensagem publicada = configuração incompleta (validator da Fase 6 falha).
5. **Locales canônicos:** `pt-BR`, `en`, `de`, `ja-JP`, `zh-CN`. `jp-JP` é duplicata exata de `ja-JP` (51 143 B, ambos em `supportedLngs`) → Fase 2+ registra `jp-JP` como alias deprecado e remove do preload; a definição `i18n.in_language` (que cita `jp-JP`) é corrigida por migration própria autorizada.

## 7. Bindings tipados e catálogo de endpoints

### 7.1 Allowlist inicial de endpoints (code-owned, seed do §3.1)

| `endpoint_key`                                                                                                                                                                                                                        | kind              | target                                                                                 | auth                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| `edge.passkey-auth`                                                                                                                                                                                                                   | edge_function     | `passkey-auth` v7                                                                      | JWT gateway                     |
| `edge.settings-cascade`                                                                                                                                                                                                               | edge_function     | `settings-cascade` v5                                                                  | JWT gateway                     |
| `edge.vector-rag`                                                                                                                                                                                                                     | edge_function     | `vector-rag` v7                                                                        | JWT gateway                     |
| `edge.pagbank-connect`                                                                                                                                                                                                                | edge_function     | `pagbank-connect` v6                                                                   | JWT gateway                     |
| `edge.pagbank-order`                                                                                                                                                                                                                  | edge_function     | `pagbank-order` v6                                                                     | JWT gateway                     |
| `edge.pagbank-webhook`                                                                                                                                                                                                                | edge_function     | `pagbank-webhook` v7                                                                   | PSP/ECDSA (sem JWT, por design) |
| `rpc.apply_setting_cascade`                                                                                                                                                                                                           | rpc               | `apply_setting_cascade/9` (definer, hardenado)                                         | autenticado + membership        |
| `rpc.resolve_effective_settings`                                                                                                                                                                                                      | rpc               | `resolve_effective_settings/4`                                                         | autenticado                     |
| `rpc.get_tenant_payment_kpis`                                                                                                                                                                                                         | rpc               | `get_tenant_payment_kpis/1` (definer)                                                  | autenticado + org               |
| `rpc.issue_quote` / `rpc.issue_manual_quote` / `rpc.consume_quote` / `rpc.release_consumed_quote`                                                                                                                                     | rpc               | billing (definer, `20261022053203`)                                                    | autenticado + org + idempotency |
| `rpc.claim_pagbank_order` / `rpc.attach_psp_idempotency`                                                                                                                                                                              | rpc               | billing PSP                                                                            | autenticado + org               |
| `rpc.record_usage_event`                                                                                                                                                                                                              | rpc               | metering                                                                               | autenticado + org               |
| `rpc.create_workspace` / `rpc.save_onboarding_progress` / `rpc.mark_notification_read` / `rpc.switch_active_context`                                                                                                                  | rpc               | fluxos existentes                                                                      | autenticado                     |
| `rpc.match_knowledge_chunks`                                                                                                                                                                                                          | rpc               | RAG                                                                                    | autenticado + org               |
| `proj.public.catalog_*`                                                                                                                                                                                                               | public_projection | `catalog_products/subproducts/capabilities/platform_services` (RLS authenticated-read) | autenticado                     |
| `proj.public.{organizations,workspaces,projects,persons,organization_members,scoped_settings,setting_definitions,payment_orders,payment_charges,payment_gateway_configs,price_books,notifications,media_objects,knowledge_documents}` | public_projection | tabelas reais via RLS                                                                  | autenticado + RLS               |

Qualquer endpoint fora desta lista exige revisão + teste + inclusão no allowlist — o banco não pode introduzi-lo.

### 7.2 Dois caminhos compartilhados (Camada C)

- **Resource Adapter (leitura):** `resource_key → binding validado → endpoint allowlisted → resposta tipada → estado Carbon`. Browser nunca consulta schema interno nem escolhe RPC por nome livre.
- **Action Dispatcher (ação):** `action_key → operation_binding → validação → autorização server-side (sessão+membership+policy+entitlement) → endpoint → confirmação → atualização`. Autorização nunca é inferida de menu/rota/label/config do cliente.

### 7.3 Estados universais e mapa de falhas

Todo recurso/ação retorna estado discriminado: `ready | loading | empty | forbidden | unavailable | failed`; decisões de acesso: `allowed | authentication_required | step_up_required | denied | policy_unavailable` (fail-closed quando policy desconhecida). `failure_map` do binding mapeia classes de erro (401/403/404/409/422/5xx/timeout/RLS-denied) → estado Carbon correspondente; detalhes internos (SQL, stack, segredos) nunca chegam à UI.

### 7.4 Critério de prova por binding

Um binding só é `WIRED` quando: endpoint existe no allowlist e no ambiente; request/response conformes ao contrato; auth+tenant verificados no servidor; erro retorna estado tipado; mutations críticas com confirmação+audit+idempotência. `INTEGRATION_VERIFIED` exige evidência encadeada pageKey→resourceKey→operationId→endpoint+versão→RPC/policy→result state no SHA exato.

## 8. Estratégia de migração e compatibilidade (preparação da Fase 2)

- **100% aditivo:** nenhuma tabela/policy/RPC existente é alterada, dropada ou recriada; objetos novos usam `IF NOT EXISTS`/`CREATE OR REPLACE` conforme o padrão já validado; forward-only.
- **Importador determinístico** (script local, `scripts/`): lê os registries versionados do `genOS` (SHA pinado), gera upserts por chave natural com `source_provenance`; relatório obrigatório: inseridos / atualizados / sem mudança / obsoletos na fonte / relações inválidas / conflitos de mapeamento. Não gera views nem arquivos React.
- **Ordem de migrations proposta** (nomes a fechar no preflight): (1) `catalog_features`+`catalog_operations`+`catalog_configurations`+`catalog_pages`+`catalog_journeys`+`catalog_entitlement_profiles`+`catalog_traceability`; (2) `surface_definitions`+`surface_revisions`+`message_registry`+`setting_normative_map`; (3) `operation_bindings`. Cada uma testada em PostgreSQL descartável 17.x com RLS, FKs, grants, idempotência e rollback/forward-recovery **antes** de qualquer pedido de aplicação remota (que depende de autorização do owner — limite intocado).
- **Compatibilidade com RPCs existentes:** nenhuma assinatura muda; `operation_bindings` apenas referencia o que existe.
- **Reconciliação local já identificada (não remota):** duplicata `jp-JP`; 4 arquivos com copy fallback; redundância `scoped_settings.scope` vs `setting_definitions.in_defined_term_set` (documentada; sem ação de schema neste ciclo).

## 9. Mapeamento das 12 settings do alvo ↔ definições normativas

Seed proposto para `setting_normative_map` (a aprovar nesta revisão):

| `term_code` (alvo, autoridade) | Chave normativa genOS                                         | `equivalence` | Nota                                                                            |
| ------------------------------ | ------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `i18n.in_language`             | `platform.default_locale` (+`content.default_language`)       | `partial`     | genOS restringe a `platform`; alvo cascata 4 níveis. Normativo vira referência. |
| `theme.mode`                   | `design.theme_default`                                        | `partial`     | escopos divergentes (tenant/user vs 4 níveis)                                   |
| `theme.header_inverse`         | —                                                             | `none`        | específico do alvo (complemento header/conteúdo)                                |
| `a11y.high_contrast`           | `design.accessibility_target`                                 | `partial`     | target genOS é meta global, não flag cascateável                                |
| `a11y.reduced_motion`          | `layout.respect_reduced_motion`                               | `partial`     | genOS honra SO no platform; alvo é override por nível                           |
| `storage.max_upload_mb`        | —                                                             | `none`        | sem equivalente normativo                                                       |
| `ai.default_model`             | `ai.default_model_class`                                      | `partial`     | classe (genOS) ≠ identificador concreto (alvo)                                  |
| `ai.rag_top_k`                 | `rag.top_k`                                                   | `partial`     | escopo `query_profile` ≠ cascata                                                |
| `ai.system_rules`              | —                                                             | `none`        | genOS usa policies por feature; sem regra genérica MERGE                        |
| `branding.color_scheme`        | `design.color.brand_primary` + `design.color.brand_secondary` | `partial`     | alvo empacota par em um JSON; genOS separa por token                            |
| `auth.require_passkey`         | `auth.passkey_enabled` (+`auth.mfa_required_roles`)           | `partial`     | enable ≠ require; genOS modela por roles                                        |
| `auth.session_ttl_minutes`     | `auth.session_duration_minutes`                               | `partial`     | escopo platform/tenant vs LOCKED 4 níveis                                       |

**Conclusão do mapeamento:** 0 `exact`, 9 `partial`, 3 `none`. Nenhuma definição normativa é ativada como valor efetivo; as 12 seguem autoridade operacional exclusiva. Isso satisfaz a Diretiva §4.3 sem inferência de escopos.

## 10. Lacunas reais (declaradas, não contornadas)

1. `message_registry` ainda não existe — copy vive em JSONs de locale até a Fase 2/4.
2. 4 arquivos com `defaultLabel`/`defaultDescription` (listados em §6.4) — remoção na Fase 4 com validator da Fase 6.
3. Duplicata `jp-JP`/`ja-JP` em `supportedLngs` — correção planejada (§6.5), migration de termo depende de autorização remota.
4. Nenhum registro normativo estendido (225/100/200/60) materializado ainda — depende da Fase 2.
5. Vercel MCP connector indisponível (404) — CLI é o caminho; sem impacto no contrato.
6. `scoped_settings.scope` duplica semanticamente `in_defined_term_set` — divergência documentada; decisão de schema adiada (não bloqueante).
7. Drift de evidência axe (`preview-3405000` citado vs `preview-b2beb6e` presente) — Fase 8.

## 11. Critérios de aceitação deste contrato

- [ ] Toda tabela proposta marcada como NEW/CODE/REUSE e compatível com o inventário vivo (§2, §3, §8).
- [ ] Nenhum objeto existente recriado ou alterado (§8).
- [ ] Mapeamento das 12 settings aprovado com equivalência honesta (§9).
- [ ] 9 templates cobrem 100% das rotas existentes sem criar rota nova (§5).
- [ ] Nenhum endpoint fora do allowlist (§7.1) e nenhum binding sem critério de prova (§7.4).
- [ ] Máquina de estados com evidência por transição (§4) e estados universais completos (§7.3).
- [ ] Estratégia de mensagens sem fallback de copy e com snapshot de mesma revisão SSR↔client (§6).
- [ ] Zero migration/deploy/alteração remota executada nesta fase.

## 12. O que este contrato NÃO autoriza

Criar rotas/páginas novas; materializar endpoints fictícios; ativar configurações normativas como efetivas; copiar runtime/migrations/identidade do `genOS`; aplicar qualquer migration remota; promover produção; alterar Auth/secrets/grants; exibir features sem binding comprovado como disponíveis. Esses limites permanecem sob os gates já definidos (Diretiva §2 e §5 do Zero Gate).
