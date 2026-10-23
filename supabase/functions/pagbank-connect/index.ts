/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAllowedRedirectUri } from '../_shared/pagbank-security.ts';

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

    // 1. Authenticated client to check user permissions
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

    // Service client for privileged multi-tenant operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = req.method === 'POST' ? await req.json() : {};
    const action = body.action ?? 'get_authorize_url';
    const organizationId = body.organizationId;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify user belongs to the requested organization
    const { data: isMember, error: membershipError } = await supabaseUser.rpc('is_org_member', {
      p_org_id: organizationId,
    });
    if (membershipError || !isMember) {
      return new Response(JSON.stringify({ error: 'Access denied: not a member of organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch Gateway configuration for this tenant
    const { data: gatewayConfig, error: gatewayError } = await supabaseAdmin
      .from('payment_gateway_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (gatewayError) {
      return new Response(JSON.stringify({ error: `Failed to load gateway config: ${gatewayError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const env = gatewayConfig?.environment ?? 'sandbox';
    const isSandbox = env === 'sandbox';
    const authBaseUrl = isSandbox ? 'https://connect.sandbox.pagseguro.uol.com.br' : 'https://connect.pagbank.com.br';
    const apiBaseUrl = isSandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';

    const clientId = Deno.env.get('PAGBANK_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('PAGBANK_CLIENT_SECRET') || '';

    // P0 SECURITY ENFORCEMENT:
    // Disallow placeholder credentials. Real PagBank credentials must be configured.
    const hasValidCredentials =
      Boolean(clientId) &&
      Boolean(clientSecret) &&
      clientId !== 'sandbox-client-id' &&
      clientSecret !== 'sandbox-client-secret';

    // 1. Generate Connect Authorization URL
    if (action === 'get_authorize_url') {
      if (!hasValidCredentials) {
        return new Response(
          JSON.stringify({
            error:
              'PagBank Connect OAuth credentials (PAGBANK_CLIENT_ID / PAGBANK_CLIENT_SECRET) are not configured. Fake OAuth flows are blocked.',
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const defaultOrigin =
        Deno.env.get('ENVIRONMENT') === 'local' ? 'http://localhost:5173' : 'https://generative-os-bay.vercel.app';
      const redirectUri = body.redirectUri || `${req.headers.get('origin') || defaultOrigin}/payments?connect=callback`;

      if (!isAllowedRedirectUri(redirectUri, Deno.env.get('ALLOWED_REDIRECT_ORIGINS'), Deno.env.get('ENVIRONMENT'))) {
        return new Response(
          JSON.stringify({ error: `Redirect URI is not in the approved allowlist: ${redirectUri}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const scope = body.scope || 'payments.read payments.create recurring.read recurring.create';

      // Generate cryptographically random state parameter (32 bytes Base64URL)
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const nonce = btoa(String.fromCharCode(...randomBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const timestamp = Date.now();
      const state = `${organizationId}:${user.id}:${timestamp}:${nonce}`;

      // Persist state in audit_actions to enforce single-use, non-expired, and tenant/user binding
      const { error: insertStateErr } = await supabaseAdmin.from('audit_actions').insert({
        schema_type: 'AuthorizeAction',
        organization_id: organizationId,
        workspace_id: body.workspaceId || null,
        agent_id: user.id,
        action_status: 'PotentialActionStatus',
        object_type: 'OAuthState',
        instrument: 'pagbank_connect_oauth_state',
        result: {
          state,
          nonce,
          redirectUri,
          expires_at: new Date(timestamp + 600000).toISOString(),
        },
      });

      if (insertStateErr) {
        return new Response(JSON.stringify({ error: `Failed to persist OAuth state: ${insertStateErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const authorizeUrl = `${authBaseUrl}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
        clientId,
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

      return new Response(JSON.stringify({ authorizeUrl, state, environment: env }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Exchange Authorization Code for Access & Refresh Tokens
    if (action === 'exchange_code') {
      const { code, state, redirectUri, workspaceId } = body;
      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing code parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!state || typeof state !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing or invalid state parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!redirectUri || typeof redirectUri !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing or invalid redirectUri parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Parse and validate state format: {orgId}:{userId}:{timestamp}:{nonce}
      const parts = state.split(':');
      if (parts.length < 4) {
        return new Response(JSON.stringify({ error: 'Malformed OAuth state parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const [stateOrgId, stateUserId, stateTimestampStr] = parts;
      const stateTimestamp = parseInt(stateTimestampStr, 10);
      if (stateOrgId !== organizationId || stateUserId !== user.id) {
        return new Response(JSON.stringify({ error: 'OAuth state tenant/user mismatch' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Expire state after 10 minutes (600,000 ms)
      if (Date.now() - stateTimestamp > 600000 || stateTimestamp > Date.now() + 60000) {
        return new Response(JSON.stringify({ error: 'OAuth state expired' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify state was registered in audit_actions and has not been consumed (single-use / replay protection)
      const { data: stateRows, error: stateQueryErr } = await supabaseAdmin
        .from('audit_actions')
        .select('id, result')
        .eq('schema_type', 'AuthorizeAction')
        .eq('instrument', 'pagbank_connect_oauth_state')
        .eq('organization_id', organizationId)
        .eq('agent_id', user.id)
        .eq('action_status', 'PotentialActionStatus')
        .order('start_time', { ascending: false })
        .limit(10);

      const matchedState = stateRows?.find((r) => r.result?.state === state);
      if (stateQueryErr || !matchedState) {
        return new Response(JSON.stringify({ error: 'Invalid, already consumed, or unrecorded OAuth state' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isAllowedRedirectUri(redirectUri, Deno.env.get('ALLOWED_REDIRECT_ORIGINS'), Deno.env.get('ENVIRONMENT'))) {
        return new Response(
          JSON.stringify({ error: `Redirect URI is not in the approved allowlist: ${redirectUri}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (matchedState.result?.redirectUri && matchedState.result.redirectUri !== redirectUri) {
        return new Response(JSON.stringify({ error: 'redirectUri mismatch against initial authorization request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Atomic compare-and-swap consumption: update ONLY if STILL 'PotentialActionStatus'
      const { data: updatedRows, error: consumeErr } = await supabaseAdmin
        .from('audit_actions')
        .update({
          action_status: 'CompletedActionStatus',
          previous_value: { consumed_at: new Date().toISOString() },
        })
        .eq('id', matchedState.id)
        .eq('action_status', 'PotentialActionStatus')
        .select('id');

      if (consumeErr || !updatedRows || updatedRows.length !== 1) {
        return new Response(
          JSON.stringify({ error: 'OAuth state already consumed or concurrent callback in progress' }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (!hasValidCredentials) {
        return new Response(
          JSON.stringify({
            error:
              'PagBank Connect OAuth credentials are not configured. Cannot perform code exchange without valid PSP client keys.',
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Execute live OAuth code exchange with PagBank
      const tokenResp = await fetch(`${apiBaseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        console.error('PagBank OAuth token error:', tokenResp.status, errText);
        return new Response(JSON.stringify({ error: `PagBank OAuth token exchange rejected: ${errText}` }), {
          status: tokenResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenData = await tokenResp.json();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 2592000) * 1000).toISOString();

      // Upsert connected seller account only upon genuine PSP authorization
      const { data: sellerAccount, error: sellerError } = await supabaseAdmin
        .from('connected_seller_accounts')
        .upsert(
          {
            organization_id: organizationId,
            workspace_id: workspaceId || null,
            seller_person_id: user.id,
            pagbank_account_id: tokenData.account_id,
            seller_email: tokenData.seller_email || user.email,
            seller_tax_id: tokenData.seller_tax_id,
            seller_legal_name: tokenData.seller_name || 'Connected Seller Account',
            authorization_status: 'authorized',
            auth_type: 'authorization_code',
            access_token_expires_at: expiresAt,
            vault_refresh_token_key: tokenData.refresh_token ? `pagbank_seller_refresh_${tokenData.account_id}` : null,
          },
          { onConflict: 'organization_id,pagbank_account_id' },
        )
        .select()
        .single();

      if (sellerError) {
        return new Response(JSON.stringify({ error: `Failed to save seller account: ${sellerError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Record Schema.org AuthorizeAction in audit stream
      await supabaseAdmin.from('audit_actions').insert({
        schema_type: 'AuthorizeAction',
        organization_id: organizationId,
        workspace_id: workspaceId || null,
        agent_id: user.id,
        action_status: 'CompletedActionStatus',
        object_type: 'ConnectedSellerAccount',
        object_id: sellerAccount.id,
        instrument: 'pagbank_connect_oauth',
        result: {
          '@context': 'https://schema.org',
          '@type': 'AuthorizeAction',
          recipient: tokenData.account_id,
          recipientEmail: tokenData.seller_email || user.email,
          status: 'authorized',
        },
      });

      return new Response(JSON.stringify({ success: true, sellerAccount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. List Connected Sellers for Organization
    if (action === 'list_sellers') {
      const { data: sellers, error: listError } = await supabaseAdmin
        .from('connected_seller_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ sellers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
