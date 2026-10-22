/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateOrderInput } from '../_shared/pagbank-security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1. Authenticated user verification
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: valid user token required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    const {
      organizationId,
      workspaceId,
      projectId,
      quoteId,
      referenceId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      customer,
      items = [],
      paymentMethod = 'PIX',
      card,
      connectedSellerId,
      customSplitPercentage,
    } = body;

    if (!organizationId || !quoteId) {
      return new Response(JSON.stringify({ error: 'organizationId and quoteId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify tenant membership
    const { data: isMember, error: membershipError } = await supabaseUser.rpc('is_org_member', {
      p_org_id: organizationId,
    });
    if (membershipError || !isMember) {
      return new Response(JSON.stringify({ error: 'Access denied: not an organization member' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2a. Idempotency: a retry with the same reference returns the existing
    // non-failed order — never a duplicate charge. Failed orders do not
    // replay; the caller must issue a new quote/reference for a new attempt.
    const { data: existingOrder } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('reference_id', referenceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder && !['failed', 'cancelled', 'declined'].includes(existingOrder.status ?? '')) {
      return new Response(
        JSON.stringify({
          success: true,
          idempotent_replay: true,
          orderId: existingOrder.id,
          pagbankOrderId: existingOrder.pagbank_order_id,
          status: existingOrder.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2b. Bind the charge to a server-issued quote. The browser never sets the
    // final amount: consume_quote validates tenant ownership, status and
    // expiry, atomically binds the quote to THIS payment reference (single
    // use) and replays idempotently for the same reference.
    const { data: quoteResult, error: quoteError } = await supabaseAdmin.rpc('consume_quote', {
      p_quote_id: quoteId,
      p_organization_id: organizationId,
      p_reference: referenceId,
    });

    if (quoteError || !quoteResult?.total_cents) {
      return new Response(
        JSON.stringify({
          error: `Invalid, expired or already-consumed quote: ${quoteError?.message ?? 'not consumable'}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // The authoritative charge amount comes from the consumed quote only.
    const amountCents: number = quoteResult.total_cents;

    // 3. Load Gateway Config for tenant
    const { data: gatewayConfig } = await supabaseAdmin
      .from('payment_gateway_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    const env = gatewayConfig?.environment ?? 'sandbox';
    const isSandbox = env === 'sandbox';
    const pagbankApiBase = isSandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';

    const pagbankToken = Deno.env.get('PAGBANK_TOKEN') ?? '';

    // P0 SECURITY & INTEGRITY ENFORCEMENT:
    // Simulated synthetic transactions are completely disallowed.
    // If PSP credentials are not available, fail explicitly with 503 instead of fabricating fake orders/EMV/barcodes.
    if (!pagbankToken) {
      return new Response(
        JSON.stringify({
          error:
            'PagBank PSP gateway token (PAGBANK_TOKEN) is not configured. Synthetic mock charges are strictly disallowed.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 4. Strict input validation BEFORE any database write or RPC call
    const validation = validateOrderInput({ amountCents, customer, items });
    if (!validation.valid || !validation.cleanCustomer || !validation.cleanItems) {
      return new Response(
        JSON.stringify({
          error: validation.error || 'Invalid order parameters.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { cleanCustomer, cleanItems } = validation;

    // 5. Create Order in database via RPC strictly with validated customer and items (no fallbacks)
    const { data: orderData, error: orderRpcError } = await supabaseAdmin.rpc('create_pagbank_order', {
      p_organization_id: organizationId,
      p_workspace_id: workspaceId || null,
      p_project_id: projectId || null,
      p_amount_cents: amountCents,
      p_reference_id: referenceId,
      p_customer_snapshot: cleanCustomer,
      p_items_snapshot: cleanItems,
    });

    if (orderRpcError) {
      return new Response(JSON.stringify({ error: `Order creation failed: ${orderRpcError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderId = orderData.order_id;

    const pagbankPayload: Record<string, unknown> = {
      reference_id: referenceId,
      customer: cleanCustomer,
      items: cleanItems,
      notification_urls: [`${supabaseUrl}/functions/v1/pagbank-webhook`],
    };

    if (paymentMethod === 'PIX') {
      pagbankPayload.qr_codes = [
        {
          amount: { value: amountCents },
          expiration_date: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
        },
      ];
    } else if (paymentMethod === 'BOLETO') {
      pagbankPayload.charges = [
        {
          reference_id: `charge_${referenceId}`,
          amount: { value: amountCents, currency: 'BRL' },
          payment_method: {
            type: 'BOLETO',
            boleto: {
              due_date: new Date(Date.now() + 3600 * 1000 * 72).toISOString().split('T')[0],
              instruction_lines: {
                line_1: 'Pagamento de serviço multi-tenant',
                line_2: 'Não receber após o vencimento',
              },
              holder: customer,
            },
          },
        },
      ];
    } else if (paymentMethod === 'CREDIT_CARD' && card) {
      pagbankPayload.charges = [
        {
          reference_id: `charge_${referenceId}`,
          amount: { value: amountCents, currency: 'BRL' },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: card.installments || 1,
            capture: true,
            card: {
              number: card.number,
              exp_month: card.exp_month,
              exp_year: card.exp_year,
              security_code: card.security_code,
              holder: { name: card.holder_name || customer?.name },
            },
          },
        },
      ];
    }

    // 6. Execute real call to PagBank Orders API
    const pspResponse = await fetch(`${pagbankApiBase}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pagbankToken}`,
      },
      body: JSON.stringify(pagbankPayload),
    });

    if (!pspResponse.ok) {
      const pspErrorText = await pspResponse.text();
      console.error('PagBank Orders API Error:', pspResponse.status, pspErrorText);

      // Recovery: mark the order failed so the attempt is auditable and does
      // not block retry. The consumed quote can then be explicitly released
      // (release_consumed_quote) because there is no active order, or the
      // operator issues a new quote for a new attempt. Never duplicate-charge.
      await supabaseAdmin
        .from('payment_orders')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      return new Response(
        JSON.stringify({
          error: `PagBank PSP rejected order creation (${pspResponse.status})`,
          details: pspErrorText,
          orderId,
          orderStatus: 'failed',
          recovery:
            'The quote bound to this attempt may be released via release_consumed_quote, or issue a new quote with a new reference.',
        }),
        {
          status: pspResponse.status >= 500 ? 502 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const pspData = await pspResponse.json();
    const pagbankOrderId = pspData.id;
    if (!pagbankOrderId) {
      return new Response(JSON.stringify({ error: 'PagBank PSP order creation response missing authoritative id' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firstCharge = pspData.charges?.[0];
    const pagbankChargeId = firstCharge?.id || (paymentMethod === 'PIX' ? pagbankOrderId : null);
    if (!pagbankChargeId) {
      return new Response(
        JSON.stringify({
          error: `PagBank PSP returned order without authoritative charge id for payment method ${paymentMethod}`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const initialStatus = firstCharge?.status || (paymentMethod === 'PIX' ? 'WAITING_PAYMENT' : 'PENDING');

    const pixData = pspData.qr_codes?.[0];
    const pixEmv = pixData?.text || null;
    const pixQrCodeUrl =
      pixData?.links?.find((l: { rel: string; href: string }) => l.rel === 'QRCODE.PNG')?.href || null;
    const pixExpirationDate = pixData?.expiration_date || null;

    const boletoData = firstCharge?.payment_method?.boleto;
    const boletoBarcode = boletoData?.barcode || null;
    const boletoFormattedBarcode = boletoData?.formatted_barcode || null;
    const boletoPdfUrl =
      firstCharge?.links?.find((l: { rel: string; href: string }) => l.rel === 'BOLETO.PDF')?.href || null;
    const boletoDate = boletoData?.due_date || null;

    // 7. Insert real charge record with status returned by PSP.
    // The PSP fee is NOT estimated here — it is reconciled from webhook
    // settlement data. fee_amount_cents stays null until reconciliation
    // (unless the tenant gateway config declares an explicit estimate in BPS).
    const configuredFeeBps =
      typeof gatewayConfig?.estimated_fee_bps === 'number' ? gatewayConfig.estimated_fee_bps : null;
    const feeAmountCents = configuredFeeBps !== null ? Math.round((amountCents * configuredFeeBps) / 10000) : null;

    const { data: chargeRecord, error: chargeError } = await supabaseAdmin
      .from('payment_charges')
      .insert({
        order_id: orderId,
        organization_id: organizationId,
        pagbank_charge_id: pagbankChargeId,
        payment_method: paymentMethod,
        status: initialStatus,
        amount_cents: amountCents,
        paid_amount_cents: 0,
        fee_amount_cents: feeAmountCents,
        pix_emv: pixEmv,
        pix_qr_code_url: pixQrCodeUrl,
        pix_expiration_date: pixExpirationDate,
        boleto_barcode: boletoBarcode,
        boleto_formatted_barcode: boletoFormattedBarcode,
        boleto_pdf_url: boletoPdfUrl,
        boleto_due_date: boletoDate,
        card_brand: firstCharge?.payment_method?.card?.brand || null,
        card_last4: firstCharge?.payment_method?.card?.last4 || null,
        installments: card?.installments || 1,
      })
      .select()
      .single();

    if (chargeError) {
      return new Response(JSON.stringify({ error: `Failed to insert charge: ${chargeError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 8. Update Order status and link the authorizing quote
    await supabaseAdmin
      .from('payment_orders')
      .update({
        pagbank_order_id: pagbankOrderId,
        quote_id: quoteId,
        status: initialStatus === 'PAID' ? 'paid' : 'waiting_payment',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // 9. Process Multi-Tenant Split if Connected Seller specified
    let splitRecord = null;
    if (connectedSellerId) {
      const { data: seller } = await supabaseAdmin
        .from('connected_seller_accounts')
        .select('*')
        .eq('id', connectedSellerId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seller) {
        // Split percentage must be explicit: per-request or tenant gateway
        // config. There is no silent default — a split without an approved
        // rule is rejected instead of guessing a percentage.
        const splitValueRaw = customSplitPercentage ?? gatewayConfig?.default_split_percentage ?? null;
        if (splitValueRaw === null || Number.isNaN(Number(splitValueRaw))) {
          return new Response(
            JSON.stringify({
              error:
                'Split percentage is not configured for this tenant. Set customSplitPercentage or configure default_split_percentage before charging with a connected seller.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        const splitPct = Number(splitValueRaw);
        const platformShare = Math.round((amountCents * splitPct) / 100);
        const sellerShare = amountCents - platformShare;

        const { data: split, error: splitErr } = await supabaseAdmin
          .from('payment_splits')
          .insert({
            charge_id: chargeRecord.id,
            organization_id: organizationId,
            connected_seller_id: seller.id,
            recipient_account_id: seller.pagbank_account_id,
            split_type: 'percentage',
            split_value: 100 - splitPct,
            amount_cents: sellerShare,
            is_liable: false,
            is_custody: true,
          })
          .select()
          .single();

        if (!splitErr) {
          splitRecord = split;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        pagbankOrderId,
        charge: chargeRecord,
        split: splitRecord,
        pix: pixEmv ? { emv: pixEmv, qrCodeUrl: pixQrCodeUrl, expirationDate: pixExpirationDate } : null,
        boleto: boletoBarcode ? { barcode: boletoFormattedBarcode, pdfUrl: boletoPdfUrl, dueDate: boletoDate } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
