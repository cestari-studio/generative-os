# Fase 7 — Manifesto Vercel, Preview E2E e WCAG 2.2 AA (preparado, não executado)

**Data de preparação:** 2026-10-22
**Estado:** `BLOCKED — owner action required` (integração Git Vercel não comprovada)
**Nenhum deployment, alteração de integração, promoção, domínio ou variável foi executado.**

---

## 1. Projeto e integração esperados

| Item                              | Estado                                    | Evidência                                                         |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Projeto Vercel                    | `generative-os` encontrado na listagem    | Leitura anterior                                                  |
| ID observado                      | `prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`        | Deployment anterior `dpl_6GLBXn...` (SHA `9627c77`, origem `cli`) |
| Integração Git                    | **`linkedProjects: []`** — NÃO comprovada | `get_git_deployment_context`                                      |
| Leitura do projeto por ID/nome    | **404/403**                               | Limitação da integração atual                                     |
| Deployment de `ui-rebuild-carbon` | **Nenhum encontrado**                     | Pesquisa por branch retornou zero                                 |
| Produção                          | `BLOCKED_FOR_PRODUCTION`                  | Sem aprovação formal do proprietário                              |

**Decisão registrada:** NÃO criar um novo projeto Vercel (sem duplicatas). Resolver primeiro o acesso/vínculo do projeto existente. Um único dono de deployment web: Vercel Git Integration (preferido) OU GitHub Actions + Vercel CLI — nunca dois promotores concorrentes.

## 2. Dependências pendentes (ação do proprietário)

| Ação                                                                                                                  | Estado                            | Bloqueio                                                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Reparar/confirmar vínculo Git do projeto `generative-os`                                                              | `BLOCKED — owner action required` | Acesso ao dashboard/token com escopo                      |
| Confirmar root directory, framework (Vite SSR), Node version, build command                                           | `BLOCKED`                         | Leitura 404/403 via integração atual                      |
| Definir variáveis `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` por ambiente (Development/Preview/Production) | `BLOCKED`                         | Valores são publishable (não secrets); nunca service-role |
| Hostname estável de Preview para callbacks OAuth (ex.: `https://preview.cestari.studio`)                              | `BLOCKED`                         | Domínio/DNS do proprietário                               |
| Confirmar produção congelada até aprovação formal                                                                     | Confirmado                        | Gate Fase 8                                               |

## 3. Procedimento para criar/identificar o Preview

1. Reparar o vínculo Git (proprietário).
2. Push/PR da branch alvo gera Preview automático do SHA exato.
3. Registrar: commit SHA, deployment ID, URL de Preview, ambiente, horário, origem do build (`git`, não `cli`), resultado de E2E.
4. Validar proveniência: os bytes compilados devem corresponder ao SHA (não reutilizar deployments CLI de proveniência ambígua como `dpl_6GLBXn...`).

## 4. Matriz E2E (a executar quando o Preview existir)

| Fluxo                    | Cenários                                                                                              | Critério de aceite                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Autenticação real        | Sign-in por e-mail/senha, magic link, logout, sessão expirada, token inválido                         | Sem identidades demo; estados de erro genéricos (anti-enumeração) |
| Recuperação de sessão    | Refresh, logout/login, persistência                                                                   | Sem vazamento entre tenants                                       |
| Onboarding               | Cada passo persiste, reload, retomada após logout, erro de RPC bloqueia avanço, conclusão idempotente | `save_onboarding_progress` confirma; sem dados fiscais em logs    |
| Navegação/rotas          | `/`, `/dashboard`, `/settings`, `/knowledge`, `/payments`, `/onboarding`, `/products`, `*`            | SSR sem fallback silencioso, códigos corretos                     |
| Dados multi-tenant       | Cross-tenant negado (leitura/escrita)                                                                 | RLS/Edge negam; estados vazios honestos                           |
| Pagamentos (modo seguro) | Formulário vazio, validação, quote→ordem com PSP em sandbox                                           | **Nunca cobrança real**; sem defaults fabricados                  |
| Passkeys                 | UI mostra "indisponível"                                                                              | Sem simulação de sucesso                                          |
| i18n                     | pt-BR, en, de, ja-JP, zh-CN                                                                           | Chaves presentes; `ja-JP` (não `jp-JP` duplicado)                 |
| Tema                     | white e g100                                                                                          | Fallback Carbon íntegro nos dois modos                            |

## 5. Plano de screenshots

- **Rotas:** todas as rotas físicas + estados (loading, empty, error, forbidden, success).
- **Viewports:** desktop (1440), tablet (768), mobile (375).
- **Temas:** `white` e `g100`, tokens default + pelo menos um override de marca autorizado do manifest.
- **Associação obrigatória:** cada screenshot ligado ao SHA do build testado; artefatos anexados ao run.

## 6. Acessibilidade — WCAG 2.2 Level AA

**Não declarar conformidade por scanner automatizado ou screenshots apenas.**

| Camada                           | Conteúdo                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatizado (CI/axe/Playwright) | axe-core por rota; navegação por teclado; foco visível; nomes/roles/estados; labels; contraste                                                                                                                                     |
| Manual obrigatório               | Leitor de tela (fluxos críticos: autenticação, onboarding, diálogos, tabelas, formulários, aprovações, erros); teclado completo; zoom/reflow 400%; preferência de movimento reduzido; alvos de interação ≥ 24px; mudança de idioma |
| Evidência                        | Relatório por URL/commit; defeitos com severidade, rota, passos de reprodução, captura (sem dados pessoais/tenants); critério de correção                                                                                          |

## 7. Relatório de defeitos (formato)

| Campo         | Descrição                    |
| ------------- | ---------------------------- |
| ID/severidade | blocker/major/minor          |
| Rota/URL      | Caminho afetado              |
| Passos        | Reprodução determinística    |
| Evidência     | Screenshot/log ligado ao SHA |
| Critério      | O que constitui correção     |

## 8. Critérios de aceite e gates

| Gate                              | Critério                                              | Estado                            |
| --------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Preview reproduzível              | SHA exato, origem `git`, URL registrada               | `BLOCKED — owner action required` |
| E2E                               | Toda a matriz §4 aprovada no Preview                  | `BLOCKED`                         |
| Screenshots                       | Todas as rotas/estados/viewports/temas ligados ao SHA | `BLOCKED`                         |
| WCAG 2.2 AA                       | Automatizado + manual; defeitos documentados          | `BLOCKED`                         |
| `E2E_VERIFIED` na matriz de rotas | Somente após os gates acima                           | `NOT VERIFIED`                    |

## 9. Proibições

- Nenhuma captura/relatório com tokens, dados pessoais ou dados de outros tenants.
- Não usar deployment CLI antigo como prova do rebuild.
- Não declarar WCAG conforme por scanner automatizado.
- Não alterar a identidade congelada `00000000-0000-4000-8000-000000000010`.
