# Master Directive — generative-os

## Conclusão integral do plano, segurança primeiro, execução paralela e release verificável

**Data de referência:** 26/10/2026  
**Repositório-alvo:** `cestari-studio/generative-os`  
**Branch de integração informada:** `feat/complete-carbon-page-rebuild`  
**Projeto Supabase-alvo:** `ldjfjmihdvdmltrptngf` — `generative-os`  
**Referência normativa:** `cestari-studio/genOS`, estritamente read-only  
**Estado:** diretiva de execução; o estado real deve ser confirmado antes de qualquer alteração.

---

# 1. Objetivo executivo

Concluir todas as etapas locais e verificáveis do plano de `generative-os`, desde o controle de especificações até a validação integrada das jornadas, garantindo:

1. Nenhum caminho de onboarding, tenant, pagamento ou acesso dependa de autoridade inferida pelo cliente.
2. Todos os contratos normativos tenham rastreabilidade até campos, operações, entidades, testes e evidências.
3. A persistência do onboarding seja versionada, minimizada, idempotente, concorrente de forma segura e protegida por RLS.
4. A criação de organizações, unidades, vínculos e memberships seja explícita, autorizada, transacional e sem promoção implícita de privilégios.
5. Todos os caminhos de autenticação, restauração de sessão, troca de contexto e rotas privadas consumam um gate central de readiness server-authoritative.
6. A UX use Carbon e as regras de design do produto, sem dados fictícios, sucessos simulados ou valores padrão apresentados como resultados reais.
7. Testes, CI, preview E2E, auditoria independente e artefatos gerados sejam reproduzíveis e associados ao SHA exato testado.
8. Todo o trabalho independente continue mesmo quando houver autorização externa pendente.
9. Nenhuma ação privilegiada ou remota seja deduzida de um status anterior, de um relatório ou do fato de um artefato estar tecnicamente pronto.

**Resultado esperado:** uma integração localmente completa e verificável, com evidências de cada critério, bloqueios externos individualizados e um pacote de revisão que permita decidir conscientemente sobre aplicação remota, aprovação humana e release.

Esta diretiva não declara que mudanças, testes ou migrações foram executados. Toda conclusão precisa corresponder a evidência produzida no checkout e no ambiente efetivamente verificados.

---

# 2. Contrato operacional obrigatório

## 2.1 Limites de autoridade

O trabalho pode ser realizado em paralelo quando as dependências forem independentes. Nenhuma das regras seguintes pode ser relaxada pelos agentes.

**Permitido sem autorização remota adicional:**

- Inspeção read-only do repositório, CI, Vercel e Supabase.
- Alterações locais no checkout designado, respeitando os arquivos já modificados.
- Criação e revisão de migrations versionadas, sem aplicação ao projeto compartilhado.
- Testes em PostgreSQL descartável compatível com PostgreSQL 17.11.
- Testes unitários, de integração, contratos, RLS, grants, geração, build e acessibilidade.
- Execução de CI para SHAs autorizados pelo fluxo existente.
- Preparação de documentação, ADRs, evidências, propostas de migration e pacotes de revisão.
- Reproduções de segurança em dados descartáveis e isolados.

**Proibido sem autorização explícita e específica do responsável:**

- Aplicar migrations ou executar DDL/DML privilegiado no Supabase remoto.
- Alterar grants, policies RLS, Auth, secrets, callbacks, URLs de redirect, configuração de WebAuthn/RP ID ou origens.
- Fazer deploy, promover, reverter ou modificar ambientes Vercel.
- Fazer merge, push ou fechar uma decisão técnica protegida quando isso exigir aprovação humana ainda não registrada.
- Modificar registros de identidade protegidos, incluindo o registro previamente congelado terminado em `...0010`.
- Escrever no repositório normativo `cestari-studio/genOS`.
- Expor credenciais, bypass secrets, tokens, PII ou payloads sensíveis em logs, testes, artefatos ou relatórios.

Uma aprovação para uma migration **não** autoriza automaticamente as demais. Uma aprovação para preview **não** autoriza promoção para produção.

## 2.2 Integridade do checkout

Antes de qualquer escrita:

1. Confirmar raiz, branch, SHA completo do HEAD, upstream e estado do Git.
2. Registrar `git status --short`, `git diff`, `git diff --cached` e os arquivos não rastreados.
3. Verificar se os SHAs, migrations e relatórios citados realmente existem no checkout atual.
4. Confirmar quais arquivos já estão modificados por terceiros ou pelo responsável.
5. Registrar as versões de Node, package manager, PostgreSQL usado nos testes e comandos de validação disponíveis.
6. Construir um mapa de arquivos por responsável antes de iniciar agentes implementadores.

Preservar integralmente alterações anteriores, incluindo `TenantContext.jsx`, planos locais e arquivos não rastreados do responsável. Não usar `git add -A` nem `git add .`. Fazer staging exclusivamente de caminhos revisados e pertencentes à tarefa atual.

Se o checkout não corresponder aos SHAs esperados, parar a integração de commits e recalcular o plano com base no estado real. Não aplicar `reset --hard`, checkout destrutivo, limpeza global ou rebase destrutivo para “normalizar” o ambiente.

## 2.3 Regra de evidência por SHA

Nenhum teste é herdado de um commit anterior.

Para cada resultado, registrar:

- SHA completo efetivamente testado.
- Comando executado e código de saída.
- Ambiente e versão relevantes.
- Resumo verificável do resultado.
- Caminho de logs/artefatos não sensíveis.
- Run ID e URL do CI, quando aplicável.
- Maturidade correspondente: proposta, implementado, testado localmente, CI verificado, Preview E2E verificado ou release aprovado.

Não confundir um commit informado com o HEAD real. Os relatórios históricos referenciam SHAs distintos, incluindo `a56e89a`, `f28d3b0`, `0be9d23`, `dc61055` e `8dc0716`. Esses identificadores precisam ser reconciliados contra o checkout e o histórico atual; nenhum deles deve ser tratado como estado corrente sem verificação.

---

# 3. Coordenação de subagentes e concorrência

## 3.1 Limites máximos

- Até **4 implementadores** simultâneos.
- Até **6 agentes ativos no total**, incluindo coordenador e auditor independente.
- Um único escritor responsável por cada arquivo.
- Um único integrador responsável pela integração final.
- O auditor independente não implementa a correção que está auditando antes de registrar a reprodução.
- Uma única suíte de testes pesada por checkout compartilhado por vez, salvo isolamento comprovado por worktree ou ambiente separado.
- Máximo de **3 tentativas de correção por defeito**, sem loops indefinidos.

Esses limites são invariantes, não objetivos a serem excedidos em períodos de pico.

## 3.2 Papéis

### Coordenador / integrador

Responsável por:

- Confirmar baseline e dependências.
- Distribuir arquivos e entregáveis sem sobreposição.
- Resolver conflitos de contratos antes da implementação.
- Integrar mudanças explicitamente identificadas.
- Executar as suítes integradas.
- Atualizar a matriz de maturidade e o release evidence ledger.
- Garantir que um bloqueio remoto não suspenda trabalho local independente.
- Impedir que um status parcial seja descrito como concluído.

O coordenador não deve assumir que uma migration está segura apenas porque seu autor produziu testes positivos.

### Worker A — Segurança, grants e RPCs de pagamento

Escopo de arquivos exclusivos:

- Migrations locais de grants de RPC.
- Testes SQL de grants e SECURITY DEFINER.
- Auditoria de contratos entre RPCs e consumidores de Edge Functions.
- Relatório de auditoria de privilégios.

Não alterar os componentes de onboarding ou o gerador de especificações.

### Worker B — Spec Control Plane, geração e rastreabilidade

Escopo:

- `scripts/spec-validate.mjs`.
- `scripts/spec-generate.mjs`.
- Testes semânticos do gerador.
- Artefatos gerados e verificação de consistência das especificações.
- Relatório da matriz normativa.

Não alterar migrations de grants nem componentes React de onboarding.

### Worker C — ADR, persistência e tenancy

Escopo:

- `docs/adr-tenancy-and-journey-persistence.md`.
- Migration local do journey ledger e suas suítes SQL específicas.
- Contrato de provisionamento e estados de tenancy.
- Testes descartáveis de RLS, concorrência, idempotência e hierarquia.

Não alterar grants de RPCs de PagBank nem o código de UI.

### Worker D — Frontend, readiness, formulários e autenticação

Escopo:

- Adaptador de readiness e integração com rotas protegidas.
- Componentes de onboarding e formulários.
- Estados de erro e de resultado desconhecido.
- Integração de passkeys com as APIs nativas Supabase Auth.
- Testes de frontend, i18n e acessibilidade relacionados.

Não alterar migrations de tenancy nem o gerador.

### Auditor independente

Escopo read-only durante a primeira passagem:

- Reproduzir os defeitos registrados.
- Testar autorização, abuso de concorrência e estados de falha.
- Rever o contrato actor/subject do onboarding.
- Verificar artefatos gerados, RLS, grants e comportamento fail-closed.
- Confirmar que os testes realmente exercitam as proteções descritas.
- Produzir achados reproduzíveis classificados por severidade.

Depois de concluir o relatório independente, cada achado é encaminhado ao único responsável pelo arquivo afetado. O auditor verifica a correção sem passar a ser o implementador principal.

## 3.3 Integração sem colisão

Os arquivos compartilhados recebem um responsável único:

- `package.json`, lockfile e scripts agregadores: integrador.
- Workflows de GitHub Actions: integrador.
- Release evidence ledger: integrador.
- Registros de maturidade e bloqueios: integrador.
- Uma migration específica: seu autor designado.
- Um componente específico: seu autor designado.
- Um teste específico: seu autor designado.

