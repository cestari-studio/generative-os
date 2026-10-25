# Crosswalk Funcional Normativo — Fase 1

**Data:** 2026-10-22
**Fonte:** `cestari-studio/genOS` (read-only, shallow clone), v0.9.0 (autoridade funcional base) + overlays v0.9.1
**Dados-máquina:** [`registry-coverage-matrix.json`](./registry-coverage-matrix.json)

> Este documento reconcilia os números normativos declarados com os artefatos efetivamente lidos. Nada aqui é prova de implementação no destino `generative-os` — é a reconciliação da **fonte normativa**.

---

## 1. Cobertura canônica — todos os números reconciliados

| Categoria             | Declarado      | Reconciliado | Estado                       |
| --------------------- | -------------- | ------------ | ---------------------------- |
| Produtos              | 5              | 5            | `MATCH`                      |
| Subprodutos           | 30             | 30           | `MATCH`                      |
| Capabilities          | 9              | 9            | `MATCH`                      |
| Platform Services     | 6              | 6            | `MATCH`                      |
| Features              | 225            | 225          | `MATCH`                      |
| Journeys              | 30             | 30           | `MATCH`                      |
| Operações             | 100            | 100          | `MATCH`                      |
| Páginas               | 60             | 60           | `MATCH`                      |
| Configurações         | 200            | 200          | `MATCH`                      |
| Perfis de entitlement | (não canônico) | 4            | `MATCH` (fora dos 8 números) |

**Fonte dos números:** `genos-functional-catalog.v0.9.0.json` (catalog_version 0.9.0, baseline 0.8.1, gerado 2026-08-04).

## 2. A divergência 100 vs 85 operation IDs — RESOLVIDA (não é gap)

A auditoria anterior citou "100 operações normativas versus 85 IDs nas allowlists dos bundles". Reconciliação:

| Classe                                    | Contagem | Significado                                                           |
| ----------------------------------------- | -------- | --------------------------------------------------------------------- |
| Operações de superfície Edge (12 bundles) | **85**   | As IDs expostas via Edge Functions                                    |
| Operações internas (`internal`)           | **15**   | `private_rpc` ×8, `worker` ×4, `scheduled_worker` ×3, `ci_signing` ×1 |
| **Total**                                 | **100**  | —                                                                     |

**Conclusão:** as 85 IDs das allowlists são a superfície Edge; as 15 internas são de outra classe de execução (RPC privado/worker/CI) e **não estão ausentes** — são classificação distinta. Lista das 15: `authorization-decision-evaluate`, `embedding-index-build`, `knowledge-access-evaluate`, `actionframe-validate`, `worker-lease-acquire`, `worker-heartbeat`, `worker-result-submit`, `eligibility-evaluate`, `reputation-classify-request`, `reputation-metrics-refresh`, `client-segment-refresh`, `notification-dispatch`, `usage-record-ingest`, `billing-reconcile`, `release-manifest-publish`.

### Operações por bundle (superfície Edge, 85)

| Bundle               | Ops |
| -------------------- | --- |
| content-api          | 11  |
| tenant-api           | 11  |
| knowledge-api        | 10  |
| academy-api          | 8   |
| identity-api         | 8   |
| admin-api            | 8   |
| schedule-api         | 7   |
| action-api           | 6   |
| client-api           | 6   |
| reputation-api       | 4   |
| integration-webhooks | 4   |
| public-api           | 2   |

## 3. Cobertura de bindings por feature (o gap real de wiring normativo)

As referências cruzadas no nível dos registries estão completas (todas as 60 páginas, 100 operações e 200 configs **são referenciadas** pela traceability matrix de 225 linhas). Porém, a maioria das features **não tem binding normativo de página/operação** — são nível de especificação, ainda não wired:

| Binding              | Features com | Features sem |
| -------------------- | ------------ | ------------ |
| `page_keys`          | 19           | **206**      |
| `operation_ids`      | 76           | **149**      |
| `configuration_keys` | 25           | 200          |

Distribuição por tipo de domínio das 225 features: **150 product** (5×30 features... na verdade 150), **45 capability** (9×5), **30 platform_service** (6×5).

## 4. Estrutura da traceability matrix (o backbone do crosswalk)

Cada uma das 225 linhas liga:

`feature_key → domain_type → owner_key → subproduct_key → operation_ids → page_keys → configuration_keys → entities → events → entitlement_profiles → release_gate`

Exemplo (`product.content_factory.briefing.brief_create`): operação `content-brief-create`; entidades `ContentBrief, SourceSet, Audience, Channel, Constraint`; eventos `...requested/.completed/.failed`; entitlement `entitlement.product_standard`; page_keys `[]` (sem binding).

## 5. Estado de runtime das bundles auditadas (v0.9.1 EDGE_RUNTIME_GAP_MATRIX)

A autoridade v0.9.1 audita 4 bundles com estado real de runtime:

| Bundle        | Versão | verify_jwt | Dispatchable                       | Bloqueadas                                                                     | Classificação                              |
| ------------- | ------ | ---------- | ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| schedule-api  | 2      | `true`     | **0** (todas fail-closed)          | 7 (typed persistence/capacity invariants ausentes)                             | `dedicated_transactional_handler_required` |
| academy-api   | 3      | `true`     | 5                                  | 3 (`assessment-submit`, `checkpoint-submit`, `certification-lifecycle-update`) | `schema_contract_blocked`                  |
| client-api    | 3      | `true`     | 2                                  | 4 (aggregates/protocol ausentes)                                               | `schema_and_public_protocol_blocked`       |
| knowledge-api | 3      | `true`     | 8 + `knowledge-search` (dedicated) | `document-ingestion-request` (worker control-plane ausente)                    | `mixed_runtime_worker_blocked`             |

**Regra v0.9.1:** "Promote a missing handler only when operation semantics, typed persistence, authorization, concurrency/idempotency and execution identity are materially supported; otherwise remain fail-closed."

## 6. Release blockers v0.9.1 (12, de IMPLEMENTATION_STATUS)

`real_auth_user_and_membership_runtime`, `user-settings-update_runtime`, `positive_and_negative_e2e_for_new_draft_write_boundaries`, `published_brand_dna_snapshot`, `worker_action_definition_workload_identity_and_control_plane`, `remaining_action_content_reputation_edge_normalization`, `lm_studio_authenticated_host_replay`, `ollama_r2_exact_model_identity_or_remain_disabled`, `wix_oauth_credential_and_capability_snapshot_before_active_sync`, `reconcile_vercel_cli_and_connected_provider_identity`, `figma_real_file_root_nodes_and_provider_publication`, `production_release_not_final`.

## 7. Implicação para o destino `generative-os`

- O catálogo normativo é **completo e internamente consistente** (registries reconciliados).
- O destino tem **9 rotas físicas + 6 Edge Functions**; a cobertura normativa de 60 páginas / 100 operações / 225 features **não está materializada** — é o backlog de vertical slices (Fase 5+).
- Não copiar migrations/seeds/IDs do `genOS`; implementar por contrato adaptado ao schema real do destino.
- O delta de implementação deve ser rastreado pela `route-page-matrix.md` do destino, nunca preenchido com conteúdo fake.
