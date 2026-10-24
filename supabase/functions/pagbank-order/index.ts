/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateOrderInput } from '../_shared/pagbank-security.ts';
import { isOrgMemberViaDataApi } from '../_shared/org-membership.ts';
import { buildPspIdempotencyKey, fingerprintPayload, submitOrderToPsp } from '../_shared/pagbank-psp.ts';

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

    // 2. Verify tenant membership via the Data API (app_private RPCs are NOT
    // exposed via PostgREST and would 404 — see _shared/org-membership).
    const isMember = await isOrgMemberViaDataApi(supabaseUser, organizationId);
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Access denied: not an organization member' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2a. Bind the charge to a server-issued quote. The browser never sets the
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

    // 5. Atomic create-or-get of the payment order (one charge per quote).
    // The unique partial index on quote_id makes this claim atomic: exactly
    // one concurrent caller wins; the others replay the existing order.
    // The amount comes from the consumed quote, never from the client.
    const { data: claimResult, error: claimError } = await supabaseAdmin.rpc('claim_pagbank_order', {
      p_organization_id: organizationId,
      p_workspace_id: workspaceId || null,
      p_project_id: projectId || null,
      p_quote_id: quoteId,
      p_reference_id: referenceId,
      p_customer_person_id: user.id,
      p_customer_snapshot: cleanCustomer,
      p_items_snapshot: cleanItems,
    });

    if (claimError || !claimResult?.order_id) {
      return new Response(
        JSON.stringify({ error: `Order claim failed: ${claimError?.message ?? 'could not claim order'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const orderId = claimResult.order_id;
    const orderClaimed = claimResult.claimed === true;

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

    // 6. Persist the PSP idempotency key + payload fingerprint BEFORE the
    // first submission. Every retry of this attempt reuses the SAME key and
    // the SAME effective payload; attach_psp_idempotency rejects a retry with
    // an incompatible fingerprint for the same order.
    const pspIdempotencyKey = buildPspIdempotencyKey(referenceId);
    const payloadFingerprint = await fingerprintPayload(pagbankPayload);

    const { error: attachError } = await supabaseAdmin.rpc('attach_psp_idempotency', {
      p_order_id: orderId,
      p_organization_id: organizationId,
      p_psp_idempotency_key: pspIdempotencyKey,
      p_psp_payload_fingerprint: payloadFingerprint,
    });

    if (attachError) {
      return new Response(
        JSON.stringify({
          error: `PSP idempotency conflict: ${attachError.message}`,
          recovery:
            'This order already has a different PSP idempotency key/payload. Issue a new quote with a new reference.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 7. Submit to the PSP exactly once with the persisted idempotency key.
    // On an ambiguous outcome (timeout/transport failure/5xx) we do NOT mark
    // the order failed and do NOT release the quote: the PSP may have created
    // the charge. The order stays non-terminal ('draft'); a retry with the
    // same reference replays the SAME key + payload, so the PSP returns the
    // original result instead of double-charging (x-idempotency-key, 48h).
    const pspOutcome = await submitOrderToPsp(fetch, {
      url: `${pagbankApiBase}/orders`,
      token: pagbankToken,
      idempotencyKey: pspIdempotencyKey,
      payload: pagbankPayload,
    });

    if (pspOutcome.kind === 'ambiguous') {
      return new Response(
        JSON.stringify({
          error: 'PSP submission outcome is unknown (timeout, transport failure or 5xx). Not marking failed.',
          reason: pspOutcome.reason,
          orderId,
          orderStatus: 'draft',
          recovery:
            'Retry with the SAME reference: the persisted PSP idempotency key and payload are reused, so the PSP returns the original result. Do NOT issue a new quote or change the payload.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (pspOutcome.kind === 'definitive') {
      // Clear business rejection (4xx): safe to cancel the order; the quote
      // may then be explicitly released (no active order) or a new quote issued.
      await supabaseAdmin
        .from('payment_orders')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      return new Response(
        JSON.stringify({
          error: `PagBank PSP rejected order creation (${pspOutcome.status})`,
          details: pspOutcome.body,
          orderId,
          orderStatus: 'canceled',
          recovery:
            'Definitive rejection. The quote may be released via release_consumed_quote, or issue a new quote with a new reference.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const pspData = pspOutcome.body as {
      id?: string;
      charges?: Array<{
        id?: string;
        status?: string;
        payment_method?: { boleto?: Record<string, unknown>; card?: { brand?: string; last4?: string } };
        links?: Array<{ rel: string; href: string }>;
      }>;
      qr_codes?: Array<{ text?: string; links?: Array<{ rel: string; href: string }>; expiration_date?: string }>;
    };

    const pagbankOrderId = pspData.id;
    if (!pagbankOrderId) {
      return new Response(
        JSON.stringify({
          error: 'PagBank PSP response missing authoritative order id. Not marking failed.',
          orderId,
          orderStatus: 'draft',
          recovery: 'Retry with the SAME reference to reconcile with the PSP using the persisted idempotency key.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const firstCharge = pspData.charges?.[0];
    const pagbankChargeId = firstCharge?.id || (paymentMethod === 'PIX' ? pagbankOrderId : null);
    if (!pagbankChargeId) {
      return new Response(
        JSON.stringify({
          error: `PagBank PSP returned order without authoritative charge id for payment method ${paymentMethod}. Not marking failed.`,
          orderId,
          orderStatus: 'draft',
          recovery: 'Retry with the SAME reference to reconcile with the PSP using the persisted idempotency key.',
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
    const boletoBarcode = (boletoData?.barcode as string) || null;
    const boletoFormattedBarcode = (boletoData?.formatted_barcode as string) || null;
    const boletoPdfUrl =
      firstCharge?.links?.find((l: { rel: string; href: string }) => l.rel === 'BOLETO.PDF')?.href || null;
    const boletoDate = (boletoData?.due_date as string) || null;

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
        orderClaimed,
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
