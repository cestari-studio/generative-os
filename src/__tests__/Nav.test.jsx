/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { Nav } from '../components/nav/Nav';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';

beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

test('renders guest UIShell header without private navigation menus when unauthenticated', () => {
  const guestContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: null,
    loading: false,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={guestContext}>
        <Nav />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  // Logo and Profile Root are present
  expect(screen.getByText('Cestari')).toBeInTheDocument();
  expect(screen.getByText('Studio')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /user profile/i })).toBeInTheDocument();

  // Navigation menu items must NOT be present before login
  expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  expect(screen.queryByText('Knowledge & Vector RAG')).not.toBeInTheDocument();
  expect(screen.queryByText('Products & Brand DNA')).not.toBeInTheDocument();
  expect(screen.queryByText('Cascade Settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Payments & PagBank')).not.toBeInTheDocument();

  // Hamburger trigger must NOT be present before login
  expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument();
});

test('renders full navigation menu items in header and side nav after login', () => {
  const authContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'admin@genos.cloud' },
    person: { name: 'Tenant Administrator', email: 'admin@genos.cloud' },
    loading: false,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={authContext}>
        <Nav />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  // Hamburger menu button is present
  expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();

  // Categorized menu items are present in Header
  expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Knowledge & Vector RAG').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Products & Brand DNA').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Cascade Settings').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Payments & PagBank').length).toBeGreaterThanOrEqual(1);
});

test('toggles profile panel when user profile button is clicked', () => {
  const guestContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: null,
    loading: false,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={guestContext}>
        <Nav />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  const profileButton = screen.getByRole('button', { name: /user profile/i });

  // Clicking should open profile panel
  fireEvent.click(profileButton);
  expect(screen.getByText(/Guest Session/i)).toBeInTheDocument();
});
