# Execução governada do Master Directive — generative-os

**Tipo:** blueprint de orquestração para execução local, forward-only e baseada em evidências  
**Data de pesquisa documental:** 26/10/2026  
**Revisão do blueprint:** v3 — 27/10/2026  
**Repositório-alvo:** `cestari-studio/generative-os`  
**Referência normativa:** `cestari-studio/genOS` — somente leitura  
**Modo padrão:** sem mutações remotas; sem merge, push, deploy ou aplicação de migrations remotas.

> Este documento compõe a Master Directive fornecida com OpenCode, Python, Mellea, AI Atlas Nexus, Granite/LM Studio, ReAct, hooks e loops de autocorreção. Não afirma que o repositório, dependências ou integrações foram inspecionados/executados nesta sessão. O preflight deve verificar o estado real antes de agir.

---

## 1. Objetivo operacional

Concluir automaticamente todo trabalho **local, verificável e autorizado** da Master Directive; usar o ciclo ReAct para observar o estado real, executar uma ação limitada, verificar o efeito e corrigir defeitos; relacionar goals, tarefas, riscos, controles e evidências a um grafo de governança; interromper somente o escopo que esteja bloqueado; produzir um pacote de revisão claro para as decisões humanas protegidas.

A definição de concluído é por evidência no SHA testado, não pela declaração de um agente. O plano não termina por atingir um número de iterações, por gerar todos os arquivos ou por passar uma suíte parcial.

### Invariantes não relaxáveis

1. A Master Directive é o contrato de execução; o checkout real é a fonte de verdade sobre estado, arquivos e SHAs.
2. Não executar mutações remotas proibidas, mesmo que um agente, relatório, grafo, modelo ou status anterior as recomende.
3. `cestari-studio/genOS` permanece read-only.
4. Preservar alterações preexistentes. Não usar `git reset --hard`, limpeza destrutiva, `git add .` ou `git add -A`.
5. Nenhuma autorização, membership, papel ou prontidão é inferida de nome, e-mail, `account_type`, identificador fiscal, UUID ou presença de linha.
6. Não converter falha/indisponibilidade em sucesso, valor zero, lista vazia ou `allow`.
7. Máximo de 4 implementadores e 6 agentes ativos no total; um escritor por arquivo; integrador único; auditor read-only na primeira passagem.
8. Até 3 tentativas de correção por defeito, sem renomeá-lo para reiniciar a contagem. Falhas transitórias seguem retries limitados separados.
9. Human gate para ação protegida vem **antes da ação externa**. Autocorreção local nunca substitui essa aprovação.
10. Nenhum teste, CI, E2E, revisão ou aplicação remota é alegado sem artefato observável associado ao SHA correto.

---

## 2. O que a documentação oficial suporta — e o que não se deve presumir

### 2.1 OpenCode

- A documentação oficial oferece SDK tipado **JavaScript/TypeScript** (`@opencode-ai/sdk`) e um servidor HTTP com especificação OpenAPI. Ela não documenta um SDK Python oficial.
- Estratégia preferida para um controlador Python: chamar a API HTTP documentada pelo servidor OpenCode, usando a especificação OpenAPI da **versão instalada**. Não codificar endpoints ou payloads por memória; obter o schema real do servidor e gerar/validar o cliente a partir dele.
- Alternativa, se a API HTTP/contrato local não bastar: um pequeno adaptador TS usando o SDK oficial, com contrato JSON versionado entre Python e TS. Não duplicar a lógica de estado e políticas nos dois runtimes.
- OpenCode suporta plugins JS/TS e eventos como `tool.execute.before`, `tool.execute.after`, `session.error`, `session.idle`, `session.diff` e eventos de permissão. Utilizá-los como hooks de observação/defesa adicional; não presumir que os hooks Mellea interceptam as ferramentas do OpenCode.
- Configurar permissões explícitas (`allow`, `ask`, `deny`) no OpenCode. Não usar auto-approve global como mecanismo de segurança. Negar operações externas protegidas e aplicar um segundo gate no controlador.
- Servidor local por padrão em `127.0.0.1`; não expor à rede. Se precisar de acesso além de loopback, exigir autenticação e revisar CORS/origem.

### 2.2 Mellea

- Usar a biblioteca Python Mellea para programas generativos, schemas tipados, requisitos, validadores, RAG e hooks das chamadas `m.instruct()` quando disponíveis na versão instalada.
- O resultado de decomposição, inclusive `m decompose`, é um **plano proposto**. Validar schema, dependências, ciclos, escopo, autoridade, arquivos e critérios antes de executar qualquer tarefa.
- Usar validadores determinísticos para contratos, JSON, estado, contagem de tentativas, hashes, testes e permissões; LLM validators são complementares.
- Intrinsics/adapters especializados não são automaticamente compatíveis com qualquer endpoint OpenAI-compatible. Não depender deles sem confirmar backend, modelo e extras compatíveis.

### 2.3 Mellea Skills Compiler

- Trata-se de **research preview**; APIs, CLI e artefatos podem mudar.
- Seu fluxo documentado é `compile` → `certify`: compilação da especificação para pipeline Mellea tipado, depois AI Atlas Nexus/PolicyManifest + hooks do Granite Guardian + fixtures e trilha de auditoria.
- O README consultado lista Claude Code e IBM Bob como backends de compilação e Ollama/vLLM como engines de inferência para certificação. Não documenta OpenCode + LM Studio como caminho nativo.
- Portanto, não inserir o Skills Compiler no caminho crítico até comprovar sua compatibilidade no ambiente real. Usar Mellea diretamente no controlador é o caminho base. Rodar Skills Compiler como trilha opcional e isolada somente se os backends e versões exigidos estiverem disponíveis.

### 2.4 AI Atlas Nexus e ontologia/graph

- A ontologia oficial relaciona riscos, taxonomias, ações/mitigações, sistemas e avaliações; o projeto oficial inclui schema LinkML, dados de instâncias e tooling para exportação de grafo, incluindo representação Cypher.
- Ingerir a ontologia e seus dados **oficiais/populados** com versão/commit/hash registrados. Usar APIs e IDs reais do pacote para identificar riscos e ações. Não inventar nomes de riscos, IDs ou relações oficiais.
- Adicionar os elementos específicos deste projeto como um **overlay namespaced** separado (por exemplo `genos:*`), com origem e evidência. Não alterar nem rebatizar os dados upstream.
- A documentação do AI Atlas Nexus lista backends como Ollama, vLLM e Watsonx; não assume compatibilidade com LM Studio. Para inferência de risco, usar um backend oficialmente suportado ou construir um adaptador LM Studio isolado, tipado e testado. Enquanto não houver adaptação validada, usar os dados do grafo como catálogo/ontologia local e marcar inferência dinâmica como não verificada.
- AI Atlas Nexus é governança e análise de risco, não prova de correção funcional nem autoridade para aprovar mudança remota.

