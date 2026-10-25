/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Code-owned runtime registries (Camada C) — single authority for the keys a
 * database surface/message/binding configuration may reference.
 *
 * Contract: docs/phase1-configuration-contract.md §3.1. The DB stores KEYS
 * only; resolution to real implementations happens here. A generated mirror
 * (scripts/generate-registry-allowlist-sql.mjs) seeds the server-side
 * `registry_allowlist` table so publication can be validated in the database;
 * CI asserts the mirror is byte-identical to a fresh regeneration.
 *
 * Status vocabulary (per genOS component-registry lesson):
 *   contract_only — key reserved, no runtime implementation yet
 *   mock          — visible mock, never counted as implemented
 *   implemented   — real implementation exists
 *   tested        — implemented AND covered by an existing automated test
 *   deprecated    — do not use in new surfaces
 */

export const REGISTRY_VERSION = '2026-10-23.1';

export const TEMPLATE_REGISTRY = Object.freeze({
  'template.public-auth': {
    kind: 'template',
    status: 'tested',
    implementation:
      'src/pages/welcome/Welcome.jsx + src/pages/auth/ResetPasswordPage.jsx + src/components/auth/SignInModal.jsx',
    slots: ['main', 'state-region'],
  },
  'template.shared-private-shell': {
    kind: 'template',
    status: 'tested',
    implementation:
      'src/components/nav/Nav.jsx + src/components/commonHeader/CommonHeader.jsx + src/components/profilePanel/ProfilePanel.jsx + src/components/workspaceSwitcher/WorkspaceSwitcherPanel.jsx',
    slots: ['header', 'navigation', 'context', 'content'],
  },
  'template.data-overview': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/dashboard/Dashboard.jsx',
    slots: ['header', 'filters', 'kpis', 'charts', 'tables', 'tabs'],
  },
  'template.catalog-browser': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/products/ProductsCatalogPage.jsx',
    slots: ['header', 'search', 'filters', 'list', 'detail'],
  },
  'template.settings-configuration': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/settings/TenantCascadeSettings.jsx',
    slots: ['header', 'hierarchy', 'forms', 'states'],
  },
  'template.multi-step-wizard': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/onboarding/OnboardingPage.jsx + src/components/onboarding/OnboardingFullPage.jsx',
    slots: ['header', 'steps', 'current-step', 'review', 'states'],
  },
  'template.knowledge-files': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/knowledge/KnowledgeVectorPage.jsx',
    slots: ['header', 'upload', 'search', 'list', 'states'],
  },
  'template.payments-transactions': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/payments/PaymentManagementPage.jsx',
    slots: ['header', 'kpis', 'actions', 'list', 'states'],
  },
  'template.unavailable-error': {
    kind: 'template',
    status: 'tested',
    implementation: 'src/pages/not-found/NotFound.jsx',
    slots: ['state-region'],
  },
});

export const ROUTE_ALLOWLIST = Object.freeze([
  { path: '/', surfaceKey: 'route.home', templateKey: 'template.public-auth', isPrivate: false },
  { path: '/dashboard', surfaceKey: 'route.dashboard', templateKey: 'template.data-overview', isPrivate: true },
  {
    path: '/dashboard/:id',
    surfaceKey: 'route.dashboard.detail',
    templateKey: 'template.data-overview',
    isPrivate: true,
  },
  { path: '/products', surfaceKey: 'route.products', templateKey: 'template.catalog-browser', isPrivate: true },
  { path: '/knowledge', surfaceKey: 'route.knowledge', templateKey: 'template.knowledge-files', isPrivate: true },
  { path: '/payments', surfaceKey: 'route.payments', templateKey: 'template.payments-transactions', isPrivate: true },
  {
    path: '/settings',
    surfaceKey: 'route.settings',
    templateKey: 'template.settings-configuration',
    isPrivate: true,
  },
  { path: '/onboarding', surfaceKey: 'route.onboarding', templateKey: 'template.multi-step-wizard', isPrivate: true },
  {
    path: '/reset-password',
    surfaceKey: 'route.reset-password',
    templateKey: 'template.public-auth',
    isPrivate: false,
  },
  { path: '*', surfaceKey: 'route.not-found', templateKey: 'template.unavailable-error', isPrivate: false },
]);

