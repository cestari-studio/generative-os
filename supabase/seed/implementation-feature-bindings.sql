-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the root directory of this source tree.
--
-- Destination-owned implementation mapping. Normative keys are referenced
-- from the read-only genOS v0.9.0 traceability matrix; no upstream seed/IDs/runtime
-- are copied. Status remains implemented_unverified until Preview/E2E evidence exists.

INSERT INTO public.catalog_feature_bindings (
  feature_key,
  page_key,
  operation_id,
  app_route,
  component_name,
  runtime_ref,
  binding_status,
  source_registry,
  source_registry_version,
  source_provenance,
  notes
) VALUES (
  'platform.configuration_naming.config_cascade_resolve',
  'tenant.private.settings',
  'effective-config-resolve',
  '/settings',
  'TenantCascadeSettings',
  'public.resolve_effective_settings',
  'implemented_unverified',
  'registry.traceability',
  '0.9.0',
  '{
    "canonical_source_repo": "cestari-studio/genOS (read-only)",
    "canonical_source_file": "docs/specs/v0.9.0/registries/traceability-matrix.json",
    "destination_source_files": [
      "src/pages/settings/TenantCascadeSettings.jsx",
      "src/context/TenantContext.jsx"
    ],
    "mapping_basis": "The normative row explicitly lists tenant.private.settings and effective-config-resolve; the destination route is /settings and the tenant context calls resolve_effective_settings.",
    "runtime_validation": "pending"
  }'::jsonb,
  'First destination binding slice. This maps the existing effective-config read only. The canonical public-host-resolve operation is not claimed as bound to this route; remote schema/auth parity and Preview E2E remain pending.'
)
ON CONFLICT (feature_key, page_key, operation_id, app_route)
DO UPDATE SET
  component_name = EXCLUDED.component_name,
  runtime_ref = EXCLUDED.runtime_ref,
  binding_status = CASE
    WHEN public.catalog_feature_bindings.binding_status = 'validated' THEN 'validated'
    ELSE EXCLUDED.binding_status
  END,
  source_registry = EXCLUDED.source_registry,
  source_registry_version = EXCLUDED.source_registry_version,
  source_provenance = EXCLUDED.source_provenance,
  notes = EXCLUDED.notes,
  updated_at = now();