### 2.5 Runtime local + Granite (decisão incremental)

- **Não migrar de runtime no MVP.** O preflight identifica qual servidor já está ativo e integrado. Manter LM Studio se ele já for o caminho funcional; manter Ollama se esse for o caminho funcional. Não operar ambos em paralelo sem uma necessidade comprovada por benchmark ou por requisito de compatibilidade.
- LM Studio documenta `/v1/models`, `/v1/chat/completions`, `/v1/responses` e `/v1/embeddings`; JSON estruturado por JSON Schema está documentado em `/v1/chat/completions`. A API nativa de carregamento permite configurar contexto e consultar o estado da instância. Verificar a configuração efetiva da instância, não apenas o limite anunciado pelo modelo.
- Para Ollama, `num_ctx` deve ser definido no `Modelfile`/configuração de modelo aplicável; não assumir que um cliente OpenAI-compatible pode alterar o contexto por requisição. Verificar `/api/ps`, versão e opções reais do servidor.
- A API de ferramentas pode variar conforme modelo, template e runtime. Testar cada combinação real para tool calling, JSON/schema, contexto, cancelamento, latência e falhas antes de atribuir-lhe tarefas.
- Modelos de referência para benchmark — não são pressupostos de disponibilidade: Granite 4.2 3B para geração/código; Granite 4.0 350M para classificações simples; Granite Embedding multilingual R2 para embeddings se o artefato exato estiver disponível; **Granite Switch 4.1 3B Preview como candidato adicional a evaluador especializado**, não como substituto imediato do modelo de geração.
- Granite Switch 4.1 3B Preview é baseado em Granite 4.1 3B, com contexto anunciado de 128K e 12 adapters embutidos das bibliotecas Granite Libraries (RAG, Core e Guardian). O modelo base é um Transformer denso com mecanismo de switching por tokens/posições; não o tratar como um MoE convencional. Conferir o model card e os artefatos oficiais da versão em uso.
- O caminho Mellea + Granite Switch documentado oficialmente usa vLLM e wrappers de adaptadores que registram o modelo e aplicam os tokens/template. A via GGUF/Ollama descrita no material do modelo é uma rota de runtime de baixo nível: usar `raw: true` e prompt renderizado apenas se a versão exata do GGUF/Ollama passar nos testes. Não presumir que os wrappers de alto nível de Mellea para Switch funcionam via Ollama ou LM Studio sem suporte explícito verificado.
- Aliases de contexto são perfis de configuração, não modelos distintos por definição. Criá-los somente depois de provar o caminho base e a capacidade do runtime. Não baixar nem carregar novos modelos automaticamente sem uma etapa explicitamente autorizada.
- Nenhum modelo — incluindo Switch/Guardian — pode, isoladamente, autorizar acesso, decidir segurança, certificar conclusão ou aprovar operação privilegiada. Sinais de adapter devem ser corroborados por validadores determinísticos e evidências.

### 2.6 Python e dependências

Há potencial divergência entre os limites de Python indicados nos READMEs consultados para AI Atlas Nexus e Mellea Skills Compiler. Resolver isso usando `Requires-Python` e locks das versões exatas, não assumindo compatibilidade. Criar um ambiente isolado de integração, preferencialmente testando primeiro Python 3.11, e registrar versões e hashes. Não alterar a versão do runtime do produto sem necessidade demonstrada.

---

## 3. Arquitetura-alvo mínima

```text
Master Directive + specs normativas + estado real do repo
                         |
                         v
             Python Execution Controller
    SQLite state / Task DAG / policy / retries / ledger
          |              |                 |
          v              v                 v
       Mellea       AI Atlas Nexus     Deterministic gates
  typed plans/checks risks/actions     git/tests/SQL/build/CI
          |              |                 |
          +--------------+-----------------+
                         |
                         v
             OpenCode Server HTTP/OpenAPI
             isolated session/worktree/task
                         |
                         v
               code changes + observations
                         |
                         v
       ReAct observe -> act -> verify -> repair
                         |
                         v
      audit artifacts + graph overlay + evidence ledger
                         |
             local readiness / human review
                         |
          explicit owner approval per external action
```

### Responsabilidades

| Componente | Responsabilidade exclusiva |
|---|---|
| Master Directive / specs normativas | Goal, escopo, critérios, proibições e precedência normativa |
| Controlador Python | Máquina de estados durável, agenda DAG, tentativas, gate de políticas, registro de evidências e decisões |
| Mellea | Planejamento tipado, extração, requisitos, validators e hooks para suas próprias chamadas generativas |
| AI Atlas Nexus | Ontologia/população oficial, identificação/mapeamento de riscos e ações de governança |
| Granite Guardian | Sinal de risco para prompts/saídas em critérios suportados, quando realmente integrado; nunca autorização final |
| OpenCode | Implementação no código por tarefa limitada, sob permissões e diretório controlados |
| Verificadores determinísticos | Testes, lint, build, SQL, tipos, diff, schema, hashes, CI e assertions |
| Auditor independente | Tenta refutar a correção sem implementar a correção na primeira passagem |
| Responsável humano | Decisões de produto/autoridade e aprovações para operações protegidas |

Não adicionar LangGraph, CrewAI, Temporal ou outro framework multiagente no MVP. A máquina de estados Python + DAG persistente é suficiente para provar o fluxo. Reavaliar apenas se houver requisito demonstrado de workers distribuídos com retomada entre máquinas.

---

## 4. Goals, critérios e DAG

Cada goal recebe ID estável (`G0`, `G1`, ...). Cada defeito recebe ID estável (`SEC-PAY-01`, `GEN-TYPE-01`, `JOURNEY-ACTOR-01` etc.). Cada tarefa precisa conter:

```json
{
  "task_id": "SEC-PAY-01",
  "goal_id": "G1",
  "title": "Validar grants de RPC PagBank em PostgreSQL descartável",
  "source_refs": ["Master Directive §6.1"],
  "depends_on": ["G0-BASELINE"],
  "owner_role": "worker_a",
  "allowed_paths": ["supabase/migrations/**", "tests/sql/**"],
  "read_only": false,
  "external_mutation": false,
  "risk_class": "high",
  "acceptance_criteria": ["anon nega EXECUTE", "authenticated nega EXECUTE", "service_role permite EXECUTE"],
  "verification_commands": ["comandos confirmados no package.json/CI"],
  "max_repair_attempts": 3,
  "status": "PENDING",
  "evidence_refs": []
}
```

