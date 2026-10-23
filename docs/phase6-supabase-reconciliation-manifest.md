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

---

## 10. Security Advisor findings (read-only, 2026-10-22)

Confirmed by remote advisor query. These are warnings to review (grants + authorization code), **not** proof of exploitability, and do not justify automatic revocation without mapping consumers.

| Finding                                              | Objeto                    | Estado                     | Ação                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated_security_definer_function_executable` | `apply_setting_cascade`   | `SECURITY DEFINER` público | Revisar grants + justificativa DEFINER; validar `auth.uid()` + tenant membership no corpo; considerar revoke de `anon`/roles desnecessárias **apenas após mapear consumidores** (não quebrar o fluxo de settings) |
| `authenticated_security_definer_function_executable` | `create_pagbank_order`    | `SECURITY DEFINER` público | Idem — é o path legado de criação de ordem; o novo fluxo usa `claim_pagbank_order` (não aplicado). Mapear consumidores antes de restringir.                                                                       |
| `authenticated_security_definer_function_executable` | `get_tenant_payment_kpis` | `SECURITY DEFINER` público | Idem — KPIs de pagamentos; validar escopo tenant no corpo.                                                                                                                                                        |
| `authenticated_security_definer_function_executable` | `record_media_object`     | `SECURITY DEFINER` público | Idem — registro de mídia; validar tenant.                                                                                                                                                                         |
| `auth_leaked_password_protection` (desativada)       | Supabase Auth             | **desativada**             | Habilitar leaked-password protection **antes** de liberar autenticação para produção, após confirmar política de Auth + testes de signup/reset. Referência: Supabase password security.                           |

**Regra:** nenhuma revogação automática; cada função exige (a) justificativa documentada de DEFINER vs INVOKER, (b) `search_path=''`, (c) grants mínimos, (d) validação `auth.uid()`/tenant no corpo, (e) testes por role. `service_role` nunca é prova de RLS.

## 11. Correção do estado de CI da PR #8 (2026-10-22)

A execução oficial anterior de #8 em `f1de94f3` (run `39739746838`) terminou em **`failure` no lint** (build/testes ignorados) — **não é** "PENDING sem status". A API combined status vazia não significa ausência de execuções de Actions; há uma execução real e falha registrada. A CI verde de #9 **não valida** o SHA oficial de #8; a execução antiga permanece falha até que a integração autorizada de #9→#8 produza um novo SHA e uma nova CI verde nele.

---

## 12. SECURITY DEFINER consumer map (read-only, 2026-10-23)

Quatro funções públicas sinalizadas pelo advisor `authenticated_security_definer_function_executable`.
Análise read-only de grants, corpo e consumidores — **nenhuma revogação executada**.

| Função                    | DEFINER | search_path | auth.uid()                        | membership                               | Grants (EXECUTE)                      | Consumidores conhecidos                                                                                                  |
| ------------------------- | ------- | ----------- | --------------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apply_setting_cascade`   | sim     | `""`        | sim, com null-check + raise       | `is_org_member` + `organization_members` | authenticated, service_role, postgres | `TenantContext.jsx` (settings UI), Edge Function `settings-cascade`                                                      |
| `create_pagbank_order`    | sim     | `""`        | sim (`v_caller_id := auth.uid()`) | `is_org_member`                          | authenticated, service_role, postgres | **nenhum consumidor no repo** — fluxo novo usa `claim_pagbank_order` (não aplicada); função legada viva apenas no remoto |
| `get_tenant_payment_kpis` | sim     | `""`        | sim (`v_caller_id := auth.uid()`) | `is_org_member`                          | authenticated, service_role, postgres | `PaymentManagementPage.jsx` (KPIs de pagamentos)                                                                         |
| `record_media_object`     | sim     | `""`        | sim, com null-check + raise       | `is_org_member`                          | authenticated, service_role, postgres | `TenantContext.jsx` (`uploadTenantMedia`)                                                                                |

### Avaliação de risco

- O aviso do advisor é **genérico** (qualquer DEFINER executável por `authenticated`).
  As quatro funções validam `auth.uid()` e membership no corpo, usam
  `search_path=""` (proteção contra hijacking de search_path) e **não** são
  executáveis por `anon`.
