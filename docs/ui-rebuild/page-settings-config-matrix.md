# Matriz de Settings / Config Scopes — Fase 1 (§11)

**Data:** 2026-10-22
**Escopo:** destino `generative-os` vs normativo `genOS` (read-only)

> Duas fontes de configuração distintas foram reconciliadas. O destino tem **12 chaves** em `setting_definitions` (modelo de cascata próprio); o normativo tem **200 configurações** (taxonomia de escopos rica). **Não são o mesmo sistema** — isto é `DOCUMENTATION_DRIFT` registrado, não um erro a silenciar.

---

## 1. As 12 chaves do destino (`setting_definitions`)

| `term_code`                | term_set       | Tipo  | Default                                  | Regra de cascata    | Bloqueada? |
| -------------------------- | -------------- | ----- | ---------------------------------------- | ------------------- | ---------- |
| `theme.mode`               | theme          | TOKEN | `system`                                 | INHERIT_OVERRIDABLE | não        |
| `theme.header_inverse`     | theme          | BOOL  | `true`                                   | INHERIT_OVERRIDABLE | não        |
| `branding.color_scheme`    | branding       | HEX   | `{primary: #0f62fe, secondary: #393939}` | LOCKED              | sim (org)  |
| `i18n.in_language`         | i18n           | BCP47 | `pt-BR`                                  | INHERIT_OVERRIDABLE | não        |
| `a11y.reduced_motion`      | a11y           | BOOL  | `false`                                  | INHERIT_OVERRIDABLE | não        |
| `a11y.high_contrast`       | a11y           | BOOL  | `false`                                  | INHERIT_OVERRIDABLE | não        |
| `auth.require_passkey`     | auth_security  | BOOL  | `false`                                  | LOCKED              | não        |
| `auth.session_ttl_minutes` | auth_security  | MIN   | `1440`                                   | LOCKED              | sim (org)  |
| `ai.default_model`         | ai_rules       | MODEL | `gemini-2.5-pro`                         | INHERIT_OVERRIDABLE | não        |
| `ai.system_rules`          | ai_rules       | RULES | `[2 regras]`                             | MERGE               | não        |
| `ai.rag_top_k`             | ai_rules       | COUNT | `5`                                      | INHERIT_OVERRIDABLE | não        |
| `storage.max_upload_mb`    | storage_vector | MB    | `50`                                     | LOCKED              | não        |

**Resolução efetiva:** RPC `resolve_effective_settings` (Organization → Workspace → Project → Person); escrita via RPC `apply_setting_cascade` (valida membership + `allowed_levels` + `LOCKED`). Origem/override rastreados por `source_level` e `effective_cascade_rule`.

## 2. As 200 configurações normativas (genOS — referência, não implementadas)

Taxonomia de escopos rica: `platform`, `deployment`, `tenant`, `agency`, `surface`, `user`, `workload`, `theme`, `product`, `session`, `environment`, `provider`, `connection`, `pipeline`, `worker`, `query_profile`, `source_profile`, `wizard`, `course`, `severity`, `category`, `budget`, `release`, `view`, `region`, `index`, `endpoint`, `action`, `public_projection`, `tool`, `queue`, `service`, `stage`.

**Por classe:** `presentation` ×67, `runtime` ×67, `policy` ×55, `registry_ref` ×7, `derived` ×3, `experiment` ×1.

**Estado no destino:** `NOT_IMPLEMENTED` — estas 200 chaves vivem no banco do `genOS` (schema `config`), não no destino. Não copiar; se uma página do destino precisar de uma configuração normativa equivalente, mapear para a chave do destino correspondente ou registrar gap.

## 3. Drift registrado e resolução

| Item                                                       | Estado                                    | Resolução                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sistemas de config distintos (12 destino vs 200 normativo) | `DOCUMENTATION_DRIFT`                     | Manter os 12 do destino como autoridade do destino; mapear equivalências quando uma página exigir config normativa; não duplicar o modelo de 200                                                                                         |
| `genOsCatalog.js` (5 produtos/30 subprodutos)              | `IMPLEMENTED_UNVERIFIED` (fonte de dados) | **Taxonomia 100% reconciliada** com o normativo (zero divergência de chaves). Gap: é constante JS, não servida por backend/CMS. Quando existir catalog API no destino, migrar a fonte; até lá, documentado como dado estático verificado |
| Chaves de config normativas para páginas futuras           | `NOT_IMPLEMENTED`                         | Mapear on-demand por vertical slice; registrar cada equivalência nesta matriz                                                                                                                                                            |

## 4. Regra de uso para páginas

- Settings efetivos SEMPRE via `resolve_effective_settings`; nunca ler `setting_definitions`/`scoped_settings` direto no browser como autoridade.
- "inherited from", "override", "LOCKED by", "effective value" só mostrados quando `source_level`/`effective_cascade_rule`/`is_locked`/`locked_by_level` comprovam.
- Falha do resolver → estado de erro/bloqueio, nunca settings sintéticos.
- Overrides privilegiados → `apply_setting_cascade` + audit; read-back depois de write.
