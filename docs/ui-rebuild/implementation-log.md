# Diário de Implementação e Registro de Evidências — UI Rebuild Carbon

**Projeto:** `cestari-studio/generative-os`  
**Branch de Trabalho:** `ui-rebuild-carbon`  
**Base Inicial:** commit `74c3b87` em `preview-homologation`  
**Data:** 22 de outubro de 2026  
**Documentos Normativos:**

- `contrato-rebuild-ui-carbon-generative-os.md`
- `reconciliacao-parecer-9627c77-e-proximo-gate-ui.md`
- `.agents/skills/carbon-builder/SKILL.md`

---

## 1. Fase 0 — Pré-voo e Gate 0

- **Status:** `CONCLUÍDO COM SUCESSO`
- **Ações Executadas:**
  1. Criação e checkout da branch isolada `ui-rebuild-carbon`.
  2. Verificação de branch limpa: `git status` 100% limpo.
  3. Verificação de ferramentas MCP:
     - Servidor Carbon MCP verificado e ativo: `list_carbon_components`, `get_carbon_tokens`, `generate_carbon_snippet`, `get_carbon_icon` retornando dados oficiais do Carbon Design System.
     - Safari Technology Preview MCP verificado e ativo via JSON-RPC stdio.
  4. Revisão integral do skill `.agents/skills/carbon-builder/SKILL.md` e referências de grid, framework, acessibilidade e code audit.

---

## 2. Fase 1 — Inventário Completo e Blueprint (Gate 1)

- **Status:** `CONCLUÍDO COM SUCESSO`
- **Entregáveis Gerados:**
  1. `docs/ui-rebuild/route-page-matrix.md`: Matriz de rastreabilidade completa cobrindo 16 rotas, modais, guards, wizards, abas e telas alcançáveis por interação.
  2. `docs/ui-rebuild/carbon-pattern-catalog.md`: Catálogo de 8 arquétipos oficiais de templates, grid de 16 colunas, tokens de espaçamento e regras WCAG 2.2 AA.
  3. `docs/ui-rebuild/implementation-log.md`: Este diário de execução e decisões.
- **Decisões Arquiteturais Tomadas:**
  - **Onboarding Multi-step:** O wizard de onboarding possui 4 etapas (Organização, Identidade Fiscal, Workspace, Revisão) e adotará obrigatoriamente o componente oficial `ProgressIndicator` com `ProgressStep`, conforme exigência explícita da Seção 5 do contrato.
  - **Validação Fiscal sem Fallbacks:** A validação de CPF e CNPJ implementada no shared security module é consumida na UI para bloquear avanço com documentos inválidos, impedindo a geração de entidades sintéticas.
  - **Isolamento de Commits:** Commits visuais do rebuild de UI são rigorosamente separados na branch `ui-rebuild-carbon`, mantendo as correções financeiras na branch `preview-homologation`.

---

## 3. Próximas Fases Operacionais

- **Fase 2 (Gate 2):** Design Foundation & Shared Shell (revisão de tokens, grid, navegação, header, switcher de workspace e menu de perfil).
- **Fase 3 (Gate 3):** Reconstrução vertical dos fluxos críticos:
  1. **Onboarding & Identidade (`/onboarding`):** `OnboardingPage.jsx` refatorada para renderizar o wizard multi-etapa `OnboardingFullPage` em modo `standalone={true}` nativo com `ProgressIndicator` em vez de redirecionamento nulo. Mensagem explícita sobre certificação FIDO2 adicionada ao fluxo de passkeys. Suíte de testes dedicada criada (`src/__tests__/OnboardingPage.test.jsx`).
  2. Sign-in & Auth Modal
  3. Dashboard & Telemetria
  4. Catálogo de Produtos & Brand DNA
  5. Knowledge Corpus & Vector RAG
  6. PagBank FinOps & Payments
  7. Cascade Settings & Governança
- **Fase 4 (Gate 4):** Verificação cruzada, testes automatizados, WCAG 2.2 AA e comparação visual.
- **Fase 5 (Gate 5):** Publicação do Preview exclusivo de UI para homologação.

---

## 4. Log de Execução — Fase 1 Reconciliação Normativa (22 de outubro de 2026)

