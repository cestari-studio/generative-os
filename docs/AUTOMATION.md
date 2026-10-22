# 🛠️ Automação do Generative OS

Este documento descreve as automações implementadas no projeto `generative-os` para permitir que o ambiente local, os agentes de IA, os estilos do Carbon Design System, o banco de dados Supabase (`ldjfjmihdvdmltrptngf`) e o deploy na Vercel operem de forma integrada e verificável.

## 📋 Resumo das Automações

### 1. ✅ Automação do VS Code (`.vscode/`)

| Arquivo                   | Status | Descrição                                                   |
| ------------------------- | ------ | ----------------------------------------------------------- |
| `.vscode/extensions.json` | ✅     | Adicionado i18n Ally, Stylelint, ESLint e SCSS IntelliSense |
| `.vscode/settings.json`   | ✅     | Configurações de i18n, SCSS, Prettier format on save        |
| `.vscode/tasks.json`      | ✅     | Tasks para Dev Server, i18n sync, SCSS generate, lint, test |
| `.vscode/mcp.json`        | ✅     | Configuração de servidores MCP (Carbon, Playwright)         |

### 2. ✅ Configuração do Carbon Builder & Supabase Skills

| Arquivo                                                    | Status | Descrição                                      |
| ---------------------------------------------------------- | ------ | ---------------------------------------------- |
| `.agents/skills/carbon-builder/SKILL.md`                   | ✅     | Instruções e guardrails para IBM Carbon v11    |
| `.agents/skills/supabase/SKILL.md`                         | ✅     | Guia oficial de arquitetura Supabase           |
| `.agents/skills/supabase-postgres-best-practices/SKILL.md` | ✅     | Boas práticas de PostgreSQL 17, RLS e pgvector |

### 3. ✅ Gerador Canônico de Foundations & Arquétipos SCSS (`@carbon/react`)

| Arquivo                               | Status | Descrição                                                                                      |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `scripts/generate-carbon-scss.js`     | ✅     | Gerador de foundations, temas, arquétipos de páginas e sincronizador de stylesheets existentes |
| `src/styles/_carbon-foundations.scss` | ✅     | Mixins canônicos de Layout, Grid, Colors, Spacing, Theme, Typography e Motion                  |
| `src/styles/_carbon-generated.scss`   | ✅     | Seletores globais de tema (`g10`/`g100`/`header-inverse`) e classes base `.cs--page__*`        |
| `src/index.scss`                      | ✅     | Manifesto auto-gerado com imports determinísticos de layouts, páginas e componentes            |

**Uso:**

```bash
# Regenerar foundations e sincronizar todas as páginas/componentes existentes
npm run scss:generate

# Scaffold de nova página padronizada (arquétipos: dashboard | welcome | settings)
npm run scss:generate -- --scaffold analytics --archetype dashboard
```

### 4. ✅ Automação Completa de i18n (`en`, `de`, `pt-BR`, `jp-JP`)

| Arquivo                    | Status | Descrição                                                       |
| -------------------------- | ------ | --------------------------------------------------------------- |
| `i18next-parser`           | ✅     | Extração automática de chaves de tradução                       |
| `i18next-parser.config.js` | ✅     | Configuração multi-locale (`en`, `de`, `pt-BR`, `jp-JP`)        |
| `scripts/i18n-sync.js`     | ✅     | Sincronização idempotente dos catálogos em `src/locales/*.json` |

**Uso:**

```bash
npm run i18n:sync
```

### 5. ✅ Governança, Copyright & GitHub Actions CI/CD

| Arquivo                           | Status | Descrição                                                                   |
| --------------------------------- | ------ | --------------------------------------------------------------------------- |
| `scripts/check-all-copyrights.sh` | ✅     | Verifica/corrige cabeçalhos Apache-2.0 em todo o repositório                |
| `.github/workflows/buildTest.yml` | ✅     | CI com Node 24 (`actions/checkout@v4`, `setup-node@v4`), lint, build e test |
| `.github/workflows/ssr-test.yml`  | ✅     | Verifica streaming SSR em `/`, `/dashboard`, `/settings`, `/knowledge`      |
| `.github/workflows/release.yml`   | ✅     | Release semântico automatizado (`semantic-release`)                         |
| `.releaserc.json`                 | ✅     | `npmPublish: false` para repositório privado                                |
| `renovate.json`                   | ✅     | Agrupamento de updates do ecossistema Carbon Design System                  |

### 6. ✅ Deploy SSR na Vercel & Supabase Remote

| Configuração           | Status | Descrição                                                                     |
| ---------------------- | ------ | ----------------------------------------------------------------------------- |
| `vercel.json`          | ✅     | Build SSR + separação de `dist/server/index.html` e rewrite para `api/ssr.js` |
| `api/ssr.js`           | ✅     | Entrypoint Serverless para streaming SSR do Express 5 + React 19              |
| `vite.config.js`       | ✅     | `ssr.noExternal` e `optimizeDeps` configurados para Carbon v11 no Vite 8      |
| `supabase/migrations/` | ✅     | Taxonomia Schema.org integral (18 tabelas, RLS `app_private`, pgvector)       |
| `supabase/functions/`  | ✅     | Edge Functions ativas (`passkey-auth`, `settings-cascade`, `vector-rag`)      |

## 🚀 Fluxo de Desenvolvimento Automatizado

```bash
# Iniciar servidor de desenvolvimento (SSR + HMR)
npm run dev

# Sincronizar i18n e gerar SCSS do Carbon
npm run i18n:sync && npm run scss:generate

# Verificar/corrigir cabeçalhos de copyright Apache-2.0
npm run copyright:fix

# Executar todos os linters (ESLint, Stylelint, Prettier, CSpell)
npm run lint

# Executar suíte de testes com cobertura
npm run test

# Build de produção (Client + SSR)
npm run build
```