Workers podem propor alterações aos arquivos centralizados, mas entregam comandos, diff sugerido e evidência; o integrador incorpora as mudanças.

Executar trabalho em ondas:

1. Baseline, contratos e mapa de propriedade.
2. Correções independentes por domínio.
3. Auditoria independente das correções.
4. Integração controlada.
5. Testes integrados e reparo de regressões.
6. Revisão final do release ledger.

---

# 4. Política de idempotência e tentativas

Idempotência deve ser uma propriedade observável do sistema, não apenas a presença de uma coluna chamada `idempotency_key`.

## 4.1 Contrato de idempotência

Para cada comando mutável, especificar:

- Identidade do ator autenticado.
- Tipo do comando e seu escopo.
- Chave de idempotência.
- Fingerprint determinístico do payload normalizado.
- Resultado persistido e identificador do recurso criado.
- Comportamento em replay idêntico.
- Comportamento em reutilização da chave com payload diferente.
- Comportamento em falha parcial.
- Concorrência entre duas requisições com a mesma chave.
- Retenção, expiração e tratamento de chaves antigas.

O contrato recomendado para comandos de negócio é uma chave única escopada pelo ator e pelo tipo de comando, por exemplo:

`UNIQUE(actor_id, operation_kind, idempotency_key)`

A forma final deve ser consistente entre os comandos e documentada no ADR. A chave não pode ser escolhida para permitir que um usuário bloqueie operações de outro usuário.

Comportamentos exigidos:

1. **Replay do mesmo comando:** retorna o mesmo resultado persistido, sem duplicar efeitos.
2. **Mesma chave, payload diferente:** retorna conflito explícito; não altera o registro original.
3. **Requisições concorrentes:** somente uma execução realiza os efeitos de negócio; as demais retornam o resultado compatível com o contrato idempotente ou um estado de processamento recuperável.
4. **Falha anterior ao commit:** não deixa provisioning parcial nem um registro de sucesso falso.
5. **Falha após commit:** o replay recupera o resultado já persistido.
6. **Expiração:** não permite reutilização ambígua de uma chave que ainda protege efeitos anteriores. Tombstone, retenção ou escopo de versão devem ser definidos explicitamente.
7. **Reexecução de migration:** não duplica objetos nem destrói dados.
8. **Reexecução do gerador:** produz bytes idênticos quando as fontes são idênticas.

## 4.2 Limite de tentativas por defeito

Cada defeito tem um identificador, como `SEC-PAY-01`, `GEN-TYPE-01` ou `JOURNEY-ACTOR-01`.

- Tentativa 1: reproduzir, corrigir a causa e testar.
- Tentativa 2: se o primeiro resultado falhar, rever a hipótese e aplicar uma correção distinta.
- Tentativa 3: última correção permitida, seguida de regressão direcionada e teste integrado.
- Após 3 tentativas sem resolução: interromper o loop automático, produzir evidência, registrar causa provável, alternativas e decisão exigida.

Não renomear um defeito para reiniciar a contagem. Um novo defeito só existe quando há uma causa-raiz tecnicamente distinta, documentada pelo coordenador.

Tentativa não significa repetir cegamente o mesmo comando. As retentativas de operações idempotentes precisam preservar a chave e obedecer ao contrato de replay.

## 4.3 Falhas transitórias e retries

Para APIs, testes de rede e operações não determinísticas:

- Retentar somente falhas classificadas como transitórias.
- Usar backoff limitado e jitter quando o mecanismo suportar esses parâmetros.
- Não retentar automaticamente autorização negada, validação inválida, conflito de chave ou incompatibilidade de schema.
- Limitar a quantidade total de tentativas e o tempo acumulado por operação.
- Não criar nova chave de idempotência apenas para contornar timeout.
- Em pagamento, não repetir uma operação externa sem confirmar o estado do pedido e o comportamento de idempotência da integração.

---

# 5. Fase 0 — Baseline, inventário e source of truth

Antes de consolidar a implementação:

1. Verificar branch, HEAD, working tree e SHAs citados nos relatórios.
2. Inventariar migrations presentes no repositório e reconciliar com os relatórios de migrations remotas.
3. Inspecionar os scripts de teste e workflows existentes.
4. Confirmar contratos das APIs realmente instaladas, incluindo versão de `supabase-js`.
5. Identificar os consumidores de cada RPC por busca no código, testes e registries.
6. Registrar todas as divergências entre documentação, migrations, estado remoto já relatado e checkout.
7. Criar uma lista única de defeitos, decisões de design, dependências e aprovações externas.

Fontes de trabalho a reconciliar:

- `docs/adr-tenancy-and-journey-persistence.md`
- `docs/fase-minus1-spec-control-plane-plan.md`
- `docs/fase0-preflight-report.md`
- `docs/release-evidence-ledger.md`
- `docs/rpc-grants-security-definer-audit.md`
- `docs/red-team-audit-readiness-generator.md`
- `docs/db-performance-findings-triage.md`
- `docs/onboarding-wizard-steps-and-passkey-plan.md`
- Migrations versionadas em `supabase/migrations/`
- Scripts de teste, registries e specs normativas.

**Saída obrigatória:** relatório de baseline que distingue claramente observação atual, evidência histórica, proposta local, comportamento testado e decisão pendente.

---

# 6. Fase 1 — Fechar primeiro os defeitos de segurança

## 6.1 PagBank: `claim_pagbank_order` e `attach_psp_idempotency`

**Prioridade máxima: impedir o abuso que pode bloquear o fluxo de pagamento de um tenant.**

O relatório fornecido descreve que ambas as RPCs são SECURITY DEFINER, não conferem `auth.uid()` ou membership no corpo e estavam executáveis por `authenticated`, apesar de o consumidor legítimo ser o Edge Function `pagbank-order`, usando `supabaseAdmin`.

Validar no checkout real:

- Assinaturas exatas.
- `prosecdef`, owner, `search_path` e ACL efetiva.
- Chamadores no código e registries.
- Caminho de autenticação dentro do Edge Function.
- Ausência de consumidor browser que necessite de EXECUTE direto.

Se a evidência continuar válida, preparar/verificar a migration local:

`20261026130000_pagbank_rpc_service_role_only.sql`

Contrato esperado:

- Revogar EXECUTE de `PUBLIC`, `anon` e `authenticated`.
- Conceder EXECUTE a `service_role`.
- Preservar assinaturas e corpos das funções nesta alteração.
- Não abrir um novo caminho de cliente para compensar a revogação.
- Incluir teste de grant e teste de fluxo legítimo via consumidor de serviço.

### Testes obrigatórios

Executados em PostgreSQL descartável compatível com 17.11, usando papéis não superusuários:

- `anon`: EXECUTE negado em ambas as RPCs.
- `authenticated`: EXECUTE negado em ambas.
- `service_role`: EXECUTE permitido nas duas.
- `pagbank-order`: caminho de negócio legítimo permanece compatível.
- Replay concorrente: estado idempotente preservado; tentativa concorrente não pode sequestrar a chave nem a claim do pedido.
- Erros permanecem seguros e não revelam dados de outro tenant.

O resultado alegado anteriormente de 5/5 precisa ser novamente associado ao SHA atual antes de afirmar que a integração está verde.

A aplicação remota continua pendente de autorização específica.

## 6.2 As três RPCs executáveis por anon/PUBLIC

Examinar:

- `public.save_onboarding_progress(text, text, integer, jsonb, boolean)`
- `public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text)`
- `public.resolve_effective_settings(uuid, uuid, uuid, uuid)`

Validar os grants efetivos e a causa descrita nos default privileges. Não assumir que uma declaração de grants em um arquivo antigo reflete o ACL atual.

Se confirmado, validar localmente a migration:

`20261026130100_rpc_grants_remove_anon_excess.sql`

Contrato esperado:

- Revogar EXECUTE de `PUBLIC` e `anon`.
- Preservar `authenticated` e `service_role` enquanto esses consumidores forem necessários.
- Assegurar que o corpo de cada função continue usando o contexto e as policies RLS corretos.
- Incluir testes negativos que comprovem que a negação ocorre no nível de grants, e não somente por erro emitido pelo corpo da função.

A mensagem de erro do teste negativo deve distinguir o novo comportamento de grant denial do anterior `Authentication required.`. Isso demonstra qual camada rejeitou a chamada.

### Atenção: o grant tightening não corrige o abuso autenticado no provisioning

`create_or_update_corporate_tenant` apresenta um risco separado descrito no relatório: o caminho de conflito pode sobrescrever representante legal e promover o chamador a `org_owner` com base no `identifier` recebido.

Revogar acesso anônimo não resolve isso.

Esse caminho deve permanecer bloqueado como defeito de segurança até que:

1. A autorização para atualizar uma organização existente seja baseada em membership e papel efetivamente autorizados.
2. O caminho de criação seja separado do caminho de atualização, ou tenha comportamento equivalente comprovadamente seguro.
3. O conflito por identificador não promova o usuário a proprietário.
4. Os testes demonstrem que um usuário B não consegue se apropriar da organização A conhecendo seu identificador.

Não considerar a migration de grant tightening prova de que o provisioning está seguro.

## 6.3 Regra sistêmica para futuras RPCs

Adicionar ao CI uma verificação de segurança que inspecione as funções públicas e falhe quando uma função estiver executável por `anon` ou `PUBLIC` fora de uma allowlist explícita, versionada e justificada.

A verificação deve:

- Inspecionar grants efetivos, e não apenas texto encontrado nas migrations.
- Considerar assinaturas e overloads individualmente.
- Documentar a justificativa de cada exceção.
- Detectar novas funções que herdem EXECUTE por defaults.
- Cobrir SECURITY INVOKER e SECURITY DEFINER.
- Incluir `search_path`, owner e papel esperado na matriz de auditoria.
- Ter testes negativos que mostrem que uma RPC indevidamente exposta faz o CI falhar.

