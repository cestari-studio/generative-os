# Fase 6 — Manifesto de Reconciliação Supabase (preparado, não executado)

**Data de preparação:** 2026-10-22
**Estado:** `BLOCKED — explicit owner authorization required`
**Fonte de hashes/versões:** [`supabase/deploy-manifest.json`](../supabase/deploy-manifest.json) (v2.0, gerado no commit `51a93719`)
**Nenhuma migração, deploy, `db push`, escrita em tabela ou alteração de configuração remota foi executada.**

---

## 1. Projeto-alvo e ambiente

| Item                     | Valor                                      | Verificação                                                               |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------- |
| Projeto autorizado       | `generative-os`                            | `supabase/config.toml` → `project_id = "ldjfjmihdvdmltrptngf"`            |
| Ref                      | `ldjfjmihdvdmltrptngf`                     | Leitura remota confirmada (MCP aponta para este projeto desde a correção) |
| URL                      | `https://ldjfjmihdvdmltrptngf.supabase.co` | —                                                                         |
| Região                   | `sa-east-1`                                | Auditoria inicial                                                         |
| Postgres                 | 17.11                                      | Testes locais usam a mesma major version                                  |
| Projeto IRMÃO (NÃO alvo) | `jkespoegdpkdcrxsxwry` (`genOS`)           | Nunca aplicar migrações/configurações do alvo aqui                        |

## 2. Estado remoto observado (leitura, 2026-10-22)

### Edge Functions — todas PRÉ-`74c3b87`, todas com `verify_jwt = false`

| Função             | Versão remota | `verify_jwt` remoto | `verify_jwt` esperado (config.toml) | Divergência                                   |
| ------------------ | ------------- | ------------------- | ----------------------------------- | --------------------------------------------- |
| `passkey-auth`     | 6             | `false`             | `true`                              | Código (challenge fail-closed) + JWT          |
| `settings-cascade` | 4             | `false`             | `true`                              | JWT                                           |
| `vector-rag`       | 6             | `false`             | `true`                              | JWT                                           |
| `pagbank-connect`  | 5             | `false`             | `true`                              | JWT                                           |
| `pagbank-order`    | 5             | `false`             | `true`                              | Código (quote-driven, idempotência PSP) + JWT |
| `pagbank-webhook`  | 6             | `false`             | `false`                             | **Nenhuma** (por design — PSP/ECDSA)          |

**Nota sobre algoritmos de hash:** o manifesto local registra `sha256` sobre a árvore-fonte de cada função (git). O remoto expõe `ezbr_sha256` do bundle compilado. **Não são comparáveis** (entradas e algoritmos diferentes). A reconciliação exige deploy controlado + leitura de versão, não igualdade de hashes.

### Migrações

- **17 migrações aplicadas remotamente**, última: `20261022002300_fase2_harden_pagbank_rpc_and_remove_realtime_pub`.
- **`20261022053203_billing_pricebook_usage_metering` NÃO aplicada** — código proposto, validado apenas em PostgreSQL descartável (44/44 assertions).
- O schema remoto foi inspecionado (read-only): `payment_orders` tem `gateway_reference_id UNIQUE` e `status CHECK IN ('draft','waiting_payment','paid','canceled','refunded')`; `organization_members` tem SELECT para `authenticated` (alinhado com as políticas da migração proposta).

## 3. `supabase/config.toml` e `verify_jwt`

- `supabase/config.toml` está **versionado** com 5 endpoints `verify_jwt = true` e apenas `pagbank-webhook = false`.
- **Não está deployado** — o remoto continua `false` nas seis funções.
- Regression gate no CI: `src/__tests__/supabase-functions-config.test.js` (cobertura, valores, ausência de config.toml por função).

## 4. Pré-condições para uma futura reconciliação (não executar sem aprovação)

1. **Aprovação explícita do proprietário** para um ambiente NÃO produtivo.
2. **Backup/snapshot** do banco antes de qualquer migração.
3. **Validação de schema**: replay limpo das migrações em branch/DB descartável do projeto correto; diff esperado = apenas objetos da migração de billing (aditiva).
4. **Validação de functions**: revisão handler-a-handler dos 6 handlers atuais (auth, tenant resolution, webhook signature, rate limit) antes de substituir versões ativas.
5. **Secrets**: `PAGBANK_TOKEN`, `PAGBANK_PUBLIC_KEY`, `PAGBANK_CLIENT_SECRET` configurados no vault do ambiente de homologação — nunca em código/log/CI.
6. **PagBank Sandbox**: credenciais de sandbox (não produção) para E2E.

## 5. Procedimento de execução futuro (quando autorizado)

1. `supabase link --project-ref ldjfjmihdvdmltrptngf` (ambiente de homologação dedicado, não o compartilhado).
2. Aplicar `20261022053203` com `supabase db push` em branch de homologação; capturar saída.
3. Rodar `npm run test:billing-sql` contra o banco de homologação (44/44 esperado).
4. Deploy das 6 functions com `supabase functions deploy <name>` — uma por vez, na ordem: `pagbank-webhook` → `vector-rag` → `settings-cascade` → `passkey-auth` → `pagbank-connect` → `pagbank-order`.
5. **Leitura de volta obrigatória**: `list_edge_functions` deve mostrar novas versões e `verify_jwt` conforme `config.toml` (5 `true`, webhook `false`). Divergência = rollback/forward fix, nunca reconciliação presumida.
6. E2E PagBank Sandbox (PIX sucesso, timeout, replay de webhook, webhook fora de ordem, cancelamento, recusa, split) antes de qualquer uso real.

