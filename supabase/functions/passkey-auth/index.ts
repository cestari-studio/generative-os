/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function generateRandomChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = req.method === 'POST' ? await req.json() : {};
    const action = body.action ?? 'list';

    // 1. WebAuthn Challenge generation — authenticated users only.
    // A challenge is bound to the identified user and ceremony; issuing one to
    // an anonymous caller would let anyone mint unbound challenges (§9.2).
    if (action === 'challenge') {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Authentication required to request a WebAuthn challenge.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const challenge = generateRandomChallenge();
      const rpId = body.rpId ?? new URL(req.url).hostname;
      const ceremonyType = body.ceremony === 'authentication' ? 'authentication' : 'registration';

      await supabase.from('webauthn_challenges').insert({
        person_id: user.id,
        challenge,
        ceremony_type: ceremonyType,
        rp_id: rpId,
        origin: req.headers.get('origin') ?? `https://${rpId}`,
      });

      return new Response(
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'AuthorizeAction',
          challenge,
          rp: { name: 'genOS', id: rpId },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          timeout: 60000,
          attestation: 'none',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 2. Register passkey credential - disabled until full WebAuthn attestation ceremony is implemented
    if (action === 'register') {
      return new Response(
        JSON.stringify({
          error:
            'Passkey registration without full FIDO2 attestation and challenge verification is disabled. Feature is experimental and scoped out of production release.',
          registered: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 3. SEC-06 P0 FIX: Disallow insecure pseudo-authentication based on email or credential ID matching.
    // True WebAuthn authentication must use cryptographic assertion verification or native Supabase Auth Passkeys.
    if (action === 'verify' || action === 'authenticate') {
      return new Response(
        JSON.stringify({
          error:
            'Insecure pseudo-passkey verification is disabled. WebAuthn authentication requires cryptographic assertion verification via native Supabase Auth Passkeys or standard FIDO2 ceremony.',
          verified: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 4. List passkey credentials - requires authenticated session
    if (action === 'list') {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Authentication required.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('passkey_credentials')
        .select('*')
        .eq('person_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          credentials: data ?? [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(JSON.stringify({ error: `Unsupported passkey action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