Toda nova função pública deve declarar seu contrato esperado de EXECUTE no mesmo conjunto de alterações que a cria. Migrations futuras que recriem funções devem revalidar grants explicitamente.

## 6.4 SECURITY DEFINER e dívida de RPC

Revalidar a matriz das funções SECURITY DEFINER relatadas. Para cada função, registrar:

- Consumidor real.
- Papel necessário.
- Verificação de `auth.uid()`.
- Verificação de membership, contexto e autoridade.
- `search_path` seguro.
- Grant esperado.
- Teste positivo e negativo.

Não remover automaticamente funções justificadas por operações transacionais ou por restrições de RLS.

Manter em decisão separada:

- A descontinuação de `create_pagbank_order`, cujo uso autenticado foi descrito como legado e sem consumidores no código versionado.
- A eventual modificação de outros SECURITY DEFINER.
- Qualquer alteração de corpo que exceda o objetivo específico das migrations de grants.

**Saída da Fase 1:** defeitos de grants corrigidos localmente, testes SQL reproduzíveis e todos os riscos de autorização por usuário autenticado explicitamente fechados ou bloqueados.

---

# 7. Fase 2 — Spec Control Plane e matriz de rastreabilidade

## 7.1 Construir a matriz normativa completa

Consolidar uma matriz que conecte:

`journey → wizard → step → role → field → operation → entity → test → evidence`

A matriz deve partir das especificações normativas existentes, não de nomes ou suposições inferidos pelo frontend.

Para cada relação, registrar:

- Chave normativa estável.
- Referência física correspondente, quando aplicável.
- Versão da especificação.
- Estado da binding.
- Consumidor.
- Contrato de entrada e saída.
- Requisito de autorização.
- Teste correspondente.
- Evidência de execução.
- Estado de maturidade.

Não transformar automaticamente `NORMATIVE_ONLY` em `INTEGRATION_VERIFIED` por existirem linhas de catálogo, registries ou componentes de UI.

## 7.2 Correções semânticas do gerador

Auditar `scripts/spec-generate.mjs` e `scripts/spec-validate.mjs`.

Resolver campos de step por `spec_key`, mantendo a referência física `field_key` e seus metadados. Uma especificação não pode ser considerada resolvida se o gerador perdeu a referência normativa.

Cobrir os defeitos e lacunas conhecidos:

1. Duas specs distintas que usam o mesmo `field_key` não podem produzir declarações TypeScript duplicadas e inválidas.
2. Identificadores TypeScript sanitizados que colidam devem ser resolvidos por regra determinística ou resultar em erro explícito.
3. Referências ausentes devem falhar com um diagnóstico que identifique o caminho de validação realmente exercitado.
4. Referências duplicadas legítimas devem manter sua semântica sem duplicar tipos incompatíveis.
5. Mudança na fonte normativa deve marcar todos os artefatos derivados afetados como stale.
6. A geração e o `--check` devem ser determinísticos.
7. Os artefatos devem compilar quando forem destinados a consumidores TypeScript.
8. Um teste de falha não pode passar apenas porque uma etapa anterior abortou por outra razão.

### Critérios de saída

- Testes semânticos para alias de `field_key`.
- Testes para colisões de identificadores.
- Testes para referências ausentes e duplicadas.
- `spec:check` determinístico.
- Compilação do artefato de tipos gerado.
- `quality` falha se os artefatos normativos estiverem desatualizados ou forem inválidos.

---

# 8. Fase 3 — Finalizar o ADR de tenancy

Arquivo principal:

`docs/adr-tenancy-and-journey-persistence.md`

O ADR deve ser revisado com base na estrutura real do banco e nos contratos existentes. As entidades documentadas são conceitos distintos, não aliases para o mesmo nível de autoridade.

## 8.1 Conceitos que não podem ser confundidos

- Identidade e sessão: Supabase Auth JWT.
- `persons.account_type`: classificação da pessoa; não é autoridade nem conclusão de onboarding.
- `organizations.tenant_kind`: natureza da organização.
- `organizations.authority_level`: posição de autoridade dentro do modelo aprovado.
- `parent_organization_id`: relação hierárquica validada no servidor.
- Membership e papel: autorização efetiva de uma pessoa no contexto.
- Produtos, capabilities e entitlements: recursos habilitados segundo a fonte normativa e políticas efetivas.
- Workspace e project: contexto de trabalho; não conferem autoridade sobre o tenant.
- Settings cascade: hierarquia de configuração, independente da hierarquia de autoridade.

Nenhum papel pode ser deduzido por e-mail, domínio, criador, identificador fiscal, nome ou simples posse de um UUID.

## 8.2 Colunas e migração aditiva

A proposta descreve:

- `tenant_kind`: `platform_operator`, `creative_agency`, `holding`, `network`, `client`, `unit`, `sandbox`.
- `authority_level`: `master`, `agency`, `tenant`.
- Pai validado, profundidade máxima 3 e ausência de ciclos.

Antes de implementar a migration, formalizar a matriz válida de pai/filho. Não basta afirmar que a autoridade do pai é maior ou igual à do filho sem definir quais combinações concretas são legítimas.

A migration deve:

1. Adicionar enumerações e colunas de forma aditiva.
2. Definir defaults seguros para novas organizações.
3. Fazer backfill determinístico e justificável.
4. Evitar conceder autoridade privilegiada por default ou por dados fornecidos pelo cliente.
5. Garantir integridade hierárquica, sem ciclos e sem ultrapassar profundidade permitida.
6. Tratar conflitos de backfill como diagnóstico, não como promoção automática.
7. Preservar registros históricos.
8. Incluir consultas de pré e pós-condição reproduzíveis.
9. Ser validada em PostgreSQL descartável antes de qualquer pedido de aplicação remota.

A classificação sugerida para a organização seed `generative-os-enterprise` deve continuar uma hipótese documentada até que a autoridade competente confirme a classificação correta.

## 8.3 Decisão obrigatória: actor versus subject

O red team reproduziu um cenário em que ator e sujeito compartilham acesso ao run e às etapas, permitindo que um deles conclua etapas que alteram a decisão de readiness observada pelo outro.

O ADR precisa definir explicitamente quem está sendo certificado pelo gate.

Para onboarding pessoal, a regra padrão deve ser: a conclusão precisa estar vinculada à pessoa cujo acesso está sendo liberado.

Para onboarding delegado, exigir uma política explícita que defina:

- Quem pode agir em nome de quem.
- Quais jornadas permitem delegação.
- Quais etapas podem ser preenchidas pelo ator.
- Quem valida e conclui cada etapa.
- Qual principal será considerado concluinte pelo readiness.
- Qual evidência de delegação deve ser guardada.
- Quais tentativas de delegação inválida devem ser negadas.

Se necessário, adicionar atribuição de `completed_by` e outras informações mínimas de proveniência às etapas. Não permitir que uma relação de acesso compartilhado seja interpretada automaticamente como certificado pessoal.

Até a decisão estar formalizada e testada, qualquer jornada cuja semântica dependa dessa distinção deve permanecer bloqueada para liberação. Não usar um `allow` permissivo como mecanismo de compatibilidade.

## 8.4 Legado

Documentar `tenants`, `tenant_users` e `tenant_settings` como modelo legado, conforme o inventário fornecido.

Não popular, apagar ou migrar essas tabelas neste conjunto de alterações. Depreciação é uma decisão separada, com ADR e plano próprio.

**Saída:** ADR coerente com schema, RLS, membership, papéis, delegação e provisioning; decisões com impacto de autoridade identificadas por responsável.

---

# 9. Fase 4 — Journey ledger e persistência

Migration local principal informada:

`20261026120000_journey_ledger_onboarding_runs.sql`

Validar o estado e o conteúdo reais desse arquivo antes de assumir que os testes históricos cobrem a versão atual.

## 9.1 Definições de jornada

A fonte normativa deve identificar a versão publicada de cada wizard e os passos exigidos.

A tabela `onboarding_journey_definitions` precisa ter:

- Escrita restrita ao papel de serviço autorizado.
- Leitura de definições publicadas compatível com o uso do readiness.
- Separação de rascunhos e versões publicadas.
- Publicação rejeitada quando a lista de passos obrigatórios estiver vazia.
- Proteção contra alteração silenciosa de uma versão publicada.
- Identidade normativa e versão inequívocas.

Uma definição publicada sem passos obrigatórios não pode produzir `allow` implícito. Adicionar uma constraint e uma defesa dentro da RPC. Ambas são necessárias: a constraint protege a integridade do dado; a defesa protege o consumidor diante de estados inesperados.

## 9.2 `onboarding_runs`

Conferir a semântica de:

- Identidade do run.
- Wizard e versão.
- Ator e sujeito.
- Contexto de organização, quando aplicável.
- Snapshot mínimo de contexto e política.
- Step atual e estado do run.
- Chave de idempotência.
- Correlation ID.
- Datas de criação, atualização e expiração.
- Conclusão.
- Recuperação de estados interrompidos.

Os snapshots não devem virar cópias irrestritas de sessão, claims ou payloads sensíveis.

## 9.3 `onboarding_step_states`

Conferir:

- Chave única por run e passo.
- Estados permitidos e transições válidas.
- Revisão para concorrência otimista.
- Payload allowlisted e validado por schema.
- Registro de validação, conclusão e falhas.
- Códigos de erro estáveis.
- Flag de retryable conforme o contrato da operação.
- Atribuição de conclusão, se necessária para a decisão actor/subject.

A concorrência otimista deve impedir que uma escrita antiga substitua silenciosamente um estado mais recente. Um conflito de revisão deve retornar um resultado que permita ao chamador recarregar e reconciliar o estado, sem regravar automaticamente payloads antigos.

