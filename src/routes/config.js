/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { lazy } from 'react';
import { Analytics, Catalog, Folder, SettingsAdjust, UserFollow, Wallet } from '@carbon/icons-react';

// This project splits the pages each in different JavaScript bundles.
// You might also split part of the pages that incur significant
// network load at your discretion, given they are not needed right
// away when the page loads.
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const NotFound = lazy(() => import('../pages/not-found/NotFound'));
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'));
const Welcome = lazy(() => import('../pages/welcome/Welcome'));
const TenantCascadeSettings = lazy(() => import('../pages/settings/TenantCascadeSettings'));
const KnowledgeVectorPage = lazy(() => import('../pages/knowledge/KnowledgeVectorPage'));
const OnboardingPage = lazy(() => import('../pages/onboarding/OnboardingPage'));
const PaymentManagementPage = lazy(() => import('../pages/payments/PaymentManagementPage'));
const ProductsCatalogPage = lazy(() => import('../pages/products/ProductsCatalogPage'));

export const RESOURCE_TAXONOMY = {
  reports: {
    id: 'reports',
    alias: 'overview',
    schemaType: 'https://schema.org/Report',
    shortSchema: 'schema:Report',
    labelKey: 'taxonomy.reports.label',
    defaultLabel: 'Reports & Telemetry',
    descriptionKey: 'taxonomy.reports.description',
    defaultDescription: 'Operational metrics, telemetry, usage reports, and multi-tenant KPI dashboards.',
    icon: Analytics,
    primaryRoute: '/dashboard',
    capabilities: ['capability.audit_ops', 'platform.experience_carbon'],
  },
  files: {
    id: 'files',
    alias: 'knowledge',
    schemaType: 'https://schema.org/DigitalDocument',
    shortSchema: 'schema:DigitalDocument',
    labelKey: 'taxonomy.files.label',
    defaultLabel: 'Files & Knowledge Corpus',
    descriptionKey: 'taxonomy.files.description',
    defaultDescription: 'Digital documents, media assets, vector RAG embeddings, and tenant storage buckets.',
    icon: Folder,
    primaryRoute: '/knowledge',
    capabilities: ['capability.knowledge_ops', 'capability.brand_dna'],
  },
  products: {
    id: 'products',
    alias: 'products',
    schemaType: 'https://schema.org/Product',
    shortSchema: 'schema:Product',
    labelKey: 'taxonomy.products.label',
    defaultLabel: 'Products & Brand DNA',
    descriptionKey: 'taxonomy.products.description',
    defaultDescription:
      'Multi-tenant product suites (Content Factory, Client Ops, Schedule Ops, Reputation Ops, Academy Ops) and Brand DNA profiles.',
    icon: Catalog,
    primaryRoute: '/products',
    capabilities: [
      'product.content_factory',
      'product.client_ops',
      'product.schedule_ops',
      'product.reputation_ops',
      'product.academy_ops',
      'capability.brand_dna',
    ],
  },
  billing: {
    id: 'billing',
    alias: 'billing',
    schemaType: 'https://schema.org/Invoice',
    shortSchema: 'schema:Invoice',
    labelKey: 'taxonomy.billing.label',
    defaultLabel: 'Billing & FinOps',
    descriptionKey: 'taxonomy.billing.description',
    defaultDescription:
      'Financial gateway, PagBank integration, multi-seller splits, recurring subscription plans, and payout transfers.',
    icon: Wallet,
    primaryRoute: '/payments',
    capabilities: ['capability.fin_ops'],
  },
  settings: {
    id: 'settings',
    alias: 'governance',
    schemaType: 'https://schema.org/PropertyValue',
    shortSchema: 'schema:PropertyValue',
    labelKey: 'taxonomy.settings.label',
    defaultLabel: 'Settings & Governance',
    descriptionKey: 'taxonomy.settings.description',
    defaultDescription:
      'Four-tier cascading hierarchy (Organization → Workspace → Project → Person), Schema.org rules, and audit ledger.',
    icon: SettingsAdjust,
    primaryRoute: '/settings',
    capabilities: ['platform.configuration_naming', 'platform.experience_carbon'],
  },
  profile: {
    id: 'profile',
    alias: 'identity',
    schemaType: 'https://schema.org/ProfilePage',
    shortSchema: 'schema:ProfilePage',
    labelKey: 'taxonomy.profile.label',
    defaultLabel: 'Profile & Identity',
    descriptionKey: 'taxonomy.profile.description',
    defaultDescription:
      'Multi-country PF/PJ verification, passkeys biometric auth, legal representative records, and organization provisioning.',
    icon: UserFollow,
    primaryRoute: '/onboarding',
    capabilities: ['platform.identity_tenancy', 'platform.provisioning_entitlements'],
  },
};

