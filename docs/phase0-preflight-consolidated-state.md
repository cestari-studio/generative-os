# Fase 0 — Estado Consolidado Preflight (`expected vs observed`)

> **CORREÇÃO ADITIVA 2026-10-23 (auditoria remota do owner):** a tabela §2 afirmava "Produção serve `973d884`; HEAD = `973d884` + 2 commits de docs → **runtime idêntico ao de produção**". A formulação é enganosa: são **artefatos de deploy distintos** — Preview no `c1bd70d` (READY), produção no `973d884` (READY), conforme confrontado pelo owner nos conectores Vercel/GitHub. Embora os 2 commits sejam docs-only (mesmo código de runtime), deployments `READY` não implicam mesmo conteúdo e nenhuma equivalência de artefato deve ser alegada sem verificação de bytes. A tabela abaixo permanece como registrada; esta correção prevalece sobre ela.

> **Data da leitura:** 2026-10-23 · **SHA:** `c1bd70d88ce5c6ae88fac4befb4e820f92f41169` (`c1bd70d`) · **Branch:** `feat/complete-carbon-page-rebuild` (178 commits à frente de `main`) · **Escopo:** somente leitura — **nenhuma alteração remota** (Supabase/Vercel/Auth/DNS) foi feita nesta fase.
> **Fontes:** git local, GitHub CLI (`gh`), Vercel CLI 63.1.0, Supabase MCP, Carbon MCP, arquivos do repo.

---

## 1. Matriz de acesso (identidade e canais)

| Canal                          | Estado                 | Evidência                                                                                                                                    |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase MCP                   | ✅ operacional         | `list_migrations`, `list_edge_functions`, `list_tables`, `execute_sql` (read-only) executados                                                |
| Carbon MCP                     | ✅ operacional         | `code_search` (Button, 84 ms) e `code_audit` (`page-layout.jsx` → `valid: true`, 0 issues, 28/28 regras)                                     |
| Vercel MCP (connector)         | ❌ **indisponível**    | `GET /v2/user` → 404 `not_found`; `list_projects` → lista vazia. Usar **Vercel CLI** como caminho                                            |
| Vercel CLI                     | ✅ operacional         | autenticado como `octavio-4895`; `.vercel/project.json` → `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC` / `team_XezmhfsfA7kR7NThtkvQzcYP`               |
| GitHub CLI                     | ✅ operacional         | PRs e runs lidos                                                                                                                             |
| Referência `genOS` (normativa) | ⚠️ **sem clone local** | `/Users/cestari/genOS` não existe; Fase 2 (importador) precisa da fonte ou trata migration `20261022060000` + seed como origem materializada |

## 2. Git e CI

| Item                | Expected               | Observed                                                                                                                    | Estado            |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| HEAD testado por CI | run verde no SHA exato | run `39972817171` **SUCCESS** em `c1bd70d`                                                                                  | ✅                |
| PR da branch        | draft até gates        | PR **#7 OPEN, draft, CLEAN** ("docs(ui): reconcile route-page matrix…")                                                     | ✅ conforme regra |
| PRs abertos         | todos draft            | **#10–#24 todos `isDraft: true`** (14 PRs; estados CLEAN/UNSTABLE/DIRTY)                                                    | ✅                |
| Produção vs HEAD    | —                      | Produção serve `973d884`; HEAD = `973d884` + 2 commits de docs (`e991182`, `c1bd70d`) → **runtime idêntico ao de produção** | ✅                |

## 3. Supabase remoto (`ldjfjmihdvdmltrptngf`, sa-east-1, PG 17)

### Migrations — **21 remotas = 21 locais, zero drift**

`list_migrations` (remoto) == arquivos em `supabase/migrations/` (local), última `20261023010000_notifications_foundation`. As 4 antes pendentes (`20261022053203` billing, `20261022060000` catalog, `20261023000000` workspace, `20261023010000` notifications) **estão aplicadas**.

### Edge Functions — reconciliadas (deploy de produção 2026-10-23)

| Função             | Versão | `verify_jwt` | Esperado (config.toml)           | Estado |
| ------------------ | ------ | ------------ | -------------------------------- | ------ |
| `passkey-auth`     | 7      | `true`       | `true`                           | ✅     |
| `settings-cascade` | 5      | `true`       | `true`                           | ✅     |
| `vector-rag`       | 7      | `true`       | `true`                           | ✅     |
| `pagbank-connect`  | 6      | `true`       | `true`                           | ✅     |
| `pagbank-order`    | 6      | `true`       | `true`                           | ✅     |
| `pagbank-webhook`  | 7      | `false`      | `false` (por design — ECDSA PSP) | ✅     |