## 9.4 RLS, TTL e minimização

Os testes precisam cobrir:

- Leitura e escrita autorizadas do run.
- Negação de usuário sem acesso.
- Isolamento entre tenants e contextos.
- Acesso delegado de acordo com a decisão do ADR.
- Expiração e rejeição de operações em runs expirados.
- Ausência de PII desnecessária em logs, eventos e payloads.
- Replay idempotente.
- Concorrência otimista.
- Estado recuperável após interrupção.
- Comportamento do readiness com definições ausentes, em rascunho, vazias, malformadas ou indisponíveis.

Os dados antigos em `persons.additional_property.onboarding` devem ser tratados como legado. A migração deve ser forward-compatible, idempotente e não destrutiva. Não remover o histórico antes de comprovar reconciliação e definir retenção com o responsável.

## 9.5 Testes SQL de entrada, saída e falha

Executar em PostgreSQL descartável:

- Replay com a mesma chave e o mesmo payload.
- Mesma chave com payload distinto.
- Duas requisições concorrentes com a mesma chave.
- Concorrência otimista com revisão antiga.
- Escrita de outro usuário ou tenant.
- Expiração.
- Recuperação de execução parcial.
- Readiness com passos completos, incompletos e estado indisponível.
- Definição publicada vazia.
- Tentativa de alteração de uma definição publicada.
- Ator diferente do sujeito.
- Injeção de strings em chaves do wizard.
- Entradas nulas ou malformadas.

As quantidades históricas de assertions — 9/9, 11/11 ou 13/13 — não substituem a verificação do conjunto atual de casos. Contar e publicar as assertions executadas no SHA atual.

---

# 10. Fase 5 — Provisionamento seguro de tenancy

## 10.1 Separar comandos de negócio

Não usar uma única função genérica para executar operações com semânticas de autoridade diferentes.

Definir contratos específicos para:

- Criar tenant.
- Atualizar tenant existente.
- Aceitar convite.
- Entrar em tenant existente.
- Solicitar acesso.
- Criar unidade.
- Criar sandbox.
- Criar agência ou organização com autoridade delegada, quando permitido.

Cada comando precisa indicar precondições, autorização necessária, dados que o cliente pode fornecer e efeitos que somente o servidor pode calcular.

## 10.2 Criação explícita e idempotente

Mover a criação de tenant para uma confirmação explícita, fora do primeiro passo automático do wizard.

O fluxo de confirmação deve ser transacional e idempotente. Em uma única operação lógica, criar e relacionar os recursos exigidos pelo contrato:

- Organização.
- Relação hierárquica autorizada.
- Membership inicial autorizado.
- Workspace e projeto, quando requeridos.
- Snapshot de entitlement efetivo, se previsto pelo modelo.
- Registro de auditoria.
- Estado final recuperável.

IDs, authority level, owner e vínculo pai devem ser derivados/validados no servidor. Não aceitar que um browser escolha o próprio papel ou declare que tem autoridade superior.

Se houver efeitos externos não transacionais, definir explicitamente o padrão de recuperação e, somente se necessário, o uso de outbox. Não introduzir infraestrutura paralela sem um requisito demonstrado.

## 10.3 Segurança do caminho de conflito

Adicionar testes de abuso autenticado:

- Usuário A cria organização.
- Usuário B tenta criar novamente usando o identificador de A.
- Usuário B tenta sobrescrever dados legais.
- Usuário B tenta alterar representante legal.
- Usuário B tenta se promover a `org_owner`.
- Usuário B tenta mudar o contexto ativo para uma organização sem membership.

Todos os efeitos não autorizados devem ser negados, sem alteração parcial de registros, memberships, contextos ou auditoria de sucesso.

É proibido considerar o conflito de `identifier` como prova de propriedade. A identidade do solicitante e o permissionamento são critérios separados da unicidade do identificador.

Uma simples revogação de `anon` não fecha estes casos, porque os ataques descritos podem vir de uma sessão autenticada.

## 10.4 Estados e recuperação

Definir comportamentos para:

- Duas confirmações concorrentes.
- Timeout após commit.
- Falha antes do commit.
- Retry após conflito.
- Requisição repetida por um cliente.
- Parent inexistente ou não autorizado.
- Ciclo hierárquico.
- Membership já existente com papel diferente.
- Entitlement indisponível.
- Erro em um dos recursos que compõem o bootstrap.

Nenhuma falha pode deixar uma organização parcialmente provisionada que apareça ao usuário como pronta. Se o comando retornar um estado pendente recuperável, ele deve ser distinto de sucesso completo.

**Saída:** contrato de provisioning testado, caminho de conflito seguro e UI conectada a comandos com semântica explícita.

---

# 11. Fase 6 — Gate central de readiness

RPC de referência informada:

`resolve_onboarding_readiness(wizard_key, version)`

Validar a assinatura real. Não confiar em versões anteriores que aceitavam uma lista de passos obrigatórios fornecida pelo cliente.

## 11.1 Fonte de autoridade

A RPC deve resolver os passos exigidos a partir de uma definição confiável no servidor. O cliente não escolhe o conjunto de passos cuja conclusão será considerada suficiente.

A identidade do usuário liberado deve ser obtida do contexto autenticado do servidor, salvo uma interface administrativa separada, explicitamente autorizada e auditada. Uma RPC pública não deve permitir que o solicitante escolha livremente o principal cuja autorização será avaliada.

Definição ausente, não publicada, inválida, vazia ou backend indisponível não pode resultar em `allow`.

O contrato de retorno deve distinguir, pelo menos:

- `allow`
- `require_steps`
- `blocked`
- `unavailable`

Na interface, o adaptador pode traduzir estados de transporte, como backend indisponível, para uma união discriminada própria. Essa tradução não pode mudar o significado de autorização.

## 11.2 Consumidores que precisam convergir

Integrar a mesma fonte de readiness a:

- Sign-in, quando pertinente.
- Restauração de sessão.
- Troca de contexto.
- ProtectedRoute.
- Rotas privadas acessadas diretamente.
- Entrada no dashboard e em superfícies que dependam de onboarding.

Não duplicar regras com base em `account_type`, nome, contagem de campos, plano ou estado local de componentes.

O usuário não pode contornar o gate navegando diretamente para uma URL privada. A UI deve lidar com `unavailable` sem fingir que o usuário precisa de passos ou que já os concluiu.

## 11.3 Testes negativos obrigatórios

- Cliente fornece passos vazios ou parciais: a assinatura não deve aceitar esse vetor de autorização.
- Definição ausente: `unavailable`.
- Definição não publicada: `unavailable`.
- Definição vazia: falha de publicação e defesa no runtime.
- Backend indisponível: `unavailable`.
- Passos incompletos: `require_steps`.
- Passos completos pelo principal correto: `allow`.
- Outro wizard com passos de nomes idênticos: não altera o resultado.
- Sujeito diferente do ator: decisão conforme o ADR e a política explícita de delegação.
- Sessão anônima: não recebe autorização de readiness baseada em usuário inexistente.
- Mudança de contexto: o resultado do contexto anterior não pode ser reutilizado indevidamente.

## 11.4 Estado de liberação

Enquanto a RPC ainda não estiver aplicada remotamente, registrar a integração local do adaptador como implementada/testada e o readiness em runtime como dependente da RPC remota. Não reportar a aplicação como concluída só porque o front já chama o contrato planejado.

---

# 12. Fase 7 — Consolidar wizard e UX Carbon

## 12.1 Uma fonte de verdade para a jornada

`OnboardingFullPage`, `OnboardingTearsheet` e `DashboardOnboarding` devem utilizar o mesmo ledger versionado de jornada, os mesmos contratos de passo e a mesma fonte de readiness.

Nenhuma superfície deve manter uma lista paralela de passos obrigatórios nem concluir o onboarding por conta própria.

Etapas de formulário não podem criar um tenant antes de uma confirmação explícita. Não duplicar comandos de provisioning em eventos de navegação ou renderização.

## 12.2 Carbon e acessibilidade

Seguir a decisão de UX registrada:

- Carbon Core para autenticação, campos, botões, links e notificações.
- Componentes IBM Products `Create*` para os contextos de onboarding onde forem apropriados.
- Nenhum uso de componente, prop ou API presumida: confirmar versões instaladas e tipos reais.
- Respeitar o design system, tokens, semântica, estados de foco, erros e navegação por teclado.
- Nenhum layout inline customizado quando a política de zero-inline-layout se aplicar.
- Não introduzir cores, espaçamentos ou CSS de layout hardcoded para contornar Carbon.
- Mensagens traduzidas em todos os locales suportados.
- Controles de formulário acessíveis por nome, erro e estado.
- Notificações úteis para erro recuperável e erro irrecuperável.

Os testes devem validar todos os estados, não apenas a renderização do caminho feliz.

## 12.3 Estados de erro e resultado desconhecido

Pagamento, settings, passkeys e readiness não podem substituir falha de leitura por um valor aparentemente legítimo.

Exemplos obrigatórios:

- Falha ao carregar KPI não pode aparecer como `R$ 0,00`.
- Falha ao listar passkeys não pode aparecer como “nenhuma credencial”.
- Erro de autenticação não pode ser apresentado como lista vazia.
- Falha de backend no readiness não pode ser interpretada como conclusão.
- Entitlement ausente por falha de consulta não é o mesmo que entitlement negado.
- Falha ao recuperar tenant não deve promover um usuário a owner nem selecionar outro tenant.

Utilizar estados discriminados explícitos, por exemplo `ready`, `unknown`, `unsupported` ou `unauthenticated`, conforme o domínio. Não espalhar interpretações de erro por componentes.

## 12.4 Remover demo e mock runtime

Preservar a regra de zero conteúdo fictício na execução real.

Verificar:

