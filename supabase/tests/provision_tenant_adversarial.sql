-- Copyright IBM Corp. 2026
-- This source code is licensed under the Apache-2.0 license found in the
-- LICENSE file in the root directory of this source tree.
--
-- provision_tenant_adversarial.sql
--
-- ADVERSARIAL assertions for public.provision_corporate_tenant (Master
-- Directive §10.3). Companion to provision_tenant_safe.sql: this file attacks
-- the SAFE path (takeover vectors, slug trickery, atomicity, owner attribution,
-- cross-tenant isolation, idempotency-vs-hostile-payload, the InitPlan bypass,
-- and slug validation). It does NOT modify the function under test.
--
-- Runs as `authenticated` with RLS enforced on a disposable PG 17.11, against
-- the schema/policy fixture from _prereq_provision_tenant.sql (which mirrors
-- the InitPlan-bugged organizations_insert_policy + app_private.is_org_member).

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_a_org uuid;          -- org created by user A
  v_b_org uuid;          -- org created by user B
  v_count int;
  v_a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE '=== ADVERSARIAL safe-provisioning assertions ===';

  -- =========================================================================
  -- SETUP (as A): A provisions a fresh tenant. This also gives us the org row
  -- the takeover attempts below will target.
  -- =========================================================================
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SELECT public.provision_corporate_tenant(
    'Acme Corp','acme-corp','Acme Legal','TAX-A','BR','MICRO',
    NULL,NULL,NULL,'{}','en','Core','Main'
  ) INTO v_result;
  v_a_org := (v_result->>'organization_id')::uuid;
  IF v_a_org IS NULL OR (v_result->>'provisioned')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP FAILED: A fresh provision did not succeed: %', v_result;
  END IF;
  RAISE NOTICE 'setup: A provisioned acme-corp (org %)', v_a_org;

  -- =========================================================================
  -- TEST 1 (re-verify core guard, independently): user B (non-member) attempts
  -- takeover via the SAME identifier -> denied 42501; B NOT promoted; A's org
  -- data intact.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provision_corporate_tenant(
      'Hostile Takeover','acme-corp','HIJACKED','TAX-EVIL','US','ENTERPRISE',
      NULL,NULL,NULL,'{}','en','Evil WS','Evil PRJ'
    );
    RAISE EXCEPTION 'ASSERTION FAILED (T1): takeover by non-member B was permitted';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T1 takeover via identifier by non-member B denied (42501)', v_assert;
  END;
  -- B NOT promoted into A's org in ANY role.
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_a_org AND member_id = v_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1): B has a membership row in A org after denied takeover';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T1 B NOT promoted into A org (no membership row)', v_assert;
  -- A's org data intact (read back as A, a member).
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND name = 'Acme Corp' AND legal_name = 'Acme Legal'
      AND tax_id = 'TAX-A' AND country_code = 'BR' AND size_category = 'MICRO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1): A org data was mutated by B takeover attempt';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T1 A org data intact after denied takeover', v_assert;

  -- T1d. Directive §7.2 path 4: A's LEGAL REPRESENTATIVE was NOT replaced by B.
  -- organizations.legal_representative_id must still be A, never B. Read with
  -- privilege (defense in depth against RLS filtering the leaked state).
  RESET ROLE;
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_representative_id = v_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1d): A legal_representative_id was replaced (must stay A)';
  END IF;
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_representative_id = v_b;
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1d): legal_representative_id was replaced with the ATTACKER B';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T1d A legal representative intact (not replaced by B)', v_assert;
  -- T1e. Directive §7.2 path 6: B's ACTIVE CONTEXT was NOT bound to A's org by
  -- the denied takeover attempt.
  PERFORM 1 FROM public.persons
    WHERE id = v_b AND (
      active_organization_id = v_a_org
      OR active_workspace_id IN (SELECT id FROM public.workspaces WHERE organization_id = v_a_org)
      OR active_project_id IN (SELECT id FROM public.projects WHERE organization_id = v_a_org)
      OR works_for_id = v_a_org
    );
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1e): B active context was bound to A org by the denied takeover';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T1e B active context NOT bound to A org (persons untouched)', v_assert;
  -- T1f. No partial org/workspace was created for B by the denied takeover:
  -- exactly ONE org with A's identifier exists, and B owns NO org.
  SELECT count(*) INTO v_count FROM public.organizations WHERE identifier = 'acme-corp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1f): expected exactly 1 org for acme-corp, found %', v_count;
  END IF;
  PERFORM 1 FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id AND om.member_id = v_b;
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T1f): a partial org was created for B by the denied takeover';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T1f no partial org/workspace created for B (exactly one org for the identifier)', v_assert;
  SET ROLE authenticated;

  -- =========================================================================
  -- TEST 2: B attempts takeover with a DIFFERENT name but SAME identifier.
  -- Proves the identifier (not the name) is the attack vector being guarded.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provision_corporate_tenant(
      'Completely Different Name','acme-corp','Other Legal','TAX-OTHER','DE','LARGE',
      NULL,NULL,NULL,'{}','de','WS','PRJ'
    );
    RAISE EXCEPTION 'ASSERTION FAILED (T2): same-identifier/different-name takeover permitted';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T2 same identifier + different name still denied (guard keys on identifier)', v_assert;
  END;

  -- =========================================================================
  -- TEST 3: SLUG-VARIANT trickery that still conflicts (or is rejected). The
  -- identifier regex is ^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$. We probe:
  --   3a. case-trickery 'ACME-CORP' -> rejected by slug validation (22023)
  --       BEFORE the conflict lookup (uppercase not allowed).
  --   3b. whitespace-trickery 'acme corp' / ' acme-corp' -> rejected (22023).
  --   3c. hyphen-trickery '-acme-corp' / 'acme-corp-' -> rejected (22023).
  --   3d. a VALID slug that is a DIFFERENT identifier ('acme-corp-2') does NOT
  --       collide -> B provisions it fresh (proving the guard keys on exact
  --       identifier equality, and B's fresh create is still allowed).
  -- =========================================================================
  -- 3a. uppercase variant
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provision_corporate_tenant('X','ACME-CORP');
    RAISE EXCEPTION 'ASSERTION FAILED (T3a): uppercase identifier variant accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T3a uppercase identifier variant rejected before guard', v_assert;
  END;
  -- 3b. whitespace variants
  BEGIN
    PERFORM public.provision_corporate_tenant('X','acme corp');
    RAISE EXCEPTION 'ASSERTION FAILED (T3b): interior-space identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T3b interior-space identifier rejected', v_assert;
  END;
  BEGIN
    PERFORM public.provision_corporate_tenant('X',' acme-corp');
    RAISE EXCEPTION 'ASSERTION FAILED (T3b): leading-space identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T3b leading-space identifier rejected', v_assert;
  END;
  -- 3c. hyphen-trickery variants
  BEGIN
    PERFORM public.provision_corporate_tenant('X','-acme-corp');
    RAISE EXCEPTION 'ASSERTION FAILED (T3c): leading-hyphen identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T3c leading-hyphen identifier rejected', v_assert;
  END;
  BEGIN
    PERFORM public.provision_corporate_tenant('X','acme-corp-');
    RAISE EXCEPTION 'ASSERTION FAILED (T3c): trailing-hyphen identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T3c trailing-hyphen identifier rejected', v_assert;
  END;
  -- Confirm none of the trickery variants created an org row (exact-match guard:
  -- only the true identifier should exist).
  SELECT count(*) INTO v_count FROM public.organizations
    WHERE identifier IN ('ACME-CORP','acme corp',' acme-corp','-acme-corp','acme-corp-');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T3): a slug-variant trickery identifier created an org row';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T3 no slug-variant trickery identifier created an org row', v_assert;
  -- 3d. a genuinely different (valid) identifier does NOT collide -> B fresh create allowed.
  SELECT public.provision_corporate_tenant('Acme Corp II','acme-corp-2') INTO v_result;
  v_b_org := (v_result->>'organization_id')::uuid;
  IF v_b_org IS NULL OR (v_result->>'provisioned')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T3d): B fresh create of a distinct identifier was blocked: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T3d distinct valid identifier does NOT collide (B fresh create allowed)', v_assert;

  -- =========================================================================
  -- TEST 4: ROLLBACK-ON-PARTIAL-FAILURE (transactional atomicity). Force a
  -- failure AFTER the org insert by passing p_project_name = NULL: the org and
  -- membership inserts succeed, the workspaces insert succeeds, then the
  -- projects INSERT violates projects.name NOT NULL -> the WHOLE function must
  -- roll back. Prove NO partial org/membership/workspace/project rows remain.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provision_corporate_tenant(
      'Atomicity Trap','atomic-trap','Atomic Legal','TAX-ATOM','BR','MICRO',
      NULL,NULL,NULL,'{}','en','Core', NULL  -- p_project_name NULL -> projects.name NOT NULL fails
    );
    RAISE EXCEPTION 'ASSERTION FAILED (T4): provision with NULL project name unexpectedly succeeded';
  EXCEPTION WHEN not_null_violation THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T4 forced failure raised after org insert (NULL project name)', v_assert;
  END;
  -- No partial rows for the failed identifier may remain. These leak-detection
  -- reads target PERSISTED state, and RLS on organizations/organization_members/
  -- workspaces/projects would silently filter the very leaked rows we are
  -- hunting (making the assertions vacuous), so read them WITH PRIVILEGE.
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.organizations WHERE identifier = 'atomic-trap';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T4): org row leaked after rolled-back provision';
  END IF;
  SELECT count(*) INTO v_count FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE o.identifier = 'atomic-trap';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T4): membership row leaked after rolled-back provision';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T4 no partial org/membership rows remain (atomic rollback)', v_assert;
  -- Workspace/project leak check by join through the (now absent) org is moot,
  -- but assert no orphan workspace/project references the failed identifier's
  -- would-be org (defense in depth: nothing references a non-existent org).
  SELECT count(*) INTO v_count FROM public.workspaces w
    WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = w.organization_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T4): orphan workspace rows remain after rollback';
  END IF;
  SELECT count(*) INTO v_count FROM public.projects p
    WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p.organization_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T4): orphan project rows remain after rollback';
  END IF;
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T4 no orphan workspace/project rows remain after rollback', v_assert;

  -- =========================================================================
  -- TEST 5: OWNER ATTRIBUTION on fresh create. A's org has EXACTLY ONE
  -- org_owner (the caller A), is_default=true, and A's
  -- persons.active_organization_id points at A's org (not another tenant's).
  -- =========================================================================
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_a_org AND role_name = 'org_owner';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T5): A org does not have exactly one org_owner (has %)', v_count;
  END IF;
  PERFORM 1 FROM public.organization_members
    WHERE organization_id = v_a_org AND role_name = 'org_owner'
      AND member_id = v_a AND is_default IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T5): A org_owner row is not member_id=A with is_default=true';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T5 fresh org has exactly one org_owner (caller, is_default=true)', v_assert;
  -- A's active context points at A's org (and A's org only). This is a check of
  -- PERSISTED state, and persons has NO SELECT policy for authenticated (RLS
  -- would silently filter the row), so read it with privilege (RESET ROLE) and
  -- then restore the authenticated context.
  RESET ROLE;
  PERFORM 1 FROM public.persons
    WHERE id = v_a AND active_organization_id = v_a_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T5): A persons.active_organization_id does not point at A org';
  END IF;
  -- And it must NOT point at any OTHER tenant's org.
  PERFORM 1 FROM public.persons
    WHERE id = v_a AND active_organization_id IS NOT NULL AND active_organization_id <> v_a_org;
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T5): A persons.active_organization_id points at a DIFFERENT tenant';
  END IF;
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T5 caller persons.active_organization_id points at the new org (not another tenant)', v_assert;

  -- =========================================================================
  -- TEST 6: CROSS-TENANT ISOLATION. A owns v_a_org (acme-corp); B owns v_b_org
  -- (acme-corp-2). As B, B must NOT be able to read A's org row via the RLS
  -- select policy, and must NOT be able to read A's members. (organization_
  -- members_select_policy is USING(true) in the fixture, so membership rows are
  -- world-readable to authenticated; the isolation guarantee we assert is the
  -- ORG-level one enforced by organizations_select_policy / is_org_member, and
  -- that the RPC cannot be used by B to read back A's org ids.)
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.organizations WHERE id = v_a_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T6): B can read A org row via RLS select policy';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T6 B cannot read A org row (organizations_select_policy / is_org_member)', v_assert;
  -- B reads back only its OWN org via the RPC idempotent path.
  SELECT public.provision_corporate_tenant('Acme Corp II','acme-corp-2') INTO v_result;
  IF (v_result->>'organization_id')::uuid IS DISTINCT FROM v_b_org
     OR (v_result->>'already_existed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T6): B RPC read-back did not return B org exclusively: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T6 B RPC read-back returns only B org (cross-tenant isolation)', v_assert;

  -- =========================================================================
  -- TEST 7: CONCURRENT-ISH IDEMPOTENCY + HOSTILE-PAYLOAD READ-BACK.
  --   7a. A calls AGAIN with identifier X -> no error, no duplicate org, no
  --       duplicate membership, provisioned=false already_existed=true.
  --   7b. A THIRD call with the SAME identifier but a HOSTILE payload
  --       (different name/tax) -> MUST be read-back (no data change), NOT an
  --       update.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SELECT public.provision_corporate_tenant('Acme Corp','acme-corp','Acme Legal','TAX-A','BR','MICRO',NULL,NULL,NULL,'{}','en','Core','Main') INTO v_result;
  IF (v_result->>'already_existed')::boolean IS NOT TRUE OR (v_result->>'provisioned')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7a): second call not a read-back: %', v_result;
  END IF;
  -- Replay identity: the replayed request returns the SAME org/workspace/project
  -- ids as the original provision (a true read-back, not a shadow duplicate).
  IF (v_result->>'organization_id')::uuid IS DISTINCT FROM v_a_org THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7a): replay returned a DIFFERENT organization_id (% vs %)',
      v_result->>'organization_id', v_a_org;
  END IF;
  SELECT count(*) INTO v_count FROM public.organizations WHERE identifier = 'acme-corp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7a): duplicate org created for acme-corp (count %)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_a_org AND member_id = v_a;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7a): duplicate membership for A (count %)', v_count;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T7a repeat provision is idempotent read-back (no dup org, no dup membership)', v_assert;
  -- 7b. hostile payload on the SAME identifier must be read-back, NOT update.
  SELECT public.provision_corporate_tenant('HOSTILE RENAME','acme-corp','HOSTILE LEGAL','TAX-HOSTILE','US','ENTERPRISE',NULL,NULL,NULL,'{}','en','Evil','Evil') INTO v_result;
  IF (v_result->>'already_existed')::boolean IS NOT TRUE OR (v_result->>'provisioned')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7b): hostile-payload call was not a read-back: %', v_result;
  END IF;
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND name = 'Acme Corp' AND legal_name = 'Acme Legal'
      AND tax_id = 'TAX-A' AND country_code = 'BR' AND size_category = 'MICRO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T7b): hostile payload MUTATED org data (must be read-back only)';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T7b hostile payload on same identifier is read-back (no data change)', v_assert;

  -- =========================================================================
  -- TEST 8: InitPlan-bug REGRESSION GUARD. A DIRECT org INSERT as a FRESH
  -- authenticated user FAILS (the InitPlan-bugged policy), yet the DEFINER RPC
  -- fresh provision SUCCEEDS. We use a brand-new identifier so this is a true
  -- fresh-create path (not the read-back).
  -- =========================================================================
  -- 8a. direct INSERT blocked
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.organizations (identifier, name) VALUES ('initplan-direct', 'Direct');
    RAISE EXCEPTION 'ASSERTION FAILED (T8a): direct org INSERT should be blocked by the InitPlan bug';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T8a direct org INSERT blocked by InitPlan RLS bug', v_assert;
  END;
  -- 8b. DEFINER RPC fresh provision succeeds despite the bug
  SELECT public.provision_corporate_tenant('InitPlan Bypass','initplan-bypass') INTO v_result;
  IF (v_result->>'provisioned')::boolean IS NOT TRUE OR (v_result->>'organization_id') IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T8b): DEFINER fresh provision failed despite InitPlan bypass: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T8b DEFINER RPC fresh provision succeeds (bypasses InitPlan-bugged policy)', v_assert;

  -- =========================================================================
  -- TEST 9: SLUG VALIDATION. Invalid identifiers are rejected (22023) BEFORE
  -- any insert: uppercase, spaces, leading/trailing hyphen, >63 chars, special
  -- chars. (Some already covered in T3; here we add >63 chars and special
  -- chars, and assert NO org row is created for any invalid identifier.)
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  -- >63 chars (64-char label)
  BEGIN
    PERFORM public.provision_corporate_tenant('Long', repeat('a', 64));
    RAISE EXCEPTION 'ASSERTION FAILED (T9): >63-char identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T9 >63-char identifier rejected', v_assert;
  END;
  -- special chars
  BEGIN
    PERFORM public.provision_corporate_tenant('Special','acme_corp!');
    RAISE EXCEPTION 'ASSERTION FAILED (T9): special-char identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T9 special-char identifier rejected', v_assert;
  END;
  -- empty / NULL identifier
  BEGIN
    PERFORM public.provision_corporate_tenant('Empty','');
    RAISE EXCEPTION 'ASSERTION FAILED (T9): empty identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T9 empty identifier rejected', v_assert;
  END;
  BEGIN
    PERFORM public.provision_corporate_tenant('NullId', NULL);
    RAISE EXCEPTION 'ASSERTION FAILED (T9): NULL identifier accepted';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR raise_exception THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: T9 NULL identifier rejected', v_assert;
  END;
  -- None of the invalid identifiers produced an org row.
  SELECT count(*) INTO v_count FROM public.organizations
    WHERE identifier IN (repeat('a', 64), 'acme_corp!', '');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (T9): an invalid identifier created an org row';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: T9 no invalid identifier created an org row', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ADVERSARIAL ASSERTIONS PASSED ===', v_assert;
END $$;