**SHA de referência:** (commit deste log, na branch `feat/complete-carbon-page-rebuild`)
**Fonte normativa lida:** `cestari-studio/genOS` @ shallow clone (read-only), v0.9.0 + overlays v0.9.1

### Fatos observados

- Registries normativos reconciliados: **5/30/9/6/225/30/100/60/200/4** — todos `MATCH` com os números declarados.
- Divergência **100 vs 85 operation IDs RESOLVIDA**: 85 superfície Edge (12 bundles) + 15 internas (`private_rpc` ×8, `worker` ×4, `scheduled_worker` ×3, `ci_signing` ×1) = 100. Não é gap, é classificação de execução.
- Cobertura de bindings por feature: **206/225 sem `page_keys`**, **149/225 sem `operation_ids`** — a maioria é nível de especificação, ainda não wired. Todas as 60 páginas, 100 operações e 200 configs são referenciadas pela traceability matrix.
- v0.9.1 EDGE_RUNTIME_GAP_MATRIX: 4 bundles auditadas (schedule-api, academy-api, client-api, knowledge-api) com a maioria das operações `fail-closed` por falta de persistência tipada/control-plane (ver tabela em `functional-crosswalk.md` §5).
- 12 release blockers v0.9.1 registrados (ver `functional-crosswalk.md` §6).

### Artefatos produzidos

- `docs/ui-rebuild/registry-coverage-matrix.json` — reconciliação máquina-legível dos counts + divergência 100vs85 + cobertura de bindings.
- `docs/ui-rebuild/functional-crosswalk.md` — crosswalk normativo humano-legível (counts, divergência, bindings, runtime gap, release blockers, implicação para o destino).

### Estado

- Fase 1 (leitura/reconciliação normativa): **PASS** para counts + divergência + bindings (evidência nos artefatos acima).
- Crosswalk `feature → journey → page → operation → resource → config → policy → test` no DESTINO: **NOT_VERIFIED** — o destino tem 9 rotas físicas + 6 Edge Functions; a cobertura normativa (60 páginas/100 operações/225 features) é backlog de vertical slices, não implementado.
- Nenhuma escrita no repo `genOS` (read-only respeitado); nenhum merge/migration/deploy no destino.

---

## 5. Log de Execução — Fase 2/3 Segurança confirmada + Shell (22 de outubro de 2026)

**SHAs de referência:** #3 `21f4d62` (shell), cascades até #7

### Fase 2 — confirmação de achados já corrigidos (sem reimplementação)

- `has_platform_role`: **confirmado corrigido** — apenas a assinatura caller-only `public.has_platform_role(text)` viva; a `/2` vulnerável existe somente na instrução `DROP`. Helper interno em `app_private` não executável por API roles. Teste A-contra-B presente.
- Idempotência PagBank: **confirmado corrigido** — `claim_pagbank_order` atômico (unique partial `quote_id` + ON CONFLICT), `attach_psp_idempotency` (chave+fingerprint persistidos), `x-idempotency-key` enviado, `gateway_reference_id` autoritativo. 44/44 SQL + 8/8 unit em `billing-sql` ✅.

### Fase 3 — Carbon MCP + shell

- Carbon MCP **conectado** (code_search real validado — ProgressIndicator v11).
- **Gap de shell fechado:** `WorkspaceSwitcherPanel` (context switching real org/workspace/project + create-org) existia mas não era renderizado. Wired no `ProfilePanel` para usuários autenticados — a shell privada agora expõe o seletor real de tenant/workspace/projeto exigido pelo contrato. 5/5 testes ProfilePanel ✅, 198/198 total ✅.

### Estado

- Shell privada comum: header (Cestari Studio brand), side nav auth-aware, profile panel (user info, theme, **tenant switcher**, read-only account, language, actions), footer. Templates por arquétipo em uso.
- Próximo: Fase 4/5 (auth/onboarding/profile/settings persistidos + vertical slices de páginas).

---

## 6. Log de Execução — Fase 5/6/7 em paralelo (22 de outubro de 2026, ciclo 2)

**SHAs de referência:** até `3e11c8e` (e cascades).

### Fase 5 — vertical slices / inventário + wiring

