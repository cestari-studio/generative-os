# Fase 2 — Pacote de Revisão (sem commit/push/PR)

> **Data:** 2026-10-23 · **Base do alvo:** `c1bd70d88ce5c6ae88fac4befb4e820f92f41169` (`feat/complete-carbon-page-rebuild`) · **Fonte normativa:** `cestari-studio/genOS` @ `ffd97fa93ab425fff6bac5015d34944ef924090c` · **Estado do pacote:** 21 arquivos no working tree (5 modificados, 16 novos), **nenhum commit/push/PR**, nenhuma operação remota.
> **Auditoria remota do owner (2026-10-23):** confirmou ausência esperada dos artefatos no GitHub (não commitados), ausência das tabelas candidatas no Supabase (não aplicadas), Preview `c1bd70d` READY, produção `973d884` READY. Compatível com o estado deste pacote.
> **Correção de contagem (2026-10-24):** as duas migrações candidatas criam **14 tabelas físicas** — 7 normativas `catalog_*` (M1) + 7 da superfície (M2: `message_registry`, `operation_bindings`, `registry_allowlist`, `setting_normative_map`, `setting_normative_map_terms`, `surface_definitions`, `surface_revisions`). A contagem anterior "13" omitia `registry_allowlist` da contagem conceitual; ela é uma tabela física e consta das 14. RLS é habilitado nas 14 (M1 via loop `EXECUTE format`, M2 via 7 ALTERs). Rollback = `DROP TABLE` das 14 + `DROP TYPE` dos enums novos.

## 1. Inventário e hashes (re-verificados após auditoria, 2026-10-23)

### Arquivos novos (16)

| Arquivo                                                               | sha256 (16)         | Nota                                                                        |
| --------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `supabase/migrations/20261023120000_normative_catalog_registries.sql` | `dca270e302b35205`  | 7 tabelas normativas + RLS + grants                                         |
| `supabase/migrations/20261023120100_web_surface_configuration.sql`    | `1cde52e5f719ea64`  | Camada B (7 tabelas) + validators de publicação                             |
| `supabase/seed/normative-catalog-seed.sql`                            | `6475b692a5b95231`  | 844 upserts idempotentes (determinístico entre runs)                        |
| `supabase/seed/registry-allowlist.sql`                                | `3bda225cd78dd13b`  | 72 entradas, espelho gerado dos registries de código                        |
| `scripts/import-normative-catalog.mjs`                                | —                   | importador determinístico (fail-closed)                                     |
| `scripts/generate-registry-allowlist-sql.mjs`                         | —                   | gerador do espelho (+ `--check` drift gate)                                 |
| `scripts/test-phase2-sql.sh`                                          | —                   | harness SQL descartável                                                     |
| `src/config/runtime-registries.js`                                    | —                   | registries code-owned (9 templates, 18 componentes, 42 endpoints, 10 rotas) |
| `src/__tests__/runtime-registries.test.js`                            | —                   | 7 testes vitest                                                             |
| `supabase/tests/_prereq_phase2.sql`                                   | —                   | mirrors de teste (rotulados)                                                |
| `supabase/tests/phase2_normative_surface_tests.sql`                   | —                   | 38 assertions                                                               |
| `docs/phase0-preflight-consolidated-state.md`                         | —                   | Fase 0                                                                      |
| `docs/phase1-configuration-contract.md`                               | —                   | contrato v1.1                                                               |
| `docs/phase2-source-reconciliation-report.md`                         | —                   | 209×200 + contagens/blob SHAs                                               |
| `docs/phase2-implementation-evidence.md`                              | —                   | comandos/exit codes/estados                                                 |
| `docs/phase2-importer-report.json`                                    | `c16fd58b9d713bec`¹ | relatório machine-readable da última run                                    |

¹ O hash do relatório varia por run (contém `generated_at`); o hash do **seed** é estável (`6475b692…`), comprovando determinismo do conteúdo. O hash `8097e819…` registrado em `phase2-implementation-evidence.md` refere-se à run de evidência anterior; o valor acima é o da run pós-auditoria.

### Arquivos modificados (5)