### Tabelas (54 em `public` + `storage`)

Catálogo normativo presente: `catalog_versions`, `catalog_products`, `catalog_subproducts`, `catalog_capabilities`, `catalog_platform_services`. Billing presente: `products`, `product_versions`, `price_books`, `price_components`, `bundles`, `bundle_items`, `usage_events`, `usage_aggregates`, `credit_ledger`, `quotes`, `quote_items`, `platform_role_assignments`, `billing_audit`. Demais: `notifications`, `organizations`, `persons`, `workspaces`, `projects`, `payment_orders`, `media_objects`, `knowledge_*`, `webauthn_challenges`, etc.

### Dados vivos (contagens read-only)

| Tabela                      | Linhas |     | Tabela                | Linhas |
| --------------------------- | ------ | --- | --------------------- | ------ |
| `catalog_products`          | 5      |     | `setting_definitions` | 12     |
| `catalog_subproducts`       | 30     |     | `scoped_settings`     | 11     |
| `catalog_capabilities`      | 9      |     | `organizations`       | 1      |
| `catalog_platform_services` | 6      |     | `persons`             | 4      |
| `catalog_versions`          | 1      |     | `workspaces`          | 2      |
| `products` (billing)        | 0      |     | `quotes`              | 1      |
| `notifications`             | 0      |     |                       |        |

Confere com o seed registrado (`5 produtos, 30 subprodutos, 9 capabilities, 6 serviços, 1 versão`). Catálogo de billing sem produtos publicados → telas devem manter empty state honesto ("Pricing not configured").

## 4. Vercel

| Item            | Observed (CLI)                                                                                | Estado                                |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| Projeto         | `cestari-studio/generative-os` (`prj_cgIw3x…`), Node 24.x, preset Vite                        | ✅ íntegro                            |
| Git integration | conectada 2026-10-23 07:17 UTC; repo `cestari-studio/generative-os`; `productionBranch: main` | ✅ comprovada                         |
| Produção        | `generative-kw5ic1i78-cestari-studio.vercel.app` — `973d884`, target=production, READY (~5 h) | ✅ promoção registrada                |
| Previews        | 9 deployments READY nas últimas ~10 h (source git/cli)                                        | ✅ pipeline ativo                     |
| Aliases         | `app.cestari.studio` + `generative-os-bay.vercel.app` → produção                              | ✅                                    |
| Gap residual    | leitura via **MCP connector** falha (404/[]); usar CLI                                        | ⚠️ restrição de canal, não de projeto |

## 5. Runtime web — fronteiras reais (inventário de código)

| Item                                                | Observed                                                                                                                                                             | Estado                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Rotas físicas (allowlist)                           | `/`, `/dashboard`, `/dashboard/:id`, `/products`, `/knowledge`, `/payments`, `/settings`, `/onboarding`, `/reset-password`, `*` — 9 entradas + 2 categorias virtuais | ✅ sem explosão de rotas       |
| Inline `style={{}}`                                 | **0 ocorrências** fora de `src/test/**`                                                                                                                              | ✅ (18 removidos em `f57f6f6`) |
| Import de `genOsCatalog.js` no runtime              | **nenhum** — única ocorrência é comentário em `useNormativeCatalog.js` ("não é fallback de runtime")                                                                 | ✅                             |
| Catálogo no runtime                                 | `useNormativeCatalog` lê **somente** das tabelas `catalog_*` com estados `loading/ready/unprovisioned`                                                               | ✅                             |
| `defaultLabel`/`defaultDescription` (copy fallback) | ainda presentes em `src/routes/config.js`, `ProtectedRoute.jsx`, `TenantCascadeSettings.jsx`, `ProductsCatalogPage.jsx`                                              | ❌ alvo Fase 4/6               |
| i18n SSR→client                                     | `entry-server.jsx` serializa `__INITIAL_I18N_STATE__` (mesma revisão de mensagens na hidratação)                                                                     | ✅ mecanismo existe            |
| Duplicação de locale                                | `jp-JP.json` e `ja-JP.json` **idênticos** (51 143 B) e ambos em `supportedLngs` (server+client)                                                                      | ❌ dívida conhecida            |
| Layout                                              | `PageLayout` = Carbon `Content` + `Nav`; `code_audit` limpo                                                                                                          | ✅                             |
| Lockfile Carbon                                     | `@carbon/react 1.117.0`, `@carbon/ibm-products 2.100.0`, `@carbon-labs/react-ui-shell 0.106.0`, `react-router 8.4.0`, `react 19.3.0`, `vite 8.3.3`                   | ✅ resolvido                   |