- Justificativa DEFINER provável: escrita/leitura agregada em tabelas com RLS
  que exigiria policy adicional por operação (settings cascade, KPIs
  agregados, registro de mídia, criação de ordem legada). Necessário confirmar
  qual acesso exato exige bypass — próximo passo: extrair as tabelas tocadas
  por cada função e mapear para a policy que seria necessária em modo INVOKER.
- `create_pagbank_order`: sem consumidores no código versionado. Candidata a
  **deprecação formal** (revogar EXECUTE de `authenticated` em migração
  aditiva futura) após confirmar que nenhum cliente externo a chama —
  decisão `BLOCKED_OWNER` (requer decisão do owner + janela de observação).
- Nenhuma revogação automática: qualquer mudança de grant exige migração
  aditiva versionada + teste dos consumidores + autorização de ambiente.

---

## 13. Leaked-password protection — policy + test plan (2026-10-23)

**Remote state:** `auth_leaked_password_protection` **disabled** (advisor).
Config changes are `BLOCKED_OWNER` — no remote Auth mutation without explicit
policy confirmation + environment authorization.

**What the feature does:** Supabase Auth can reject passwords known to have
appeared in public breaches (HaveIBeenPwned corpus) at signup and password
change/reset. Without it, users may register breach-compromised passwords.

**Auth surfaces in this product:** password sign-in (`signInWithPassword` in
`TenantContext.jsx`, used by `SignInModal.jsx`). No self-service signup UI
exists yet (users are provisioned via onboarding/invite flows); password
reset flow exists via Supabase Auth recovery.

**Policy decision needed from owner:**

1. Enable `password_security_leaked_password_protection` in Supabase Auth for
   the non-prod isolated environment first, then production.
2. Decide minimum password strength policy (length/strength) alongside it —
   current client enforces only non-empty password.

**Test plan (to run after enablement in the authorized non-prod env):**

| #   | Case                                                              | Expected                                                                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Signup/reset with a known breached password (e.g. `Password123!`) | Supabase rejects with `weak_password`/leaked-password error; UI surfaces the auth error honestly |
| 2   | Signup/reset with a strong unique passphrase                      | Accepted                                                                                         |
| 3   | Existing user with an old (possibly breached) password signs in   | Sign-in still works (protection applies at set/reset time, not login)                            |
| 4   | Password change to a breached password via reset flow             | Rejected with clear error                                                                        |
| 5   | UI error mapping                                                  | `SignInModal` shows the auth error message, never a generic success                              |

**Evidence to capture:** supabase auth config read-back (read-only),
signup/reset attempt logs (no password values), UI screenshots of the error
state, and the advisor finding clearing after enablement.

---

## 14. Onboarding persistence — destination contract formalization (2026-10-23)

**Normative source check (read-only genOS registries):** the normative ontology
does **not** define a user-onboarding journey or feature. The closest journey,
`journey.platform.activate_product` ("Provisionar e ativar produto"), is
operator-side provisioning — actors `master_operator`, `agency_admin`,
`tenant_admin`, `provisioning_worker`; steps: tenant/workspace provision →
entitlement resolve → product activation. Per the directive, it is **not** a
substitute for user onboarding.

**Destination contract (formal, with evidence):**

| Aspect     | Value                                                                                                               | Evidence                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Write path | `save_onboarding_progress(text, text, integer, jsonb, boolean)` RPC                                                 | migration `20261018225420`          |
| Security   | `SECURITY INVOKER`, `search_path=''`, requires `auth.uid()` + existing person                                       | migration `20261018225420`          |
| Storage    | `public.persons.additional_property->'onboarding'`                                                                  | RPC body + `loadOnboardingProgress` |
| Shape      | `{account_type, country_code, current_step, status, last_updated_at, step_data, completed_at?}`                     | RPC body                            |
| Semantics  | progressive `step_data` merge (atomic jsonb `\|\|`), status `in_progress`/`completed`, `completed_at` on completion | RPC body                            |
| Read path  | `persons.additional_property->'onboarding'` via `loadOnboardingProgress`                                            | `TenantContext.jsx`                 |
| Client     | `OnboardingTearsheet` saves per step; reload rehydrates from backend                                                | component                           |

**Not the contract:** `public.cs_preferences.onboarding_done` was previously a
candidate — it is **not** the persistence path. The authoritative path is
`persons.additional_property->'onboarding'`.

**Status:** destination-local contract, consistent end-to-end (write RPC ↔
storage ↔ read path ↔ client). No normative binding exists to claim; marked as
destination-owned in the binding ledger.
