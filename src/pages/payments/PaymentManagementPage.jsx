/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CodeSnippet,
  Column,
  DataTable,
  Grid,
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react';
import {
  Add,
  CheckmarkFilled,
  Connect,
  Copy,
  DocumentDownload,
  Finance,
  Launch,
  QrCode,
  Receipt,
  Renew,
} from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../layouts/page-layout';
import { Footer } from '../../components/footer/Footer';
import { useTenant } from '../../context/useTenant';
import { getSupabaseBrowserClient } from '../../lib/supabase.client';

const classifyPaymentReadError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');

  if ([401, 403].includes(status) || ['42501', 'PGRST301'].includes(code)) return 'forbidden';
  if (
    ['42P01', 'PGRST202', 'PGRST205'].includes(code) ||
    /relation .* does not exist|could not find the table .* schema cache|function .* does not exist/i.test(message)
  ) {
    return 'unprovisioned';
  }
  return 'error';
};

export default function PaymentManagementPage() {
  const { t } = useTranslation();
  const { activeOrganization, activeWorkspace, activeProject } = useTenant();

  const organizationId = activeOrganization?.id || null;
  const workspaceId = activeWorkspace?.id || null;
  const projectId = activeProject?.id || null;

  // KPI values remain absent until the real scoped query succeeds.
  const [kpis, setKpis] = useState(null);
  const [paymentLoadState, setPaymentLoadState] = useState({ status: 'loading', error: null });
  const paymentRequestVersion = useRef(0);

  // Data collections
  const [charges, setCharges] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info');

  // New Charge Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAmount, setModalAmount] = useState('');
  const [modalMethod, setModalMethod] = useState('PIX');
  const [modalCustomerName, setModalCustomerName] = useState('');
  const [modalCustomerEmail, setModalCustomerEmail] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [splitPct, setSplitPct] = useState('');

  // Active Instant Charge Result
  const [activePaymentResult, setActivePaymentResult] = useState(null);

  // Read the complete payment view as one scoped unit. Any failed query
  // blocks the empty-table and zero-KPI states, so an access/schema error is
  // never misrepresented as a tenant with no financial activity.
  const loadPaymentData = useCallback(async () => {
    const requestVersion = ++paymentRequestVersion.current;
    const isCurrent = () => requestVersion === paymentRequestVersion.current;

    if (!organizationId) {
      setKpis(null);
      setCharges([]);
      setSellers([]);
      setAuditEvents([]);
      setPaymentLoadState({ status: 'no-scope', error: null });
      return;
    }

    setPaymentLoadState({ status: 'loading', error: null });
    setKpis(null);
    setCharges([]);
    setSellers([]);
    setAuditEvents([]);

    try {
      const supabase = getSupabaseBrowserClient();
      const [kpiResult, chargesResult, sellersResult, auditResult] = await Promise.all([
        supabase.rpc('get_tenant_payment_kpis', { p_organization_id: organizationId }),
        supabase
          .from('payment_charges')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('connected_seller_accounts')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('audit_actions')
          .select('*')
          .eq('organization_id', organizationId)
          .in('object_type', ['Order', 'PaymentCharge', 'ConnectedSellerAccount'])
          .order('start_time', { ascending: false })
          .limit(10),
      ]);

      if (!isCurrent()) return;

      const failedResult = [kpiResult, chargesResult, sellersResult, auditResult].find((result) => result?.error);
      if (failedResult?.error) {
        const error = failedResult.error;
        setPaymentLoadState({
          status: classifyPaymentReadError(error),
          error: error.message || 'Payment data request failed.',
        });
        return;
      }

      if (!kpiResult?.data || typeof kpiResult.data !== 'object' || Array.isArray(kpiResult.data)) {
        setPaymentLoadState({
          status: 'error',
          error: 'The payment KPI service returned no usable record.',
        });
        return;
      }

      setKpis(kpiResult.data);
      setCharges(Array.isArray(chargesResult?.data) ? chargesResult.data : []);
      setSellers(Array.isArray(sellersResult?.data) ? sellersResult.data : []);
      setAuditEvents(Array.isArray(auditResult?.data) ? auditResult.data : []);
      setPaymentLoadState({ status: 'ready', error: null });
    } catch (error) {
      if (!isCurrent()) return;
      setKpis(null);
      setCharges([]);
      setSellers([]);
      setAuditEvents([]);
      setPaymentLoadState({
        status: classifyPaymentReadError(error),
        error: error instanceof Error ? error.message : 'Payment data request failed.',
      });
    }
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadPaymentData();
    });
    return () => {
      cancelled = true;
      paymentRequestVersion.current += 1;
    };
  }, [loadPaymentData]);

  const paymentLoadMessage = {
    loading: {
      kind: 'info',
      title: t('payments.loadingTitle', 'Loading payment data'),
      subtitle: t(
        'payments.loadingDesc',
        'Retrieving payment totals, orders, seller accounts, and audit events for the active organization.',
      ),
    },
    'no-scope': {
      kind: 'warning',
      title: t('payments.noOrganizationTitle', 'Organization not selected'),
      subtitle: t(
        'payments.noOrganizationDesc',
        'Select an organization to view financial records or initiate a payment.',
      ),
    },
    forbidden: {
      kind: 'error',
      title: t('payments.paymentAccessDeniedTitle', 'Payment access restricted'),
      subtitle: t(
        'payments.paymentAccessDeniedDesc',
        'The current session is not authorized to read payment data for this organization.',
      ),
    },
    unprovisioned: {
      kind: 'warning',
      title: t('payments.paymentSchemaMissingTitle', 'Payment data is not provisioned'),
      subtitle: t(
        'payments.paymentSchemaMissingDesc',
        'The payment schema or read endpoint is not provisioned in this environment. No empty ledger or zero totals are inferred.',
      ),
    },
    error: {
      kind: 'error',
      title: t('payments.paymentLoadErrorTitle', 'Payment data could not be loaded'),
      subtitle:
        paymentLoadState.error ||
        t(
          'payments.paymentLoadErrorDesc',
          'The payment data request failed. Retry after investigating the service response.',
        ),
    },
  }[paymentLoadState.status];

  // Handle Instant Charge Creation
  // Flow: (1) the server issues an audited quote for the operator-entered
  // amount; (2) the order boundary consumes that quote and derives the charge
  // amount from it — the browser never sets the final charge amount.
  const handleCreateCharge = async () => {
    setStatusMsg('');
    const amountCents = Math.round(parseFloat(modalAmount || '0') * 100);
    if (amountCents <= 0) {
      setStatusMsg(t('payments.invalidAmount', 'Please enter a valid amount greater than zero.'));
      setStatusType('error');
      return;
    }
    if (!modalCustomerName.trim() || !modalCustomerEmail.trim()) {
      setStatusMsg(t('payments.invalidCustomer', 'Customer name and email are required.'));
      setStatusType('error');
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();

      // 1. Server-issued, audited quote for the proposed amount.
      const { data: quote, error: quoteError } = await supabase.rpc('issue_manual_quote', {
        p_organization_id: organizationId,
        p_amount_cents: amountCents,
        p_currency: 'BRL',
        p_description: `Manual charge for ${modalCustomerName.trim()}`,
        p_idempotency_key: crypto.randomUUID(),
      });

      if (quoteError || !quote?.quote_id) {
        setStatusMsg(
          quoteError?.message || t('payments.quoteError', 'Could not issue a server quote for this charge.'),
        );
        setStatusType('error');
        return;
      }

      // 2. The order boundary consumes the quote and derives the amount.
      const { data, error } = await supabase.functions.invoke('pagbank-order', {
        body: {
          organizationId,
          workspaceId,
          projectId,
          quoteId: quote.quote_id,
          paymentMethod: modalMethod,
          customer: {
            name: modalCustomerName,
            email: modalCustomerEmail,
          },
          connectedSellerId: selectedSellerId || null,
          customSplitPercentage: splitPct.trim() === '' ? null : parseFloat(splitPct),
        },
      });

      if (error) {
        setStatusMsg(error.message || t('payments.chargeError', 'Failed to process PagBank charge.'));
        setStatusType('error');
        return;
      }

      setActivePaymentResult(data);
      setIsModalOpen(false);
      setStatusMsg(
        `${t('payments.chargeSuccess', 'Charge generated successfully!')} Code: ${data.charge?.pagbank_charge_id}`,
      );
      setStatusType('success');
      loadPaymentData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : t('payments.chargeFailed', 'Charge creation failed.'));
      setStatusType('error');
    }
  };

  // Launch PagBank Connect OAuth flow
  const handleConnectSeller = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke('pagbank-connect', {
        body: {
          action: 'get_authorize_url',
          organizationId,
          redirectUri: `${window.location.origin}/payments?connect=callback`,
        },
      });

      if (error) {
        setStatusMsg(error.message || t('payments.connectError', 'Error retrieving PagBank Connect URL.'));
        setStatusType('error');
        return;
      }

      if (data?.authorizeUrl) {
        window.open(data.authorizeUrl, '_blank', 'noopener,noreferrer');
        setStatusMsg(t('payments.connectWindowOpened', 'PagBank Connect authorization window opened.'));
        setStatusType('info');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : t('payments.connectInitError', 'Connect initiation error.'));
      setStatusType('error');
    }
  };

  // Table Headers
  const chargeHeaders = [
    { key: 'pagbank_charge_id', header: t('payments.colChargeId', 'Charge ID') },
    { key: 'payment_method', header: t('payments.colMethod', 'Method') },
    { key: 'amount', header: t('payments.colAmount', 'Amount') },
    { key: 'status', header: t('payments.colStatus', 'Status') },
    { key: 'created_at', header: t('payments.colDate', 'Date/Time') },
  ];

  const chargeRows = useMemo(
    () =>
      charges.map((c) => ({
        id: c.id,
        pagbank_charge_id: c.pagbank_charge_id,
        payment_method: c.payment_method,
        amount: `R$ ${(c.amount_cents / 100).toFixed(2)}`,
        status: (
          <Tag
            type={
              c.status === 'PAID'
                ? 'green'
                : c.status === 'PENDING'
                  ? 'warm-gray'
                  : c.status === 'DECLINED'
                    ? 'red'
                    : 'cool-gray'
            }
          >
            {c.status}
          </Tag>
        ),
        created_at: new Date(c.created_at).toLocaleString(),
      })),
    [charges],
  );

  const sellerHeaders = [
    { key: 'pagbank_account_id', header: t('payments.colSellerAccount', 'PagBank Account') },
    { key: 'seller_legal_name', header: t('payments.colSellerName', 'Legal Name') },
    { key: 'seller_tax_id', header: t('payments.colSellerTaxId', 'Tax ID / CNPJ') },
    { key: 'seller_email', header: t('payments.colSellerEmail', 'Email') },
    { key: 'authorization_status', header: t('payments.colSellerStatus', 'Status') },
  ];

  const sellerRows = useMemo(
    () =>
      sellers.map((s) => ({
        id: s.id,
        pagbank_account_id: s.pagbank_account_id,
        seller_legal_name: s.seller_legal_name,
        seller_tax_id: s.seller_tax_id,
        seller_email: s.seller_email,
        authorization_status: (
          <Tag type={s.authorization_status === 'authorized' ? 'green' : 'warm-gray'}>{s.authorization_status}</Tag>
        ),
      })),
    [sellers],
  );

  return (
    <PageLayout>
      <PageHeader
        className="cs--payment-management__page-header"
        title={t('payments.title', 'PagBank Multi-Tenant & FDW Engine')}
        subtitle={t(
          'payments.subtitle',
          'Unified financial module: Instant PIX payments, Card, Boleto, Split Marketplace Connect, and Supabase Wrappers.',
        )}
      />

      {statusMsg && (
        <InlineNotification
          kind={statusType}
          title={statusType === 'error' ? t('common.error', 'Error') : t('payments.status', 'Status')}
          subtitle={statusMsg}
          onCloseButtonClick={() => setStatusMsg('')}
          style={{ marginBlockEnd: '1rem' }}
        />
      )}

      {paymentLoadState.status !== 'ready' && paymentLoadMessage && (
        <InlineNotification
          kind={paymentLoadMessage.kind}
          title={paymentLoadMessage.title}
          subtitle={paymentLoadMessage.subtitle}
          lowContrast
          style={{ marginBlockEnd: '1rem' }}
        />
      )}

      {/* KPI Tiles */}
      <Grid className="cs--payment-management__kpi-grid">
        <Column sm={4} md={2} lg={4}>
          <Tile className="cs--payment-management__kpi-tile">
            <span className="cs--payment-management__kpi-label">
              {t('payments.kpiTotal', 'Total Transacted Volume')}
            </span>
            <span className="cs--payment-management__kpi-value">
              {paymentLoadState.status === 'ready' && kpis?.total_transacted_cents != null
                ? `R$ ${(Number(kpis.total_transacted_cents) / 100).toFixed(2)}`
                : '—'}
            </span>
          </Tile>
        </Column>
        <Column sm={4} md={2} lg={4}>
          <Tile className="cs--payment-management__kpi-tile">
            <span className="cs--payment-management__kpi-label">{t('payments.kpiPaid', 'Paid Charges')}</span>
            <span className="cs--payment-management__kpi-value">
              {paymentLoadState.status === 'ready' && kpis?.paid_charges_count != null
                ? kpis.paid_charges_count
                : '—'}
            </span>
          </Tile>
        </Column>
        <Column sm={4} md={2} lg={4}>
          <Tile className="cs--payment-management__kpi-tile">
            <span className="cs--payment-management__kpi-label">{t('payments.kpiPending', 'Pending Charges')}</span>
            <span className="cs--payment-management__kpi-value">
              {paymentLoadState.status === 'ready' && kpis?.pending_charges_count != null
                ? kpis.pending_charges_count
                : '—'}
            </span>
          </Tile>
        </Column>
        <Column sm={4} md={2} lg={4}>
          <Tile className="cs--payment-management__kpi-tile">
            <span className="cs--payment-management__kpi-label">
              {t('payments.kpiSellers', 'Connected Sellers (Split)')}
            </span>
            <span className="cs--payment-management__kpi-value">
              {paymentLoadState.status === 'ready' && kpis?.active_sellers_count != null
                ? kpis.active_sellers_count
                : '—'}
            </span>
          </Tile>
        </Column>
      </Grid>

      {/* Active Instant Payment Detail Card (QR Code or Boleto) */}
      {activePaymentResult?.pix && (
        <Grid style={{ marginBlockEnd: '1.5rem' }}>
          <Column sm={4} md={8} lg={16}>
            <Tile className="cs--payment-management__qr-card">
              <QrCode size={32} />
              <h4>{t('payments.pixQrHeading', 'Dynamic PIX QR Code Generated')}</h4>
              <p>{t('payments.pixQrInstructions', 'Scan with your banking app or copy the EMV digital line:')}</p>
              <img
                src={activePaymentResult.pix.qrCodeUrl}
                alt="PagBank PIX QR Code"
                className="cs--payment-management__qr-image"
              />
              <CodeSnippet type="multi" feedback={t('payments.copied', 'Copied!')}>
                {activePaymentResult.pix.emv}
              </CodeSnippet>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Copy}
                onClick={() => navigator.clipboard.writeText(activePaymentResult.pix.emv)}
              >
                {t('payments.copyEmv', 'Copy PIX Code')}
              </Button>
            </Tile>
          </Column>
        </Grid>
      )}

      {activePaymentResult?.boleto && (
        <Grid style={{ marginBlockEnd: '1.5rem' }}>
          <Column sm={4} md={8} lg={16}>
            <Tile className="cs--payment-management__qr-card">
              <Receipt size={32} />
              <h4>{t('payments.boletoHeading', 'Boleto Bancario Generated')}</h4>
              <p>{t('payments.boletoInstructions', 'Barcode digital line for settlement:')}</p>
              <CodeSnippet type="single" feedback={t('payments.copied', 'Copied!')}>
                {activePaymentResult.boleto.barcode}
              </CodeSnippet>
              <Button
                kind="primary"
                size="sm"
                renderIcon={DocumentDownload}
                href={activePaymentResult.boleto.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('payments.printBoleto', 'Print / Download Boleto PDF')}
              </Button>
            </Tile>
          </Column>
        </Grid>
      )}

      {/* Functional Tabs */}
      <Tabs className="cs--payment-management__tabs">
        <TabList aria-label="PagBank Multi-Tenant Management Sections">
          <Tab renderIcon={Receipt}>{t('payments.tabCharges', 'Charges & Orders')}</Tab>
          <Tab renderIcon={Connect}>{t('payments.tabConnect', 'PagBank Connect & Split')}</Tab>
          <Tab renderIcon={Finance}>{t('payments.tabFdw', 'Supabase Wrappers (FDW)')}</Tab>
          <Tab renderIcon={CheckmarkFilled}>{t('payments.tabAudit', 'Schema.org Audit')}</Tab>
        </TabList>

        <TabPanels>
          {/* TAB 1: Charges & Orders */}
          <TabPanel>
            <div className="cs--payment-management__action-bar">
              <h5>{t('payments.chargesSectionHeading', 'Tenant Transactions Ledger')}</h5>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button kind="ghost" size="sm" renderIcon={Renew} onClick={loadPaymentData}>
                  {t('payments.refresh', 'Refresh')}
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Add}
                  disabled={!organizationId || paymentLoadState.status !== 'ready'}
                  onClick={() => setIsModalOpen(true)}
                >
                  {t('payments.newCharge', 'New Instant Charge')}
                </Button>
              </div>
            </div>

            {paymentLoadState.status === 'ready' ? (
              <DataTable rows={chargeRows} headers={chargeHeaders}>
                {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer
                    title={t('payments.chargesTableTitle', 'Charges and Orders')}
                    description={t('payments.chargesTableDesc', 'Transactions governed by tenant RLS policy')}
                  >
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => (
                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                              <p className="cs--data-table__empty-text">
                                {t(
                                  'payments.emptyCharges',
                                  'No transactions found. Click "New Instant Charge" to create one.',
                                )}
                              </p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>{cell.value}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
            ) : null}
          </TabPanel>

          {/* TAB 2: Connect & Split */}
          <TabPanel>
            <div className="cs--payment-management__action-bar">
              <h5>{t('payments.connectHeading', 'Connected Accounts & Payout Split Engine')}</h5>
              <Button
                kind="primary"
                size="sm"
                renderIcon={Launch}
                disabled={!organizationId || paymentLoadState.status !== 'ready'}
                onClick={handleConnectSeller}
              >
                {t('payments.authorizeSeller', 'Authorize PagBank Seller')}
              </Button>
            </div>

            {paymentLoadState.status === 'ready' ? (
              <DataTable rows={sellerRows} headers={sellerHeaders}>
                {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer
                    title={t('payments.sellersTableTitle', 'Authorized Sellers')}
                    description={t(
                      'payments.sellersTableDesc',
                      'Connected sub-accounts eligible for automated split payouts',
                    )}
                  >
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => (
                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                              <p className="cs--data-table__empty-text">
                                {t(
                                  'payments.emptySellers',
                                  'No connected seller accounts are recorded for this organization.',
                                )}
                              </p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>{cell.value}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
            ) : null}
          </TabPanel>

          {/* TAB 3: Supabase Wrappers (FDW) */}
          <TabPanel>
            <Grid>
              <Column sm={4} md={8} lg={16}>
                <Tile style={{ marginBlockEnd: '1rem' }}>
                  <h5>{t('payments.fdwHeading', 'Supabase Wrappers & Foreign Data Wrapper Architecture')}</h5>
                  <p style={{ marginBlock: '0.5rem' }}>
                    {t(
                      'payments.fdwDesc',
                      'The wasm_wrapper Foreign Data Wrapper (wrappers v0.6.3) maps PagBank REST endpoints directly to relational PostgreSQL tables isolated in private pagbank_fdw schema.',
                    )}
                  </p>
                  <p
                    className="cds--type-caption"
                    style={{ color: 'var(--cds-text-secondary, #6f6f6f)', marginBlockStart: '0.5rem' }}
                  >
                    {t(
                      'payments.fdwNotVerified',
                      'Runtime status of wrappers, FDW connectivity, and Vault encryption is not verified by this page.',
                    )}
                  </p>
                </Tile>

                <Tile>
                  <h6>{t('payments.taxonomyHeading', 'Schema.org Taxonomy Mapping (contract example):')}</h6>
                  <CodeSnippet type="multi">
                    {`{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FinancialService",
      "name": "PagBank Multi-Tenant Gateway",
      "currenciesAccepted": "BRL",
      "paymentAccepted": ["PIX", "CreditCard", "DebitCard", "Boleto"]
    },
    {
      "@type": "Order",
      "orderStatus": "https://schema.org/OrderProcessing",
      "priceCurrency": "BRL"
    },
    {
      "@type": "PayAction",
      "recipient": "ConnectedSellerAccount",
      "instrument": "PaymentSplit"
    }
  ]
}`}
                  </CodeSnippet>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>

          {/* TAB 4: Audit Ledger */}
          <TabPanel>
            <h5>{t('payments.auditHeading', 'Real-Time Audit Ledger Events (public.audit_actions)')}</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBlockStart: '1rem' }}>
              {paymentLoadState.status !== 'ready' ? null : auditEvents.length === 0 ? (
                <p>{t('payments.noAuditEvents', 'No payment audit events recorded for this organization yet.')}</p>
              ) : (
                auditEvents.map((evt) => (
                  <Tile key={evt.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{evt.schema_type}</strong>
                      <Tag type={evt.action_status === 'CompletedActionStatus' ? 'green' : 'warm-gray'}>
                        {evt.action_status}
                      </Tag>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'gray', marginBlock: '0.25rem' }}>
                      Object: {evt.object_type} ({evt.object_id}) | Instrument: {evt.instrument}
                    </p>
                    <CodeSnippet type="inline">{JSON.stringify(evt.result || {})}</CodeSnippet>
                  </Tile>
                ))
              )}
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal New Charge */}
      <Modal
        open={isModalOpen}
        modalHeading={t('payments.modalHeading', 'Issue New PagBank Charge')}
        primaryButtonText={t('payments.modalSubmit', 'Generate Charge')}
        secondaryButtonText={t('payments.modalCancel', 'Cancel')}
        onRequestClose={() => setIsModalOpen(false)}
        onRequestSubmit={handleCreateCharge}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBlock: '0.5rem' }}>
          <TextInput
            id="amount-input"
            labelText={t('payments.amountLabel', 'Charge Amount (BRL)')}
            value={modalAmount}
            onChange={(e) => setModalAmount(e.target.value)}
            placeholder={t('payments.amountPlaceholder', '0.00')}
          />

          <RadioButtonGroup
            legendText={t('payments.methodLegend', 'Payment Method')}
            name="payment-method-group"
            valueSelected={modalMethod}
            onChange={(val) => setModalMethod(val)}
          >
            <RadioButton id="method-pix" labelText={t('payments.methodPix', 'Instant PIX (EMV QR Code)')} value="PIX" />
            <RadioButton id="method-card" labelText={t('payments.methodCard', 'Credit Card')} value="CREDIT_CARD" />
            <RadioButton id="method-boleto" labelText={t('payments.methodBoleto', 'Boleto Bancario')} value="BOLETO" />
          </RadioButtonGroup>

          <TextInput
            id="customer-name"
            labelText={t('payments.customerName', 'Customer Name')}
            value={modalCustomerName}
            onChange={(e) => setModalCustomerName(e.target.value)}
          />

          <TextInput
            id="customer-email"
            labelText={t('payments.customerEmail', 'Customer Email')}
            value={modalCustomerEmail}
            onChange={(e) => setModalCustomerEmail(e.target.value)}
          />

          {sellers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="cds--label" htmlFor="seller-select">
                {t('payments.sellerSplitLabel', 'Seller for Payment Split (Optional)')}
              </label>
              <select
                id="seller-select"
                className="cds--select-input"
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
              >
                <option value="">{t('payments.noSplit', 'None (100% Platform Tenant)')}</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.seller_legal_name} ({s.pagbank_account_id})
                  </option>
                ))}
              </select>

              {selectedSellerId && (
                <TextInput
                  id="split-pct-input"
                  labelText={t('payments.commissionLabel', 'Platform Commission (%)')}
                  value={splitPct}
                  onChange={(e) => setSplitPct(e.target.value)}
                  placeholder="10"
                />
              )}
            </div>
          )}
        </div>
      </Modal>

      <Footer />
    </PageLayout>
  );
}
