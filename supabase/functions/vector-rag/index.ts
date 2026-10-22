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

function computeDeterministicEmbedding(text: string): number[] {
  const dims = 384;
  const vec = new Float64Array(dims);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\u00C0-\u017F\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const primaryIdx = Math.abs(hash) % dims;
    const secondaryIdx = Math.abs(Math.imul(hash, 31)) % dims;
    vec[primaryIdx] += 1.0;
    vec[secondaryIdx] += 0.5;
  }

  let norm = 0;
  for (let i = 0; i < dims; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1. Authenticate caller with user JWT
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

    const body = req.method === 'POST' ? await req.json() : {};
    const action = body.action ?? 'search';
    const organizationId = body.organizationId;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Authorize caller against tenant membership
    const { data: isMember, error: membershipError } = await supabaseUser.rpc('is_org_member', {
      p_org_id: organizationId,
    });

    if (membershipError || !isMember) {
      return new Response(JSON.stringify({ error: 'Access denied: not an organization member' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const workspaceId = body.workspaceId ?? null;
    const projectId = body.projectId ?? null;

    if (action === 'ingest') {
      const name = body.name ?? 'Untitled Knowledge Document';
      const text = String(body.text ?? '');
      const visibilityScope = body.visibilityScope ?? 'project';
      const inLanguage = body.inLanguage ?? 'en';

      if (!text.trim()) {
        return new Response(JSON.stringify({ error: 'Document text cannot be empty' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: doc, error: docError } = await supabaseUser
        .from('knowledge_documents')
        .insert({
          organization_id: organizationId,
          workspace_id: workspaceId,
          project_id: projectId,
          visibility_scope: visibilityScope,
          name,
          description: text,
          in_language: inLanguage,
          content_size: text.length,
          indexing_status: 'ready',
        })
        .select()
        .single();

      if (docError) {
        return new Response(JSON.stringify({ error: docError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const paragraphs = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const chunks = paragraphs.length > 0 ? paragraphs : [text];

      const chunkRows = chunks.map((chunkText, idx) => ({
        document_id: doc.id,
        organization_id: organizationId,
        workspace_id: workspaceId,
        project_id: projectId,
        visibility_scope: visibilityScope,
        position: idx,
        text: chunkText,
        word_count: chunkText.split(/\s+/).filter(Boolean).length,
        embedding: computeDeterministicEmbedding(`${name} ${chunkText}`),
      }));

      const { error: chunkError } = await supabaseUser.from('knowledge_chunks').insert(chunkRows);

      if (chunkError) {
        return new Response(JSON.stringify({ error: chunkError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'DigitalDocument',
          document: doc,
          chunksIndexed: chunkRows.length,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const queryText = String(body.query ?? '');
    const queryEmbedding = computeDeterministicEmbedding(queryText);

    const { data, error } = await supabaseUser.rpc('match_knowledge_chunks', {
      p_query_embedding: queryEmbedding,
      p_organization_id: organizationId,
      p_workspace_id: workspaceId,
      p_project_id: projectId,
      p_match_threshold: Math.max(0, Math.min(1, Number(body.matchThreshold ?? 0.1))),
      p_match_count: Math.max(1, Math.min(50, Number(body.matchCount ?? 5))),
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
        '@type': 'SearchResultsPage',
        query: queryText,
        results: data ?? [],
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