export const COMPONENT_REGISTRY = Object.freeze({
  'carbon.shell.global-header': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/commonHeader/CommonHeader.jsx',
  },
  'carbon.shell.side-nav': { kind: 'component', status: 'tested', implementation: 'src/components/nav/Nav.jsx' },
  'carbon.shell.profile-panel': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/profilePanel/ProfilePanel.jsx',
  },
  'carbon.shell.workspace-switcher': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/workspaceSwitcher/WorkspaceSwitcherPanel.jsx',
  },
  'carbon.shell.footer': { kind: 'component', status: 'tested', implementation: 'src/components/footer/Footer.jsx' },
  'carbon.auth.sign-in-modal': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/auth/SignInModal.jsx',
  },
  'carbon.auth.protected-route': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/auth/ProtectedRoute.jsx',
  },
  'carbon.data.data-table': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/pages/dashboard/DashboardTables.jsx',
  },
  'carbon.data.kpi-tiles': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/pages/dashboard/DashboardKpis.jsx',
  },
  'carbon.data.charts': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/pages/dashboard/DashboardCharts.jsx',
  },
  'carbon.form.cascade-settings': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/pages/settings/TenantCascadeSettings.jsx',
  },
  'carbon.wizard.progress-indicator': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/components/onboarding/OnboardingFullPage.jsx',
  },
  'carbon.file.uploader': {
    kind: 'component',
    status: 'tested',
    implementation: 'src/pages/knowledge/KnowledgeVectorPage.jsx',
  },
  'carbon.state.empty': {
    kind: 'component',
    status: 'implemented',
    implementation: 'shared EmptyState usage across pages',
  },
  'carbon.state.loading-skeleton': {
    kind: 'component',
    status: 'implemented',
    implementation: 'Carbon Loading/Skeleton usage across pages',
  },
  'carbon.state.forbidden': {
    kind: 'component',
    status: 'implemented',
    implementation: 'src/components/auth/ProtectedRoute.jsx',
  },
  'carbon.state.unavailable': {
    kind: 'component',
    status: 'implemented',
    implementation: 'honest unprovisioned states',
  },
  'carbon.state.failed': { kind: 'component', status: 'implemented', implementation: 'error state usage across pages' },
});

