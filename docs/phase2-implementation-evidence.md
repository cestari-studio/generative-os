# Fase 2 — Evidência de Implementação Local (importer + migrations candidatas)

> **Data:** 2026-10-23 · **SHA alvo:** `c1bd70d88ce5c6ae88fac4befb4e820f92f41169` (working tree; artefatos novos não commitados) · **Fonte normativa:** `cestari-studio/genOS` @ `ffd97fa93ab425fff6bac5015d34944ef924090c` (somente leitura) · **Escopo:** **100% local e reversível — nenhum objeto remoto foi criado, alterado ou aplicado.**

## 1. Artefatos produzidos

| Artefato                                                                                                               | Tipo                                                          | sha256 (16)        |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `supabase/migrations/20261023120000_normative_catalog_registries.sql`                                                  | migration candidata (7 tabelas normativas)                    | `dca270e302b35205` |
| `supabase/migrations/20261023120100_web_surface_configuration.sql`                                                     | migration candidata (Camada B: 6 tabelas + validators)        | `1cde52e5f719ea64` |
| `supabase/seed/normative-catalog-seed.sql`                                                                             | seed gerado (844 upserts idempotentes)                        | `6475b692a5b95231` |
| `supabase/seed/registry-allowlist.sql`                                                                                 | espelho gerado dos registries de código                       | `3bda225cd78dd13b` |
| `scripts/import-normative-catalog.mjs`                                                                                 | importador determinístico                                     | —                  |
| `scripts/generate-registry-allowlist-sql.mjs`                                                                          | gerador do espelho allowlist                                  | —                  |
| `src/config/runtime-registries.js`                                                                                     | registries code-owned (templates/componentes/endpoints/rotas) | —                  |
| `supabase/tests/_prereq_phase2.sql`, `supabase/tests/phase2_normative_surface_tests.sql`, `scripts/test-phase2-sql.sh` | harness SQL descartável                                       | —                  |
| `src/__tests__/runtime-registries.test.js`                                                                             | 7 testes vitest (incl. drift gate do espelho)                 | —                  |
| `docs/phase2-importer-report.json`                                                                                     | relatório machine-readable do importador                      | `8097e819892cd0a0` |
| `docs/phase2-source-reconciliation-report.md`                                                                          | reconciliação 209×200 + contagens/blob SHAs                   | —                  |

## 2. Comandos, exit codes e ambiente

| #   | Comando                                                                                                                                                       | Exit | Evidência                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| 1   | `initdb` + `pg_ctl` (PostgreSQL **17.11** user-space, socket em `/private/var/folders/.../pg17-disposable`, porta 55432 — sem serviço de sistema, sem docker) | 0    | `SELECT version()` → `PostgreSQL 17.11 (Homebrew) on aarch64-apple-darwin27.0.0`               |
| 2   | `node scripts/generate-registry-allowlist-sql.mjs`                                                                                                            | 0    | 85 linhas, 72 entradas allowlist                                                               |
| 3   | `node scripts/import-normative-catalog.mjs --source <clone pinado>`                                                                                           | 0    | `validation PASS`; contagens exatas 225/100/200/60/30/4/225; 0 duplicatas; 0 referências órfãs |
| 4   | `./scripts/test-phase2-sql.sh` (suite completa: prereq → 2× migrations → allowlist → importer ×2 → assertions)                                                | 0    | log `phase2-final-run.log`; **38/38 assertions SQL + importer no-op 844/844 unchanged**        |
| 5   | `npx vitest run src/__tests__/runtime-registries.test.js`                                                                                                     | 0    | **7/7** (incl. espelho allowlist byte-idêntico)                                                |
| 6   | `npm run lint` (es + style + format + spell)                                                                                                                  | 0    | limpo                                                                                          |
| 7   | `npm test` (suite completa)                                                                                                                                   | 0    | **29 arquivos passed (1 skipped), 233 testes passed (7 skipped), 0 falhas**                    |
| 8   | `npm run check:matrices`                                                                                                                                      | 0    | 10/10 contagens canônicas MATCH; nenhum E2E_VERIFIED/ACCEPTED falso                            |
| 9   | `npm run check:branding`                                                                                                                                      | 0    | sem identidades demo/copy fabricada                                                            |

## 3. Cobertura de testes SQL (fail-closed comprovado)