O exemplo é um contrato proposto do controlador, não schema nativo de OpenCode/Mellea/AI Atlas. O validador deve rejeitar placeholders na execução real: os comandos precisam ser resolvidos para comandos existentes no repositório.

### Fases/Goals do plano

- `G0` — Baseline, checkout, contratos, versões, mapa de arquivos e evidência histórica versus atual.
- `G1` — PagBank RPC grants / SECURITY DEFINER, em banco descartável.
- `G2` — Grants das RPCs `anon`/`PUBLIC` + testes negativos de camada de negação.
- `G3` — Provisioning autenticado sem takeover, elevação implícita ou conflito inseguro.
- `G4` — Spec Control Plane, validação semântica, geração determinística e tipos.
- `G5` — ADR de tenancy, hierarquia e decisão explícita actor/subject/delegação.
- `G6` — Journey ledger: RLS, TTL, concorrência, idempotência, payload minimizado e recuperação.
- `G7` — Comandos de provisioning separados e recuperação transacional.
- `G8` — Readiness centralizado, server-authoritative e fail-closed.
- `G9` — UX Carbon, i18n, auth, passkeys e estados `unknown/unavailable`.
- `G10` — Settings, registries, bindings e rastreabilidade normativa.
- `G11` — Desempenho/RLS: triagem baseada em evidência, sem remoções automáticas.
- `G12` — Suites SQL, lint, tipos, build, SSR/browser smoke e acessibilidade.
- `G13` — Red team independente e reparos limitados.
- `G14` — Preview E2E associado ao SHA, somente quando acesso autorizado estiver disponível.
- `G15` — Evidence ledger e pacote de revisão humana.
- `G16` — Aguardar decisões/autorizações protegidas; nenhum gate humano é contornado.

A dependência real deve ser gerada a partir da Master Directive, da matriz normativa e dos arquivos atuais. Não codificar uma falsa lista de passos como verdade se o plano ou o repositório disserem outra coisa. Tarefas independentes podem correr em paralelo; a segurança e os contratos compartilhados precedem a integração.

---

## 5. Agentes, propriedade e concorrência

Manter os limites da diretiva: até 4 implementadores, até 6 agentes ativos contando coordenador e auditor; um escritor por arquivo; integrador único; auditor read-only na primeira passagem; no máximo uma suíte pesada por checkout compartilhado, salvo isolamento comprovado.

| Papel | Escopo primário | Proibição principal |
|---|---|---|
| Coordenador/integrador | Baseline, contratos, DAG, integração, testes integrados, ledger e handoff | Não inferir que migration está segura só porque o autor testou |
| Worker A | PagBank, grants/RPCs de pagamento, SQL e matriz de privilégios | Não editar onboarding/UI/gerador |
| Worker B | `spec-validate`, `spec-generate`, artefatos e rastreabilidade | Não editar grants ou componentes React |
| Worker C | ADR, journey ledger, tenancy, RLS, idempotência e concorrência | Não editar grants de PagBank nem UI |
| Worker D | Readiness adapter, auth, formulários, passkeys, UX, i18n e a11y | Não editar migrations de tenancy nem gerador |
| Auditor independente | Reprodução de defeitos e red team read-only; depois revalidar correções | Não implementar a correção auditada antes do registro do achado |

Antes de distribuir tarefas, congelar os contratos de arquivos compartilhados. `package.json`, lockfile, workflows, release ledger, matriz de maturidade e arquivos de integração têm integrador único. Workers apresentam diff sugerido e evidência, não editam esses arquivos diretamente.

Usar worktrees separadas quando compatível com as ferramentas e com o estado real do Git; caso contrário, manter o mapa de propriedade e serializar mudanças que possam colidir. Nunca descartar trabalho preexistente para “limpar” a base.

---

## 6. ReAct operacional — sem confiar em chain-of-thought

Implementar ReAct como um ciclo observável de **estado → ação limitada → observação → avaliação**, inspirado no padrão público ReAct. Não exigir, armazenar ou expor raciocínio privado extenso do modelo. Registrar plano de ação resumido, ferramentas chamadas, resultados, evidências e decisão de controle.

```text
OBSERVE
  Ler Git/status/diff/logs atuais, estado do task ledger e artefatos.
  Confirmar SHA, dependências, escopo e permissões.

THINK/PLAN (saída estruturada, curta)
  Escolher uma tarefa elegível do DAG.
  Declarar hipótese testável, arquivos permitidos e critério de sucesso.
  Mellea valida o schema; policy gate verifica autorização.

ACT
  Enviar uma instrução de tarefa limitada ao OpenCode via API documentada.
  Permitir apenas ferramentas e paths necessários.
  Não executar comandos remotos protegidos.

OBSERVE
  Ler resposta real, diff, status Git, resultados e logs não sensíveis.
  Verificar se houve alteração fora do escopo.

VERIFY
  Executar os verificadores existentes e específicos do domínio.
  Executar testes como roles reais, não só superuser/owner.
  Conferir assertion e a camada exata de negação.

EVALUATE
  Determinístico: PASS / FAIL / BLOCKED / NEEDS_EVIDENCE.
  Guardian/LLM: sinal adicional com proveniência e limitação.
  Ontologia: mapear risco/controle usando IDs oficiais confirmados.

REPAIR (se elegível)
  Classificar a falha e modificar a hipótese, não repetir cegamente.
  Até 3 tentativas por defeito, com regressão depois da última correção.
  Depois da terceira falha: registrar causa provável, evidências e opções.
  Continuar tarefas independentes; não travar todo o plano.

CHECKPOINT
  Persistir estado e artefatos após cada transição significativa.
  Atualizar evidence ledger por SHA/ambiente/command/exit code.
```

### Classificação de falhas/retries

- **Falha de contrato/schema/segurança:** não retentar cegamente; corrigir a causa; `deny`/`blocked` mantém-se até prova.
- **Falha transitória** (por exemplo, serviço local reiniciável): retry limitado, backoff e mesmo idempotency key quando aplicável.
- **Conflito de versão/revisão:** recarregar estado e reconciliar; nunca sobrescrever payload antigo automaticamente.
- **Ambiguidade de autoridade/ADR:** bloquear o escopo dependente, emitir questão decisória, continuar tarefas independentes.
- **Ambiente externo indisponível:** registrar `BLOCKED_ENVIRONMENT`; não simular PASS.
- **Após 3 correções sem êxito:** parar só aquele defeito e reportar evidência, não o plano inteiro.

