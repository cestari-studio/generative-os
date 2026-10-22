/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  VALID_PAGBANK_STATUSES,
  TERMINAL_STATUSES,
  derToP1363,
  verifyPagBankEcdsaSignatures,
  isValidStatusTransition,
} from '../_shared/pagbank-security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payload-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const pagbankPublicKey = Deno.env.get('PAGBANK_PUBLIC_KEY') ?? '';

    // Read raw body bytes strictly before parsing
    const rawBuffer = await req.arrayBuffer();
    const rawBytes = new Uint8Array(rawBuffer);
    const payloadSignature = req.headers.get('x-payload-signature');

    // P0 SECURITY ENFORCEMENT:
    // If PagBank ECDSA public key is not configured, FAIL CLOSED.
    // Never process or mutate database when authenticity cannot be cryptographically proven.
    if (!pagbankPublicKey) {
      console.warn('PagBank webhook received, but PAGBANK_PUBLIC_KEY is not configured. Rejecting untrusted payload.');
      return new Response(
        JSON.stringify({
          error: 'Webhook verification key not configured on server. Rejecting untrusted payload.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!payloadSignature) {
      console.warn('PagBank webhook rejected: missing x-payload-signature header.');
      return new Response(
        JSON.stringify({
          error: 'Missing required x-payload-signature header.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Verify ECDSA cryptographic signature over raw request body bytes
    const isValidSignature = await verifyPagBankEcdsaSignatures(rawBytes, payloadSignature, pagbankPublicKey);

    if (!isValidSignature) {
      console.warn('PagBank webhook rejected: cryptographic signature verification failed.');
      return new Response(
        JSON.stringify({
          error: 'Invalid webhook signature. Payload integrity and authenticity could not be verified.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    let body: Record<string, unknown>;
    try {
      const rawText = new TextDecoder().decode(rawBytes);
      body = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chargeId = (body.id || body.charge_id) as string | undefined;
    if (!chargeId) {
      return new Response(JSON.stringify({ error: 'Missing charge id in webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Never default status to 'PAID'. Reject payload without recognized status.
    const rawStatus = body.status as string | undefined;
    if (!rawStatus) {
      return new Response(JSON.stringify({ error: 'Missing required status field in webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const status = String(rawStatus).toUpperCase();
    if (!VALID_PAGBANK_STATUSES.has(status)) {
      return new Response(JSON.stringify({ error: `Unrecognized status value: ${status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Locate charge in database
    const { data: existingCharge, error: findError } = await supabaseAdmin
      .from('payment_charges')
      .select('*, payment_orders!inner(id, organization_id, status)')
      .eq('pagbank_charge_id', chargeId)
      .maybeSingle();

    if (findError) {
      return new Response(JSON.stringify({ error: `Database error: ${findError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!existingCharge) {
      return new Response(JSON.stringify({ received: true, warning: 'Charge not found locally' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const organizationId = existingCharge.organization_id;
    const orderId = existingCharge.order_id;

    // 2. Monotonic State Machine & Idempotency check:
    // If charge has already reached this status, return idempotent success without duplicate actions.
    if (existingCharge.status === status) {
      return new Response(
        JSON.stringify({
          received: true,
          idempotent: true,
          chargeId,
          status,
          orderId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Monotonic State Machine validation via shared security module
    const transitionCheck = isValidStatusTransition(existingCharge.status, status);
    if (!transitionCheck.allowed) {
      console.warn(`Attempted illegal status transition: ${transitionCheck.reason}`);
      return new Response(
        JSON.stringify({
          error: transitionCheck.reason,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 3. Update charge record
    const isPaid = status === 'PAID';
    const paidAmount = isPaid ? existingCharge.amount_cents : 0;

    const { error: updateChargeErr } = await supabaseAdmin
      .from('payment_charges')
      .update({
        status,
        paid_amount_cents: paidAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCharge.id);

    if (updateChargeErr) {
      return new Response(JSON.stringify({ error: updateChargeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Update order status monotonically
    if (isPaid) {
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Release split custody only upon verified authoritative payment
      await supabaseAdmin
        .from('payment_splits')
        .update({
          released_at: new Date().toISOString(),
        })
        .eq('charge_id', existingCharge.id)
        .eq('is_custody', true);
    } else if (status === 'DECLINED' || status === 'CANCELED') {
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    }

    // 5. Emit Schema.org UpdateAction in audit stream
    await supabaseAdmin.from('audit_actions').insert({
      schema_type: 'UpdateAction',
      organization_id: organizationId,
      action_status: 'CompletedActionStatus',
      object_type: 'PaymentCharge',
      object_id: existingCharge.id,
      instrument: 'pagbank_webhook',
      result: {
        '@context': 'https://schema.org',
        '@type': 'UpdateAction',
        chargeId,
        previousStatus: existingCharge.status,
        newStatus: status,
        paidAmountCents: paidAmount,
        signatureVerified: true,
      },
    });

    return new Response(
      JSON.stringify({
        received: true,
        chargeId,
        status,
        orderId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err: unknown) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
