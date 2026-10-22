/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import ProductsCatalogPage from '../pages/products/ProductsCatalogPage';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';

beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

test('renders Products & Brand DNA Catalog with all 5 product suites and tabs', () => {
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
  expect(screen.getByText('Brand DNA Profiles (12)')).toBeInTheDocument();
  expect(screen.getByText('Platform Services & Capabilities')).toBeInTheDocument();
  expect(screen.getByText('Schema.org Taxonomy Graph')).toBeInTheDocument();

  // All 5 Product Suites per Cestari Studio canonical taxonomy
  expect(screen.getByText('Content Factory')).toBeInTheDocument();
  expect(screen.getByText('Client Ops')).toBeInTheDocument();
  expect(screen.getByText('Schedule Ops')).toBeInTheDocument();
  expect(screen.getByText('Reputation Ops')).toBeInTheDocument();
  expect(screen.getByText('Academy Ops')).toBeInTheDocument();
});

test('interacts with Brand DNA catalog and search', async () => {
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
  const brandTab = screen.getByText('Brand DNA Profiles (12)');
  await user.click(brandTab);

  expect(screen.getByText('Brand DNA Multi-Tenant Catalog')).toBeInTheDocument();
  expect(screen.getAllByText('Cestari Studio Agency').length).toBeGreaterThanOrEqual(1);

  // Search filter
  const searchInput = screen.getByRole('searchbox');
  await user.type(searchInput, 'PUTTINATO');
  expect(screen.getByText('PUTTINATO')).toBeInTheDocument();
});