---

## 7. Hooks e guardrails em três camadas

### Camada A — Controlador Python (enforcement primário)

Implementar hooks da aplicação — estes nomes são contratos próprios do controlador, não APIs nativas de um framework:

- `before_plan`: verificar hash das fontes, estado Git e fontes normativas.
- `after_plan`: validar schema do DAG, dependências, ciclos, scope, goals e critérios.
- `before_task`: confirmar dono, paths, dependências e política.
- `before_opencode_request`: validar tarefa, prompt/inputs e limite de contexto.
- `after_opencode_response`: validar saída estruturada e coletar referência da sessão.
- `after_diff`: validar paths modificados, tamanho/diff inesperado e arquivos protegidos.
- `after_verification`: persistir comando, exit code, SHA, assertions e artefatos.
- `before_protected_action`: negar sem autorização vinculada ao tipo exato de operação, ambiente e alvo.
- `before_handoff`: calcular gaps e preparar o pacote de aprovação.

O controlador deve ser fail-closed quando política, grafo, identidade do alvo ou estado atual não puderem ser resolvidos.

### Camada B — OpenCode (defesa adicional e telemetria)

- Configurar `permission` por ferramenta; padrões explícitos `deny`/`ask` para operações de risco.
- Implementar plugin TS/JS para eventos oficiais `tool.execute.before` e `tool.execute.after`; usar `session.error`, `session.idle`, `session.diff` e eventos de permissão para registrar estado.
- O plugin pode rejeitar leituras de segredos e ações proibidas reconhecíveis, mas não deve ser o único controle contra shell remoto. Reforçar no controlador, no ambiente e na disponibilidade de credenciais.
- Servidor restrito a `127.0.0.1`; autenticar se for exposto além da máquina local.
- Não ativar `--auto` como política global. Explicit `deny` deve continuar prevalecendo.

### Camada C — Mellea + Guardian + Atlas

- Usar Mellea schemas e `req`/`check`/validators disponíveis na versão pinada.
- Instrumentar chamadas Mellea por hooks compatíveis com a versão instalada.
- Se Granite Guardian estiver disponível via caminho oficialmente suportado, aplicar seus critérios a prompts/saídas/fixtures relevantes e registrar o verdict. Não afirmar que todos os comandos/tools do OpenCode estão automaticamente instrumentados pelo Guardian.
- Consultar AI Atlas Nexus para levantar riscos, controles e ações. Vincular cada mapeamento à fonte, ID nativo, versão do grafo e confiança/estado de revisão.
- Um verdict LLM não concede permissão. Enforcement é aplicado por código/policy determinística e permissões do OpenCode.

---

## 8. Ontologia e grafo populado

### 8.1 Ingestão oficial

1. Fixar a origem do repositório `IBM/ai-atlas-nexus`, branch/release/commit e checksum dos arquivos de schema, instâncias e dados exportados.
2. Validar schema LinkML e instâncias com as ferramentas definidas no projeto oficial.
3. Registrar a versão do grafo usado para a execução.
4. Manter o dataset upstream imutável e reproduzível.
5. Se uma base de grafo for realmente necessária, usar o exportador/forma Cypher oficial descrita pelo projeto e validar a carga. Não instalar um graph DB apenas para “ter um grafo” se consultas aos dados populados bastarem.

### 8.2 Overlay de execução genOS

Criar registros próprios, namespaced, para ligar o plano ao grafo oficial sem sobrescrever sua ontologia. Tipos de aplicação sugeridos:

- `genos:Plan`, `genos:Goal`, `genos:Task`, `genos:AcceptanceCriterion`;
- `genos:CodeArtifact`, `genos:MigrationProposal`, `genos:TestRun`, `genos:EvidenceArtifact`;
- `genos:PolicyDecision`, `genos:HumanGate`, `genos:Blocker`, `genos:RunAttempt`.

Relações de overlay propostas: `CONTAINS`, `DEPENDS_ON`, `IMPLEMENTS`, `TOUCHES`, `ADDRESSES_RISK`, `MITIGATED_BY`, `VERIFIED_BY`, `EVIDENCED_BY`, `BLOCKED_BY`, `REQUIRES_APPROVAL`, `DERIVED_FROM`. Essas relações são do projeto, não devem ser alegadas como termos nativos do AI Atlas Nexus.

Todo nó/aresta customizado deve ter `namespace`, `source_ref`, `created_by_run`, `source_sha` e timestamp; toda referência a risco/mitigação upstream deve usar IDs reais. Deduplicar por chave determinística e não inserir dados sensíveis. O overlay é regenerável e deve permitir comparar diferenças com a execução anterior.

### 8.3 Mapeamento de riscos

- A descrição do caso de uso é extraída pelo Mellea para um schema tipado.
- AI Atlas Nexus fornece candidatos de risco/ações das taxonomias existentes.
- A classificação é salva como `proposed` até passar por regras locais e/ou revisão apropriada.
- Um controle precisa mapear para uma ação/teste real; “risk addressed” sem teste/evidência fica `PARTIAL` ou `MANUAL`, não `AUTOMATED`.
- Riscos de segurança de auth/RLS/provisioning devem usar casos negativos e assertions concretas; o mapeamento taxonômico não substitui red team.

### 8.4 Consulta de rastreabilidade mínima

Para cada goal/critério, o relatório deve responder:

- Qual fonte normativa o define?
- Quais tarefas e arquivos o implementam?
- Quais riscos oficiais são relevantes e por quê?
- Quais controles o mitigam?
- Quais testes verificam os controles?
- Quais evidências de execução existem no SHA exato?
- Qual maturidade e bloqueio permanecem?

---

## 9. Estado durável e idempotência

Usar SQLite local no controlador como ledger de execução, separado do banco do produto. O schema exato é implementação própria, mas deve cobrir pelo menos:

- `runs`: run ID, source hash, repo path, branch, HEAD inicial/final, config version, started_at/status.
- `goals`: goal ID, critérios e maturidade.
- `tasks`: task ID, dependências, owner role, paths autorizados, risco, status, tentativa atual.
- `attempts`: task ID, número, hipótese, ação, erro classificado, resultado, timestamps.
- `artifacts`: caminho/hash/tipo/SHA/ambiente/command/exit code.
- `policy_snapshots`: source graph, manifest hash, controles aplicáveis e decisão.
- `approvals`: ação exata, ambiente, alvo, requester, approver, instante, expiração e referência; não guardar tokens.
- `blockers`: escopo, causa, responsável e condição de desbloqueio.

