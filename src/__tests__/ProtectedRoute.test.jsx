/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi, describe, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';

// Drive the server-authoritative readiness RPC deterministically per test. Default
// is a non-decisive envelope so the session-only gate behaves exactly as the
// existing tests expect (children render for an authed user, gate otherwise).
const rpcMock = vi.fn().mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
vi.mock('../lib/supabase.client.js', () => ({
  getSupabaseBrowserClient: () => ({ rpc: rpcMock }),
}));

beforeAll(() => setupBeforeAll(server));
beforeEach(() => {
  setupBeforeEach(server);
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
});
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

describe('ProtectedRoute — server-authoritative readiness gate (§11)', () => {
  const authedUser = { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'tenant.admin@ibm.com' };

  // §11.2 / Req #3 — the gate resolves on sign-in (user becomes present). When the
  // server says required steps are incomplete, the onboarding flow is opened —
  // the user cannot reach the private surface by simply authenticating.
  test('sign-in with require_steps -> onboarding flow opens (gate applies on authentication)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        decision: 'require_steps',
        next_step_key: 'onboarding.person.address',
        run_id: 'run-1',
        incomplete_steps: ['onboarding.person.address'],
      },
      error: null,
    });
    const openOnboardingFlow = vi.fn();
    const ctx = { ...DEFAULT_CONTEXT_VALUE, user: authedUser, loading: false, openOnboardingFlow };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={ctx}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(openOnboardingFlow).toHaveBeenCalledWith(0));
    // The RPC was consulted with the wizard identity only (never a client step list).
    const [, args] = rpcMock.mock.calls[0];
    expect(args).toHaveProperty('p_wizard_key');
    expect(args).not.toHaveProperty('p_required_step_keys');
  });

  // §11.2 / Req #5 — no frontend decision duplication. A person whose local data
  // "looks complete" (account_type, name, plan_tier) must NOT bypass the gate:
  // when the server still says require_steps, the onboarding flow opens anyway.
  test('does NOT re-derive readiness from person.account_type / person data (server decision wins)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        decision: 'require_steps',
        next_step_key: 'onboarding.person.address',
        run_id: 'run-1',
        incomplete_steps: ['onboarding.person.address'],
      },
      error: null,
    });
    const openOnboardingFlow = vi.fn();
    const completeLookingPerson = {
      id: authedUser.id,
      account_type: 'corporate',
      full_name: 'Ada Lovelace',
      plan_tier: 'enterprise',
      // even a person object that claims onboarding is complete:
      additional_property: { onboarding: { status: 'completed', current_step: 5 } },
    };
    const ctx = {
      ...DEFAULT_CONTEXT_VALUE,
      user: authedUser,
      person: completeLookingPerson,
      loading: false,
      openOnboardingFlow,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={ctx}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Despite the "complete" person data, the server's require_steps decision wins.
    await waitFor(() => expect(openOnboardingFlow).toHaveBeenCalledWith(0));
  });

  // §11.2 / Req #3 — session restore / direct-URL navigation: the gate runs for an
  // already-authenticated user on mount (no fresh sign-in), so a direct visit to a
  // private URL still resolves readiness and opens onboarding on require_steps.
  test('session restore / direct-URL (user present on first render) still resolves the gate', async () => {
    rpcMock.mockResolvedValue({
      data: {
        decision: 'require_steps',
        next_step_key: 'onboarding.person.address',
        run_id: 'run-1',
        incomplete_steps: ['onboarding.person.address'],
      },
      error: null,
    });
    const openOnboardingFlow = vi.fn();
    const ctx = { ...DEFAULT_CONTEXT_VALUE, user: authedUser, loading: false, openOnboardingFlow };

    renderWithoutProviders(
      <MemoryRouter initialEntries={['/settings/billing']}>
        <TenantContext.Provider value={ctx}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await waitFor(() => expect(openOnboardingFlow).toHaveBeenCalledWith(0));
  });

  // §11.4 / Req #3 — a blocked decision must NOT open the onboarding flow (blocked
  // is not require_steps) and must NOT be treated as cleared/allow.
  test('blocked decision -> onboarding flow NOT opened (blocked is not require_steps and not allow)', async () => {
    rpcMock.mockResolvedValue({
      data: { decision: 'blocked', reason: 'policy_violation', run_id: 'run-1' },
      error: null,
    });
    const openOnboardingFlow = vi.fn();
    const ctx = { ...DEFAULT_CONTEXT_VALUE, user: authedUser, loading: false, openOnboardingFlow };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={ctx}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    // Give effects a chance to fire; blocked must never trigger onboarding.
    await new Promise((res) => setTimeout(res, 50));
    expect(openOnboardingFlow).not.toHaveBeenCalled();
  });

  // §11.2 / Req #3 — context switch: when the authenticated user identity changes,
  // the gate re-resolves (the previous context's decision is not reused).
  test('context switch (user identity change) re-resolves the gate', async () => {
    rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
    const openOnboardingFlow = vi.fn();
    const ctxA = { ...DEFAULT_CONTEXT_VALUE, user: authedUser, loading: false, openOnboardingFlow };

    const { rerender } = renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={ctxA}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    // Switch to a different authenticated principal (context switch).
    const switchedUser = { id: 'usr_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', email: 'other.admin@ibm.com' };
    const ctxB = { ...DEFAULT_CONTEXT_VALUE, user: switchedUser, loading: false, openOnboardingFlow };
    rerender(
      <MemoryRouter>
        <TenantContext.Provider value={ctxB}>
          <ProtectedRoute category="billing">
            <div data-testid="private-content">Private</div>
          </ProtectedRoute>
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(rpcMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
