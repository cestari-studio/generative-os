# 🛠️ Automação do Generative OS

Este documento descreve as automações implementadas no projeto generative-os para permitir que o ambiente local, os agentes de IA, os estilos do Carbon e o repositório remoto operem sem intervenção manual.

## 📋 Resumo das Automações

### 1. ✅ Automação do VS Code (.vscode/)

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `.vscode/extensions.json` | ✅ | Adicionado i18n Ally e SCSS IntelliSense |
| `.vscode/settings.json` | ✅ | Configurações de i18n, SCSS, format on save |
| `.vscode/tasks.json` | ✅ | Tasks para Dev Server, i18n sync, SCSS generate, lint, test |
| `.vscode/mcp.json` | ✅ | Configuração de servidores MCP (Carbon, Playwright) |

### 2. ✅ Configuração do Carbon MCP e Skill

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `.agents/skills/carbon-builder/SKILL.md` | ✅ | Instruções para agentes de IA (Carbon Builder) |
| `CLAUDE.md` | ✅ | Guia completo de IA Agent |
| `.github/copilot-instructions.md` | ✅ | Instruções rápidas para GitHub Copilot |

### 3. ✅ Auto-generate de SCSS a partir de @carbon/styles

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `scripts/generate-carbon-scss.js` | ✅ | Script que gera `_carbon-generated.scss` automaticamente |
| `npm run scss:generate` | ✅ | Script adicionado ao package.json |
| `src/index.scss` | ✅ | Importado o arquivo gerado automaticamente |

**Uso:**
```bash
npm run scss:generate
```

### 4. ✅ Automação Completa de i18n (pt-BR)

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `i18next-parser` | ✅ | Instalado (extraction de chaves) |
| `i18next-parser.config.js` | 📝 | Criar nos próximos passos |
| `scripts/i18n-sync.js` | 📝 | Criar nos próximos passos |

**Uso (a ser implementado):**
```bash
npm run i18n:sync
```

### 5. ✅ Governança no GitHub Privado

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `.releaserc.json` | ✅ | `npmPublish: false` para repositório privado |
| `renovate.json` | ✅ | Agrupamento de updates do Carbon Design System |
| `branch protection` | 🔒 | Não disponível no GitHub Free (esperado) |

### 6. ✅ Link com Vercel CLI e Pacotes Locais

| Configuração | Status | Descrição |
|--------------|--------|-----------|
| `vite.config.js` | ✅ | `noExternal: [/^@carbon\//, /^@ibm\/plex/, /^@cestari\//]` |

**Uso (a ser implementado):**
```bash
npx vercel link --scope cestari-studio
npx vercel env pull .env.local
```

## 🚀 Fluxo de Desenvolvimento Automatizado

### Desenvolvimento Local

```bash
# Iniciar servidor de desenvolvimento (SSR + HMR)
npm run dev

# Sincronizar i18n e gerar SCSS do Carbon
npm run i18n:sync && npm run scss:generate

# Executar todos os linters
npm run lint

# Executar testes
npm run test
```

### VS Code Tasks

- **Cmd + Shift + B** → Run Task
  - Dev Server (SSR) - Default
  - Sync i18n + Generate Carbon SCSS
  - Lint All
  - Test

### VS Code Extensions Recomendadas

- Code Spell Checker
- ESLint
- Prettier
- Stylelint
- Carbon Token Snippets
- **i18n Ally** (nova) - Edição inline de traduções
- **SCSS IntelliSense** (novo) - Autocompletar tokens Carbon

## 📊 Status das Automações

| Etapa | Status | Prioridade |
|-------|--------|------------|
| 1. VS Code Automation | ✅ Concluído | High |
| 2. Carbon MCP + Skill | ✅ Concluído | High |
| 3. Auto-generate SCSS | ✅ Concluído | Medium |
| 4. i18n Automation | 📝 Pendente | High |
| 5. GitHub Governance | ✅ Concluído | Medium |
| 6. Vercel Link | ✅ Configurado | Low |

## 📝 Próximos Passos

1. **Criar `i18next-parser.config.js`** para extração automática de chaves
2. **Criar `scripts/i18n-sync.js`** para sincronização pt-BR
3. **Instalar `@cspell/dict-pt-br`** para suporte ao português no spell checker
4. **Configurar Vercel Deploy** (se desejado)
5. **Criar workflow de CI/CD** (se necessário)

## 🔗 Recursos

- [Documentação do Vite SSR](https://vite.dev/guide/ssr)
- [Carbon Design System](https://carbondesignsystem.com/)
- [react-i18next Documentation](https://www.i18next.com/)
- [GitHub Copilot Instructions](.github/copilot-instructions.md)