Estados sugeridos: `PENDING`, `READY`, `RUNNING`, `VERIFYING`, `REPAIRABLE`, `PASSED`, `BLOCKED_POLICY`, `BLOCKED_OWNER_APPROVAL`, `BLOCKED_ENVIRONMENT`, `FAILED_FINAL`, `CANCELLED`.

Para comandos mutáveis do produto, verificar contrato de idempotência e replay por operação. Para o controlador, use IDs estáveis e hash da fonte; não repetir tarefa `PASSED` se SHA, fontes, config e entradas de dependência não mudaram. Se mudarem, marcar artefatos dependentes como stale e reexecutar as verificações afetadas.

Não guardar reasoning traces privados, credentials, session secrets, PII ou conteúdo integral de payloads sensíveis. Logs guardam observações, chamadas, decisões, errors redigidos e links para artefatos não sensíveis.

---

## 10. Human gate: preparar antes, nunca contornar

### Trabalho que pode completar sem aprovação remota

Inspeção read-only; mudanças locais autorizadas; migrations como arquivos locais; testes em PostgreSQL descartável; unit/integration/contract tests; RLS/grants locais; lint, build, CI; documentação e ADR; geração de artefatos; análise de preview sem alterar ambiente; relatório de auditoria; pacote de revisão.

### Ações proibidas sem autorização explícita específica

- Aplicar migration/DDL/DML privilegiado no Supabase remoto.
- Alterar grants, RLS, Auth, secrets, callbacks, redirect URLs, WebAuthn/RP ID ou origins remotos.
- Deploy, promoção, rollback ou mudança de configuração Vercel.
- Merge, push ou fechar decisão protegida ainda sem aprovação.
- Alterar registro de identidade congelado terminado em `...0010`.
- Escrever em `cestari-studio/genOS`.

Cada aprovação vale apenas para a ação, alvo, ambiente, migration/artefato e SHA nela identificados. Aprovação para uma migration não aprova as outras; autorização de Preview não autoriza produção.

### Pacote de aprovação

Antes de chamar uma pessoa, finalizar o trabalho local independente e preparar:

1. SHA completo e `git diff --stat`/diff revisado.
2. Objetivo, causa raiz e mudanças.
3. Testes executados, exit codes, contagem de assertions e ambiente.
4. Resultado do auditor read-only.
5. Maturidade por gate e gaps residuais.
6. Lista exata das ações protegidas solicitadas, com ambiente e alvo.
7. Riscos, reversão/recuperação e evidência necessária depois da ação.

A aprovação humana é um gate de autoridade, não um teste automático. Um bloqueio externo não deve parar as outras tarefas locais independentes.

---

## 11. Critérios de aceitação globais

- Baseline corresponde ao checkout, branch e SHA reais.
- Todo task/goal possui fonte, owner, dependências, arquivos, critérios e evidências.
- O grafo oficial está versionado por commit/hash e o overlay genOS está separado e reprodutível.
- Mapeamentos de risco usam IDs oficiais rastreáveis; nenhum risco/controle foi inventado pelo agente.
- OpenCode está acessado via API documentada com schema local da versão instalada; o controlador verifica tool permissions e diff.
- Os modelos LM Studio passaram por testes de formato, tool use e qualidade para as funções que recebem.
- Mellea e AI Atlas Nexus carregam em um ambiente com versões compatíveis registradas.
- Mellea/Guardian hooks não são alegados como interceptores globais do OpenCode.
- Cada defeito tem no máximo 3 tentativas de correção, logs redigidos e um resultado terminal.
- Testes de segurança incluem tentativas negativas e comprovam camada de bloqueio.
- Lint, unit tests, matrizes, `spec:check`, suites SQL, build e smoke tests executaram no mesmo SHA de integração aplicável.
- Red team verifica os resultados sem implementar a correção auditada antes da reprodução.
- Preview E2E só fica `PREVIEW_E2E_VERIFIED` quando o artefato servido está associado ao SHA exato.
- `release-evidence-ledger` distingue `PROPOSED`, `IMPLEMENTED_LOCAL`, `IMPLEMENTED_AND_TESTED_LOCAL`, `CI_VERIFIED`, `PREVIEW_E2E_VERIFIED`, `OWNER_APPROVED`, `REMOTE_APPLIED_AND_VERIFIED` e `RELEASED`.
- Nenhuma ação remota é realizada por inferência, por `PASS` local ou por conclusão do modelo.

---

## 12. Sequência imediata recomendada

1. **Preflight read-only:** verificar raiz, branch, HEAD completo, status, diffs staged/unstaged, arquivos não rastreados, SHAs históricos, versions/lockfiles e scripts reais. Parar integração destrutiva se a baseline divergir; continuar a análise read-only.
2. **Compatibility spike isolado:** provar HTTP/OpenAPI OpenCode ↔ Python; LM Studio `/v1/models` + JSON schema; Mellea com backend compatível; AI Atlas Nexus import e grafo populado; versões Python. Não tocar ainda em migrations do produto.
3. **Policy spike:** construir decisão determinística para “pode editar caminho local X” e “ação remota protegida negada”, com testes negativos.
4. **Graph spike:** ingerir snapshot oficial e criar overlay genOS para 1 goal/2 critérios/risco/teste/evidência, com IDs e proveniência reais.
5. **MVP ReAct:** uma tarefa de baixo risco em worktree/local fixture; induzir falha, verificar até 3 correções, interrupção e retomada a partir do SQLite.
6. **G0 baseline e plano completo:** só então decompor o documento integral, resolver dependências e distribuir workers segundo a ownership matrix.
7. **Execução em ondas:** segurança e contratos, depois persistência/provisioning/readiness, depois UX/auth, registries/performance, integração/CI, red team e pacote de aprovação.
8. **Human gate:** preparar package de revisão; só executar operações remotas se houver autorização explícita e específica.

Se qualquer spike falhar, registrar a incompatibilidade e adaptar a fronteira. Não adulterar os critérios nem marcar a integração como suportada só para prosseguir.

---

## 13. Fontes oficiais para execução