`AGENTS.md` (gaps verificados) · `docs/phase6-supabase-reconciliation-manifest.md` (adendo datado) · `docs/phase7-vercel-preview-e2e-wcag-manifest.md` (adendo datado) · `docs/release-evidence-ledger.md` (entradas Fase 0/1/2 + auditoria) · `package.json` (scripts `test:phase2-sql`, `registry:sync`, `registry:check`)

Diff cumulativo dos modificados: **+25/−5 linhas** (fora os arquivos novos).

## 2. Evidência de verificação (checkout real, pós-auditoria)

| Verificação                                                            | Resultado                                             | Detalhe                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `test-phase2-sql.sh` (PostgreSQL 17.11 descartável, socket user-space) | **PASS (exit 0)**                                     | 38/38 assertions; migrations 2× idempotentes; importador 2× → 844/844 unchanged |
| `vitest runtime-registries.test.js`                                    | **7/7 PASS**                                          | incl. drift gate byte-idêntico do espelho                                       |
| `npm run lint`                                                         | **0**                                                 | es + style + format + spell                                                     |
| `npm test` (suite completa, run anterior neste checkout)               | **233 passed / 0 failed**                             | 29 arquivos (1 skipped)                                                         |
| `npm run check:matrices`                                               | **10/10 MATCH**                                       | sem E2E_VERIFIED/ACCEPTED falso                                                 |
| `npm run check:branding`                                               | **PASS**                                              | —                                                                               |
| Hashes dos artefatos                                                   | **coincidem** com `phase2-implementation-evidence.md` | exceto o relatório JSON (por run — ver nota ¹)                                  |

## 3. Instruções de aplicação (quando o owner autorizar — gate remoto intacto)

**Pré-voo:** backup/snapshot do projeto `ldjfjmihdvdmltrptngf`; janela acordada; nenhuma dependência de código novo (as tabelas são aditivas e o runtime atual não as lê).

**Ordem exata** (tudo aditivo/idempotente; `supabase db query --linked` ou psql):

1. `supabase/migrations/20261023120000_normative_catalog_registries.sql`
2. `supabase/migrations/20261023120100_web_surface_configuration.sql`
3. `supabase/seed/registry-allowlist.sql`
4. `supabase/seed/normative-catalog-seed.sql` (ou `node scripts/import-normative-catalog.mjs --source <clone pinado> --dsn <remoto> --apply` — produz o relatório de diff)

**Pós-aplicação (read-back):** `list_migrations` = 23; contagens 225/100/200/60/30/4/225; RLS ativa nas **14 tabelas** (7 `catalog_*` via loop `EXECUTE format` na M1, 7 da superfície via ALTERs na M2); anon lê 0 do catálogo e ≥0 das mensagens published; `registry_allowlist` = 72 linhas com checksum único.

**Rollback/forward-recovery:** tudo aditivo — rollback = `DROP TABLE` das **14 tabelas novas** (7 `catalog_*`: `catalog_configurations`, `catalog_entitlement_profiles`, `catalog_features`, `catalog_journeys`, `catalog_operations`, `catalog_pages`, `catalog_traceability`; 7 da superfície: `message_registry`, `operation_bindings`, `registry_allowlist`, `setting_normative_map`, `setting_normative_map_terms`, `surface_definitions`, `surface_revisions`) + `DROP TYPE` dos 4 enums novos (nada existente é tocado); falha no meio da sequência deixa objetos anteriores aplicados e reexecutáveis (idempotentes).

**Não fazer:** re-executar seeds contra `jkespoegdpkdcrxsxwry` (projeto-irmão, nunca alvo); editar as seeds à mão; promover Preview para produção (fora do escopo deste pacote).

## 4. Estados honestos (inalterados pela auditoria)

- Objetos novos: `INTEGRATION_VERIFIED` **somente em PostgreSQL descartável local** — não há evidência remota.
- Rendering por configuração: `NORMATIVE_ONLY`.
- Aplicação remota: `BLOCKED` até autorização explícita específica.
- Produção: `973d884`; Preview: `c1bd70d` — artefatos distintos (ver correção no adendo da Fase 0).