- **Contagens exatas** das 7 tabelas normativas; **100% `NORMATIVE_ONLY`** na importação; proveniência com SHA pinado em 225/225 features.
- **Idempotência**: migrations aplicadas 2× sem erro; importador 2× → segundo run `0 inserted / 0 changed / 844 unchanged`.
- **RLS** (roles reais `authenticated`/`anon`, nunca superuser): escrita não-admin negada em `catalog_operations`; leitura anon do catálogo = 0 linhas; admin (`platform_admin`) escreve; drafts de mensagens invisíveis para não-admin; published legível por anon (SSR público).
- **Publicação de superfície**: 1 published por superfície (índice único parcial); template desconhecido rejeitado; `component_key` desconhecido rejeitado; `endpoint_key` fora do allowlist rejeitado; `message_key` sem published rejeitado; **JSX/HTML e URLs arbitrárias no payload rejeitados** (validator server-side).
- **Bindings**: FK composta `(endpoint_kind, endpoint_key) → registry_allowlist` disparada; status `WIRED` sem `evidence{sha,run_id,verified_at}` rejeitado; uma binding ativa por operação; FK para operação desconhecida disparada.
- **Settings map normalizado**: duplicata `(mapping_id, normative_config_key)` rejeitada; `equivalence=none` rejeita filhas; FK para config normativa desconhecida disparada.
- **Charsets**: `message_key` e locale BCP-47 enforced por CHECK.

## 4. Estados honestos por capacidade (nada além do comprovado)

| Capacidade                                                        | Estado                                      | Por quê                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 7 tabelas normativas + seed 844 registros                         | `INTEGRATION_VERIFIED` (local, descartável) | provado em PostgreSQL 17.11 descartável no SHA de trabalho; **não aplicado remotamente**   |
| Camada B (surfaces/revisions/messages/bindings/map)               | `INTEGRATION_VERIFIED` (local, descartável) | idem; validators server-side provados                                                      |
| Importador                                                        | `INTEGRATION_VERIFIED` (local)              | validation + no-op second run provados                                                     |
| Registries code-owned (9 templates, 18 componentes, 42 endpoints) | `CONFIGURED`                                | existem em código + testes; consumo por superfícies publicadas ainda não existe no runtime |
| Runtime renderizando por configuração do banco                    | `NORMATIVE_ONLY`                            | nenhum renderer consome `surface_revisions` ainda (Fase 4/5)                               |
| Features/operações normativas no produto                          | `NORMATIVE_ONLY`                            | importadas como metadados; nenhum binding declarado além do fixture de teste               |
| Aplicação remota das migrations                                   | `BLOCKED`                                   | requer autorização explícita do owner (limite documentado)                                 |
| `E2E_VERIFIED` de qualquer item novo                              | —                                           | não reivindicado; exige Preview no SHA exato                                               |

## 5. Divergências e decisões registradas

1. **209 × 200**: resolvido por evidência — 209 é bootstrap do banco vivo do genOS (sem seed no repo); o conjunto normativo versionado é exatamente 200 (fechamento por conjuntos). Ver `docs/phase2-source-reconciliation-report.md`.
2. **Cardinalidade do mapa de settings**: normalizada (pai + filhas) — contrato v1.1.
3. **Modelo de grants**: ajustado ao padrão vivo do alvo (privilégios para `anon`/`authenticated`/`service_role` com RLS como única barreira), verificado em `information_schema.role_table_grants` de `catalog_products`.
4. **`registry_allowlist` como espelho gerado**: mantém autoridade no código (`src/config/runtime-registries.js`), com sync byte-idêntico testado em CI e re-sync upsert-only (FK impede remoção silenciosa de entradas referenciadas).
5. **`jp-JP` duplicado**: plano de correção registrado no contrato §6; nenhuma mudança de locale neste incremento.

## 6. Handoff — o que falta para cada próximo passo

- **Aplicação remota**: aprovação explícita do owner para as 2 migrations + 2 seeds no projeto `ldjfjmihdvdmltrptngf` (ordem: `20261023120000…` → `20261023120100…` → `registry-allowlist.sql` → `normative-catalog-seed.sql`; todas aditivas/idempotentes; rollback = DROP das 13 tabelas novas, documentado nos arquivos).
- **Fase 3 (bindings reais)**: mapear recursos/ações das superfícies existentes para os 42 endpoints allowlisted, com testes por operação.
- **Fase 4 (mensagens)**: seed da `message_registry` a partir dos `src/locales/*.json` (script de migração de copy), remoção dos 4 arquivos com `defaultLabel`/`defaultDescription`, snapshot SSR com checksum.
- **Fase 6 (validators CI)**: `scripts/validate-matrices.mjs` já reconhece os novos objetos; o drift gate do allowlist já roda em vitest.

**Nada neste documento implica deploy, migration remota ou autorização de produção.**