export const TENANT_SETTINGS_CATEGORIES = Object.values(RESOURCE_TAXONOMY).map((item) => ({
  id: item.id,
  alias: item.alias,
  labelKey: item.labelKey,
  defaultLabel: item.defaultLabel,
  descriptionKey: item.descriptionKey,
  defaultDescription: item.defaultDescription,
  icon: item.icon,
  path: item.primaryRoute,
  schemaType: item.schemaType,
  shortSchema: item.shortSchema,
}));

export const routes = [
  {
    index: true,
    path: '/',
    element: Welcome,
    isPrivate: false,
  },
  {
    path: '/dashboard',
    element: Dashboard,
    isPrivate: true,
    tenantLevel: true,
    category: 'reports',
    resourceType: 'reports',
    schemaType: 'schema:Report',
    capabilityKey: 'capability.audit_ops',
    carbon: {
      labelKey: 'routes.dashboard',
      label: 'Dashboard',
      icon: Analytics,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'reports',
      resourceType: 'reports',
      schemaType: 'schema:Report',
    },
  },
  {
    path: '/dashboard/:id',
    element: Dashboard,
    isPrivate: true,
    tenantLevel: true,
    category: 'reports',
    resourceType: 'reports',
    schemaType: 'schema:Report',
    carbon: {
      settingCategory: 'reports',
      resourceType: 'reports',
      schemaType: 'schema:Report',
    },
  },
  {
    category: 'products',
    resourceType: 'products',
    schemaType: 'schema:Product',
    tenantLevel: true,
    isPrivate: true,
    carbon: {
      virtualPath: '/operations',
      labelKey: 'nav.categories.operations',
      label: 'Operations & Catalog',
      icon: Catalog,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'products',
      resourceType: 'products',
      schemaType: 'schema:Product',
      isCategory: true,
      categoryGroup: 'operations',
    },
  },
  {
    path: '/products',
    element: ProductsCatalogPage,
    isPrivate: true,
    tenantLevel: true,
    category: 'products',
    resourceType: 'products',
    schemaType: 'schema:Product',
    capabilityKey: 'product.content_factory',
    carbon: {
      labelKey: 'routes.products',
      label: 'Products & Brand DNA',
      icon: Catalog,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'products',
      resourceType: 'products',
      schemaType: 'schema:Product',
      categoryParent: 'operations',
    },
  },
  {
    path: '/knowledge',
    element: KnowledgeVectorPage,
    isPrivate: true,
    tenantLevel: true,
    category: 'files',
    resourceType: 'files',
    schemaType: 'schema:DigitalDocument',
    capabilityKey: 'capability.knowledge_ops',
    carbon: {
      labelKey: 'routes.knowledge',
      label: 'Knowledge & Vector RAG',
      icon: Folder,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'files',
      resourceType: 'files',
      schemaType: 'schema:DigitalDocument',
      categoryParent: 'operations',
    },
  },
  {
    path: '/payments',
    element: PaymentManagementPage,
    isPrivate: true,
    tenantLevel: true,
    category: 'billing',
    resourceType: 'billing',
    schemaType: 'schema:Invoice',
    capabilityKey: 'capability.fin_ops',
    carbon: {
      labelKey: 'routes.payments',
      label: 'Payments & PagBank',
      icon: Wallet,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'billing',
      resourceType: 'billing',
      schemaType: 'schema:Invoice',
      categoryParent: 'operations',
    },
  },
  {
    category: 'settings',
    resourceType: 'settings',
    schemaType: 'schema:PropertyValue',
    tenantLevel: true,
    isPrivate: true,
    carbon: {
      virtualPath: '/governance',
      labelKey: 'nav.categories.governance',
      label: 'Tenant Administration',
      icon: SettingsAdjust,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'settings',
      resourceType: 'settings',
      schemaType: 'schema:PropertyValue',
      isCategory: true,
      categoryGroup: 'governance',
    },
  },
  {
    path: '/settings',
    element: TenantCascadeSettings,
    isPrivate: true,
    tenantLevel: true,
    category: 'settings',
    resourceType: 'settings',
    schemaType: 'schema:PropertyValue',
    capabilityKey: 'platform.configuration_naming',
    carbon: {
      labelKey: 'routes.settings',
      label: 'Cascade Settings',
      icon: SettingsAdjust,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'settings',
      resourceType: 'settings',
      schemaType: 'schema:PropertyValue',
      categoryParent: 'governance',
    },
  },
  {
    path: '/onboarding',
    element: OnboardingPage,
    isPrivate: true,
    tenantLevel: true,
    category: 'profile',
    resourceType: 'profile',
    schemaType: 'schema:ProfilePage',
    capabilityKey: 'platform.identity_tenancy',
    carbon: {
      labelKey: 'routes.onboarding',
      label: 'Onboarding & Identity',
      icon: UserFollow,
      inHeader: true,
      inSideNav: true,
      settingCategory: 'profile',
      resourceType: 'profile',
      schemaType: 'schema:ProfilePage',
      categoryParent: 'governance',
    },
  },
  {
    path: '/reset-password',
    element: ResetPasswordPage,
    isPrivate: false,
    category: 'auth',
    resourceType: 'auth',
    schemaType: 'schema:UpdateAction',
  },
  {
    path: '*',
    element: NotFound,
    status: 404,
    isPrivate: false,
  },
];