- Endpoints de demonstração sem uso.
- Placeholders e páginas de navegação não registradas.
- Nomes e dados fictícios de clientes.
- Defaults que fingem ser resultados de dados persistidos.
- Mocks utilizados indevidamente fora dos testes.
- Fallbacks que ocultam a indisponibilidade de dados reais.

Os testes devem detectar regressões de demo em superfícies runtime. Testes isolados podem continuar usando fixtures claramente identificadas.

---

# 13. Fase 8 — Autenticação e passkeys

## 13.1 Supabase Auth

Confirmar a versão instalada e as assinaturas reais das APIs nativas para:

- Sign-in por senha.
- Magic link.
- Recuperação de senha.
- Reset de senha.
- Registro de passkey.
- Sign-in por passkey.
- Listagem e atualização de credenciais.

As chamadas devem usar as APIs suportadas pela versão instalada. Não implementar verificação WebAuthn fictícia no cliente nem apresentar sucesso antes de a operação ser confirmada.

## 13.2 Estados obrigatórios

Para passkeys, distinguir:

- Pronto/credenciais carregadas.
- Nenhuma credencial confirmada.
- Resultado desconhecido após falha.
- API não suportada.
- Usuário não autenticado.
- Registro em progresso.
- Registro concluído de forma confirmada.
- Erro de registro ou autenticação.

Nunca converter erro de listagem em lista vazia. Nunca exibir sucesso de registro se a cerimônia falhar ou for cancelada.

## 13.3 Ambientes e RP ID

A verificação de passkeys deve ocorrer em um ambiente autorizado e acessível cujo domínio seja compatível com o RP ID.

O relatório anterior descreve `cestari.studio` como RP ID e os domínios de produção correspondentes. O estado atual deve ser revalidado antes de qualquer alteração.

Preview em `*.vercel.app` e localhost não devem ser tratados como equivalentes ao domínio de produção quando o RP ID não for compatível. Não relaxar a configuração de produção para acomodar o ambiente de teste.

Testes que exigem o domínio real, sessão ou cerimônia WebAuthn precisam de autorização e ambiente disponíveis. Até lá, o trabalho local independente continua; o gate E2E específico permanece bloqueado com evidência.

## 13.4 E-mail e recuperação

Testar separadamente:

- E-mail preservado entre as etapas de autenticação.
- Magic link para contas registradas.
- Anti-enumeration para contas não registradas.
- Recuperação de senha.
- Redirects corretos por ambiente.
- Estados de rate limit e erros de provedor.
- Reset de senha.
- Persistência segura de estado ao abrir o fluxo correspondente.

Não imprimir tokens, códigos, URLs sensíveis ou credenciais de teste em logs.

---

# 14. Fase 9 — Settings, registries, bindings e publicação

## 14.1 Settings

Preservar as 12 settings operacionais existentes como superfície de configuração efetiva. A existência de 200 definições normativas não significa que todas são inputs operacionais.

Manter os eixos separados:

- Catálogo normativo.
- Configuração efetiva.
- Configuração por escopo.
- Política de autoridade e tenant.

Validar a correspondência entre as settings operacionais e os mapeamentos normativos, sem inventar equivalências quando o estado estiver `partial` ou `none`.

## 14.2 Registries e bindings

Verificar:

- `registry:check`.
- `check:matrices`.
- `check:branding`.
- Contratos entre operação, endpoint, entitlement e consumidor.
- `page_keys` e `operation_ids` ausentes.
- Allowlist de endpoints e componentes.
- Evidências associadas à maturidade da feature.

Bindings que ainda não possuem contrato ou evidência devem continuar em estado incompleto. Não promover automaticamente um binding apenas porque existe em uma tabela.

## 14.3 Catálogo e runtime

Manter os estados de maturidade separados:

- `NORMATIVE_ONLY`
- Estados intermediários definidos pelo projeto.
- `INTEGRATION_VERIFIED`
- `E2E_VERIFIED`

A existência de tabelas preenchidas, RLS ativa e registries consistentes não prova, por si só, que o runtime está consumindo os dados dinamicamente.

Para cada feature declarada como integrada, demonstrar o caminho de ponta a ponta que a conecta à tela, ao binding, ao endpoint real, à autorização e à evidência de execução.

---

# 15. Fase 10 — Auditoria de desempenho e RLS

Esta frente é independente das mudanças de onboarding e pode prosseguir localmente enquanto decisões de tenancy estão pendentes.

## 15.1 Foreign keys sem índice

O relatório fornecido lista 16 FKs e propõe índices aditivos. Antes de aceitar o número, corrigir ou confirmar a metodologia de consulta.

A verificação deve respeitar a ordem das colunas do FK e a semântica de prefixo dos índices compostos. Consultar apenas se uma coluna aparece em qualquer posição de algum índice pode produzir falsos negativos.

Para cada FK, verificar:

- Ordem de `conkey`.
- Ordem de colunas no índice.
- Predicados de índice parcial.
- Exclusão de índices inválidos.
- Cobertura por índice existente.
- Relação entre FK e índice composto.
- Custo e plano de consultas relevantes.

Preparar migration local aditiva apenas para os índices comprovadamente ausentes. Validar idempotência e ausência de duplicação em PostgreSQL descartável. Nenhum índice remoto é adicionado nesta etapa.

## 15.2 Múltiplas permissive policies

Não consolidar policies com base apenas no número informado pelo advisor.

A consulta usada deve agrupar e comparar o escopo por tabela, comando e papel, analisando também `qual` e `with_check`.

Para cada caso, distinguir:

- Políticas intencionalmente complementares.
- Políticas cuja combinação amplia o acesso por OR.
- SELECT implícito dentro de uma policy `FOR ALL`.
- Leitura pública de conteúdo publicado.
- Leitura administrativa de drafts.
- Escrita por administradores de plataforma ou billing.
- Policies redundantes com risco real, se comprovado.

Não remover as policies `SELECT` e `FOR ALL` descritas como complementares sem demonstrar equivalência semântica e preservação dos caminhos pretendidos.

## 15.3 Índice duplicado e índices sem scans

A duplicação entre `idx_tenant_users_unique` e `tenant_users_user_id_tenant_id_key` foi descrita como confirmada. Isso deve ser reconciliado com o estado atual antes de qualquer proposta.

Não apagar o índice duplicado automaticamente. Verificar dependências, se existe uma constraint que o usa, plano de consultas e a real necessidade de remover o índice redundante. Qualquer remoção exige proposta isolada e aprovação apropriada.

Os 148 índices sem scans não devem ser removidos apenas por esse contador, especialmente num banco descrito como pré-produção. Manter índices de constraints e índices necessários ao domínio até existir evidência de tráfego e análise de planos suficiente.

**Saída:** relatório de triagem corrigido, consulta reproduzível, migration proposta apenas para mudanças sustentadas por evidência e nenhuma alteração remota não autorizada.

---

# 16. Matriz de CI/CD e testes integrados

## 16.1 Qualidade e integridade

O job `quality` deve incorporar ou manter gates explícitos para:

- Lint.
- Testes unitários.
- `spec:check`.
- Validação dos specs.
- Compilação dos artefatos gerados.
- `check:matrices`.
- `check:branding`.
- `registry:check`.
- Verificação de bindings e endpoints autorizados.
- Verificação de grants de RPC.
- Teste de não exposição de anon/PUBLIC fora da allowlist.

Os scripts usados devem estar identificados em `package.json` e executáveis no ambiente de CI. Nenhum comando pode ser declarado obrigatório sem existir ou ser instalado corretamente.

## 16.2 Suites SQL

Validar as suítes presentes e integrá-las conforme os contratos reais:

- `test:pagbank-grants-sql`
- `test:rpc-grants-sql`
- `scripts/test-journey-ledger-sql.sh`
- `test:org-hierarchy-sql`
- Billing pricebook.
- Workspace.
- Notifications.
- Demais suites SQL de segurança ou catálogo existentes.

Todos os testes devem rodar em ambiente descartável compatível com PostgreSQL 17.11, sem apontar para o projeto remoto compartilhado.

Quando forem validar RLS, grants e papéis, não executar apenas como superuser ou owner privilegiado. Exercitar os papéis e claims que representam o consumidor real.

Cada suíte deve relatar quantidade de assertions, PASS/FAIL e o SHA testado.

## 16.3 Frontend e browser

Manter:

- Testes de todos os estados de erro.
- Smoke tests de rotas SSR.
- Browser smoke.
- axe/a11y.
- Testes de hydration.
- Estados privados e gate.
- Testes de autenticação e formulários.
- Testes por locale e conteúdo de erro.
- Testes de passkeys suportadas e não suportadas.

Se for necessário alterar o número de assertions, manter as anteriores válidas e justificar os casos adicionados ou removidos.

## 16.4 Preview E2E

O E2E precisa provar que o artefato servido corresponde ao SHA testado.

Sequência:

1. Registrar SHA e run CI.
2. Confirmar que a integração de Git produziu um deployment de Preview para esse SHA.
3. Confirmar ambiente e configuração pública necessários.
4. Acessar o Preview pelo mecanismo autorizado.
5. Executar smoke e axe.
6. Exercitar os fluxos disponíveis e os estados privados.
7. Salvar relatório e screenshots necessários sem incluir secrets.
8. Confirmar o SHA do artefato servido.
9. Atualizar o evidence ledger com a URL do deployment, SHA, run ID e os resultados.

Se bypass, sessão autenticada ou segredo estiverem indisponíveis, o gate de E2E continua pendente. Isso não deve impedir lint, testes unitários, SQL descartável, geração nem validações locais.

## 16.5 Build e regressões

O pipeline deve falhar quando:

- Os artefatos gerados estão desatualizados.
- Existe type conflict ou tipo TypeScript duplicado.
- Um teste de segurança negativo passa pela camada errada.
- Uma RPC nova torna-se executável por anon/PUBLIC sem exceção autorizada.
- Um estado de erro é apresentado como dado válido.
- Uma rota privada ignora o readiness.
- A versão do pacote ou API usada não corresponde ao contrato compilado.
- O build não corresponde ao SHA registrado na evidência.

---

# 17. Onda de integração e revisão independente

Após as frentes independentes:

1. O integrador reconcilia alterações e confirma um único estado coerente dos contratos.
2. Atualiza as migrations e o catálogo de testes sem misturar alterações pertencentes a outros workers.
3. Executa `spec:check`, lint, testes unitários e matrizes.
4. Executa as suítes SQL em PostgreSQL descartável.
5. Confirma que scripts e workflows de CI cobrem as novas suítes.
6. Executa build e smoke tests.
7. Envia o resultado integrado ao auditor read-only.
8. O auditor tenta reproduzir os defeitos originais e os riscos introduzidos.
9. Correções aprovadas são integradas sob a regra de um escritor por arquivo.
10. O integrador executa novamente todos os gates afetados e, quando apropriado, as suítes completas.

O auditor deve verificar especialmente:

- Se a migration de grant realmente impede EXECUTE por `anon`, `PUBLIC` ou `authenticated` conforme o contrato.
- Se o serviço legítimo ainda executa as operações necessárias.
- Se provisioning ainda permite takeover no caminho de conflito.
- Se o gerador de specs cria artefatos TypeScript válidos para aliases.
- Se uma definição vazia pode retornar `allow`.
- Se o actor/subject consegue conferir readiness indevidamente.
- Se o cliente consegue alterar os passos obrigatórios enviados ao gate.
- Se RLS e otimistic concurrency resistem a requisições simultâneas.
- Se falhas de backend aparecem como estados indisponíveis, não como sucesso ou lista vazia.

Nenhum teste deve ser considerado suficiente apenas porque seu nome sugere que cobre o cenário. Examinar assertions e verificar a camada exata de negação.

---

# 18. Bloqueios externos — lista explícita e escopo

A coordenação deve manter um registro único de bloqueios, com responsável, artefato, consequência e condição objetiva de desbloqueio.

| Bloqueio                              | Escopo afetado                               | Condição para desbloquear                                                                            |
| ------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Migrations de grants do PagBank       | Segurança de RPCs de pagamento em produção   | Autorização explícita para aplicar a migration de grants correspondente e validação remota posterior |
| Grant tightening das três RPCs anon   | Hardening de RPCs e contrato runtime         | Revisão e autorização explícitas; teste negativo remoto após aplicação                               |
| Migration do journey ledger/readiness | Gate server-authoritative remoto             | Autorização para aplicar a migration e confirmação da RPC no projeto alvo                            |
| Takeover no provisioning autenticado  | Criação/atualização de organizações          | Correção local, testes negativos, revisão independente e contrato seguro aprovado                    |
| ADR de tenancy                        | Colunas, backfill e hierarquia de autoridade | Aprovação do ADR, incluindo matriz pai/filho e política de backfill                                  |
| Actor/subject                         | Certificação de conclusão de onboarding      | Decisão explícita de delegação e testes que vinculem a conclusão ao principal correto                |
| RP ID / cerimônia WebAuthn            | Passkeys no domínio real                     | Ambiente autorizado, domínio acessível e cerimônia concluída sem relaxar a política de produção      |
| Preview E2E privado                   | Validação de rotas autenticadas              | Sessão ou bypass autorizado e teste executado contra o SHA exato do Preview                          |
| Revisão humana do PR #7               | Merge de integração                          | Aprovação humana registrada no PR para o HEAD atual                                                  |
| Decisão sobre `create_pagbank_order`  | RPC de pagamento legada                      | Decisão documentada do responsável sobre descontinuação ou manutenção                                |

Uma mudança de estado no ledger remoto, no CI ou no PR exige atualização baseada em nova evidência. Não encerrar um bloqueio por inferência.

Todos os caminhos independentes devem continuar sendo executados enquanto o bloqueio estiver ativo.

---

# 19. Critérios de conclusão por etapa

## Gate A — Segurança

- Grants de PagBank e das três RPCs verificados no checkout atual.
- Migrations locais revisadas e testadas.
- Testes positivos e negativos comprovam o papel esperado.
- Defeito autenticado de provisioning tratado separadamente.
- CI protege contra regressão de grants em novas RPCs.

## Gate B — Contratos

- Matriz normativa completa e rastreável.
- Gerador determinístico.
- Aliases não produzem tipos duplicados.
- Referências inválidas falham claramente.
- Artefatos gerados compilam.
- Falhas semânticas não são ocultadas por testes fracos.

## Gate C — Persistência e tenancy

- ADR coerente e decisões explícitas.
- Journey ledger idempotente e concorrente de forma segura.
- RLS validada com papéis reais.
- TTL e payload minimizado.
- Política actor/subject resolvida ou corretamente bloqueada.
- Provisioning idempotente, transacional e sem promoção implícita.

## Gate D — Readiness e UX

- Todos os consumidores convergem para o gate central.
- Acesso direto a rota privada não contorna a política.
- Estado desconhecido é distinto de conclusão.
- Componentes Carbon e i18n coerentes.
- Erros de leitura não parecem dados válidos.
- Nenhum demo/mock indevido em runtime.

## Gate E — Autenticação

- Senha, magic link, recuperação e reset testados.
- Passkeys usam APIs reais da versão instalada.
- Resultado desconhecido não é confundido com ausência de credenciais.
- Validação real de RP ID concluída quando houver ambiente autorizado.

## Gate F — CI e Preview

- Suites locais e SQL verdes no SHA de integração.
- Build e browser smoke verdes.
- Acessibilidade verificada.
- Preview E2E associado ao artefato e ao SHA exatos, quando autorizado.
- Nenhum gate pendente declarado como verde.

## Gate G — Revisão e handoff

- Auditoria independente encerrada.
- Defeitos reproduzidos foram corrigidos ou registrados como blockers objetivos.
- Human review e decisões de proprietário claramente separadas dos gates técnicos.
- Evidence ledger atualizado para o SHA final.
- Nenhuma alteração externa não autorizada.

---

# 20. Release evidence ledger — formato obrigatório

Para cada entrega, acrescentar uma linha ou seção com:

| Campo         | Conteúdo necessário                                           |
| ------------- | ------------------------------------------------------------- |
| Identificador | ID estável da correção, contrato ou gate                      |
| Escopo        | Arquivos, migration, RPC ou fluxo                             |
| Root cause    | Causa reproduzida, não apenas sintoma                         |
| Mudança       | Comportamento corrigido ou contrato definido                  |
| SHA           | SHA completo do commit que contém a mudança                   |
| Ambiente      | Local, PostgreSQL descartável, CI ou Preview                  |
| Testes        | Comandos e assertions efetivamente executadas                 |
| Resultado     | PASS/FAIL com diagnóstico                                     |
| Artefatos     | Caminhos para logs, SQL, relatório ou screenshots sem secrets |
| Maturidade    | Estado explícito da entrega                                   |
| Bloqueios     | Aprovação ou dependência externa ainda necessária             |
| Próximo passo | Ação objetiva com critério de aceite                          |

Classificações de maturidade não são intercambiáveis:

- `PROPOSED`
- `IMPLEMENTED_LOCAL`
- `IMPLEMENTED_AND_TESTED_LOCAL`
- `CI_VERIFIED`
- `PREVIEW_E2E_VERIFIED`
- `OWNER_APPROVED`
- `REMOTE_APPLIED_AND_VERIFIED`
- `RELEASED`

Usar somente estados que correspondam à evidência. Um relatório histórico ou uma migration criada não pode ser rotulado como `REMOTE_APPLIED_AND_VERIFIED`.

---

# 21. Handoff final e decisões do responsável

O pacote de handoff deve incluir:

1. Resumo executivo do estado real.
2. Branch, SHA completo e diff integrado.
3. Matriz de rastreabilidade.
4. ADR revisado e decisões pendentes.
5. Inventário das migrations locais e seu estado de aplicação.
6. Relatórios de grants e SECURITY DEFINER.
7. Evidências de idempotência, concorrência, RLS e actor/subject.
8. Resultados de testes, lint, build e CI associados ao SHA.
9. Preview URL e evidência E2E, se concluídos.
10. Bloqueios remotos e humanos com condição explícita de desbloqueio.
11. Lista exata das operações que exigirão autorização adicional.
12. Nenhuma credencial, PII ou segredo em texto ou nos artefatos.

A passagem para merge, aplicação remota ou produção é uma decisão separada e não faz parte implícita da conclusão técnica local.

---

# 22. Ordem final de execução

A sequência de prioridade é:

1. **Confirmar baseline e proteger o checkout.**
2. **Concluir a auditoria e os testes locais dos grants do PagBank.**
3. **Concluir o tightening local das três RPCs anon/PUBLIC.**
4. **Fechar o caminho de abuso autenticado em `create_or_update_corporate_tenant`.**
5. **Corrigir e validar o Spec Control Plane e os artefatos gerados.**
6. **Finalizar o ADR de tenancy, incluindo actor/subject.**
7. **Validar o journey ledger, RLS, TTL, concorrência e idempotência.**
8. **Concluir os comandos de provisioning separados e seguros.**
9. **Unificar o readiness e integrar todos os caminhos de acesso.**
10. **Consolidar UX Carbon, auth, passkeys, i18n e estados de erro.**
11. **Concluir settings, registries, bindings e rastreabilidade.**
12. **Executar auditoria de desempenho sem remoções automáticas.**
13. **Integrar suítes SQL, frontend, CI, build e browser smoke.**
14. **Executar red team independente e corrigir as falhas dentro do limite de tentativas.**
15. **Validar Preview E2E quando houver acesso autorizado.**
16. **Atualizar o release evidence ledger e preparar revisão humana.**
17. **Aguardar autorizações explícitas antes de qualquer ação remota protegida.**

