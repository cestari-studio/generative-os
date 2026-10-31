-- Copyright IBM Corp. 2026
-- This source code is licensed under the Apache-2.0 license found in the
-- LICENSE file in the root directory of this source tree.
--
-- provision_tenant_concurrency_race.sql — POST-RACE invariant assertions.
--
-- Directive Onda 1 (request-replay + concurrency): two CONCURRENT provision
-- attempts with the SAME identifier raced in two REAL psql sessions (see
-- scripts/test-provision-concurrency-race-sql.sh, which runs the racers as
-- background psql processes released simultaneously by an advisory-lock
-- barrier — NOT a single DO block). Acceptable loser outcomes: a clean
-- conflict (23505 unique_violation, or 42501 takeover denial when the winner
-- commits before the loser's conflict lookup) or an idempotent read-back.
-- NEVER two orgs, NEVER a hijack.
--
-- The harness passes the raced identifier via -v race_identifier=...; the
-- SET below lands it in a GUC so the DO block can read it (psql variables
-- are not expanded inside dollar-quoted bodies).

\set QUIET on
\pset footer off

SET app.race_identifier = :'race_identifier';

DO $$
DECLARE
  v_assert int := 0;
  v_count int;
  v_org_id uuid;
  v_winner uuid;
  v_loser uuid;
  v_race_id text := current_setting('app.race_identifier');
  v_a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE '=== CONCURRENCY-RACE invariant assertions (identifier: %) ===', v_race_id;

  -- R1a. both racers recorded an outcome (the race actually ran).
  SELECT count(*) INTO v_count FROM public.race_results;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R1a): expected 2 racer outcomes, found %', v_count;
  END IF;
  -- R1b. every racer outcome is an ACCEPTABLE one: provisioned (winner),
  -- read_back, or a clean conflict error (23505 unique_violation / 42501
  -- takeover denial). Any other error code is a harness/function defect.
  SELECT count(*) INTO v_count FROM public.race_results
  WHERE NOT (outcome = 'provisioned'
             OR outcome = 'read_back'
             OR (outcome = 'error' AND errcode IN ('23505', '42501')));
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R1b): a racer ended in an UNACCEPTABLE outcome (see race_results)';
  END IF;
  -- R1c. exactly ONE winner.
  SELECT count(*) INTO v_count FROM public.race_results WHERE provisioned IS TRUE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R1c): expected exactly 1 provisioned=true racer, found %', v_count;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R1 both racers recorded; every outcome acceptable; exactly one winner', v_assert;

  -- R2. exactly one org for the raced identifier.
  SELECT count(*) INTO v_count FROM public.organizations WHERE identifier = v_race_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R2): expected exactly 1 org for %, found %', v_race_id, v_count;
  END IF;
  SELECT id INTO v_org_id FROM public.organizations WHERE identifier = v_race_id;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R2 exactly one org row for the raced identifier (%)', v_assert, v_org_id;

  -- R3. exactly one org_owner; the owner is one of the two racers; the OTHER
  -- racer (loser) holds NO membership row in ANY role.
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND role_name = 'org_owner';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R3): expected exactly 1 org_owner, found %', v_count;
  END IF;
  SELECT member_id INTO v_winner FROM public.organization_members
    WHERE organization_id = v_org_id AND role_name = 'org_owner';
  IF v_winner NOT IN (v_a, v_b) THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R3): org_owner % is not one of the two racers', v_winner;
  END IF;
  v_loser := CASE WHEN v_winner = v_a THEN v_b ELSE v_a END;
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND member_id = v_loser;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R3): losing racer % holds a membership row in the winner org', v_loser;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R3 exactly one org_owner (winner %); loser holds NO membership', v_assert, v_winner;

  -- R4. winner payload intact: the org carries the WINNER's legal/tax payload.
  PERFORM 1 FROM public.organizations
    WHERE id = v_org_id
      AND legal_name = 'Race Legal ' || CASE WHEN v_winner = v_a THEN 'A' ELSE 'B' END
      AND tax_id = 'TAX-' || CASE WHEN v_winner = v_a THEN 'A' ELSE 'B' END
      AND legal_representative_id = v_winner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R4): winner org data does not match the winner payload';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R4 winner org data intact (winner payload, winner as legal representative)', v_assert;

  -- R5. exactly one core workspace and one main project for the org (no
  -- partial double-provisioning from the two racers).
  SELECT count(*) INTO v_count FROM public.workspaces
    WHERE organization_id = v_org_id AND identifier = 'core';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R5): expected exactly 1 core workspace, found %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.projects
    WHERE organization_id = v_org_id AND identifier = 'main';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R5): expected exactly 1 main project, found %', v_count;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R5 exactly one core workspace + one main project (no double-provisioning)', v_assert;

  -- R6. the loser's active context is NOT bound to the winner's org. (A racer
  -- whose fresh-create LOST the insert race must never have been switched into
  -- the winner's tenant; only a read-back by an admin may — and the loser is
  -- not an admin of the winner's org.)
  PERFORM 1 FROM public.persons
    WHERE id = v_loser AND active_organization_id = v_org_id;
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (R6): losing racer active_organization_id points at the winner org';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: R6 losing racer active context NOT bound to the winner org', v_assert;

  RAISE NOTICE '=== ALL % CONCURRENCY-RACE ASSERTIONS PASSED (identifier %) ===', v_assert, v_race_id;
END $$;