- OpenCode SDK (JS/TS): <https://docs.opencode.ai/docs/sdk/>
- OpenCode HTTP server/OpenAPI: <https://dev.opencode.ai/docs/pt-br/server/>
- OpenCode permissions: <https://opencode.ai/docs/pt-br/permissions/>
- OpenCode plugins/events: <https://opencode.ai/docs/pt-br/plugins/>
- Mellea library: <https://github.com/generative-computing/mellea>
- Mellea Skills Compiler (research preview): <https://github.com/generative-computing/mellea-skills-compiler>
- AI Atlas Nexus, ontology and graph resources: <https://github.com/IBM/ai-atlas-nexus>
- Granite Guardian: <https://github.com/ibm-granite/granite-guardian>
- LM Studio OpenAI-compatible API: <https://lmstudio.ai/docs/developer/openai-compat>
- LM Studio structured output: <https://lmstudio.ai/docs/developer/openai-compat/structured-output>
- LM Studio tool use: <https://lmstudio.ai/docs/developer/openai-compat/tools>
- ReAct paper/project: <https://arxiv.org/abs/2210.03629> · <https://react-lm.github.io/>

**Regra de atualização:** na implementação, revisar a documentação oficial e as versões realmente instaladas. Este blueprint não congela APIs de um research preview; ele congela os princípios de autoridade, evidência, segurança e retomada.


---

## 14. Revisão v2 — execução incremental com minimal changes (27/10/2026)

Esta seção refina a ordem de execução e o controle do runtime. Em caso de conflito de implementação, prevalecem os invariantes de segurança das seções 1, 7, 9 e 10; esta revisão não autoriza mutações remotas nem substitui a Master Directive.

### 14.1 Princípio de mudança mínima

1. Tratar o checkout, configurações, lockfiles e comandos reais como baseline; não reestruturar pastas nem trocar framework sem defeito demonstrado.
2. Reutilizar mecanismos existentes de fila, estado, logs, permissões, testes e checkpoints. Adicionar SQLite, adaptador ou plugin apenas se o preflight comprovar a lacuna.
3. Fazer uma alteração por hipótese verificável; registrar arquivo, razão, risco, teste e condição de rollback local.
4. Não criar manifestos/aliases paralelos quando o mesmo contrato puder ser estendido sem ambiguidade.
5. Isolar integrações experimentais em ambiente e dependências separados; não alterar a versão de Python do produto para satisfazer um plugin experimental sem prova de necessidade.
6. Preservar as alterações existentes e executar primeiro um teste de regressão direcionado, depois a suíte adequada.

### 14.2 Ordem de execução revisada

**Step 0 — preflight read-only.** Confirmar repo, branch, SHA, status/diff, arquivos não rastreados, versões, processos, endpoints e modelos já carregados. Nenhuma instalação, download, configuração persistente ou mutação remota nesta etapa.

**Step 1 — runtime spike.** Usar o runtime já conectado ao caminho atual. Confirmar `/v1/models` ou endpoint equivalente, uma inferência, saída JSON/schema, tool calling e timeout. Capturar request sanitizado, resposta, versão e duração.

**Step 2 — compatibilidade OpenCode.** Consultar a API HTTP/OpenAPI da versão instalada e provar uma sessão local a partir do controlador. Se a API documentada não cobrir uma necessidade concreta, avaliar um adaptador TS fino sobre o SDK oficial. Não duplicar a máquina de estados ou a política em TS.

**Step 3 — controlador mínimo.** Reutilizar o ledger/orquestrador existente. Se não houver estado durável, adicionar SQLite local com claims transacionais, checkpoints e transições validadas. Executar um único task de baixo risco e um cenário de reinício.

**Step 4 — política e auditoria.** Testar deterministicamente edição de path permitido, edição de path negado e tentativa de ação remota protegida. AI Atlas Nexus/Guardian fornecem evidência adicional, nunca permissão final.

**Step 5 — concorrência e reparo.** Começar com uma geração ativa e no máximo duas tarefas logicamente concorrentes. Injetar falha, timeout, cancelamento e reinício. Elevar concorrência só após medições no M4.

**Step 6 — Skills Compiler e expansão.** Testar em trilha isolada somente depois de confirmar versões, `Requires-Python`, backend de compilação e engine de inferência compatíveis. Não bloquear o caminho principal por uma integração research preview.

**Step 7 — onda de execução do Master Directive.** Só distribuir o DAG completo depois de G0, compatibilidade e policy spikes aprovados; então seguir a precedência normativa e a matriz de propriedade das seções anteriores.

### 14.3 Perfis de contexto: candidatos, não configuração aplicada

| Alias lógico candidato | Modelo-base candidato | Contexto | Uso proposto | Condição para adotar |
|---|---|---:|---|---|
| `cptx64k-granite42-3b` | Granite 4.2 3B | 65.536 | Contexto longo; planejamento limitado | Só se o runtime/modelo suportar e o benchmark justificar memória/latência |
| `cptx32k-granite42-3b` | Granite 4.2 3B | 32.768 | Tarefas extensas | Validar contexto efetivo e qualidade |
| `cptx16k-granite42-3b` | Granite 4.2 3B | 16.384 | Perfil generativo inicial | Candidato preferencial para primeiro benchmark, não presumido ativo |
| `cptx8k-granite4-350m` | Granite 4.0 350M | 8.192 | Classificação curta | Validar identificador, tool calling se necessário e qualidade |
| `cptx4k-granite4-350m` | Granite 4.0 350M | 4.096 | Tarefas simples | Validar se reduz custo sem degradar a tarefa |
| `judge-granite-switch-4.1-3b-preview` | Granite Switch 4.1 3B Preview | Até 131.072 anunciados; iniciar benchmark em 8K–16K | Avaliação especializada de requisitos, answerability, factualidade, citações e risco | Validar adapter, chat template, runtime, memória e qualidade; não habilitar como gate decisivo por LLM |
| `768d-granite-embedding-311m-multilingual-r2` | Granite Embedding R2 311M multilingual | 768 dimensões de saída, se confirmado | Embeddings/RAG | Verificar modelo exato, dimensão real e benchmark de recuperação |

Os nomes acima são aliases propostos, não identificadores oficiais garantidos. Não criar todos no primeiro ciclo. Selecionar primeiro um perfil generativo e, se RAG fizer parte do escopo ativo, um perfil de embeddings. Contexto configurado não é igual a contexto útil: medir truncamento, tokens de entrada/saída, latência e consumo de memória. Se o runtime não suportar aliases equivalentes, manter um único modelo e configurar o contexto pela API oficial disponível.

### 14.4 Concorrência e ciclo de vida do modelo

