# Carbon Builder Skill (Oficial)

Esta skill é importada oficialmente do [carbon-design-system/carbon-mcp](https://github.com/carbon-design-system/carbon-mcp).

## Documentação Oficial

- **Repository**: https://github.com/carbon-design-system/carbon-mcp
- **Skills Directory**: https://github.com/carbon-design-system/carbon-mcp/tree/main/public/skills
- **Version**: 1.3.1

## Instalação

A skill oficial está localizada em:
```
~/.config/opencode/skills/carbon-builder/
```

Para atualizar, baixe o zip mais recente em:
https://github.com/carbon-design-system/carbon-mcp/releases

## Estrutura dos Arquivos de Referência

Os seguintes arquivos de referência estão disponíveis e devem ser usados:

| Arquivo | Descrição |
|---------|-----------|
| `data-model.md` | Schema completo para code_search, docs_search e get_charts |
| `framework-rules.md` | React vs Web Components + regras IBM Plex |
| `implementation-guardrails.md` | Stability, SSR, package, styling e layout guardrails |
| `common-pitfalls.md` | SCSS, CDN, Web Components, Labs e query-routing |
| `query-protocols.md` | Strategy Discover→Canonicalize→Target + special cases |
| `ai-chat-protocols.md` | AI Chat file completeness + query patterns |
| `charts-protocols.md` | Carbon Charts 2-call convention + assembly hints |
| `code-audit-protocols.md` | code_audit params, response schema, category/severity |
| `accessibility-rules.md` | WCAG 2.2 AA rules + Carbon a11y props |
| `grid-system.md` | Carbon Grid variants + responsive spans |
| `carbon-labs.md` | Carbon Labs package verification |
| `result-validation.md` | Result reconciliation + complex queries |
| `error-recovery.md` | Error recovery + performance checklist |

## Uso no generative-os

Esta skill é ativada automaticamente quando o agente de IA detecta:
- Carbon components (Button, Modal, DataTable, etc.)
- IBM Products UI
- Carbon Charts
- Carbon icons/pictograms
- AI Chat/watsonx integration
- Documentação Carbon (usage, accessibility, style)

## Versão Atual do Generative OS

O generative-os está configurado com:
- **Repository**: https://github.com/cestari-studio/generative-os
- **Visibility**: Público
- **Branch Protection**: Ativo (force push, deletions)
- **MCP Server**: carbon-mcp configurado via `.vscode/mcp.json`

## Próximos Passos

1. Atualizar `.agents/skills/carbon-builder/SKILL.md` com o conteúdo oficial
2. Copiar todos os arquivos de referência para `.agents/skills/carbon-builder/references/`
3. Commitar e pushar as atualizações
