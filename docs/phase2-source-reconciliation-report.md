# Fase 2 — Relatório de Reconciliação da Fonte Normativa

> **Data:** 2026-10-23 · **Fonte:** `cestari-studio/genOS` main @ `ffd97fa93ab425fff6bac5015d34944ef924090c` (clone temporário somente-leitura; nenhum byte escrito na fonte) · **Alvo:** `generative-os` @ `c1bd70d` · **Método:** contagens independentes por script (Node), blob SHAs via `git hash-object`, cruzamento de chaves por conjunto. Nenhuma contagem assumida de documentação.

## 1. Discrepância 209 × 200 — explicação

| Item                                                          | Valor                                                         | Origem do número                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registry.config_definitions` no **banco vivo do genOS**      | 209 (+209 `config_values`)                                    | Auditoria do banco vivo em 2026-08-07 (`docs/architecture/BRAND_SETTINGS_CASCADE.md` §5; `docs/implementation/BRAND_DNA_SETTINGS_PROVIDER_AUDIT_2026-08-07_V3.md` §82) |
| Coleção `configurations` no **catálogo funcional versionado** | **200** registros, **200** chaves distintas, **0** duplicatas | contagem independente neste relatório                                                                                                                                  |

**Evidência decisiva:** no repositório pinado, **não existe seed** de `registry.config_definitions` — nenhuma migration contém `INSERT INTO registry.config_definitions` e `supabase/seed.sql` tem 0 blocos para essa tabela. As 209 definições existem **somente no banco vivo do genOS** (linhas de bootstrap/draft nunca commitadas como seed). O banco do genOS é projeto-irmão, não fonte normativa importável (a fonte normativa é o repositório).

**Fechamento em 200 (conjuntos):** chaves de configuração referenciadas pela traceability v0.9.0 = **200**; pelo feature-registry = **200**; interseção = **200**; união = **200**; referenciadas-mas-ausentes-do-catálogo = **0**.

**Conclusão:** 209 ≠ versão das 200 — são coleções distintas (bootstrap vivo × normativo versionado). O conjunto normativo importável e verificável é **exatamente 200**. O delta de 9 é irrecuperável a partir do repo e fica registrado como drift de bootstrap do banco vivo do genOS, não como lacuna de importação.

## 2. Tabela de reconciliação por coleção

| Coleção (destino no alvo)         | Fonte (path)                                                            | Blob SHA                                   | Versão | Regra de extração               | Contagem                                      |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | ------ | ------------------------------- | --------------------------------------------- |
| `catalog_features`                | `docs/specs/v0.9.0/registries/feature-registry.json`                    | `d4f32dea850083c96cd4e09d9402f471473f1628` | 0.9.0  | `features[]`                    | **225** (225 `feature_key` distintas)         |
| `catalog_operations`              | `docs/specs/v0.9.0/genos-functional-catalog.v0.9.0.json → operations`   | `0000c22eda100397cf9b9300326c8c370612feca` | 0.9.0  | `operations[]` (`Operation ID`) | **100** (100 IDs distintos)                   |
| dispositions de operações         | `docs/specs/v0.9.1/V010_OPERATION_DISPOSITION.v0.9.1.json`              | `64eae4aeed72164c9ebc2ec7620f548a801cfab9` | 0.9.1  | `dispositions[]`                | 5 (0 promovidas a v0.10.0; as 100 permanecem) |
| `catalog_configurations`          | `genos-functional-catalog.v0.9.0.json → configurations`                 | `0000c22eda100397cf9b9300326c8c370612feca` | 0.9.0  | `configurations[]` (`Key`)      | **200** (200 distintas, 0 duplicatas)         |
| `catalog_pages`                   | `genos-functional-catalog.v0.9.0.json → pages`                          | `0000c22eda100397cf9b9300326c8c370612feca` | 0.9.0  | `pages[]` (`page_key`)          | **60** (60 distintas)                         |
| `catalog_journeys`                | `docs/specs/v0.9.0/registries/journey-registry.json`                    | `43d69e939e6921770d18e2f7240938efff633885` | 0.9.0  | `journeys[]`                    | **30**                                        |
| `catalog_entitlement_profiles`    | `docs/specs/v0.9.0/registries/entitlement-registry.json`                | `57fad7de1133e51fa821bf76e6a5dde8a890f18e` | 0.9.0  | `profiles[]`                    | **4**                                         |
| `catalog_traceability`            | `docs/specs/v0.9.0/registries/traceability-matrix.json`                 | `6ab81cd669004460796387de28e4d654a626e161` | 0.9.0  | `rows[]`                        | **225**                                       |
| (contexto) overlay traceability   | `docs/specs/v0.9.1/TRACEABILITY_MATRIX.v0.9.1.json`                     | `e08535e8cc31155577c961d76000a4106c4394ae` | 0.9.1  | `rows[]`                        | 26 (overlay; não é a matriz completa)         |
| (contexto) schema do catálogo     | `docs/specs/v0.9.0/schemas/genos-functional-catalog-v0.9.0.schema.json` | `20e4b8185f7b652076f1edd378eafdff09a58743` | 0.9.0  | —                               | referência de validação                       |
| (referência cruzada) products     | `docs/specs/v0.9.0/registries/product-registry.json`                    | `c8dfbd414074ed6ed3df740edc4f4b1b19d7a237` | 0.9.0  | `products[]`                    | 5                                             |
| (referência cruzada) subproducts  | `docs/specs/v0.9.0/registries/subproduct-registry.json`                 | `c3b60dc168c6d0612b9d72ab9e381805bff06a70` | 0.9.0  | `subproducts[]`                 | 30                                            |
| (referência cruzada) capabilities | `docs/specs/v0.9.0/registries/capability-registry.json`                 | `6990d23599fa8ed376bd085975d79fbe133828e8` | 0.9.0  | `capabilities[]`                | 9                                             |
| (referência cruzada) services     | `docs/specs/v0.9.0/registries/platform-service-registry.json`           | `ec0abfc6c78bbf3bec5cb8ad59bcc4436f1cd3b0` | 0.9.0  | `services[]`                    | 6                                             |

## 3. Regras fail-closed para o importador

1. Contagens exatas esperadas: **225 / 100 / 200 / 60 / 30 / 4 / 225** (+5/30/9/6 apenas para referência cruzada). Qualquer drift de contagem ou chave **aborta** a importação — nunca truncar, deduplicar ou sintetizar silenciosamente.
2. Chaves devem ser únicas por coleção; duplicata aborta.
3. Referências cruzadas obrigatórias: `feature.product_key`/`subproduct_key` ∈ registries; `feature.operations[]` ⊆ 100 operation IDs; `feature.configuration_keys[]` ⊆ 200 config keys; `traceability.feature_key` ⊆ 225 features.
4. Proveniência obrigatória por registro: `{source_repo, source_sha, source_path, source_blob_sha, registry_version}`.
5. Registros existentes do alvo (`catalog_products/subproducts/capabilities/platform_services`) são reconciliados por chave e **nunca sobrescritos silenciosamente** — divergência de conteúdo é reportada como conflito.