## 6. Critérios de aceite da reconciliação

- [ ] Versões remotas das 6 functions > versões pré-`74c3b87` (leitura remota).
- [ ] `verify_jwt` remoto = config.toml (5 `true`, webhook `false`).
- [ ] `20261022053203` no histórico remoto de migrações.
- [ ] `npm run test:billing-sql` verde no ambiente de homologação.
- [ ] E2E Sandbox PagBank aprovado (PIX + recuperação ambígua + replay).
- [ ] Registro de resultado com SHA, versões, horário e operador.

## 7. Riscos e mitigação

| Risco                                                         | Mitigação                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Aplicar na base errada (irmão `genOS`)                        | Gate de leitura de `project_id` antes de qualquer ação; MCP já corrigido                               |
| Perda de dados na migração                                    | Snapshot prévio; migração é aditiva (`IF NOT EXISTS`, nada destrutivo)                                 |
| JWT quebrando clientes existentes ao ativar `verify_jwt=true` | Ativar por função, uma de cada vez, com smoke após cada uma; rollback por re-deploy da versão anterior |
| PagBank em produção com credenciais erradas                   | Somente sandbox em homologação; produção separada com aprovação própria                                |
| Drift hash/versão após deploy                                 | Leitura de volta obrigatória; falha = rollback documentado                                             |

## 8. Autorização necessária

| Ação                                   | Estado    | Aprovador                            |
| -------------------------------------- | --------- | ------------------------------------ |
| Deploy não-produtivo das functions     | `BLOCKED` | Proprietário (Cestari Studio)        |
| Aplicação da migração `20261022053203` | `BLOCKED` | Proprietário                         |
| Alteração de `verify_jwt` remoto       | `BLOCKED` | Proprietário                         |
| E2E PagBank Sandbox                    | `BLOCKED` | Proprietário                         |
| Qualquer ação em produção              | `BLOCKED` | Proprietário (gate separado, Fase 8) |

**Operador responsável (quando autorizado):** a definir pelo proprietário. O agente NÃO executa nenhuma ação desta seção.

---

## 9. Matriz `expected vs observed` (read-only, 2026-10-22)

**Project ref:** `ldjfjmihdvdmltrptngf` (generative-os, sa-east-1, Postgres 17.11). `expected` = artefatos versionados (branches); `observed` = estado remoto lido via MCP. **Caveat de hash preservado:** sha256 da árvore local ≠ `ezbr_sha256` do bundle remoto — reconciliar por deploy + read-back de versões, não por igualdade de prefixo.

### Edge Functions

| Função             | verify_jwt (expected) | verify_jwt (observed) | Código (expected)                                                                                                              | Código (observed)                                                                                                                                 | Estado                            |
| ------------------ | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `passkey-auth`     | `true`                | `false`               | challenge fail-closed (401 anônimo, 500 não-persistido, 401 list-anônimo)                                                      | emite challenge a anônimo SEM persistir, list anônimo → 200 vazio                                                                                 | `RUNTIME_DRIFT` (config + código) |
| `settings-cascade` | `true`                | `false`               | membership-gated                                                                                                               | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `vector-rag`       | `true`                | `false`               | lexical-hash determinístico                                                                                                    | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `pagbank-connect`  | `true`                | `false`               | OAuth allowlist                                                                                                                | —                                                                                                                                                 | `RUNTIME_DRIFT` (config)          |
| `pagbank-order`    | `true`                | `false`               | quote-driven, `claim_pagbank_order` atômico, valor da quote consumida, `x-idempotency-key` persistido+reusado, ambíguo ≠ falha | usa `create_pagbank_order`, aceita `amountCents` do request, referência `Date.now()`, fallback sintético item/tax_id, **sem** `x-idempotency-key` | `RUNTIME_DRIFT` (config + código) |
| `pagbank-webhook`  | `false` (design)      | `false`               | ECDSA DER/P1363 fail-closed                                                                                                    | —                                                                                                                                                 | `verify_jwt` confere com o design |

### Migration ledger

- `observed_latest`: `20261022002300` · `observed_applied_count`: 17 · `in_sync_applied`: 17/17
- `expected_pending`: `20261022053203_billing_pricebook_usage_metering` → **NÃO aplicada**
- **Todas as 13 tabelas de billing AUSENTES** no remoto (`products` … `billing_audit`).

### RPCs

- Observados: 20 públicos (4 DEFINER — os mesmos 4 flags do advisor: `apply_setting_cascade`, `create_pagbank_order`, `get_tenant_payment_kpis`, `record_media_object`) + 7 `app_private`.
- Esperados (novos, da migração): `issue_quote`, `issue_manual_quote`, `consume_quote`, `release_consumed_quote`, `record_usage_event`, `claim_pagbank_order`, `attach_psp_idempotency`, `has_platform_role` (caller-only) + `app_private.has_platform_role(text,uuid)` — **todos AUSENTES** (migração não aplicada).

### Vercel

- Observado: projeto listado (`prj_cgIw3xCnho9TNi37gH5e3VmiwtXC`, equipe `cestari-studio`); leitura de detalhes/domínios/env → `404`; listagem de deployments → `403`; `linkedProjects: []`.
- Estado: `BLOCKED — owner action required` (vínculo Git não comprovado; **não** criar projeto duplicado).