## 6. Reconciliação de manifestos e AGENTS.md (stale → verificado)

| Documento                            | Dizia                                                                                                                        | Realidade verificada (2026-10-23)                                                                                                                                                                                                                                                                                                                                                                               | Ação                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `AGENTS.md` gap 1                    | "Supabase **não reconciliado** (verify_jwt=false nas 6)"                                                                     | Reconciliado em deploy owner-authorized 2026-10-23; verificado vivo: versões 7/5/7/6/6/7, JWT por config.toml, 21 migrations                                                                                                                                                                                                                                                                                    | AGENTS.md atualizado neste commit |
| `AGENTS.md` gap 2                    | "Vercel Git integration **unproven** (404/403)"                                                                              | Integração conectada 07:17 UTC; Preview git-source verificado; produção promovida a `973d884`. Restrição residual: MCP connector (usar CLI)                                                                                                                                                                                                                                                                     | AGENTS.md atualizado neste commit |
| `AGENTS.md` gap 3                    | identity record `…0010` congelado                                                                                            | **mantém-se** — cautela vigente, não reavaliado                                                                                                                                                                                                                                                                                                                                                                 | sem mudança                       |
| `AGENTS.md` gap 4                    | "Fase 7 **não feita**"                                                                                                       | Parcialmente executada: preview-smoke **34/34** (`e3xsqpj8c`/`3405000`), preview-axe **0 critical/serious** em 6 rotas, screenshots `e7247f8` (8 rotas × 3 viewports, 27 PNGs), verificação Safari TP. **Pendente:** checklist manual WCAG 2.2 AA (humano, todas as caixas abertas), screenshots white/g100 por tema, drift de evidência: ledger cita `axe/preview-3405000` mas só existe `axe/preview-b2beb6e` | AGENTS.md atualizado neste commit |
| `docs/phase6-…-manifest.md`          | "BLOCKED — não executado", 17 migrations                                                                                     | Executado 2026-10-23 (ver `deploy-manifest.json → production_deploy`); leitura viva confirma                                                                                                                                                                                                                                                                                                                    | adendo datado adicionado          |
| `docs/phase7-…-manifest.md`          | "BLOCKED — owner action required"                                                                                            | Dependências resolvidas (Git link, env vars); suítes de Preview executadas; pendentes: gate humano WCAG + temas                                                                                                                                                                                                                                                                                                 | adendo datado adicionado          |
| `supabase/deploy-manifest.json` v3.0 | seções históricas (`remote_observed` pré-`74c3b87`, `pending_migrations`, rehearsal 17/18) + seção `production_deploy` atual | **Conteúdo misto**: histórico válido como registro, mas precisa de marcação "superseded" na Fase 8 (não apagar)                                                                                                                                                                                                                                                                                                 | registrado aqui; Fase 8           |

## 7. Lacunas remanescentes honestas (não fechadas nesta leitura)

1. **Vercel MCP connector quebrado** (404 `/v2/user`) — investigar token/escopo do connector ou formalizar CLI como caminho padrão.
2. **Clone local de `genOS` ausente** — Fase 2 (importador normativo) precisa decidir a fonte canônica de leitura.
3. **Copy fallback** (`defaultLabel`/`defaultDescription`) em 4 arquivos — Fase 4/6.
4. **Locale duplicado** `jp-JP`/`ja-JP` — decidir canônico (`ja-JP`) e migrar chaves.
5. **WCAG 2.2 AA manual + screenshots por tema (white/g100)** — gate humano pendente; rotas não podem ir a `ACCEPTED` sem ele.
6. **Registro normativo estendido** (225 features, 100 operations, 200 config defs de `genOS`) — **não materializado**; hoje só existem as 5/30/9/6 do catálogo-base e 12 setting definitions do alvo. Fase 1/2.
7. **Drift de evidência axe** (`preview-3405000` citado, `preview-b2beb6e` presente) — corrigir referência na Fase 8.

## 8. Declaração de gate

- Nenhuma migration aplicada, nenhum deploy, nenhuma alteração de Auth/secrets/domínios/grants.
- Todas as leituras remotas foram read-only (Supabase MCP `list_*`/`execute_sql SELECT`; Vercel CLI `project inspect`/`ls`; GitHub `gh pr/run list`).
- PRs permanecem draft; nenhum gate de release avançado nesta fase.
