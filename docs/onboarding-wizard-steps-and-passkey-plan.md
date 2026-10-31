# generative-os — comparação dos planos e plano consolidado de execução

**Projeto-alvo:** `cestari-studio/generative-os` (branch de referência `feat/complete-carbon-page-rebuild`). `cestari-studio/genOS` é somente referência ontológica normativa e permanece read-only. **Captura de referência:** 25–26/10/2026. **Objetivo:** substituir os dois planos conflitantes por um contrato único, implementável e verificável para login, onboarding, tenants, roles, produtos e configuração. Este documento é um plano; não afirma que o trabalho foi implementado.

## 1. Resultado executivo

**Decisão:** usar o plano longo de onboarding/tenancy como base arquitetural; incorporar do plano Login/Onboard somente a separação de autenticação, a inscrição de passkeys como ação explícita e o tratamento de estados Carbon — depois de corrigir suas afirmações de API e seu ponto de integração. **Seleção UX confirmada: opção 3, Carbon Core para autenticação**; IBM Products Create patterns ficam restritos às superfícies de onboarding/provisioning, não ao login/recovery. Não implementar nenhum dos dois planos literalmente antes de corrigir os P0 abaixo.

Os três problemas que mais impactam a arquitetura são:

1. **Há três fontes diferentes para a conclusão do onboarding.** `OnboardingFullPage` tem cinco etapas; `OnboardingTearsheet` tem quatro etapas independentes e é o fluxo aberto pelo login; `DashboardOnboarding` estima conclusão a partir de nome da organização, quantidade de workspaces/documentos e `plan_tier`. Nenhuma é um ledger comum e autoritativo de etapas.
2. **A conclusão do onboarding não protege o dashboard.** `SignInModal` só testa `person.account_type`; `ProtectedRoute` só valida sessão. Um usuário autenticado pode entrar por URL direta ou pelo botão de entrada no dashboard sem um gate durável que confirme onboarding obrigatório, membership, contexto e policy.
3. **O modelo atual não representa toda a ontologia de tenancy.** `organizations.parent_organization_id` existe, mas não há colunas físicas normalizadas para `tenant_kind` e `authority_level`. PF/PJ (`persons.account_type`) está sendo usado como atalho para “criar organização”, apesar de significar outra coisa. Há ainda as tabelas legadas `tenants`, `tenant_users` e `tenant_settings`, vazias no snapshot, com políticas baseadas em claims `tenant_id`/`super_admin` distintas do modelo ativo de `organizations`.

O destino é um **motor de jornadas versionadas e retomáveis** que serve às várias superfícies e tipos de tenant, com definições code-owned primeiro e publicação em banco somente quando os contratos de composição/bindings estiverem testados. O backend decide identidade, autoridade, parent, membership, roles, entitlements, campos obrigatórios e prontidão; o browser somente apresenta o fluxo e envia respostas.

## 2. Base de evidência e estado dos ambientes

### 2.1 GitHub e Vercel

| Evidência observada                                                                        | Estado                                                                                               | Implicação para o plano                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch `feat/complete-carbon-page-rebuild`, SHA `61216abeb9cf6a9aa3c778b77c794a054fd8711f` | Existe                                                                                               | Toda nova prova deve estar ligada a SHA específica; revalidar antes de executar.                                                                                                                                 |
| CI run `40243363999` (run 521)                                                             | `success`; combined status Vercel também success                                                     | CI verde prova somente os jobs executados naquele SHA, não jornada real ponta a ponta nem aprovação do PR.                                                                                                       |
| PR #7                                                                                      | Continua aberto no snapshot; a evidência de revisão obtida é `COMMENTED`, não `APPROVED`             | Não tratar como aprovado. O comentário do bot Vercel associado ao SHA atual afirma que falha ao carregar dados de pagamentos é escondida como estado vazio/zero. Resolver e testar antes de aceitar o dashboard. |
| Preview `dpl_FMjMAs16R6a9K1vK9TZjggpSQoH6`                                                 | `READY`, origem Git, SHA `61216ab...`, URL `https://generative-htp0myk5i-cestari-studio.vercel.app`  | É a Preview atual observada; `READY` não prova que os fluxos autenticados passaram E2E em rede.                                                                                                                  |
| Produção `dpl_DKhGFtHLWgyVZbcqYf2tQkhmhW6p`                                                | `READY`, alvo production, SHA `41357df385a2890565607fa52d2946891cf2890d`, alias `app.cestari.studio` | Produção não está no SHA atual da branch. Não promover automaticamente.                                                                                                                                          |

