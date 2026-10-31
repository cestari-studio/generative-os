/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import ProductsCatalogPage from '../pages/products/ProductsCatalogPage';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';
import * as catalogModule from '../../src/data/useNormativeCatalog';

beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

const normativeProducts = [
  {
    key: 'product.content_factory',
    name: 'Content Factory',
    summary: 'Creates content',
    value: 'v',
    outcomes: [],
    status: 'normative',
  },
  {
    key: 'product.client_ops',
    name: 'Client Ops',
    summary: 'Client operations',
    value: 'v',
    outcomes: [],
    status: 'normative',
  },
  {
    key: 'product.schedule_ops',
    name: 'Schedule Ops',
    summary: 'Scheduling',
    value: 'v',
    outcomes: [],
    status: 'normative',
  },
  {
    key: 'product.reputation_ops',
    name: 'Reputation Ops',
    summary: 'Reputation',
    value: 'v',
    outcomes: [],
    status: 'normative',
  },
  {
    key: 'product.academy_ops',
    name: 'Academy Ops',
    summary: 'Learning',
    value: 'v',
    outcomes: [],
    status: 'normative',
  },
];

function mockCatalogReady() {
  vi.spyOn(catalogModule, 'useNormativeCatalog').mockReturnValue({
    status: 'ready',
    products: normativeProducts,
    subproductsByProduct: {},
    capabilities: [],
    platformServices: [],
    error: null,
  });
}

test('renders the normative product catalog from the backend with all 5 suites and tabs', () => {
  mockCatalogReady();
  const authContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'admin@genos.cloud' },
    activeOrganization: { name: 'Cestari Studio Agency', identifier: 'cestari-studio' },
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={authContext}>
        <ProductsCatalogPage />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  // Page Header
  expect(screen.getByText('Products & Brand DNA Catalog')).toBeInTheDocument();
  expect(screen.getAllByText('schema:Product').length).toBeGreaterThanOrEqual(1);

  // 4 Tabs
  expect(screen.getByText('Product Suites (5)')).toBeInTheDocument();
  expect(screen.getByText('Brand DNA Profiles')).toBeInTheDocument();
  expect(screen.getByText('Platform Services & Capabilities')).toBeInTheDocument();
  expect(screen.getByText('Schema.org Taxonomy Graph')).toBeInTheDocument();

  // All 5 Product Suites per canonical taxonomy (from the catalog backend)
  expect(screen.getByText('Content Factory')).toBeInTheDocument();
  expect(screen.getByText('Client Ops')).toBeInTheDocument();
  expect(screen.getByText('Schedule Ops')).toBeInTheDocument();
  expect(screen.getByText('Reputation Ops')).toBeInTheDocument();
  expect(screen.getByText('Academy Ops')).toBeInTheDocument();
});

test('shows the factual unprovisioned empty state when the catalog is not provisioned', () => {
  vi.spyOn(catalogModule, 'useNormativeCatalog').mockReturnValue({
    status: 'unprovisioned',
    products: [],
    subproductsByProduct: {},
    capabilities: [],
    platformServices: [],
    error: 'relation "public.catalog_products" does not exist',
  });
  const authContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'admin@genos.cloud' },
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={authContext}>
        <ProductsCatalogPage />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  expect(screen.getAllByText('Product catalog not provisioned').length).toBeGreaterThanOrEqual(1);
  // The static catalog content must NOT appear as a silent runtime fallback.
  expect(screen.queryByText('Content Factory')).not.toBeInTheDocument();
});

test('shows catalog request failures with the error and a retry action', async () => {
  const user = userEvent.setup();
  const retry = vi.fn();
  vi.spyOn(catalogModule, 'useNormativeCatalog').mockReturnValue({
    status: 'error',
    products: [],
    subproductsByProduct: {},
    capabilities: [],
    platformServices: [],
    error: 'Catalog request timed out',
    retry,
  });

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={DEFAULT_CONTEXT_VALUE}>
        <ProductsCatalogPage />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load product catalog');
  expect(screen.getByText('Catalog request timed out')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

// The Brand DNA tab must never present static demo tenants as real data.
// No backend brand registry exists yet, so the tab shows the factual
// unprovisioned state instead of the fictional BRAND_DNA_PROFILES list.
test(
  'Brand DNA tab shows the factual unprovisioned state — never static demo tenants',
  { timeout: 20000 },
  async () => {
    const user = userEvent.setup();
    const authContext = {
      ...DEFAULT_CONTEXT_VALUE,
      user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'admin@genos.cloud' },
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={authContext}>
          <ProductsCatalogPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Switch to Brand DNA tab
    const brandTab = screen.getByText('Brand DNA Profiles');
    await user.click(brandTab);

    // Fictional demo tenants must not render anywhere.
    expect(screen.queryByText('PUTTINATO')).not.toBeInTheDocument();
    expect(screen.queryByText('All Life Institute')).not.toBeInTheDocument();
    expect(screen.queryByText('Clareira de Avalon')).not.toBeInTheDocument();

    // The honest unprovisioned state is shown instead.
    expect(screen.getByText('Brand DNA registry not provisioned')).toBeInTheDocument();
  },
);
