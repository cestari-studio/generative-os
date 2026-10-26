/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

// Default happy-path `from` chain: every table query resolves one charge row.
const defaultFrom = vi.fn().mockReturnValue({
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
});

/**
 * Builds the browser-client shape the component consumes. `overrides` lets a
 * test inject a failing RPC and/or failing table queries while keeping every
 * other call on the happy path.
 */
const buildClient = ({ rpcImpl, fromImpl } = {}) => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  rpc: rpcImpl ?? rpcSpy,
  from: fromImpl ?? defaultFrom,
  functions: {
    invoke: invokeSpy,
  },
});

/**
 * Builds a table-aware `from` mock: the query against `failTable` resolves
 * with `error`, all other tables resolve with an empty (but successful) result.
 * Terminal methods differ per query in the component — charges/audit end at
 * `.limit()`, sellers ends at `.order()` — so both are provided on every chain.
 */
const buildFromFailing = (failTable, error) =>
  vi.fn((table) => {
    const isTarget = table === failTable;
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };
    const result = isTarget ? { data: null, error } : { data: [], error: null };
    // The sellers query awaits the `.order()` result directly (no `.limit()`).
    // Make `order` return a thenable chain so both call patterns resolve.
    chain.order = vi.fn(() => ({
      ...chain,
      then: (resolve) => resolve(result),
    }));
    chain.limit = vi.fn().mockResolvedValue(result);
    return chain;
  });

// Mock Supabase browser client functions
vi.mock('../lib/supabase.client', () => ({
  getSupabaseBrowserClient: vi.fn(() => buildClient()),
}));

import { getSupabaseBrowserClient } from '../lib/supabase.client';

beforeEach(() => {
  vi.mocked(getSupabaseBrowserClient).mockImplementation(() => buildClient());
});

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

/**
 * PR #7 zero-mock rule: a FAILED load must render an explicit error
 * (InlineNotification) and must NEVER render fabricated zero KPI values as if
 * they were real. Each test below forces a different backend call to fail and
 * asserts the same contract: error notification visible, zero-looking KPI
 * strings absent.
 */
describe('PaymentManagementPage load error states (zero-mock rule)', () => {
  // The KPI strings that would appear only if zeros were rendered as real data.
  const fabricatedZeroSelectors = ['R$ 0.00'];

  const assertErrorState = async () => {
    // 1. The explicit error notification appears.
    await waitFor(() => {
      expect(screen.getByText('Could not load payments data')).toBeInTheDocument();
    });

    // 2. No fabricated zero KPI values are rendered as if real.
    for (const text of fabricatedZeroSelectors) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }

    // 3. The KPI value placeholders (SkeletonText) must also be gone — the
    //    grid is replaced by the notification, not left in a loading state.
    expect(document.querySelector('.cs--payment-management__kpi-value')).toBeNull();
  };

  test('(a) KPI RPC error -> error notification, no fabricated zeros', async () => {
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() =>
      buildClient({
        rpcImpl: vi.fn().mockResolvedValue({ data: null, error: { message: 'kpi rpc exploded' } }),
      }),
    );
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    await assertErrorState();
    await waitFor(() => {
      expect(screen.getByText(/kpi rpc exploded/i)).toBeInTheDocument();
    });
  });

  test('(b) charges query error -> error notification, no fabricated zeros', async () => {
    const failingFrom = buildFromFailing('payment_charges', { message: 'charges table denied' });
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() => buildClient({ fromImpl: failingFrom }));
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    await assertErrorState();
    await waitFor(() => {
      expect(screen.getByText(/charges table denied/i)).toBeInTheDocument();
    });
  });

  test('(c) sellers query error -> error notification, no fabricated zeros', async () => {
    const failingFrom = buildFromFailing('connected_seller_accounts', { message: 'sellers read failed' });
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() => buildClient({ fromImpl: failingFrom }));
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    await assertErrorState();
    await waitFor(() => {
      expect(screen.getByText(/sellers read failed/i)).toBeInTheDocument();
    });
  });

  test('(d) audit query error -> error notification, no fabricated zeros', async () => {
    const failingFrom = buildFromFailing('audit_actions', { message: 'audit log unavailable' });
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() => buildClient({ fromImpl: failingFrom }));
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    await assertErrorState();
    await waitFor(() => {
      expect(screen.getByText(/audit log unavailable/i)).toBeInTheDocument();
    });
  });

  test('(e) unexpected exception (rpc throws) -> error notification, no fabricated zeros', async () => {
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() =>
      buildClient({
        rpcImpl: vi.fn().mockRejectedValue(new Error('network unreachable')),
      }),
    );
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    await assertErrorState();
    await waitFor(() => {
      expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
    });
  });
});