- Inventário integral de views: 9 rotas físicas + categorias virtuais `/operations` `/governance`, tabs em 5 páginas, modais/panels/tearsheets em 7 componentes, wizard steps em sign-in modal + onboarding.
- **`DashboardWorkspaceTab`**: botão "Switch" agora usa `switchActiveContext` (validado/persistido) em vez do setter local bruto.
- **`DashboardUsersTab`**: botão "Invite Team Member" não dispara mais `window.alert` fake — agora desabilitado com nota factual (fluxo de convite não provisionado), em 6 locales. Nenhum botão decorativo restante nessas tabs.

### Fase 6 — rehearsal Supabase (local, disposable PostgreSQL 17.11)

- Migration ledger: **17/17 aplicadas remotamente = 17/17 arquivos locais** (zero drift); apenas `20261022053203` (billing) pendente.
- Billing replay: **44/44 SQL assertions PASS** (rehearsal_test DB).
- Rollback: **CLEAN** — objetos aditivos removidos, `payment_orders` de volta às colunas originais; `has_platform_role` requer `DROP CASCADE` (policies dependentes) — documentado. `deploy-manifest.json` v2.1.

### Fase 7 — validação local

- **axe-core 4.14.0** (devDep): `a11y-routes.test.jsx` — 9 rotas, **zero serious/critical violations** (`/`, 404, Placeholder, SignInModal, /dashboard, /settings, /knowledge, /payments, /onboarding). Manual keyboard/screen-reader continua gate separado.
- **Playwright 1.64.1** (devDep): `scripts/capture-screenshots.mjs` — **24/24 rotas capturadas** (8 rotas × 3 viewports: desktop/tablet/mobile) com manifest por SHA, HTTP 200 nas rotas reais, 404 na NotFound. `cspell.json` adicionado a `.prettierignore` (prettier re-escapava palavras UTF-8).

### Estado / pendências

- CI esperado verde no SHA deste log; **0 reviews humanas** (gate).
- Runtime Supabase `RUNTIME_DRIFT` (6 functions pré-`74c3b87`); Vercel `linkedProjects: []` (BLOCKED — owner action); identidade `...0010` congelada (BLOCKED — decisão).
- Próximo: Fase 5 continuação (products catalog source decision — estático vs backend/CMS gap), Fase 7 Preview quando o vínculo Vercel existir.

---

## 7. Log de Execução — P0 manifesto runtime + P1 catálogo normativo (22 de outubro de 2026, ciclo 3)

**SHA de referência:** `594e7c1` (e cascades).

### P0 — expected-vs-observed (manifesto)

- `deploy-manifest.json` v2.2 + `phase6` §9: matriz explícita por função (config + código), migration ledger (17/17 sync), **13 tabelas de billing AUSENTES** no remoto, 20 RPCs públicos (4 advisor DEFINER) + 7 app_private, RPCs de billing esperados AUSENTES, Vercel 404/403. **`RUNTIME_DRIFT` confirmado como config + código** para `passkey-auth` e `pagbank-order`.

### P1 — catálogo normativo (gap estático fechado)

- **Migração aditiva** `20261022060000_catalog_normative_source.sql`: catalog_versions/products/subproducts/capabilities/platform_services com `source_provenance`, RLS (read=authenticated, write=platform_admin), grants.
- **Seed** `supabase/seed/catalog-normative-seed.sql`: gerado DOS registries normativos genOS (não do genOsCatalog.js) — 5/30/9/6 com conteúdo rico + proveniência; validado em PostgreSQL 17.11 descartável (contagens, links, idempotência de re-seed).
- **`useNormativeCatalog`**: adapter backend com estados ready/loading/unprovisioned honestos.
- **ProductsCatalogPage**: tabs de produtos/serviços/capabilities agora leem do catálogo backend com empty state factual "not provisioned" quando não provisionado — **sem fallback estático silencioso**. Tab Brand DNA mantém fonte estática verificada (IMPLEMENTED_UNVERIFIED). JSON-LD usa dados do catálogo.
- Testes: provisionado mostra 5 suítes; não-provisionado mostra empty state SEM fallback — 208/208 ✅.

### Estado