## Regra de encerramento

O plano só pode ser descrito como concluído quando todos os gates aplicáveis tiverem evidência no SHA final, as decisões de autoridade estiverem resolvidas, os defeitos de segurança relevantes estiverem corrigidos ou isolados por bloqueios efetivos, e a revisão independente não tiver encontrado regressões abertas que invalidem os contratos.

A existência de um bloqueio externo não justifica parar as frentes independentes. A existência de um teste verde, isoladamente, não justifica declarar uma entrega concluída. O resultado final precisa separar o que foi implementado, o que foi testado, o que está integrado, o que foi verificado remotamente e o que ainda depende de decisão humana.

# Direcionamento de execução — Tenancy ADR Finalization

## Master Directive §6 — Actor/Subject, persistência e continuidade do plano

**Data:** 26/10/2026  
**Projeto:** `cestari-studio/generative-os`  
**Referências:** `docs/adr-tenancy-and-journey-persistence.md`, `docs/red-team-audit-readiness-generator.md`, `supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql`

**Modo de execução:** local, forward-only, com testes descartáveis e sem mutações remotas.

## 1. Objetivo

Finalizar o ADR 0001 para que identidade autenticada, iniciador do onboarding, pessoa-alvo, organização, membership, autoridade e conclusão de etapas tenham semântica inequívoca.

A correção anterior do provisioning resolve a separação entre criação e conflito de identificador, de acordo com as evidências fornecidas. Isso não resolve, por si só, quem pode concluir uma etapa em nome de outra pessoa nem quem pode receber uma decisão `allow`.

A ambiguidade actor/subject deve ser fechada antes de considerar o readiness gate concluído.

## 2. Decisão de arquitetura proposta

### 2.1 Definições normativas

| Conceito                 | Definição                                                        | Autoridade                                                                  |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `actor_id`               | Principal autenticado que inicia ou executa uma ação no workflow | Derivado no servidor de `auth.uid()`                                        |
| `subject_user_id`        | Pessoa cujo onboarding ou estado está sendo tratado              | Identidade vinculada ao run por operação autorizada                         |
| `completed_by`           | Principal que efetivamente executou a conclusão da etapa         | Derivado no servidor no momento da conclusão                                |
| `target_organization_id` | Organização à qual a operação se aplica                          | Validada pelo servidor contra a política e a hierarquia                     |
| `run_id`                 | Identificador do workflow específico                             | Gerado ou validado no backend                                               |
| readiness                | Decisão de acesso para um principal e contexto definidos         | Resolvida no servidor a partir de definições publicadas e estado autorizado |

Não inferir autorização, membership, papel, conclusão ou autoridade a partir de e-mail, nome, `account_type`, existência de uma organização ou capacidade de ler um run.

### 2.2 Dois modos explícitos de onboarding

**`self_service`**

- O ator e o sujeito são a mesma pessoa.
- A criação do run deve validar essa igualdade no servidor.
- A conclusão de etapas obrigatórias é atribuída ao sujeito, salvo verificação independente prevista no contrato.
- Outro usuário não pode modificar o run ou concluir etapas apenas por conhecer seu identificador.

**`delegated`**

- Ator e sujeito podem ser diferentes.
- A delegação precisa ser autorizada por uma política confiável, no servidor.
- O escopo da delegação deve identificar o workflow, o sujeito e as ações permitidas.
- Cada etapa define quais tipos de principal podem concluí-la: sujeito, delegado autorizado ou verificador confiável.
- Consentimento, representação legal, identidade e outras declarações sensíveis não podem ser consideradas satisfeitas apenas porque um delegado marcou a etapa como concluída.

O modo e as permissões são definidos por configuração normativa publicada, não por parâmetros fornecidos pelo navegador.

Se existirem fluxos mistos, eles devem ser declarados separadamente; não se deve inferir um terceiro modo de permissões.

### 2.3 Semântica da decisão de readiness

A decisão `allow` deve responder à pergunta: **este principal pode acessar este contexto agora, segundo a política aplicável?**

Para rotas privadas de um usuário:

1. Derivar o principal da sessão validada.
2. Resolver o contexto e as permissões no servidor.
3. Identificar a definição publicada e sua versão.
4. Avaliar as etapas obrigatórias segundo o modo e as regras de conclusão daquela jornada.
5. Validar membership, política e autoridade independentemente do progresso do onboarding.
6. Retornar uma decisão discriminada.

Valores admissíveis:

- `allow`: todos os requisitos aplicáveis estão satisfeitos.
- `require_steps`: existem etapas obrigatórias ainda não satisfeitas.
- `blocked`: a política nega a operação ou o acesso.
- `unavailable`: não foi possível resolver com segurança a configuração ou o estado.

Falha de consulta, definição ausente, versão inválida, política ambígua ou configuração não publicada nunca devem resultar em `allow`.

A conclusão de um onboarding não concede automaticamente papel, membership, entitlement ou autoridade.

### 2.4 Atribuição e comprovação de conclusão

Cada etapa que possa influenciar readiness precisa ter atribuição verificável do principal responsável pela conclusão.

Revisar a estrutura atual de `onboarding_step_states` e usar, conforme necessário:

- Identificador do run e da etapa.
- Estado e revisão otimista.
- Principal que concluiu a etapa.
- Tipo de conclusão: sujeito, delegado autorizado ou verificador confiável.
- Momento da conclusão.
- Referência à política que autoriza a ação, quando aplicável.

Não armazenar cópias desnecessárias de documentos, segredos ou payloads completos de autenticação no ledger. Usar códigos de erro estáveis e payloads minimizados.

Se forem necessárias colunas ou mudanças estruturais, produzir migration aditiva e compatível com os registros existentes. Não editar migrations já aplicadas para alterar retroativamente seu efeito.

## 3. Persistência, RLS e idempotência

Revisar o journey ledger com as seguintes garantias.

### 3.1 Controle de acesso

- O ator não recebe acesso irrestrito a todos os dados do sujeito por ter iniciado o run.
- O sujeito não recebe automaticamente permissão para modificar qualquer execução delegada.
- Uma delegação autorizada é limitada às operações e etapas explicitamente permitidas.
- O acesso aos registros de etapa deriva da autorização do run e da política da operação.
- A organização-alvo não pode ser escolhida ou alterada para contornar membership ou hierarquia.
- `completed_by` e outras atribuições críticas são determinados pelo backend, não aceitos como fatos confiáveis do cliente.

A política final deve evitar tanto a elevação de privilégio quanto o bloqueio de um fluxo legítimo de delegação.

### 3.2 Concorrência e idempotência

- Repetir a mesma operação lógica não pode criar runs ou memberships duplicados.
- Uma chave idempotente reutilizada por outro ator não deve permitir que ele leia ou controle a execução original.
- Avaliar uma restrição composta, como `(actor_id, wizard_key, idempotency_key)`, em vez de unicidade global desnecessariamente restritiva.
- Repetições com a mesma chave e payload compatível devem retornar um resultado consistente.
- Reutilização incompatível da chave deve produzir erro explícito e auditável.
- Escritas concorrentes usam revisão otimista ou mecanismo transacional equivalente.
- Conflitos de revisão retornam um resultado recuperável; não sobrescrevem silenciosamente uma conclusão concorrente.
- Expiração impede novas alterações não autorizadas e deve ter comportamento definido para runs incompletos e concluídos.

A escolha exata da chave e sua compatibilidade com clientes existentes devem ser verificadas contra os consumidores do repositório antes de alterar o contrato.

### 3.3 Compatibilidade histórica

- Manter `persons.additional_property.onboarding` como fallback legado apenas enquanto necessário.
- Não tratar o JSON legado como fonte autoritativa concorrente após a migração do run.
- Preservar o histórico necessário e minimizar PII.
- Não migrar nem remover o modelo legado `tenants*` neste ADR.
- Documentar a precedência entre dados canônicos e dados legados.
- Assegurar que uma falha parcial da migração possa ser retomada sem duplicação.

## 4. Testes obrigatórios do ADR

Criar ou ampliar testes SQL em PostgreSQL descartável 17.11, executados com roles não superusuárias e RLS efetivamente ativa.

### Identidade e delegação

1. Self-service com ator igual ao sujeito: permitido quando todos os requisitos forem satisfeitos.
2. Self-service com ator diferente do sujeito: negado.
3. Delegação não autorizada: negada.
4. Delegação autorizada para a etapa permitida: aceita.
5. Delegado tentando concluir etapa reservada ao sujeito: negado.
6. Sujeito tentando alterar run fora do seu escopo: negado.
7. Terceiro não relacionado tentando ler ou modificar o run: negado.
8. Conclusão de uma pessoa não deve satisfazer automaticamente a jornada de outra.
9. Completion attribution deve refletir o principal efetivo, não um valor arbitrário do cliente.
10. A decisão de readiness respeita a política específica de cada modo.

### Integridade e falhas

11. Definição ausente ou não publicada: `unavailable`.
12. Definição publicada sem etapas obrigatórias: rejeitada na escrita ou tratada como `unavailable`, nunca `allow`.
13. Passo com estado inválido ou revisão desatualizada: rejeitado.
14. Repetição idempotente: sem duplicação.
15. Reuso incompatível da chave: erro determinístico.
16. Duas conclusões concorrentes: sem perda silenciosa de atualização.
17. Run expirado: comportamento documentado e testado.
18. Injeção em `wizard_key` e versões inválidas: sem crash e sem autorização.
19. Cross-wizard completion: não satisfaz requisitos de outro wizard.
20. Falha no backend ou política não resolvida: fail-closed.

