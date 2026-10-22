/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';

beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

test('renders children directly when user is authenticated', () => {
  const authContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'tenant.admin@ibm.com' },
    loading: false,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={authContext}>
        <ProtectedRoute category="billing">
          <div data-testid="private-tenant-content">Confidential Payments Table</div>
        </ProtectedRoute>
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  expect(screen.getByTestId('private-tenant-content')).toBeInTheDocument();
  expect(screen.getByText('Confidential Payments Table')).toBeInTheDocument();
  expect(screen.queryByText('Tenant-Level Settings Access Restricted')).not.toBeInTheDocument();
});

test('renders loading indicator when session is initializing', () => {
  const loadingContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: null,
    loading: true,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={loadingContext}>
        <ProtectedRoute category="overview">
          <div>Dashboard Content</div>
        </ProtectedRoute>
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('renders access restricted gate and triggers sign in modal when unauthenticated', async () => {
  const user = userEvent.setup();
  const mockOpenSignInModal = vi.fn();

  const unauthContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: null,
    loading: false,
    openSignInModal: mockOpenSignInModal,
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={unauthContext}>
        <ProtectedRoute category="billing">
          <div>Hidden Financial Gateway</div>
        </ProtectedRoute>
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  // Hidden content is not rendered
  expect(screen.queryByText('Hidden Financial Gateway')).not.toBeInTheDocument();

  // Access restricted header is shown
  expect(screen.getByText('Tenant-Level Settings Access Restricted')).toBeInTheDocument();

  // Category tags and cards for tenant categories are present
  expect(screen.getByText('Tenant-Level Settings Categories')).toBeInTheDocument();
  expect(screen.getAllByText('Billing & FinOps').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Reports & Telemetry')).toBeInTheDocument();
  expect(screen.getByText('Files & Knowledge Corpus')).toBeInTheDocument();
  expect(screen.getByText('Products & Brand DNA')).toBeInTheDocument();
  expect(screen.getByText('Settings & Governance')).toBeInTheDocument();
  expect(screen.getByText('Profile & Identity')).toBeInTheDocument();

  // Sign in button is interactive and calls openSignInModal(0)
  const signInButton = screen.getByText('Sign in to Tenant Workspace');
  expect(signInButton).toBeInTheDocument();
  await user.click(signInButton);
  expect(mockOpenSignInModal).toHaveBeenCalledWith(0);

  // Return to public welcome button exists
  expect(screen.getByText('Return to Public Welcome')).toBeInTheDocument();
});