- Baseline inicial: uma geração ativa; até duas tarefas de agente em voo lógico; um modelo generativo carregado; embedding separado e em lote pequeno.
- Separar limite de tarefas do limite de inferências simultâneas. Não contar dois subagentes como paralelismo útil se ambos apenas competem pelo mesmo slot de inferência.
- Registrar tempo de load/unload, memória quando observável, fila, p50/p95, tokens/s, erros, retries e taxa de sucesso.
- Definir `keep_alive`/TTL e descarregamento conforme o runtime real. Não mandar `keep_alive: 0` nem alternar instâncias automaticamente sem provar que o servidor é Ollama e medir o efeito.
- Em overload, aplicar backpressure e fila limitada; não disparar retries simultâneos que agravem a pressão.
- Só elevar para concorrência 2 e depois 3 se testes de estresse não demonstrarem regressão inaceitável de memória, p95, erro ou qualidade.

### 14.5 Contrato mínimo de idempotência e retomada

A chave lógica de tarefa deve derivar de `run_id + task_id + input_hash + config_version`. Cada claim é atômico; cada transição de estado é validada; tarefas `PASSED` só são reutilizadas quando entradas, dependências, configuração e SHA relevante não mudaram. Caso contrário, marcar evidência derivada como stale e reexecutar apenas o necessário.

Retries não tornam uma operação externa idempotente. Para qualquer efeito externo, exigir idempotency key suportada pelo destino ou reconciliação explícita antes de repetir. Operações remotas protegidas continuam bloqueadas sem autorização específica, mesmo que a tarefa local tenha passado.

### 14.6 Logging e pacote de evidências

Cada evento deve incluir, quando aplicável: `run_id`, `task_id`, timestamp, etapa, versão/config hash, provider, model ID, contexto configurado, duração, status, tentativa, erro classificado, request/response IDs e refs dos artefatos. Redigir credenciais, tokens, PII e payloads sensíveis; não armazenar chain-of-thought privado.

O relatório por execução deve separar claramente:
- **Observed:** valores efetivamente lidos do ambiente;
- **Executed:** comandos e ações realmente realizados;
- **Verified:** assertions/testes e seus exit codes;
- **Inferred:** conclusões não diretamente observadas;
- **Blocked:** requisito, causa e condição de desbloqueio;
- **Not tested:** lacunas ainda não verificadas.

### 14.7 Gate de aceite do vertical slice

Antes de ampliar para múltiplos workers, demonstrar num fluxo local de baixo risco:

1. Inventário e SHA inicial registrados.
2. Uma tarefa atravessa controlador → OpenCode → diff → verificação.
3. Schema e tool calling testados pelo endpoint real, não apenas por teste isolado do modelo.
4. Path proibido bloqueado e ação remota protegida negada.
5. Falha injetada produz estado terminal ou retry limitado e auditável.
6. Reinício recupera o checkpoint sem duplicar efeitos.
7. Logs e relatório referenciam o SHA, config e artefatos corretos.
8. Nenhuma mudança remota ocorreu.

### 14.8 Timebox inicial de três horas

- **0–30 min:** preflight read-only e baseline.
- **30–60 min:** teste do runtime/modelo e tool calling.
- **60–105 min:** correção mínima ou adaptador isolado, se a evidência exigir.
- **105–145 min:** caminho de tarefa, estado/checkpoint e logs, reutilizando o que já existir.
- **145–170 min:** falhas injetadas, retomada, idempotência e permissões.
- **170–180 min:** relatório de evidências, lacunas e próximo gate.

Esse timebox busca provar um vertical slice, não declarar o Master Directive inteiro implementado.

### 14.9 Documentação oficial de referência para esta revisão

- LM Studio OpenAI-compatible API: https://lmstudio.ai/docs/developer/openai-compat
- LM Studio load model / REST API: https://lmstudio.ai/docs/developer/rest/load
- LM Studio tool use: https://lmstudio.ai/docs/developer/openai-compat/tools
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Ollama Modelfile: https://docs.ollama.com/modelfile
- Ollama API: https://docs.ollama.com/api
- OpenCode agents: https://opencode.ai/docs/agents
- OpenCode SDK: https://docs.opencode.ai/docs/sdk/
- OpenCode HTTP server: https://dev.opencode.ai/docs/server/
- Mellea: https://github.com/generative-computing/mellea
- Mellea Skills Compiler: https://github.com/generative-computing/mellea-skills-compiler
- AI Atlas Nexus: https://github.com/IBM/ai-atlas-nexus

**Nota de evidência:** esta revisão atualiza o desenho e os gates. Não afirma que o runtime, os aliases, os testes ou a integração tenham sido executados nesta sessão. A implementação deve registrar o que foi observado no ambiente real.


### 14.10 Granite Switch 4.1 3B Preview — avaliação especializada (aditivo v3)

**Decisão:** adicionar o Granite Switch como candidato isolado à camada de avaliação/guardrails; não substituir o modelo primário de implementação e não torná-lo bloqueador obrigatório até medir a sua utilidade no hardware local.

#### Fonte e arquitetura

- Model card: `https://huggingface.co/ibm-granite/granite-switch-4.1-3b-preview`
- Coleção Granite Libraries: `https://huggingface.co/collections/ibm-granite/granite-libraries`
- Projeto e exemplos: `https://github.com/generative-computing/granite-switch`
- Guia Mellea + Switch: `https://github.com/generative-computing/granite-switch/blob/main/tutorials/guides/mellea_with_granite_switch.md`
- Catálogo de adapters: `https://generative-computing.github.io/granite-switch/adapter_catalog.html`
- O modelo publicado descreve base `ibm-granite/granite-4.1-3b`, contexto de 128K e 12 adapters das bibliotecas RAG, Core e Guardian. Os artefatos oficiais do modelo listam Transformers e vLLM; a documentação do projeto Granite Switch recomenda Mellea + vLLM para o caminho de inferência de alto nível.

#### Adapters e pontos de integração

| Biblioteca | Adapter(s) relevantes | Ponto do pipeline | Política de uso |
|---|---|---|---|
| RAG | `query_rewrite`, `query_clarification`, `answerability`, `citations`, `hallucination_detection`/`context_relevance` conforme catálogo e versão | Antes/depois da recuperação e geração | Sinal auxiliar para RAG; conservar source IDs e citações verificáveis |
| Core | `requirement-check`, `context-attribution`, `uncertainty` | Pós-geração e auditoria | Verificar critérios de aceite e proveniência; não confiar em autoavaliação sem teste independente |
| Guardian | `factuality-detection`, `factuality-correction`, `guardian-core`, `policy-guardrails` | Pré-aceitação, avaliação de risco e reparo | Sinal de risco e proposta de correção; não concede autorização nem apaga o resultado original |

