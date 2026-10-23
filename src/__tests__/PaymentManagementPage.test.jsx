/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import PaymentManagementPage from '../pages/payments/PaymentManagementPage';

const paymentMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('../lib/supabase.client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: paymentMocks.rpc,
    from: paymentMocks.from,
    functions: {
      invoke: paymentMocks.invoke,
    },
  }),
}));

const testTenantContext = {
  ...DEFAULT_CONTEXT_VALUE,
  user: { id: '00000000-0000-4000-8000-000000000001', email: 'billing-test@example.invalid' },
  activeOrganization: {
    id: '00000000-0000-4000-8000-000000000002',
    identifier: 'billing-test-org',
    name: 'Billing Test Organization',
  },
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
  beforeEach(() => {
    paymentMocks.rpc.mockReset().mockImplementation((name) =>
      name === 'issue_manual_quote'
        ? { data: { quote_id: '00000000-0000-4000-8000-000000000099' }, error: null }
        : {
            data: {
              total_transacted_cents: 250000,
              paid_charges_count: 12,
              pending_charges_count: 3,
              active_sellers_count: 5,
            },
            error: null,
          },
    );
    paymentMocks.from.mockReset().mockImplementation(() => {
      const query = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.in = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.limit = vi.fn().mockResolvedValue({
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
      });
      return query;
    });
    paymentMocks.invoke.mockReset().mockResolvedValue({
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
    });
  });

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

  test('retries an ambiguous PagBank outcome with the same quote and reference without issuing a new quote', async () => {
    paymentMocks.invoke
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Gateway timeout', context: { status: 502 } },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          charge: { id: 'ch_recovered', pagbank_charge_id: 'CHAR_RECOVERED' },
        },
        error: null,
      });

    renderPaymentPage();
    const newChargeButton = screen.getByRole('button', { name: /New Instant Charge/i });
    await waitFor(() => expect(newChargeButton).toBeEnabled());
    fireEvent.click(newChargeButton);

    fireEvent.change(screen.getByLabelText(/Charge Amount \(BRL\)/i), { target: { value: '125.00' } });
    fireEvent.change(screen.getByLabelText(/Customer Name/i), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByLabelText(/Customer Email/i), { target: { value: 'customer@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Charge/i }));

    expect(await screen.findByText(/The payment outcome is unknown/i)).toBeInTheDocument();
    const retryButton = await screen.findByRole('button', { name: 'Retry same payment attempt' });
    expect(newChargeButton).toBeDisabled();
    expect(paymentMocks.rpc.mock.calls.filter(([name]) => name === 'issue_manual_quote')).toHaveLength(1);
    expect(paymentMocks.invoke).toHaveBeenCalledTimes(1);

    const firstBody = paymentMocks.invoke.mock.calls[0][1].body;
    expect(firstBody.referenceId).toBe(`Q_${firstBody.quoteId}`);

    fireEvent.click(retryButton);
    await waitFor(() => expect(screen.getByText(/CHAR_RECOVERED/)).toBeInTheDocument());

    expect(paymentMocks.invoke).toHaveBeenCalledTimes(2);
    expect(paymentMocks.invoke.mock.calls[1][1].body).toEqual(firstBody);
    expect(paymentMocks.rpc.mock.calls.filter(([name]) => name === 'issue_manual_quote')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Retry same payment attempt' })).not.toBeInTheDocument();
  });

  test('PagBank order reference is canonical and stable per quote in the Edge Function', () => {
    const source = fs.readFileSync(path.resolve('supabase/functions/pagbank-order/index.ts'), 'utf8');
    expect(source).toContain('const referenceId = `Q_${quoteId}`;');
    expect(source).toContain('requestedReferenceId !== referenceId');
    expect(source).not.toContain('referenceId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`');
  });

  test('does not present example FDW configuration as verified runtime state', async () => {
    renderPaymentPage();

    const fdwTab = screen.getByRole('tab', { name: /Supabase Wrappers/i });
    fireEvent.click(fdwTab);

    expect(screen.getByText('FDW runtime not verified')).toBeInTheDocument();
    expect(screen.getByText(/no verified read model for live Supabase Wrappers/i)).toBeInTheDocument();
    expect(screen.queryByText('PagBank Multi-Tenant Gateway')).not.toBeInTheDocument();
    expect(screen.queryByText(/Extension: wrappers \(Active\)/i)).not.toBeInTheDocument();
  });
});