Fontes: [branch e código](https://github.com/cestari-studio/generative-os/tree/feat/complete-carbon-page-rebuild), [PR #7](https://github.com/cestari-studio/generative-os/pull/7), [Preview atual](https://vercel.com/cestari-studio/generative-os/FMjMAs16R6a9K1vK9TZjggpSQoH6), [produção observada](https://vercel.com/cestari-studio/generative-os/DKhGFtHLWgyVZbcqYf2tQkhmhW6p).

### 2.2 Supabase

| Evidência observada                                                                                                                | Estado                                                                                                                                     | Implicação                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto alvo `ldjfjmihdvdmltrptngf` (`generative-os`), PostgreSQL 17.11                                                            | Saudável; 24 migrations no snapshot                                                                                                        | Não confundir com o projeto irmão `jkespoegdpkdcrxsxwry` (`genOS`), que permanece read-only.                                                                                 |
| Catálogo normativo Fase 2                                                                                                          | 225 features, 100 operations, 200 configurations, 60 pages, 30 journeys, 4 entitlement profiles, 225 traceability; `registry_allowlist` 76 | Catálogo materializado é metadado, não prova que a funcionalidade está ligada.                                                                                               |
| `surface_definitions`, revisões publicadas, `operation_bindings` ativos, mensagens publicadas e mapeamentos normativos de settings | Todos zero                                                                                                                                 | Não habilitar renderização dinâmica a partir de banco nem declarar essas rotas/operações configuradas.                                                                       |
| `setting_definitions`                                                                                                              | 12 settings efetivos; escopos `organization`, `workspace`, `project`, `person`                                                             | São a fonte atual de settings operacionais. Os 200 normativos não viram 200 campos no formulário.                                                                            |
| `organizations`                                                                                                                    | 42 colunas; `parent_organization_id` existe                                                                                                | Não há coluna física `tenant_kind` nem `authority_level`/`tenant_authority_level` no snapshot. É um gap de modelo, não resolvido por exibir um `Select`.                     |
| `tenants`, `tenant_users`, `tenant_settings`                                                                                       | Tabelas legadas existem, sem linhas                                                                                                        | Modelo paralelo com políticas próprias: documentar como legado e decidir migração futura por ADR; não popular nem apagar por conveniência.                                   |
| `save_onboarding_progress`                                                                                                         | Grava `current_step` e `step_data` dentro de `persons.additional_property.onboarding`                                                      | Não há run/version/schema, step status por chave, TTL, state de validação autoritativo ou recovery idempotente. Dados fiscais podem ficar duplicados num JSON genérico.      |
| `create_or_update_corporate_tenant`                                                                                                | RPC `SECURITY INVOKER`; executável por `anon` e `authenticated`; corpo exige `auth.uid()`                                                  | Revisar grant público e separar create de update. Hoje aceita identifier do browser, upsert por identifier e pode promover o chamador a `org_owner` no caminho de conflito.  |
| `save_onboarding_progress`                                                                                                         | RPC `SECURITY INVOKER`; executável por `anon` e `authenticated`; corpo exige `auth.uid()`                                                  | Revisar grant `anon` com teste negativo; não considerar auth check de corpo como justificativa para deixar o endpoint exposto. Não alterar grants remotamente sem aprovação. |
| `create_organization_hierarchy`                                                                                                    | RPC `SECURITY DEFINER`, executável por authenticated                                                                                       | Analisar individualmente as verificações de role, policy, parent e grants; não revogar genericamente.                                                                        |
| `public.passkey_credentials`                                                                                                       | Existe, 0 linhas; `auth.webauthn_credentials` foi resolvida por `to_regclass`                                                              | Código de UI/context ainda lê `public.passkey_credentials`; não assumir que esse espelho representa as credenciais nativas atuais.                                           |
| Advisors                                                                                                                           | 13 avisos SECURITY DEFINER callable por authenticated; 17 FKs sem índice no snapshot                                                       | Revisar por função e evidência, sem sweep indiscriminado.                                                                                                                    |

Links: [Fase 1 contract](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/docs/phase1-configuration-contract.md), [Fase 2 review package](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/docs/phase2-review-package.md), [migration PF/PJ](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/supabase/migrations/20261018225420_onboarding_pf_pj_multi_country_and_chinese.sql).

## 3. Comparação dos planos e correções obrigatórias

| Achado                              | Plano “Login vs Onboard” (outro agente)                                                                                                                                | Plano longo de onboarding/tenancy                                                                                       | Decisão consolidada                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login versus onboarding             | Correto ao separar autenticação de configuração; porém afirma que `openOnboardingFlow()` abre o `OnboardingFullPage`                                                   | Correto ao separar login, pessoa, criação de tenant e configurações                                                     | Manter login separado. Corrigir integração: `Nav.jsx` monta `OnboardingTearsheet`; `/onboarding` monta `OnboardingFullPage`. Não declarar que são o mesmo fluxo.                                                                                                                                                                                                                                                                                                                      |
| Fonte de progresso                  | Não define um contrato de progresso de jornadas completo                                                                                                               | Identifica `additional_property.onboarding` como insuficiente e propõe persistência versionada                          | Adotar um ledger único de jornada/etapa no servidor; os componentes passam a ser visualizações do mesmo contrato.                                                                                                                                                                                                                                                                                                                                                                     |
| Conclusão antes do dashboard        | Não trata o gate de landing como regra universal                                                                                                                       | Propõe bloquear navegação quando persistência/etapas obrigatórias faltam, mas não reconcilia a checklist real existente | Implementar gate central em todas as entradas de rotas privadas usando requisitos do wizard/tenant/role/product; checklist do Dashboard lê o mesmo ledger.                                                                                                                                                                                                                                                                                                                            |
| PF/PJ                               | Apresenta `individual`/`organization_member` como branch principal para registro legal                                                                                 | Separa `account_type`, `tenant_kind`, authority, membership, entitlement e surface                                      | `account_type` classifica a pessoa; nunca determina authority nem cria tenant por si. Criação/join é uma escolha/ação distinta, autorizada no backend.                                                                                                                                                                                                                                                                                                                                |
| Tipo e autoridade de tenant         | Praticamente ausentes                                                                                                                                                  | Reconhece falta de colunas normalizadas e pede ADR/migration aditiva                                                    | Persistir `tenant_kind` + `authority_level` com contrato explícito depois do ADR; não usar `additional_property` como ontologia permanente.                                                                                                                                                                                                                                                                                                                                           |
| Passkey API                         | Afirma que `listPasskeys()`/`refreshPasskeys()` estão “Done”; propõe `auth.passkey.list()` e usa uma variável de erro que não pode existir se o helper só retorna `[]` | Propõe verificação de capability e gate externo, mas não resolve o API mismatch                                         | **Não implementar essa API por suposição.** Provar a API no pacote `@supabase/auth-js`/`supabase-js` exatamente resolvido pelo lockfile e em browser real. Estado `unknown` distinto de `no credentials`.                                                                                                                                                                                                                                                                             |
| Local do nudge de passkey           | Propõe aviso inline no dashboard; boa alternativa a modal não solicitado                                                                                               | Trata passkey como etapa de segurança do wizard                                                                         | Fazer passkey opcional e não bloqueante por padrão; só enforcement quando policy efetiva o exigir. Nudge aparece no shell autenticado comum, não apenas Dashboard, e é visível apenas se capability e resultado de detecção forem conhecidos.                                                                                                                                                                                                                                         |
| Carbon e superfície de autenticação | Mistura padrões visuais com afirmações de API sem prova                                                                                                                | Separa autenticação de onboarding, mas não fixa a seleção de componentes do login                                       | **Opção 3 escolhida:** autenticação/recovery com Carbon Core (`Form`, `TextInput`, `PasswordInput` quando aplicável, `Button`, `Link`, `InlineNotification` e estado de loading compatível com a versão instalada). Confirmar exports/types/props no lockfile; não presumir que `InlineLoading` ou `ActionableNotification` estejam cobertos pelo registry. `CreateFullPage`/`CreateTearsheet` de IBM Products são para onboarding, não login. MCP não foi comprovadamente executado. |
| Create tenant                       | Plano passkey não cobre esse risco                                                                                                                                     | Alerta para `Date.now()` e dados default                                                                                | Além do identifier feito no frontend, o Tearsheet provisiona no passo 0 antes do review final. Mover a mutação para um comando de confirmação idempotente e autorizado, ou aplicar ActionFrame/compensação conforme o runtime existente.                                                                                                                                                                                                                                              |
| Dashboard checklist                 | Não trata                                                                                                                                                              | Propõe uma checklist por tenant/produto                                                                                 | Substituir a checklist atual de 4 heurísticas (`name`, `workspaces.length`, `knowledgeDocuments.length`, `plan_tier !== free`) por requisitos persistidos reais e avaliados por contexto.                                                                                                                                                                                                                                                                                             |
| PII em drafts                       | Não trata de forma suficiente                                                                                                                                          | Reconhece PII no JSON de `additional_property.onboarding`                                                               | Documentos fiscais, ID secundário, nascimento e detalhes de representante só são coletados por finalidade válida, armazenados no registro de domínio certo e redigidos em logs. Draft genérico não deve duplicar PII.                                                                                                                                                                                                                                                                 |
| Operações/entitlements              | Passkey independente                                                                                                                                                   | Separa catálogo normativo de implementação real                                                                         | Não habilitar produto porque existe `catalog_features` ou `catalog_operations`; exige entitlement efetivo, policy, operation binding real/testado e evidência na SHA atual.                                                                                                                                                                                                                                                                                                           |
| Estado do PR e da entrega           | Não inclui estado corrente de CI/Preview/produção                                                                                                                      | Requer revalidar tudo                                                                                                   | Estado do snapshot: CI success, Preview feature `READY`, PR #7 tem revisão COMMENTED sobre zero/empty fabricado, produção no SHA `41357df`. Não é “ready for release” até resolver o comentário e concluir gates aplicáveis.                                                                                                                                                                                                                                                          |

### Erros específicos do plano passkey que não devem ser copiados

1. A árvore atual não define `listPasskeys()` ou `refreshPasskeys()` no `TenantContext.jsx`; o contexto lê/atualiza `public.passkey_credentials`. Portanto, dizer que esses helpers estão “Done” não corresponde ao source observado.
2. Se `listPasskeys()` retornar `[]` em qualquer erro, o chamador não consegue distinguir “lista vazia” de “falha na consulta”; a condição `if (listError)` fica sem contrato possível. Usar resultado discriminado (`checking`, `ready`, `unknown/error`, `unsupported`).
3. O login comum chama `openOnboardingFlow()`, cujo componente real é `OnboardingTearsheet`. A lógica condicional de passkey em `OnboardingFullPage` não cobre esse caminho por si só.
4. Os props de `ActionableNotification`/`InlineLoading` e o suporte ao API de passkeys devem ser comprovados para as versões locked, não assumidos de memória nem herdados de uma captura antiga.
5. O host atual do Preview é diferente de `app.cestari.studio`; não declarar que o passkey funciona ou não funciona nele só pela hostname. Confirmar RP ID/origins do Supabase Auth e executar em browser real no host autorizado; alterações do host/callback exigem aprovação separada.

## 4. Modelo canônico: tenant, pessoa, roles e produtos

### 4.1 Conceitos separados

- **Identity/session:** quem está autenticado.
- **`persons.account_type`:** pessoa (`individual`/PF ou `organization_member`/PJ no modelo atual). É classificação do cadastro individual, não autorização nem tipo de tenant.
- **`tenant_authority_level`:** lugar na árvore de autoridade (`master`, `agency`, `tenant`).
- **`tenant_kind`:** natureza organizacional (`platform_operator`, `creative_agency`, `holding`, `network`, `client`, `unit`, `sandbox`).
- **Parent:** organização pai validada no servidor, com profundidade e ciclo controlados.
- **Membership + role + policy:** ligação de usuário a uma organização/contexto e o que pode fazer. Nunca inferir Owner/Admin a partir de e-mail, perfil ou quem criou o registro.
- **Product + subproduct + capability + entitlement:** catálogo diz o que existe normativamente; runtime/entitlement diz o que está liberado nesta instância.
- **Workspace/Project:** contexto de trabalho no modelo físico atual; seu vínculo não cria tenant authority.
- **Surface `view`/`public`:** projeção autorizada, não novo tenant ou membership.
- **Settings cascade:** o código atual resolve `organization → workspace → project → person`; isso é um eixo de configuração diferente da autoridade `Master → Agency → Tenant`.

### 4.2 Matriz de fluxo por ator

| Ator/contexto                                       | Fluxo permitido                                                                                         | Campos/decisões específicos                                                                                          | Não permitido por padrão                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Pessoa nova ou pessoa existente sem contexto válido | Perfil mínimo → entrar por convite/membership existente, solicitar acesso ou iniciar criação autorizada | Nome só se ausente; locale canônica; contexto escolhido dos memberships devolvidos pelo servidor                     | Criar tenant automaticamente por marcar PF/PJ; expor dados fiscais no login |
| Membro convidado para Tenant existente              | Resolver e aceitar convite real; validar status/expiração; associar role delegado                       | Convite/role/organização vêm do servidor; aceitar termos exigidos pelo fluxo                                         | Criar organização paralela ou aceitar convite expirado                      |
| Owner/Admin de Tenant autorizado                    | Configurar contexto, ativar produtos autorizados e completar checklist específico                       | Organização/workspace/project real; capabilities e entitlements efetivos; passos do(s) produto(s) selecionado(s)     | Alterar authority ou assumir planos/quota pelo browser                      |
| Agency Owner/Admin delegado                         | Provisionar Tenants filhos (`client`, `unit`, `sandbox`) dentro dos limites permitidos                  | Parent Agency resolvida do contexto, policy, quotas, produtos filhos permitidos, owner/memberships                   | Criar outra Agency ou subir de autoridade sem grant/approval                |
| Master/Platform Operator                            | Bootstrap/gestão privilegiada por console privado e step-up/approval                                    | Ownership verificado, MFA/step-up conforme policy, segregação de funções, justificativa/audit                        | Signup público ou escolha de `platform_operator` em onboarding comum        |
| `creative_agency`, `holding`, `network`             | Wizard privilegiado de Agency, iniciado por Master/ator comercial autorizado                            | Identidade legal, topologia, delegação, produtos/capabilities, limites contratados, brand/domain se real e suportado | White-label/domain ativo antes de verificação e revisão                     |
| `unit`                                              | Provisionamento dentro de pai autorizado                                                                | Pai, scope, inherited settings/policies, owner e limites; parent membership revalidado                               | Herança implícita de membros ou leitura de dados                            |
| `sandbox`                                           | Provisionamento temporário com isolamento e expiração                                                   | Owner, propósito, expiry, quotas, providers e dataset de teste permitidos, cleanup                                   | Dados reais sem autorização ou sandbox sem TTL                              |
| View/Public                                         | Resolver superfície pública permitida por host/grant                                                    | Conteúdo explicitamente publicado e revogável                                                                        | Criar tenant/membership ou contornar guard privado                          |

A implementação deve descobrir e mapear os nomes reais dos roles no registry/funções existentes (ex.: `org_owner`, `org_admin`, `org_member`, `workspace_admin`, `project_owner`, `project_editor`, e `platform_role_assignments`) para as roles normativas. Essa matriz não deve ser uma enumeração hardcoded dentro do wizard e não deve inventar roles ausentes do registry. O mesmo vale para os quatro perfis de entitlement técnico: não os tratar como preço comercial.

## 5. Unificar os wizards e tornar a conclusão persistente

### 5.1 Um contrato, várias apresentações

Manter separados os **objetivos** de autenticação, entrada em contexto, criação de tenant e setup opcional, mas remover os ledgers independentes de progresso. O `OnboardingFullPage`, o `OnboardingTearsheet` e o `DashboardOnboarding` devem ser consumidores de **definições/versionamento e run ID compartilhados**. Decisão de UX a executar no ADR: preferir um wizard principal reutilizável Carbon IBM Products; a segunda superfície pode ser uma apresentação resumida/edição contextual, não um segundo workflow que provisiona entidades por sua própria lógica.

Contrato conceitual do run:

`wizard_key`, `wizard_version`, `schema_version`, `run_id`, `actor_id`, `subject_user_id`, `target_organization_id?`, `context_snapshot`, `policy_snapshot/version`, `entitlement_snapshot/version`, `current_step_key`, `run_state`, `created_at`, `updated_at`, `expires_at`, `completed_at`, `idempotency_key`, `correlation_id`.

Contrato conceitual do step:

`run_id`, `step_key`, `step_version`, `state`, `payload_minimizado`, `validation_state`, `saved_at`, `verified_at`, `completed_at`, `evidence_ref?`, `error_code?`, `retryable?`. Constraints mínimos: uma linha por `(run_id, step_key)`; update concorrente com revision/optimistic concurrency; payload allowlisted e schema-validado. Não armazenar tokens/secrets/passkeys ou cópia desnecessária de documentos fiscais no payload genérico.

Estados base: `locked → available → in_progress → valid → completed`; incluir `invalid`, `skipped` apenas quando permitido pela definição, `expired`, `blocked` e `failed` para estados de impedimento/execução. A conclusão de um step exige evidência autoritativa do backend, não o clique em Next. Reabrir os passos afetados se policy/definition/entitlement mudar enquanto o wizard está suspenso.

**Persistência atual não basta:** o RPC grava JSON em `persons.additional_property.onboarding`. Na Fase 1, comparar `ActionFrames`, entidades/workflow tables e policies já existentes; se não houver registro compatível (o inventário atual não retornou tabela `wizard`/`onboarding`), propor migration aditiva para `onboarding_runs` e `onboarding_step_states` ou contrato equivalente, mais RLS e lifecycle. Não aplicar essa migration remotamente sem autorização explícita. Até isso ser implementado, o fluxo não deve afirmar “retomável por etapa” nem usar a checklist como gate confiável.

### 5.2 Gate obrigatório para o dashboard principal

Criar uma operação/consulta server-authoritative de `resolve_onboarding_readiness` (ou adaptar operação existente após exame de contracts, sem pressupor que ela existe). Ela retorna: `decision = allow | require_steps | blocked | unavailable`, a razão taxonomizada, contexto efetivo, steps incompletos/locked, quais são obrigatórios, próximo step permitido e `run_id`. Não usar um `step_status` enviado pelo browser como prova.

Em cada autenticação (senha, OTP/magic link, passkey se suportada), recuperação de sessão, troca de contexto e entrada em rota privada:

1. Validar identidade/sessão no servidor.
2. Resolver a pessoa e os memberships válidos; determinar se há zero, um ou vários contextos permitidos.
3. Se zero contextos, permitir apenas fluxo de ingressar por convite/solicitar acesso/criar o que a policy autoriza.
4. Resolver authority, tenant kind, membership/role, policies, entitlements e settings efetivos.
5. Resolver a definição de onboarding aplicável à combinação de ator/contexto/product.
6. Se faltar um step **obrigatório**, direcionar a ele sem montar o Dashboard. Rota direta, link salvo, refresh e `WelcomeHeader` não podem pular o gate.
7. Se o step ou dependência obrigatória estiver não implementada, `BLOCKED` com explicação/ação de solicitação; não marcar completo.
8. Quando todos os gates core forem confirmados, permitir o Dashboard. Setup opcional de produtos permanece como checklist acessível, sem bloquear áreas que a policy autoriza.

O gate deve ser centralizado, não espalhado apenas no `SignInModal`. `ProtectedRoute` atualmente testa `user` e devolve children; essa função precisa integrar o resolved readiness e manter acesso de “sign out / unavailable / forbidden / retry” corretamente. Progresso e autorização são coisas diferentes: concluir um step nunca concede role, membership ou entitlement.

### 5.3 Steps-base (condicionais, não um formulário universal)

**A. Login e recovery — Carbon Core (opção 3 selecionada)** — superfície de autenticação independente do wizard: `Form`, `TextInput` para e-mail/identificador, `PasswordInput` somente quando password for o método habilitado, `Button` para ação primária, `Link` para recuperação/alternância de método e `InlineNotification` para erros/avisos. Loading deve usar componente/API comprovados na versão instalada; não introduzir `InlineLoading` por suposição. Recovery é fluxo separado e coleta apenas o identificador necessário. Nunca coletar tax ID, endereço ou tenant type no login. Erros de credencial anti-enumeração; loading verdadeiro; bloquear double submit; não navegar em falha. OTP/passkey só aparecem se o método e o contrato real estiverem habilitados.

**B. Pessoa e contexto** — nome, se ausente; idioma BCP 47 suportado; escolher entre memberships/convites reais ou solicitar acesso. Escolher Organization/Workspace/Project apenas do resultado do servidor; limpar cache/query state ao trocar de contexto. PF/PJ não obriga criação de entidade.

**C. Registro legal PF/PJ (sob finalidade comprovada)** — `full_name`; tax ID local e data de nascimento só se legal/funcionalmente exigidos; documentos secundários não fazem parte do mínimo universal. Para organização: razão social, nome de exibição, país/jurisdição e ID legal/registro quando exigidos. Os valores devem ser validados pelo país no servidor; os placeholders devem parecer exemplos de formato, não nomes ou organizações falsas. Separar `address`, `billing_address` e endereço residencial por finalidade.

**D. Provisionar Tenant cliente/Unit/Sandbox** — preconditions de auth + actor permission + parent autorizado + produto/entitlement + limites/policy. Parent/authority derivados pelo servidor. Escolher tipo permitido no escopo da ação; capturar nome e dados legais mínimos. Owner vem da identidade/convite confirmado. Criar workspace/project por nome explícito ou template publicado com confirmação — nunca um “Default Project” silencioso. Governança/retention/residency e integração são steps condicionais conforme policy/produto.

**E. Provisionar Agency/Holding/Network** — fluxo privado autorizado por Master/commercial-admin, identidade legal, topology e parent Master, delegações, catálogo/perfis de filhos, limites de produto e billing contratados, owner/admins, governance e termos. Domínio/white-label só entra se a capability existir e a verificação estiver implementada. Aprovação de risco e audit record explícitos.

**F. Ativação de produto** — apresentar só os cinco produtos canônicos (`Content Factory`, `AcademyOps`, `ScheduleOps`, `ReputationOps`, `ClientOps`), mas habilitar apenas os com entitlement, policy, migrations/contracts, binding de operação e runtime testado. O catálogo normativo não é catálogo de disponibilidade. Não exigir AI chat: `AGENTS.md` diz que Chat with AI está fora do MVP.

**G. Review/confirm** — resumo de parent/kind/owner/membership, workspaces/projects, produtos/entitlements, políticas/dados e integrações; diff e efeitos; ação confirm explícita. Criar via operação server-side idempotente e retornar IDs/estados/correlation/audit. A UI só declara provisionado após resposta real.

**H. Primeiro valor útil** — escolher primeiro fluxo real a partir do produto/capability autorizado (ex.: item de conteúdo, solicitação, agendamento, caso de reputação ou fonte de conhecimento conforme bindings reais). Se não existe operação `WIRED`/testada, mostrar bloqueio específico, não simular resultado nem dizer `E2E_VERIFIED`.

### 5.4 Checklist por tenant/product/role

Substituir a checklist atual de quatro cartões por tarefas derivadas da definição da jornada e verificadas pelo backend. Cada item deve ter: `requirement_key`, `audience/role predicate`, `tenant_kind/authority predicate`, `product/capability predicate`, `required_for_dashboard`, `required_for_product`, `operation/binding reference`, `completion predicate`, `evidence`, `owner`, `retry/remediation`.

As heurísticas existentes são inválidas como fonte de conclusão:

- `activeOrganization.name` não prova cadastro legal ou provisioning completo;
- `workspaces.length > 0` não prova que o usuário tem membership/permission no workspace escolhido;
- `knowledgeDocuments.length > 0` não prova ingestão/indexação correta nem o embedding dimension descrito no cartão;
- `plan_tier !== 'free'` não prova ativação válida de produto ou entitlement.

O cartão no dashboard pode resumir o ledger, mas nunca definir sozinho o estado. Dados reais vazios e falhas de leitura são estados distintos; corrigir a issue apontada no review do PR #7 sobre pagamentos zerados em caso de erro.

## 6. Persistência, atomicidade e segurança

1. **Não provisionar no primeiro step do formulário.** `OnboardingTearsheet.handleNext()` chama `createOrUpdateCorporateTenant()` no step 0 antes de o usuário revisar e confirmar a jornada completa. Mover para final confirm ou um ActionFrame idempotente. Persistência de progresso e side effects de criação precisam ter recovery explícito.
2. **Remover identificador criado no browser** a partir de nome e `Date.now()`. Identificador canônico é gerado/validado no backend com unicidade e chave idempotente. Retentativa após timeout retorna mesma operação/run, não novo tenant.
3. **Não usar `create_or_update_corporate_tenant` como criação universal.** A função atualmente faz upsert por `identifier`, atribui `org_owner` ao chamador e provisiona workspace `core`/projeto `main`; não recebe `tenant_kind`, `authority_level`, parent, catálogo de products, roles ou entitlements. Separar comandos autorizados de `create` e `update` e implementar parent/authority/effects no contrato, após ADR e testes.
4. **Atomicidade:** organização + parent link + owner membership + workspace/project + initial entitlements/config snapshot + audit/outbox devem ser transação atômica ou ActionFrame com idempotency, checkpoint e compensações. Testar concorrência, timeout pós-commit, retry, falha entre steps e recovery sem duplicação.
5. **RLS/policy:** testar como `anon`, usuários authenticated distintos, owner/admin/member por tenant e roles de platform. Cross-tenant read/write deve falhar; IDs enviados pelo browser são revalidados com `auth.uid()`, membership, parent e org context. Não elevar permissão por completar wizard.
6. **PII:** `save_onboarding_progress` hoje grava campos de PII em `additional_property.onboarding.step_data`. Não ampliar isso sem schema allowlist, redaction, TTL e policy de acesso. Armazenar dados legais no registro canônico correto; não colocar documento fiscal/token em logs, analytics, screenshots ou CI artifacts. A reidratação deve respeitar permissão, prazo e classificação.
7. **RPC grants:** realizar security review dos privilégios `anon EXECUTE` em `save_onboarding_progress` e `create_or_update_corporate_tenant`; escrever teste de negação anônima. Propor migration de grant estrita se necessário, sem aplicar remotamente nesta execução sem autorização explícita.
8. **Falhas de leitura:** diferenciar `loading`, `ready + empty`, `forbidden`, `unavailable`, `failed`, `stale` e `partial`. Não esconder falhas atrás de `[]`, zero, fallback nominal ou catch vazio. Rever `applySettingCascade(...).catch(() => {})`: se idioma é parte de completion, falha precisa bloquear; se é não-crítico, apresentar estado/retry e não alegar persistência.

## 7. Settings, registries e superfície

- `setting_definitions` é fonte de 12 settings operacionais atuais. UI categorizada por propósito; valor efetivo, origem/escopo, cascata, lock e última atualização só se dados reais estiverem disponíveis. `LOCKED` não tem input editável.
- `catalog_configurations` 200 é referência; `setting_normative_map` e `_terms` vazios no snapshot não autorizam declarar mapeamento completo. Mapeamentos `exact`/`partial`/`none` exigem contrato e evidência, nunca equivalência por nome parecido.
- Antes de publicar surfaces, comparar `runtime-registries.js`, `registry_allowlist` e `npm run registry:check`. Só as rotas físicas allowlisted podem ser compostas: `/`, `/dashboard`, `/dashboard/:id`, `/products`, `/knowledge`, `/payments`, `/settings`, `/onboarding`, `/reset-password`, `*`. Não criar 60 rotas a partir dos 60 page keys.
- Todas as `surface_definitions`, `surface_revisions`, `operation_bindings` e mensagens permanecem `BLOCKED/empty` até catalog keys e render contracts terem mapping, validators, endpoint/auth schemas, tests e review; o DB guarda keys, nunca JSX/import/CSS/JS/SQL/URLs arbitrárias.
- Maturity é evidência-first: `NORMATIVE_ONLY → MAPPED_UNVERIFIED → CONFIGURED → WIRED → INTEGRATION_VERIFIED → E2E_VERIFIED`. Status `E2E_VERIFIED` deve expirar quando SHA/contract version muda.

## 8. Carbon e passkeys

### Carbon — seleção de componentes fixada

**Decisão de UX aprovada pelo usuário: opção 3 — Carbon Core para autenticação.** Aplicar a seleção à superfície de login/recovery do projeto `generative-os`; não a confundir com os componentes IBM Products usados nos wizards de provisionamento.

| Superfície                                           | Componentes Carbon Core propostos                                                                                                           | Contrato de uso                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login por e-mail/senha                               | `Form`, `TextInput`, `PasswordInput`, `Button`, `Link`, `InlineNotification`                                                                | Renderizar apenas métodos realmente habilitados; label persistente, autocomplete adequado, submit único, erros acessíveis e sem navegação em falha.                       |
| Login por OTP/magic link, se habilitado              | `Form`, `TextInput`, `Button`, `Link`, `InlineNotification`                                                                                 | Campos e ações seguem o contrato real do provedor; não exibir método apenas porque há componente visual.                                                                  |
| Recuperação de acesso                                | `Form`, `TextInput`, `Button`, `Link`, `InlineNotification`                                                                                 | Fluxo/rota separados; resposta anti-enumeração; não confirmar se o e-mail existe. `PasswordInput` só na tela de definição de nova senha, se esse fluxo realmente existir. |
| Loading e submissão                                  | `Button` em estado busy/disabled somente se suportado; componente de loading Carbon compatível com a versão locked                          | Verificar exports, tipos e props. Não depender de `InlineLoading` sem prova da versão instalada e do registry. Nunca simular sucesso ou trocar erro por vazio.            |
| Erro de rede/provedor/sessão                         | `InlineNotification` ou outro padrão já aprovado e comprovado                                                                               | Distinguir erro recuperável, indisponibilidade, credenciais inválidas e sessão expirada; oferecer retry/sign-out quando apropriado.                                       |
| Onboarding/provisionamento (fora da seleção de auth) | `CreateFullPage`/`CreateFullPageStep` ou `CreateTearsheet`/`CreateTearsheetStep`, de `@carbon/ibm-products` se confirmados no pacote locked | Apresentações diferentes podem consumir o mesmo `run_id` e ledger; nenhuma deve manter lógica de provisioning própria.                                                    |

**Regras de importação:** componentes Core de autenticação devem vir de `@carbon/react` quando exportados pela versão resolvida. Padrões `Create*` pertencem a `@carbon/ibm-products` conforme a versão instalada. Não importar componente de um pacote por semelhança de nome nem assumir API de uma versão documental diferente. Validar imports, types, props, acessibilidade e comportamento no build/teste do projeto.

Ler e aplicar as referências oficiais:

- Onboarding: https://www.carbondesignsystem.com/building-experiences/onboard
- Login: https://www.carbondesignsystem.com/building-blocks/core/patterns/login
- Forms: https://www.carbondesignsystem.com/building-blocks/core/patterns/forms
- Loading: https://www.carbondesignsystem.com/building-blocks/core/patterns/loading
- Disclosures: https://www.carbondesignsystem.com/building-blocks/core/patterns/disclosures
- Dialogs: https://www.carbondesignsystem.com/building-blocks/core/patterns/dialogs
- Common actions: https://www.carbondesignsystem.com/building-blocks/core/patterns/common-actions

Essas fontes orientam primeiro valor em tempo curto, somente campos necessários, grupos previsíveis, loading verdadeiro, disclosures acionados pelo usuário, dialogs raros e explícitos, e ações proporcionais a permissão/risco.

**Carbon Builder/MCP gate:** a ferramenta deve descobrir componentes/ícones por APIs oficiais e emitir evidência por arquivo quando estiver disponível no ambiente executor. Nesta sessão não foi demonstrado que `@carbon-builder` MCP foi chamado. O plano de outro agente dizer “MCP-verified @carbon/react@1.73” não bate com o lockfile, que resolve `@carbon/react@1.117.0` / `@carbon/ibm-products@2.100.0`. Antes de usar `ActionableNotification`, `InlineLoading` ou outros componentes/props, verificar a API/types dessa versão e atualizar `src/config/carbon-component-patterns.json` + schema/gates, com testes. Se MCP não estiver autenticado/disponível, marcar apenas essa parte `BLOCKED_EXTERNAL_ACCESS`; prosseguir com docs oficiais, registry local e `npm run check:carbon-patterns`. Não declarar auditoria feita sem logs.

### Passkey

- Login/assertion e registro/attestation são tarefas diferentes, mas a inscrição é opcional até policy efetiva exigir o fator. `auth.require_passkey` está `LOCKED` com default `false` no settings atual; o catálogo normativo que menciona `auth.passkey_enabled` não é valor efetivo.
- Antes da UI, provar qual API de listar credenciais existe na versão npm locked `@supabase/auth-js`/`@supabase/supabase-js` 2.118.0 e em ambiente browser real. O código atual chama `registerPasskey()`/`signInWithPasskey()` no contexto, mas a listagem usa a tabela pública `passkey_credentials` vazia; **`auth.passkey.list()` não está estabelecido no código consultado nem foi validado aqui**.
- O helper deverá preservar estado discriminado `unknown/error` versus `ready([])`, jamais colapsar erro para lista vazia. Não mostrar “active/registered” sem listar confirmação real após o ceremony. Validar RP ID, origins, secure context e host da Preview/prod com evidence; não alterar configurações Auth/dominio/callback sem aprovação.
- Passkey nudge deve ser user-triggered, inline e dismissible, sem modal imprevisto. Se a API ou RP context não estiver confirmado, oferecer apenas um estado honesto com caminho de suporte/ambiente adequado; não inventar o estado “sem passkey”. Testar sign-in, register, cancel, unsupported, erro de listagem, outra sessão, logout e troca de usuário.

## 9. Plano único de execução autônoma

O agente executa na ordem, mas quando um gate externo bloquear, registra prova/owner/ação faltante e continua os itens independentes. Não faz merge, push, migrations remotas, mudança de grant/policy/RLS, deploy, promoção, mudança de domínio/Auth settings, nem toca identity record protegido sem autorização específica. O projeto normativo `cestari-studio/genOS` continua read-only.

### Fase 0 — Preflight invariável

- [ ] Capturar `HEAD`, árvore/diff/untracked, branch, PR #7, reviews/threads/status checks e branches/PRs drafts no GitHub; confirmar CI run `40243363999` e o review comentado de pagamentos. Distinguir comentários automatizados de approval humano.
- [ ] Conferir Vercel Preview SHA/ID/URL e production SHA/alias, protection e environment metadata. Não inferir E2E pela palavra `READY`.
- [ ] Ler `AGENTS.md`, phase0/phase1/phase2/phase6/phase7 manifests, `release-evidence-ledger.md`, route matrix, WCAG checklist, migrations e scripts de CI.
- [ ] Fazer read-only preflight no Supabase alvo correto: migrations, funções/RPCs, RLS, grants, enums, org/person/member/workspace/project/legacy tables, 12 settings, catálogo/registry/bindings, advisors. Identificar APIs concretas existentes para wizard/workflow, audit, idempotency, event/outbox e ActionFrames.
- [ ] Resolver Carbon Builder/MCP e validar docs/componentes usando versões exatas do lockfile; se indisponível, registrar blocker sem fingir chamada MCP.

**Gate 0:** targets e baseline documentados; qualquer ambiguidade de target bloqueia operações dependentes sem tentar outro ambiente.

### Fase 1 — Source-of-truth e Gap Protocol

- [ ] Fixar o snapshot normativo `genOS@ffd97fa93ab425fff6bac5015d34944ef924090c` como read-only.
- [ ] Gerar a matriz: `journey_key → wizard_key/version → step_key → role/tenant predicate → fields/schema → operation_id → endpoint/RPC → entity/table → policy/entitlement → tests → evidence`.
- [ ] Comparar os dois wizards, `DashboardOnboarding`, `SignInModal`, `ProtectedRoute`, `TenantContext`, `useTenant`, RPCs e rotas. Documentar os quatro estados atuais de falha: múltiplos ledgers, first-step side effect, rehydration sem voltar ao step e direct-route gate incompleto.
- [ ] Identificar roles e permissão efetivas em funções/policies/registries; não inventar mapeamento para nomes normativos não materializados.
- [ ] Produzir ADR de tenancy schema: mapear `tenant_kind`, `authority_level`, parent tree, legado `tenants*`, membership roles/status, RLS, source of truth e migração/recovery. Sem migration remota.

**Gate 1:** cada campo/step/role/operation tem owner, fonte, finalidade e requisito; lacunas passam por ADR/Gap Protocol em vez de suposição.

### Fase 2 — Contratos de wizard e policy

- [ ] Definir schemas tipados e versionados para pessoa/context, join/invite, client tenant, Agency, Unit, sandbox, product activation, settings e connection. Cada definição especifica audience, preconditions, branch rules, stable `step_key`, version, fields, validation, persistence/redaction/TTL, resume policy, completion gate, output actions e erro/compensation policy.
- [ ] Declarar que os seis primitives normativos (identity/context, configuration, resource-builder, review/approval, connection/auth, release/operations) são reutilizáveis; não criar um motor por produto.
- [ ] Definir dashboard gate e requisitos obrigatórios vs opcionais por role, authority/kind e produto. O núcleo obrigatório é identity/session + contexto válido com membership/policy + registro/run de onboarding que prova os steps core; passos específicos de produto somente bloqueiam quando o produto foi selecionado e a sua policy os exige.
- [ ] Não exigir fiscal identity, pagamento, integração, knowledge upload, passkey ou setup de todos os produtos de qualquer usuário por padrão. Um admin de tenant, um membro comum e um Agency owner têm passos diferentes.

**Gate 2:** estado de readiness pode ser derivado determinística e server-side da definição versionada + dados reais + policy snapshot.

### Fase 3 — Persistência de run e etapas

- [ ] Confirmar se há entidade workflow/ActionFrame aproveitável. Se não houver, desenhar migration aditiva para `onboarding_runs` e `onboarding_step_states` ou modelagem equivalente; incluir RLS por actor/contexto, foreign keys, unique constraints, TTL/cleanup, audit events, schema allowlist e versão.
- [ ] Migrar dados de progresso existentes de `persons.additional_property.onboarding` de forma compatível/forward-only (preservar histórico, minimizar PII e fazer fallback legacy read-only com versão). Não editar migration já aplicada.
- [ ] Persistir cada step depois de validação/salvamento confirmado; usar stable IDs/version. Load errors devem mostrar “não foi possível recuperar”, não iniciar silenciosamente como fluxo novo. Não rehidratar PII expirado ou sem autorização.
- [ ] Testar RLS como atores distintos, replay, double submit, aba duplicada, race, logout/login, browser reload, policy/registry change, expiry, falha de rede e timeout pós-commit.

**Gate 3:** o servidor distingue run ausente, em progresso, bloqueado, completo e expirado; cada step incompleto é reprodutível em read-back.

### Fase 4 — Corrigir tenancy e provisioning

- [ ] Separar comandos e contratos para join existing, accept invite, request access, create client Tenant, create Unit, create sandbox e create Agency/Holding/Network. Master bootstrap é privado.
- [ ] Propor e testar campos/enums/funções normalizados para kind/authority/parent; não gravar esses conceitos em JSON de apresentação. Parent, tenant kind e authority são derivados e verificados no servidor.
- [ ] Substituir identifier do browser e `Date.now()` por geração de ID/slug segura no backend e idempotency key estável por run.
- [ ] Remover `createOrUpdateCorporateTenant()` do step 0 do `OnboardingTearsheet`; fazer confirmação transacional após summary. Auditar e separar create/upsert/update — não elevar owner por um conflito de identifier.
- [ ] Criar owner membership, workspace/project e entitlements somente por operações autorizadas; validar parent, quota, status, cycle/depth, memberships e entitlement; prova cross-tenant negativa.
- [ ] Revisar `anon EXECUTE` de `save_onboarding_progress` e `create_or_update_corporate_tenant`; preparar migration de grants/testes caso deva ser corrigido. Nada remoto sem autorização.

**Gate 4:** replay não duplica organização/membership/workspace/project; falha não deixa provisioning parcial sem recovery; authority não é controlada pelo browser.

### Fase 5 — Canonizar a UX e o redirect

- [ ] Selecionar a implementação de presentation principal. `OnboardingFullPage` pode ser wizard principal e Tearsheet pode ser uma apresentação reduzida que referencia o mesmo run, ou vice-versa; não permitir duas lógicas/side effects independentes.
- [ ] Ajustar `SignInModal` para resolver `readiness`, não `account_type` como proxy de setup concluído. Implementar a superfície com Carbon Core conforme a opção 3: `Form`, `TextInput`, `PasswordInput` quando aplicável, `Button`, `Link` e `InlineNotification`; confirmar API/props no lockfile. Unificar comportamento em password, OTP, passkey suportada e refresh de sessão, sem mostrar métodos não habilitados.
- [ ] Aplicar o readiness gate em `ProtectedRoute`, links para Dashboard, deep links e sessão restaurada. Se required step faltante, redirect para `step_key` permitido; quando todos os passos obrigatórios forem completos, continuar para Dashboard. Remover loop de redirect e preservar rota de recovery/logout.
- [ ] Trocar `DashboardOnboarding` heurístico por checklist baseada em ledger; os status “done” vêm de predicates definidos/testados no backend. Setup opcional continua pós-landing.
- [ ] Tratar `ready/empty/forbidden/unavailable/failed/partial` como estados diferentes em todas as páginas. Corrigir o erro do PR #7 que converte falha de load financeiro em zero/vazio.

**Gate 5:** a mesma decisão de readiness vale por todas as formas de autenticação e entrada; não há bypass por URL direta ou false-positive de checklist.

### Fase 6 — Formulários condicionais e validação

- [ ] Implementar field schema com `field_key`, `entity/data_path`, label/help message key, control type/data type, `visible_when`, `required_when`, `read_only_when`, validators, normalization, sensitivity, purpose, classification, persistence strategy, source of truth, allowed scopes e schema version.
- [ ] Dados fiscais PF/PJ e endereço são condicionais por finalidade e país; `TextInput`, nunca `NumberInput`, para IDs com zeros à esquerda; validação local de UX + validação servidor (incluindo checksum quando regra confiável existir).
- [ ] Não limpar automaticamente dados incompatíveis ao alternar branch PF/PJ/kind sem confirmação e política de retenção explícita.
- [ ] Inputs obrigatórios derivados do mesmo schema de validação de servidor; erro mantém dados digitados e bloqueia avanço. Loading real e botão desabilitado durante submit; labels não dependem de placeholder.
- [ ] Não disponibilizar opções de tenant type/role/product que o ator não tem permissão de criar. View/Public não cria tenant.

**Gate 6:** todos os fields têm finalidade/data source, validator, i18n, privacy class, persistence e teste; nenhum input expõe configuração indisponível.

### Fase 7 — Settings e surface registry

- [ ] Criar a UI somente para 12 settings efetivos em `setting_definitions`, agrupados por propósito e governados por `allowed_levels`, `value_schema`, `default_cascade_rule` e policy. `LOCKED` readonly e mostrar fonte/valor efetivo.
- [ ] Mapear os 12 para catálogos normativos por relação comprovada exact/partial/none; `setting_normative_map` está vazio e não é para inferir semanticamente.
- [ ] `npm run registry:check`; seed `registry_allowlist` gerado, não editar manualmente. Definir `surface_definitions` e revisões inicialmente draft para as rotas físicas permitidas; bind apenas operações implementadas/testadas; inserir mensagens i18n necessárias com locale/ICU/placeholders/limits.
- [ ] Revisar validação de publicação e security model. Publicar somente depois de revisão e evidência; não ativar renderização dinâmica de superfície enquanto as tabelas estejam vazias/incompletas.

**Gate 7:** no runtime é usado somente um binding publicado e verificado; o DB nunca injeta código/rota arbitrária; não há 200 settings genéricos.

### Fase 8 — Passkeys e Carbon Builder

- [ ] Provar API nativa de list/register/sign-in no pacote locked e no ambiente de auth atual; adicionar teste de runtime browser. Se list API não existir, selecionar fonte suportada/documentada segura ou deixar o status como `unknown` e o recurso bloqueado.
- [ ] Conferir Auth configuration real, RP ID/origins, Preview/prod host e secure context; não mudar host/origin/settings sem autorização.
- [ ] Implementar passkey enrollment como feature opcional; enforcement só via policy efetiva. Aviso inline não-modal, user-triggered, dismissible; nunca atrapalhar o setup/primeiro acesso nem dizer “sem credencial” quando a listagem falhou.
- [ ] Validar os componentes Carbon Core de autenticação selecionados (`Form`, `TextInput`, `PasswordInput`, `Button`, `Link`, `InlineNotification`) e os padrões IBM Products `Create*` usados no onboarding contra exports/types/props da versão locked. Usar Carbon Builder MCP se disponível; se ausente, seguir docs oficiais + registry local, marcar apenas MCP check como blocked e usar `npm run check:carbon-patterns`. Atualizar `src/config/carbon-component-patterns.json`, schema e testes quando o componente aprovado mudar; não declarar MCP concluído sem log de execução.

**Gate 8:** nenhum claim de passkey/Carbon API sem teste/saída real; ausência de passkey não confunde com API indisponível.

### Fase 9 — Testes integrados e preview E2E

- [ ] Unit/contract: field visibility/required, PF/PJ/kind branch, state machine, resume/replay, readiness redirects, error taxonomy, canonical `ja-JP`; login/recovery Carbon Core (labels, submit, loading, erro anti-enumeração, retry, teclado/aria e ausência de navegação em falha).
- [ ] SQL disposable PostgreSQL 17: RLS cross-tenant, grants, step read/write authorization, parent/cycle/depth, authority spoof, invite expiry, entitlement absence, duplicate identifier, idempotency, transactional rollback/recovery, TTL/redaction, no PII in logs.
- [ ] Rodar `npm run lint`, `npm test`, `npm run build`, `npm run check:branding`, `npm run check:matrices`, `npm run check:carbon-patterns`, `npm run registry:check`, SQL harnesses pertinentes e SSR/browser smoke. Confirmar o workflow de CI chama de fato `test:phase2-sql` e outros harnesses necessários; script no package.json não prova execução.
- [ ] E2E no Preview Git-source do SHA testado — auth, no context, single/multiple membership, new client tenant, invitation, agency delegated child, unit, sandbox, product selected/unavailable, incomplete required step, step persistence/reload, failure retry, direct URL gate, settings locked, optional/required passkey, first-value operation real.
- [ ] Testes de UI por locale (`pt-BR`, `en`, `de`, `ja-JP`, `zh-CN` se realmente suportados), themes white/g100, desktop/tablet/mobile, loading/empty/error/forbidden/success. Axe não substitui revisão manual WCAG 2.2 AA. Não reutilizar screenshots de SHA anterior.

**Gate 9:** E2E ligado à mesma SHA/deployment e às entidades reais; não declarar `E2E_VERIFIED` apenas com CI local ou screenshots.

### Fase 10 — Handoff e owner gates

- [ ] Atualizar evidence ledger, route/page matrix, Phase 7 manifest e manual WCAG checklist com a mesma SHA, deployment ID, timestamps, links a artifacts acessíveis e outcome por rota/step.
- [ ] Resolver review comment do Vercel bot sobre erro de pagamentos/estado zero; reexecutar check e obter revisão humana de PR #7. Verificar required checks/rulesets pela interface autorizada, sem presumir se o conector não mostrar.
- [ ] Registrar findings de security/performance advisors individualmente e as decisões (corrigido, aceito com justificativa, bloqueado).
- [ ] Produzir handoff `READY_FOR_HUMAN_REVIEW` com diffs, migrações propostas, impacto, rollback/forward recovery, riscos e autorizações pendentes. Não merge, push, aplicar migration, alterar grant/policy, deploy nem promover produção por conta própria.

**Gate final:** ready para revisão humana só quando CI, policy/security, readiness gate, persisted ledger, Preview E2E, accessibility, artefatos e PR/review estiverem coerentes. Produção é uma decisão separada.

## 10. Definition of Done objetiva

- [ ] Existe uma única autoridade persistente para progresso e conclusão por run/step, com versões, RLS, TTL, schema validation, audit e idempotency.
- [ ] Todos os caminhos login/restauração/URL direta resolvem sessão + membership + role/policy + authority/kind + entitlement + required steps do servidor antes do dashboard principal.
- [ ] Os tipos de tenant existentes e os produtos/roles aplicáveis são resolvidos por policy/registry/entitlement, não hardcoded no browser; PF/PJ não cria autoridade.
- [ ] O provisionamento é idempotente e transacional/recoverable; não há tenant criado no primeiro step sem confirmação.
- [ ] Passos ausentes são persistidos, aparecem com próximo passo/motivo e não desaparecem após reload/login; itens opcionais não bloqueiam dashboard se policy não exigir.
- [ ] Os três componentes de onboarding/checklist não mantêm estados rivais; todos leem o mesmo contrato.
- [ ] PII mínima e finalidade clara; nada sensível é duplicado em log/analytics/generic draft sem política.
- [ ] Settings usa os 12 valores efetivos e não confunde 200 configurações normativas com campos editáveis.
- [ ] Autenticação usa a seleção Carbon Core aprovada; exports/types/props e estados têm testes. Passkey API/Carbon MCP/APIs externas têm evidência real ou são marcadas como bloqueadas; sem claims não provados.
- [ ] Testes e artifacts estão vinculados à SHA/deployment exata; PR #7 tem review/approval apropriados e issue de pagamento resolvida.
- [ ] Nenhum remote mutation executado sem autorização específica.

## 11. Referências normativas e de implementação

**genOS normativa (`genOS` read-only):**

- [Foundation Specification v0.9.0](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/genOS_Foundation_Spec_v0.9.0.md)
- [Functional Taxonomy](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/FUNCTIONAL_TAXONOMY.md)
- [Product Functional Coverage](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/PRODUCT_FUNCTIONAL_COVERAGE.md)
- [Feature Registry](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/feature-registry.json)
- [Traceability Matrix](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/traceability-matrix.json)
- [Product Registry](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/product-registry.json)
- [Subproduct Registry](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/subproduct-registry.json)
- [Entitlement Registry](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/entitlement-registry.json)
- [Journey Registry](https://github.com/cestari-studio/genOS/blob/ffd97fa93ab425fff6bac5015d34944ef924090c/docs/specs/v0.9.0/registries/journey-registry.json)

**Target repo (`generative-os`):**

- [AGENTS.md](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/AGENTS.md)
- [TenantContext.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/context/TenantContext.jsx)
- [OnboardingFullPage.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/components/onboarding/OnboardingFullPage.jsx)
- [OnboardingTearsheet.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/components/onboarding/OnboardingTearsheet.jsx)
- [DashboardOnboarding.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/pages/dashboard/DashboardOnboarding.jsx)
- [SignInModal.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/components/auth/SignInModal.jsx)
- [ProtectedRoute.jsx](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/components/auth/ProtectedRoute.jsx)
- [runtime-registries.js](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/config/runtime-registries.js)
- [Carbon pattern registry](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/src/config/carbon-component-patterns.json)
- [Phase 1 configuration contract](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/docs/phase1-configuration-contract.md)
- [Release evidence ledger](https://github.com/cestari-studio/generative-os/blob/feat/complete-carbon-page-rebuild/docs/release-evidence-ledger.md)

**Carbon official patterns:**

- [Onboarding](https://www.carbondesignsystem.com/building-experiences/onboard)
- [Login](https://www.carbondesignsystem.com/building-blocks/core/patterns/login)
- [Forms](https://www.carbondesignsystem.com/building-blocks/core/patterns/forms)
- [Loading](https://www.carbondesignsystem.com/building-blocks/core/patterns/loading)
- [Disclosures](https://www.carbondesignsystem.com/building-blocks/core/patterns/disclosures)
- [Dialogs](https://www.carbondesignsystem.com/building-blocks/core/patterns/dialogs)
- [Common actions](https://www.carbondesignsystem.com/building-blocks/core/patterns/common-actions)
- [Carbon MCP setup](https://www.carbondesignsystem.com/getting-started/carbon-mcp/onboarding-and-setup)

**Limites deste plano:** as consultas acima são leituras de código/metadata e SQL read-only. O plano não confirma visualmente o Preview, não prova passkey E2E, não executa browser E2E dos fluxos privados e não substitui aprovação humana, auditoria manual WCAG nem ADR/schema review.