O catálogo e o contrato de saída podem mudar; sempre ler `adapter_index.json`, `io_configs/`, o chat template e o catálogo da revisão fixada. Não hardcodar lista de tokens ou formato de resposta sem comparar com o checkpoint efetivo.

#### Compatibilidade do runtime — regras sem inferência otimista

1. **Mellea + vLLM:** caminho de alto nível documentado pelo projeto Switch. A página atual do model card especifica requisitos de dependência; usar um ambiente virtual isolado e a faixa de versões indicada no card/repositório fixado. Não adicionar a stack vLLM ao runtime de produto macOS sem verificar suporte real no Apple Silicon e custo operacional.
2. **Ollama + GGUF:** o artefato GGUF citado pelo usuário descreve um checkpoint BF16 com os adapters embutidos e chamadas nativas por `raw: true`, com prompt completo renderizado. Esta via deve ser tratada como integração de baixo nível e condicionada à versão exata do Ollama/GGUF. Testar saída, tokens e isolação por adapter antes de automatizar.
3. **LM Studio:** importar/expor GGUF não prova, por si só, que o runtime preserve a semântica do switch, os tokens de controle ou os limites aLoRA. Não registrar como compatível até o smoke test de cada adapter demonstrar o output esperado.
4. **Mellea wrappers via Ollama/LM Studio:** não presumir compatibilidade nativa para a camada Switch. O guia oficial Mellea+Switch consultado usa `OpenAIBackend` apontado para vLLM e `register_embedded_adapter_model`; outro runtime exige adapter explícito e testes de contrato.
5. **M4 Apple Silicon:** começar com um adapter, contexto 8K ou 16K, uma geração por vez e temperatura determinística apropriada ao eval. Medir memória residente, duração, tokens, erros e interferência com o Granite gerador. BF16 não é uma quantização leve; não tentar 64K/128K antes de medir consumo real.

#### Integração mínima para o Master Directive

1. Fixar modelo/revisão e verificar integridade dos artefatos.
2. Executar teste de geração base sem adapter para distinguir falha de runtime de falha de adapter.
3. Testar `requirement-check` com fixtures positivas e negativas; usar exatamente o template e os tokens definidos no artefato fixado.
4. Testar `answerability` contra documentos que respondem e não respondem à pergunta.
5. Testar factualidade/groundedness com fontes conhecidas e citações deliberadamente ausentes ou contraditórias.
6. Registrar cada execução como `judge_signal`, com adapter, modelo, versão, hash de entradas, fontes, output bruto redigido, parser/schema, duração e estado.
7. Comparar o resultado com o ground truth e validadores determinísticos; acompanhar falso positivo/falso negativo e acordo com os testes.
8. Só após avaliação documentada, ativar o adapter para pré-triagem automática. Os testes determinísticos continuam a definir `PASS`/`FAIL`; o judge pode encaminhar para `NEEDS_EVIDENCE`/revisão, nunca conceder acesso ou autorizar ação protegida.

#### Contrato de judge e fail-safe

Resultado normalizado interno (contrato proposto do controlador, não schema nativo do modelo):

```json
{
  "judge_id": "granite-switch-requirement-check",
  "model_revision": "pinned-revision-or-digest",
  "adapter": "requirement-check",
  "input_hash": "sha256:...",
  "source_refs": [],
  "verdict": "PASS|FAIL|UNCERTAIN|ERROR",
  "raw_artifact_ref": "artifact://...",
  "latency_ms": 0
}
```

- `PASS` do judge significa apenas que o adapter reportou aprovação do critério; não equivale ao estado final da tarefa.
- Timeout, resposta inválida, adapter ausente, parser falhado ou modelo incompatível resulta em `ERROR`/`NEEDS_EVIDENCE`, nunca `PASS`.
- Repetições usam a mesma entrada/hash e orçamento de tentativas; não há loops livres de correção.
- Para `factuality-correction`, guardar o texto original e o corrigido como artefatos separados, depois reexecutar testes e verificação de fontes.
- `guardian-core` e `policy-guardrails` são sinais de triagem; enforcement segue no controlador, permissões OpenCode e verificadores de código.

#### Benchmark de aprovação inicial

Usar fixtures versionadas, não avaliação subjetiva de algumas respostas. Começar com pelo menos 20 exemplos por adapter usado (positivos, negativos e casos ambíguos; 60–100 casos no conjunto mínimo se forem ativados vários adapters) e anotar ground truth. Registrar accuracy, precisão, recall, false-negative rate nos controles críticos, latência p50/p95, consumo de memória e falhas de parser. A contagem é uma recomendação de benchmark local, não um requisito oficial do modelo.

Critérios de promoção:

- 100% dos cenários críticos de política/autoridade ficam bloqueados pelo mecanismo determinístico quando devem ser bloqueados, independentemente do verdict do judge.
- Medir e declarar falsos negativos/positivos de cada adapter; não resumir todos os adapters numa única taxa.
- O benchmark deve demonstrar que Switch agrega sinal útil em relação ao baseline determinístico/Granite atual, sem tornar o throughput ou consumo de memória inaceitável.
- Se a qualidade não superar a baseline ou a compatibilidade não estiver provada, manter o Switch opcional e não carregá-lo no fluxo padrão.

#### Critério de aceite

Granite Switch só passa de `EXPERIMENTAL` para `LOCAL_EVAL_VERIFIED` quando: versão/digest está fixado; adapter e template corretos foram usados; fixtures versionadas passaram pelos thresholds previamente definidos; logs e artefatos são reproduzíveis; e a falha do judge é fail-closed. Não inferir `PRODUCTION_READY` a partir deste marco.


- Granite Switch 4.1 3B Preview model card: https://huggingface.co/ibm-granite/granite-switch-4.1-3b-preview
- Granite Libraries collection: https://huggingface.co/collections/ibm-granite/granite-libraries
- Granite Switch repository: https://github.com/generative-computing/granite-switch
- Granite Switch Composer and adapter catalog: https://github.com/generative-computing/granite-switch/blob/main/src/granite_switch/composer/README.md
- Mellea with Granite Switch: https://github.com/generative-computing/granite-switch/blob/main/tutorials/guides/mellea_with_granite_switch.md
- Granite Switch tutorials and inference support: https://github.com/generative-computing/granite-switch/blob/main/tutorials/README.md