export const ENDPOINT_ALLOWLIST = Object.freeze({
  'edge.passkey-auth': { kind: 'edge_function', target: 'passkey-auth', auth: 'jwt_gateway' },
  'edge.settings-cascade': { kind: 'edge_function', target: 'settings-cascade', auth: 'jwt_gateway' },
  'edge.vector-rag': { kind: 'edge_function', target: 'vector-rag', auth: 'jwt_gateway' },
  'edge.pagbank-connect': { kind: 'edge_function', target: 'pagbank-connect', auth: 'jwt_gateway' },
  'edge.pagbank-order': { kind: 'edge_function', target: 'pagbank-order', auth: 'jwt_gateway' },
  'edge.pagbank-webhook': { kind: 'edge_function', target: 'pagbank-webhook', auth: 'psp_ecdsa' },
  'rpc.apply_setting_cascade': { kind: 'rpc', target: 'apply_setting_cascade', auth: 'authenticated+membership' },
  'rpc.resolve_effective_settings': { kind: 'rpc', target: 'resolve_effective_settings', auth: 'authenticated' },
  'rpc.get_tenant_payment_kpis': { kind: 'rpc', target: 'get_tenant_payment_kpis', auth: 'authenticated+org' },
  'rpc.issue_quote': { kind: 'rpc', target: 'issue_quote', auth: 'authenticated+org+idempotency' },
  'rpc.issue_manual_quote': { kind: 'rpc', target: 'issue_manual_quote', auth: 'authenticated+org+idempotency' },
  'rpc.consume_quote': { kind: 'rpc', target: 'consume_quote', auth: 'authenticated+org' },
  'rpc.release_consumed_quote': { kind: 'rpc', target: 'release_consumed_quote', auth: 'authenticated+org' },
  'rpc.claim_pagbank_order': { kind: 'rpc', target: 'claim_pagbank_order', auth: 'authenticated+org' },
  'rpc.attach_psp_idempotency': { kind: 'rpc', target: 'attach_psp_idempotency', auth: 'authenticated+org' },
  'rpc.record_usage_event': { kind: 'rpc', target: 'record_usage_event', auth: 'authenticated+org' },
  'rpc.create_workspace': { kind: 'rpc', target: 'create_workspace', auth: 'authenticated' },
  'rpc.save_onboarding_progress': { kind: 'rpc', target: 'save_onboarding_progress', auth: 'authenticated' },
  'rpc.mark_notification_read': { kind: 'rpc', target: 'mark_notification_read', auth: 'authenticated' },
  'rpc.switch_active_context': { kind: 'rpc', target: 'switch_active_context', auth: 'authenticated' },
  'rpc.match_knowledge_chunks': { kind: 'rpc', target: 'match_knowledge_chunks', auth: 'authenticated+org' },
  'proj.public.catalog_products': { kind: 'public_projection', target: 'catalog_products', auth: 'authenticated+rls' },
  'proj.public.catalog_subproducts': {
    kind: 'public_projection',
    target: 'catalog_subproducts',
    auth: 'authenticated+rls',
  },
  'proj.public.catalog_capabilities': {
    kind: 'public_projection',
    target: 'catalog_capabilities',
    auth: 'authenticated+rls',
  },
  'proj.public.catalog_platform_services': {
    kind: 'public_projection',
    target: 'catalog_platform_services',
    auth: 'authenticated+rls',
  },
  'proj.public.organizations': { kind: 'public_projection', target: 'organizations', auth: 'authenticated+rls' },
  'proj.public.workspaces': { kind: 'public_projection', target: 'workspaces', auth: 'authenticated+rls' },
  'proj.public.projects': { kind: 'public_projection', target: 'projects', auth: 'authenticated+rls' },
  'proj.public.persons': { kind: 'public_projection', target: 'persons', auth: 'authenticated+rls' },
  'proj.public.organization_members': {
    kind: 'public_projection',
    target: 'organization_members',
    auth: 'authenticated+rls',
  },
  'proj.public.scoped_settings': { kind: 'public_projection', target: 'scoped_settings', auth: 'authenticated+rls' },
  'proj.public.setting_definitions': {
    kind: 'public_projection',
    target: 'setting_definitions',
    auth: 'authenticated+rls',
  },
  'proj.public.payment_orders': { kind: 'public_projection', target: 'payment_orders', auth: 'authenticated+rls' },
  'proj.public.payment_charges': { kind: 'public_projection', target: 'payment_charges', auth: 'authenticated+rls' },
  'proj.public.payment_gateway_configs': {
    kind: 'public_projection',
    target: 'payment_gateway_configs',
    auth: 'authenticated+rls',
  },
  'proj.public.price_books': { kind: 'public_projection', target: 'price_books', auth: 'authenticated+rls' },
  'proj.public.notifications': { kind: 'public_projection', target: 'notifications', auth: 'authenticated+rls' },
  'proj.public.media_objects': { kind: 'public_projection', target: 'media_objects', auth: 'authenticated+rls' },
  'proj.public.knowledge_documents': {
    kind: 'public_projection',
    target: 'knowledge_documents',
    auth: 'authenticated+rls',
  },
});

/** Flattened rows used by the allowlist SQL generator and the CI drift test. */
export function listRegistryAllowlistEntries() {
  const entries = [];
  for (const [key, value] of Object.entries(TEMPLATE_REGISTRY)) {
    entries.push({ kind: 'template', key, status: value.status });
  }
  for (const [key, value] of Object.entries(COMPONENT_REGISTRY)) {
    entries.push({ kind: 'component', key, status: value.status });
  }
  for (const [key, value] of Object.entries(ENDPOINT_ALLOWLIST)) {
    entries.push({ kind: `endpoint:${value.kind}`, key, status: 'implemented' });
  }
  for (const route of ROUTE_ALLOWLIST) {
    entries.push({ kind: 'route', key: route.path, status: 'tested' });
  }
  return entries.sort((a, b) => (a.kind + ':' + a.key).localeCompare(b.kind + ':' + b.key));
}
