/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import i18next from 'i18next';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantProvider } from '../context/TenantContext';
import Dashboard from '../pages/dashboard/Dashboard';

vi.mock('../lib/supabase.client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  }),
}));

vi.mock('@carbon/charts-react', () => ({
  AreaChart: (props) => <div data-testid="mock-area-chart" {...props} />,
  DonutChart: (props) => <div data-testid="mock-donut-chart" {...props} />,
  SimpleBarChart: (props) => <div data-testid="mock-bar-chart" {...props} />,
}));

describe('Carbon v12 Dashboard Architecture & Components', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });
  test('renders executive PageHeader with breadcrumbs, actions, and 5 tabs', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cascade Settings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Export report').length).toBeGreaterThan(0);

    // 5 tabs present
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Subscriptions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
  });

  test('renders onboarding GetStartedCards journey in dashboard tab', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Complete Your Tenant Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Configure Tenant DNA & Identity')).toBeInTheDocument();
    expect(screen.getByText('Provision Workspaces & Projects')).toBeInTheDocument();
    expect(screen.getByText('Index Vector Knowledge & Documents')).toBeInTheDocument();
    expect(screen.getByText('Activate Subscription & FinOps')).toBeInTheDocument();
  });

  test('switches tabs and displays respective workspace, users, subscriptions, and settings panes', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    // Switch to Workspace tab
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByText('Provisioned Workspaces')).toBeInTheDocument();

    // Switch to Users tab
    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
    expect(screen.getByText('Tenant Members & Permissions')).toBeInTheDocument();

    // Switch to Subscriptions tab — without a provisioned plan the tab shows
    // the honest empty state instead of fabricated pricing.
    fireEvent.click(screen.getByRole('tab', { name: 'Subscriptions' }));
    expect(screen.getByText('No active subscription')).toBeInTheDocument();
    expect(screen.getByText(/Pricing is not configured/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$0 \/ month|\$49 \/ month|\$199 \/ month/)).not.toBeInTheDocument();

    // Switch to Settings tab
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText('Personal User Preferences')).toBeInTheDocument();
  });

  test('renders global filter bar with time horizon and workspace dropdowns', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Time horizon')).toBeInTheDocument();
    expect(screen.getByText('Workspace scope')).toBeInTheDocument();
    expect(screen.getByText('Refresh metrics')).toBeInTheDocument();
  });

  test('renders 4 operational KPI tiles with real data and Schema.org tags', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Active members')).toBeInTheDocument();
    expect(screen.getByText('CreativeWork projects')).toBeInTheDocument();
    expect(screen.getByText('Knowledge assets')).toBeInTheDocument();
    expect(screen.getByText('Locked cascade rules')).toBeInTheDocument();

    expect(screen.getByText('Tier 4 Persons')).toBeInTheDocument();
    expect(screen.getByText('Tier 3 Projects')).toBeInTheDocument();
    expect(screen.getByText('pgvector & Storage')).toBeInTheDocument();
    expect(screen.getByText('Strict Governance')).toBeInTheDocument();
  });

  test('renders telemetry and governance analytics chart tiles', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Tenant Activity & Audit Timeline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cascade Governance Rule Distribution').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Knowledge & Media Assets by Format').length).toBeGreaterThan(0);
  });

  test('renders operational DataTables with honest empty states when no data exists', async () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Effective Cascade Governance')).toBeInTheDocument();
      expect(screen.getByText('Schema.org Audit Action Stream')).toBeInTheDocument();
    });

    // Without provisioned settings/audit data, both ledgers render an honest
    // empty state instead of synthetic rows.
    const emptyHeadings = screen.getAllByRole('heading', { name: 'No matching results' });
    expect(emptyHeadings.length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText('Filter policies...');
    expect(searchInput).toBeInTheDocument();

    // Filtering an already-empty ledger keeps the empty state visible.
    fireEvent.change(searchInput, { target: { value: 'non_existent_policy_xyz' } });
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'No matching results' }).length).toBeGreaterThan(0);
    });
  });

  test('handles report export action successfully', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    const exportBtns = screen.getAllByRole('button', { name: /export report/i });
    fireEvent.click(exportBtns[exportBtns.length - 1]);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });
});
