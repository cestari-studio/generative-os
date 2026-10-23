/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantProvider } from '../context/TenantContext';
import PaymentManagementPage from '../pages/payments/PaymentManagementPage';

// Shared spies: the quote-first contract test asserts on these directly.
const rpcSpy = vi.fn().mockImplementation((fn) => {
  if (fn === 'issue_manual_quote') {
    return Promise.resolve({ data: { quote_id: 'quote-123' }, error: null });
  }
  return Promise.resolve({
    data: {
      total_transacted_cents: 250000,
      paid_charges_count: 12,
      pending_charges_count: 3,
      active_sellers_count: 5,
    },
    error: null,
  });
});
const invokeSpy = vi.fn().mockResolvedValue({
  data: {
    success: true,
    charge: { id: 'ch_new', pagbank_charge_id: 'CHAR_9999' },
    pix: {
      emv: '00020126580014br.gov.bcb.pix...',
      qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=pix',
    },
  },
  error: null,
});

// Mock Supabase browser client functions
vi.mock('../lib/supabase.client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: rpcSpy,
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
      invoke: invokeSpy,
    },
  }),
}));

describe('PaymentManagementPage UI & PagBank Integration', () => {
  test('renders page header, KPI tiles, and functional tabs', async () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );

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
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );

    const openModalBtn = screen.getByRole('button', { name: /New Instant Charge/i });
    expect(openModalBtn).toBeInTheDocument();

    fireEvent.click(openModalBtn);

    expect(screen.getByText('Issue New PagBank Charge')).toBeInTheDocument();
    expect(screen.getByLabelText(/Charge Amount \(BRL\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Instant PIX/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Credit Card/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Boleto Bancario/i)).toBeInTheDocument();
  });

  test('renders FDW architecture and Schema.org taxonomy overview in tab', async () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );

    const fdwTab = screen.getByRole('tab', { name: /Supabase Wrappers/i });
    fireEvent.click(fdwTab);

    expect(screen.getByText('Supabase Wrappers & Foreign Data Wrapper Architecture')).toBeInTheDocument();
    expect(screen.getByText(/Extension: wrappers \(Active\)/i)).toBeInTheDocument();
    expect(screen.getByText(/FDW: wasm_wrapper/i)).toBeInTheDocument();
    expect(screen.getByText(/Schema.org Taxonomy Implemented:/i)).toBeInTheDocument();
  });
});

describe('quote-first billing contract (directive §9: browser sends quoteId, never amountCents)', () => {
  test('charge submission issues a server quote first, then orders by quoteId without amountCents', async () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );

    // Open the modal and fill the form.
    fireEvent.click(screen.getByRole('button', { name: /New Instant Charge/i }));
    fireEvent.change(screen.getByLabelText(/Charge Amount \(BRL\)/i), { target: { value: '150.00' } });
    fireEvent.change(screen.getByLabelText(/Customer Name/i), { target: { value: 'Real Customer' } });
    fireEvent.change(screen.getByLabelText(/Customer Email/i), { target: { value: 'customer@real.example' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate Charge/i }));

    // 1. The server-issued quote RPC must be called with the proposed amount.
    await vi.waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith(
        'issue_manual_quote',
        expect.objectContaining({
          p_amount_cents: 15000,
          p_currency: 'BRL',
        }),
      );
    });

    // 2. The order function must receive quoteId — and NEVER amountCents.
    await vi.waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith(
        'pagbank-order',
        expect.objectContaining({
          body: expect.objectContaining({ quoteId: 'quote-123' }),
        }),
      );
    });

    const orderCall = invokeSpy.mock.calls.find(([fn]) => fn === 'pagbank-order');
    expect(orderCall).toBeTruthy();
    expect(orderCall[1].body).not.toHaveProperty('amountCents');
    expect(orderCall[1].body).not.toHaveProperty('amount_cents');
  });
});