- Migração + seed aditivas, **NÃO aplicadas a nenhum remoto**; página mostra empty state honesto até deploy do catálogo (gate Fase 6).
- CI esperado verde no SHA deste log; 0 reviews humanas; runtime Supabase divergente (documentado); Vercel BLOCKED; identidade `...0010` congelada.
- Próximo: Fase 5 continuação (demais slices normativas: settings/overrides, onboarding read-back, knowledge pipeline description, demais páginas), Fase 6 rehearsal do catálogo+billing, Fase 7 Preview quando o vínculo Vercel existir.

---

## 8. Log de Execução — Ciclo master directive (23 de outubro de 2026)

**SHA de referência:** `fda6367` (e antecessores do ciclo).

### P0-1 — Segurança do teste de catálogo + execução real na CI

- Guard `src/test/catalog-test-guard.mjs` + 11 testes unitários: opt-in explícito (`CATALOG_TEST_ENABLE=1`), host loopback-only, flag destrutiva separada (`CATALOG_TEST_ALLOW_RECREATE=1`), DB de sistema recusado, versão major 17 exigida, sem secrets em logs. Sem opt-in → skip intencional sem tocar a rede; host remoto → erro fechado.
- `quality` job ganhou service `postgres:17` + step de asserção JSON: **7 passed / 0 skipped** exigidos — skip não conta como sucesso. Evidência: run 39901369262 (`total=7 passed=7 skipped=0`).

### P0-2 — Brand DNA: lista de tenants fictícios removida do runtime

- Aba Brand DNA em `/products` renderizava 12 tenants fictícios (`BRAND_DNA_PROFILES`). Sem brand registry no backend → aba mostra estado honesto "not provisioned". Teste garante que PUTTINATO/All Life Institute/Clareira de Avalon **nunca** renderizam.

### P0-3 — Hydration mismatch eliminado + gate browser-smoke

- Causa raiz: subtrees lazy hidratam DEPOIS do effect de mount disparar `refreshTenantData` → `setLoading(true)`; a subtree hidratada renderizava spinner enquanto o SSR tinha o gate — mismatch em /dashboard, /products, /knowledge. Segundo: `useState(Date.now())` no dashboard.
- Correções: `refreshTenantData({silent})` para o refresh de mount; clock via `useSyncExternalStore` (snapshot servidor null, cliente cacheado).
- `scripts/browser-smoke.mjs`: 24 asserções Chromium locais (SSR não-vazio, conteúdo anônimo esperado, zero conteúdo fictício, zero erros fatais de página). Novo job CI `browser-smoke` (não-required; recomendação ao owner).

### P1 — Gates de consistência

- `scripts/validate-matrices.mjs` (`npm run check:matrices`) no quality job: contadores internos consistentes, canonical counts MATCH, nenhum `E2E_VERIFIED`/`ACCEPTED` alcançado sem artefato por SHA, ledger de bindings coerente.
- `docs/ui-rebuild/feature-binding-ledger.json`: 3 slices implementadas (products-catalog, billing-pricebook-quotes, auth-onboarding-persistence) com status honesto `INTEGRATION_VERIFIED` + evidência + SHA.
- axe-core gate: `scripts/axe-a11y.mjs` — 0 violações critical/serious em 7 rotas; artefatos gitignored + upload CI. Revisão manual WCAG 2.2 AA segue gate humano.

### Segurança (docs, sem mutação remota)

- Mapa de consumidores das 4 funções SECURITY DEFINER sinalizadas: todas validam `auth.uid()` + `is_org_member`, `search_path=""`, sem grant para `anon`. `create_pagbank_order` sem consumidores no código versionado → candidata a deprecação (BLOCKED_OWNER).
- Plano de política + testes para leaked-password protection (BLOCKED_OWNER).

### Auditoria runtime mock/demo/fake (Fase 2)

- Sem achados proibidos restantes no runtime `src/` e `supabase/functions/` (evidência por camada de dados: TenantContext, dashboard, knowledge, funções pagbank versionadas).

### Estado / próximos

- Runtime Supabase divergente (re-confirmado 23/10: 17 migrações, 18/18 tabelas esperadas ausentes).
- 0 reviews humanas; Vercel BLOCKED; identidade `...0010` congelada; PagBank sandbox BLOCKED.
- Próximo: revisão contextual manual restante da Fase 2, materialização de slices normativas adicionais, benchmark baseline.