/**
 * Checks if a subPath is a direct child of a parent path.
 * A direct child means the subPath starts with the parent path followed by '/',
 * and contains no additional '/' characters after that.
 *
 * @param {string} parentPath - The parent path to check against
 * @param {string} subPath - The potential child path
 * @returns {boolean} True if subPath is a direct child of parentPath
 *
 * @example
 * isDirectChildPath('/link-4', '/link-4/sub-link-1') // true
 * isDirectChildPath('/link-4', '/link-4/sub-link-1/nested') // false
 * isDirectChildPath('/dashboard', '/dashboard/123') // true
 * isDirectChildPath('/dashboard', '/dashboard') // false
 */
export const isDirectChildPath = (parentPath, subPath) => {
  if (!subPath || !parentPath) {
    return false;
  }

  // Check if subPath starts with parentPath followed by '/'
  if (!subPath.startsWith(parentPath + '/')) {
    return false;
  }

  // Get the remainder after the parent path and separator
  const remainder = subPath.slice(parentPath.length + 1);

  // A direct child should have content but no additional '/' characters
  return remainder.length > 0 && !remainder.includes('/');
};

// The routes config is a flat structure defined for use with react-router.
// Here we organize the routes into a hierarchy for use by the Carbon header and sidenav
// NOTE: The routes are processed outside of a component as they are not dynamic.
const routesProcessed = routes.map((route) => {
  if (!route.carbon) {
    return route;
  }

  const path = route.path || route.carbon.virtualPath;

  const subMenu = routes.filter((subRoute) => {
    // Only include routes with carbon config in navigation menus
    if (!subRoute.carbon) return false;

    const subPath = subRoute.path || subRoute.carbon.virtualPath;
    if (route.index || subPath === path) return false;

    return (
      isDirectChildPath(path, subPath) ||
      (route.carbon.isCategory && subRoute.carbon.categoryParent === route.carbon.categoryGroup)
    );
  });

  if (subMenu && subMenu.length > 0) {
    // add sub menu to parent
    route.carbon.subMenu = subMenu;

    // mark child as in sub menu
    subMenu.forEach((menu) => {
      const subPath = menu.path || menu.carbon.virtualPath;
      // Carbon should never be blank
      menu.carbon = menu.carbon || { label: subPath };
      menu.carbon.inSubMenu = true;
    });
  }

  return route;
});

export const routesInHeader = routesProcessed.filter(
  (route) => route.carbon && route.carbon.inHeader && !route.carbon.inSubMenu,
);

export const routesInSideNav = routesProcessed.filter(
  (route) => route.carbon && route.carbon.inSideNav && !route.carbon.inSubMenu,
);
