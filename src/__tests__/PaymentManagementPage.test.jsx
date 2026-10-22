/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import PaymentManagementPage from '../pages/payments/PaymentManagementPage';

// Mock Supabase browser client functions
vi.mock('../lib/supabase.client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: {
        total_transacted_cents: 250000,
        paid_charges_count: 12,
        pending_charges_count: 3,
        active_sellers_count: 5,
      },
      error: null,
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'c1',
            pagbank_charge_id: 'CHAR_1001',
            payment_method: 'PIX',
            amount_cents: 15000,
            status: 'PAID',
            created_at: '2026-10-19T20:00:00Z',
          },
        ],
        error: null,
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: {
          success: true,
          charge: {
            id: 'ch_new',
            pagbank_charge_id: 'CHAR_9999',
          },
          pix: {
            emv: '00020126580014br.gov.bcb.pix...',
            qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=pix',
          },
        },
        error: null,
      }),
    },
  }),
}));

const testTenantContext = {
  ...DEFAULT_CONTEXT_VALUE,
  user: { id: '00000000-0000-4000-8000-000000000001', email: 'billing-test@example.invalid' },
  activeOrganization: { id: '00000000-0000-4000-8000-000000000002', identifier: 'billing-test-org', name: 'Billing Test Organization' },
};

const renderPaymentPage = (context = testTenantContext) =>
  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={context}>
        <PaymentManagementPage />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

describe('PaymentManagementPage UI & PagBank Integration', () => {
  test('renders page header, KPI tiles, and functional tabs', async () => {
    renderPaymentPage();

    expect(screen.getByText('PagBank Multi-Tenant & FDW Engine')).toBeInTheDocument();
    expect(screen.getByText('Total Transacted Volume')).toBeInTheDocument();
    expect(screen.getByText('Paid Charges')).toBeInTheDocument();
    expect(screen.getByText('Pending Charges')).toBeInTheDocument();
    expect(screen.getByText('Connected Sellers (Split)')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /Charges & Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PagBank Connect & Split/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Supabase Wrappers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Schema.org Audit/i })).toBeInTheDocument();
  });

  test('opens instant charge modal and shows payment method radio options', async () => {
    renderPaymentPage();

    const openModalBtn = screen.getByRole('button', { name: /New Instant Charge/i });
    await waitFor(() => expect(openModalBtn).toBeEnabled());

    fireEvent.click(openModalBtn);

    expect(screen.getByText('Issue New PagBank Charge')).toBeInTheDocument();
    expect(screen.getByLabelText(/Charge Amount \(BRL\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Instant PIX/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Credit Card/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Boleto Bancario/i)).toBeInTheDocument();
  });

  test('does not show fabricated zero totals or empty ledgers without an organization scope', async () => {
    renderPaymentPage(DEFAULT_CONTEXT_VALUE);

    await waitFor(() => {
      expect(screen.getByText('Organization not selected')).toBeInTheDocument();
    });

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /New Instant Charge/i })).toBeDisabled();
    expect(screen.queryByText(/No transactions found/i)).not.toBeInTheDocument();
  });

  test('renders FDW architecture and Schema.org taxonomy overview in tab', async () => {
    renderPaymentPage();

    const fdwTab = screen.getByRole('tab', { name: /Supabase Wrappers/i });
    fireEvent.click(fdwTab);

    expect(screen.getByText('Supabase Wrappers & Foreign Data Wrapper Architecture')).toBeInTheDocument();
    expect(screen.getByText(/Extension: wrappers \(Active\)/i)).toBeInTheDocument();
    expect(screen.getByText(/FDW: wasm_wrapper/i)).toBeInTheDocument();
    expect(screen.getByText(/Schema.org Taxonomy Implemented:/i)).toBeInTheDocument();
  });
});