Se algum teste depender de uma interpretação ainda não decidida, registrar o caso como decisão pendente; não ajustar a expectativa para fazer a suíte passar.

## 5. Trabalho paralelo

Aplicar o limite global de até quatro implementadores e seis agentes ativos incluindo coordenação e auditoria. Cada arquivo possui um único responsável; o integrador é o único responsável por integrar os resultados.

### Worker A — ADR e contratos

- Finalizar `docs/adr-tenancy-and-journey-persistence.md`.
- Registrar os modos de onboarding, regras de delegação e semântica de readiness.
- Atualizar o registro de decisões e consequências.
- Marcar explicitamente decisões que dependam do responsável do produto.

### Worker B — Persistência e RLS

- Revisar o schema e as políticas existentes do ledger.
- Elaborar somente as migrations aditivas necessárias.
- Criar a suíte SQL de permissões, delegação, idempotência, concorrência e expiração.
- Testar em banco descartável e demonstrar que os papéis são aplicados efetivamente.

### Worker C — Readiness e consumidor frontend

- Revisar a resolução do readiness e seu adapter.
- Garantir derivação server-side do principal e do contexto.
- Confirmar os estados `allow`, `require_steps`, `blocked` e `unavailable`.
- Cobrir sign-in, restauração de sessão, troca de contexto e navegação direta.
- Não introduzir fallback otimista nem simulação local para substituir uma resposta ausente.

### Worker D — Auditor independente

- Fazer primeiro a análise read-only.
- Reproduzir o caso em que sujeito e ator completam o mesmo run.
- Tentar bypass por mudança de identificador, revisão, wizard, role e contexto.
- Auditar separadamente a decisão produzida pelo RPC e a forma como o frontend a consome.
- Entregar achados com reprodução, severidade e teste negativo correspondente.

O coordenador deve congelar contratos compartilhados antes de iniciar alterações concorrentes. Não permitir que vários workers editem o mesmo ADR, migration ou teste de integração.

## 6. Critérios de aceitação desta fase

A fase só pode ser marcada `CI_VERIFIED` quando:

- O ADR documenta inequívoca e consistentemente ator, sujeito, delegação e principal da decisão.
- Todos os achados reproduzidos possuem correção ou decisão pendente explícita.
- O schema e RLS limitam atores e sujeitos aos seus escopos.
- A matriz de rastreabilidade aponta para os contratos, operações, campos e testes relevantes.
- As migrations rodam em um PostgreSQL descartável compatível.
- A suíte SQL cobre os testes obrigatórios de identidade, delegação, concorrência e falhas.
- Os testes frontend comprovam que erros não são exibidos como sucesso, conclusão vazia ou ausência de credenciais.
- O gerador e `spec:check` continuam determinísticos.
- Lint, build, testes afetados e suítes integradas passam no mesmo SHA.
- O auditor verifica os resultados sem implementar a correção auditada.
- A documentação identifica explicitamente o que permanece não validado remotamente.

Um ADR escrito não equivale a uma decisão implementada; migration testada localmente não equivale a runtime remoto corrigido.

## 7. Sequência posterior — concluir o restante do plano

Após esta fase, o coordenador deve continuar todas as frentes independentes, sem parar apenas porque uma autorização remota está pendente.

### Fase seguinte 1 — Provisionamento completo

- Mapear todos os consumidores de `create_or_update_corporate_tenant`.
- Confirmar que o caminho de criação usa `provision_corporate_tenant` após a migração autorizada.
- Separar explicitamente criação, atualização, convite, ingresso, solicitação de acesso, criação de unidade, sandbox e agência.
- Impedir promoção de `org_owner` por conflito de identificador.
- Garantir que parent, authority, membership e identifiers sejam validados ou derivados no backend.
- Manter a RPC legada apenas para compatibilidade enquanto houver consumidores; registrar plano de descontinuação com testes que impeçam reintrodução.

### Fase seguinte 2 — Readiness centralizado

- Consolidar o uso do adapter por sign-in, restauração da sessão, troca de contexto e rotas privadas.
- Eliminar decisões locais baseadas em `account_type`, nome, número de registros ou `plan_tier`.
- Usar definições versionadas e confiáveis para as etapas obrigatórias.
- Testar falha de rede, payload inválido, configuração ausente e contexto sem membership.
- Registrar a ausência da RPC remota como bloqueio de deployment até a aplicação autorizada e verificada.

### Fase seguinte 3 — Contratos e UX

- Fechar a matriz `journey → wizard → step → role → field → operation → entity → test → evidence`.
- Impedir identificadores físicos duplicados nos artefatos TypeScript gerados; conflito semântico deve falhar explicitamente.
- Rejeitar definições publicadas sem etapas obrigatórias válidas.
- Aplicar Carbon Core nos fluxos de autenticação e os componentes de onboarding compatíveis do IBM Products onde previstos.
- Preservar i18n nas seis localidades atualmente cobertas; testar acessibilidade, estados de erro, carregamento e formulários.
- Manter as 12 configurações operacionais ligadas ao contrato efetivo; não criar bindings fictícios para satisfazer cobertura normativa.

### Fase seguinte 4 — Segurança e banco

- Executar as verificações locais das quatro migrations pendentes mencionadas no relatório: readiness ledger, grants de PagBank, grants dos três RPCs e safe provisioning.
- Adicionar uma regra de CI para detectar funções públicas `anon`/`PUBLIC`-executáveis fora de uma allowlist justificada.
- Garantir que alterações em funções SQL explicitem seus grants e revogações.
- Revalidar todas as SECURITY DEFINER quanto a `search_path`, grants, autenticação, membership e escopo.
- Preparar a migration de índices ausentes em separado; confirmar a cobertura real das FKs compostas e os planos de consulta.
- Não remover índices apenas por `idx_scan = 0` em banco sem tráfego representativo.
- Não consolidar políticas RLS cuja semântica seja complementar.
- Manter o índice que sustenta a constraint de unicidade de `tenant_users`; a remoção do índice duplicado exige verificação de dependências e aprovação separada.

### Fase seguinte 5 — CI/CD e Preview E2E

- Executar suites SQL de journey, provisioning, grants e billing no mesmo SHA integrado.
- Executar `spec:check`, validação de matrizes e registries, branding, lint, build, unit tests, SSR smoke e browser smoke.
- Executar axe e benchmark conforme os gates configurados.
- Executar E2E de Preview com autenticação autorizada e secrets disponíveis somente no ambiente.
- Validar os fluxos privados e os estados negativos, não somente HTTP 200 ou renderização SSR.
- Testar passkeys em `app.cestari.studio`, a origem autorizada, sem tratar a incompatibilidade de RP ID em Preview como falha do domínio de produção.
- Registrar a evidência pelo SHA exato; cada novo commit precisa do próprio CI.

### Fase seguinte 6 — Revisão e release

- Gerar relatório de achados independentes, bloqueios e evidências.
- Atualizar o release evidence ledger com estado e SHA por item.
- Preparar o pacote de revisão do PR #7 com alterações, riscos residuais, testes e decisões requeridas.
- Obter revisão humana antes de merge.
- Solicitar autorização específica para cada grupo de migrations remotas.
- Depois de cada aplicação autorizada, verificar os grants, políticas, tabelas e RPCs no remoto antes de marcar o bloqueio correspondente como encerrado.
- Separar prontidão de Preview de autorização para promoção de produção.
- Não promover produção até todos os gates, aprovações e evidências requeridos estarem concluídos.

## 8. Limite de tentativas e política de falhas

Cada defeito recebe um identificador e até três ciclos de correção:

1. Reproduzir e identificar a causa raiz.
2. Implementar a menor correção coerente com o contrato e testar.
3. Se necessário, realizar uma última correção baseada na nova evidência.

Após três tentativas sem resolução, interromper novas variações especulativas, registrar as reproduções, impacto, hipóteses descartadas e opções de decisão. Isso não encerra o plano inteiro: outras frentes independentes continuam.

Quando um teste falhar, não reduzir sua cobertura, neutralizar asserções, aumentar timeouts arbitrariamente nem transformar erros em skips para obter CI verde. Corrigir a causa ou documentar um bloqueio real.

## 9. Gate de conclusão global

O plano somente poderá ser declarado concluído quando cada item estiver em uma destas categorias, com evidência:

- `IMPLEMENTED_AND_TESTED_LOCAL`
- `CI_VERIFIED`
- `PREVIEW_E2E_VERIFIED`
- `BLOCKED_OWNER_APPROVAL`
- `BLOCKED_ENVIRONMENT`
- `BLOCKED_HUMAN_REVIEW`
- `DEFERRED_WITH_APPROVAL`

Não marcar uma fase como concluída porque seus arquivos existem ou porque uma suíte parcial passou. Bloqueios externos devem ser específicos, com escopo afetado e condição de desbloqueio mensurável.

## 10. Restrições finais

- Todas as migrations permanecem locais até autorização explícita.
- Não fazer merge, deploy, promoção ou alteração remota como consequência implícita desta diretiva.
- Não alterar o repositório normativo `cestari-studio/genOS`.
- Não expor credenciais, PII, bypass secrets ou dados privados em logs.
- Não afirmar que testes, CI, revisão ou mudanças ocorreram sem evidências correspondentes.
- Priorizar segurança e integridade dos contratos; em caso de ambiguidade, falhar fechado e registrar a decisão necessária.

**Entrega imediata:** ADR 0001 finalizado, decisão actor/subject explicitada, testes SQL/ frontend de delegação e readiness definidos, migration aditiva proposta se necessária, auditoria independente concluída e matriz de evidências atualizada.

**Próximo marco:** provisioning e readiness integrados localmente, com os bloqueios remotos registrados separadamente e sem impedir a conclusão dos demais steps locais.
