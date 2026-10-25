/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isOrgMemberViaDataApi } from '../_shared/org-membership.ts';

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
    const authHeader = req.headers.get('Authorization') ?? '';

    // Create user-scoped client carrying the caller's JWT
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body = req.method === 'POST' ? await req.json() : {};
    const action = body.action ?? 'resolve';

    const organizationId = body.organizationId;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const workspaceId = body.workspaceId ?? null;
    const projectId = body.projectId ?? null;
    const personId = body.personId ?? null;

    if (action === 'apply') {
      // 1. Enforce authenticated caller
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

      // 2. Validate tenant membership via the Data API (app_private RPCs are
      // NOT exposed via PostgREST and would 404 — see _shared/org-membership).
      const isMember = await isOrgMemberViaDataApi(supabaseUser, organizationId);

      if (!isMember) {
        return new Response(JSON.stringify({ error: 'Forbidden: not an organization member' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 3. Strict boolean parsing - avoid coercion of string "false" to true
      const clearChildOverrides = body.clearChildOverrides === true || body.clearChildOverrides === 'true';

      const { data, error } = await supabaseUser.rpc('apply_setting_cascade', {
        p_organization_id: organizationId,
        p_level: body.level ?? 'organization',
        p_property_id: body.propertyId,
        p_value: body.value,
        p_cascade_rule: body.cascadeRule ?? 'INHERIT_OVERRIDABLE',
        p_workspace_id: workspaceId,
        p_project_id: projectId,
        p_person_id: personId,
        p_clear_child_overrides: clearChildOverrides,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: error.message.includes('Access denied') ? 403 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve effective settings
    const { data, error } = await supabaseUser.rpc('resolve_effective_settings', {
      p_organization_id: organizationId,
      p_workspace_id: workspaceId,
      p_project_id: projectId,
      p_person_id: personId,
    });

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
        organizationId,
        workspaceId,
        projectId,
        itemListElement: data ?? [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
