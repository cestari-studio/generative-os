/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { getSupabaseBrowserClient } from '../lib/supabase.client.js';
import { getThemeSettings, setHeaderInverse, setThemeSetting } from '../utils/theme.js';
import { TenantContext } from './useTenant.js';

export const TenantProvider = ({ children, initialThemeSetting, initialHeaderInverse, initialServerUser = null }) => {
  const { i18n } = useTranslation();
  const i18nRef = useRef(i18n);
  useEffect(() => {
    i18nRef.current = i18n;
  }, [i18n]);

  // Seed from the server-validated user (SSR). The client revalidates via
  // supabase.auth.getSession()/onAuthStateChange on mount — this initial
  // value only prevents an unauthenticated flash during hydration.
  const [user, setUser] = useState(initialServerUser);
  const [person, setPerson] = useState(null);
  const [persons, setPersons] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [effectiveSettings, setEffectiveSettings] = useState([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState([]);
  const [mediaObjects, setMediaObjects] = useState([]);
  const [auditActions, setAuditActions] = useState([]);
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const userRef = useRef(user);
  const personRef = useRef(person);
  const activeOrgIdRef = useRef(activeOrganizationId);
  const activeWsIdRef = useRef(activeWorkspaceId);
  const activePrjIdRef = useRef(activeProjectId);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    personRef.current = person;
  }, [person]);

  useEffect(() => {
    activeOrgIdRef.current = activeOrganizationId;
  }, [activeOrganizationId]);

  useEffect(() => {
    activeWsIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  useEffect(() => {
    activePrjIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const initialTheme = useMemo(() => {
    if (initialThemeSetting !== undefined && initialThemeSetting !== null) {
      return {
        themeSetting: initialThemeSetting,
        headerInverse: Boolean(initialHeaderInverse),
      };
    }
    if (typeof document !== 'undefined') {
      const htmlTheme = document.documentElement.getAttribute('data-theme-setting');
      const htmlHeaderInverse = document.documentElement.getAttribute('data-header-inverse') === 'true';
      if (htmlTheme) {
        return {
          themeSetting: htmlTheme,
          headerInverse: htmlHeaderInverse,
        };
      }
      return getThemeSettings();
    }
    return { themeSetting: 'system', headerInverse: false };
  }, [initialThemeSetting, initialHeaderInverse]);

  const [themeSetting, setThemeSettingState] = useState(initialTheme.themeSetting || 'system');
  const [headerInverse, setHeaderInverseState] = useState(Boolean(initialTheme.headerInverse));
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [signInStep, setSignInStep] = useState(0);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0);

  const updateThemeSetting = useCallback((newSetting) => {
    setThemeSettingState(newSetting);
    setThemeSetting(newSetting);
  }, []);

  const updateHeaderInverse = useCallback((newInverse) => {
    setHeaderInverseState(newInverse);
    setHeaderInverse(newInverse);
  }, []);

  const openSignInModal = useCallback((step = 0) => {
    setSignInStep(step);
    setIsSignInModalOpen(true);
  }, []);

  const closeSignInModal = useCallback(() => {
    setIsSignInModalOpen(false);
  }, []);

  const openOnboardingFlow = useCallback((step = 0) => {
    setOnboardingInitialStep(typeof step === 'number' ? step : 0);
    setIsOnboardingOpen(true);
  }, []);

  const closeOnboardingFlow = useCallback(() => {
    setIsOnboardingOpen(false);
  }, []);

  const syncSettingsSideEffects = useCallback(
    (rows) => {
      if (!Array.isArray(rows) || typeof window === 'undefined') return;
      const themeModeRow = rows.find((r) => r.property_id === 'theme.mode');
      const headerInverseRow = rows.find((r) => r.property_id === 'theme.header_inverse');
      const languageRow = rows.find((r) => r.property_id === 'i18n.in_language');

      // Only allow database values to override local user preferences if they are explicitly locked by org or set on user level
      if (themeModeRow && themeModeRow.effective_value && themeModeRow.source_level !== 'default') {
        const rawMode = String(themeModeRow.effective_value);
        if (rawMode === 'g90' || rawMode === 'g100' || rawMode === 'dark') {
          updateThemeSetting('dark');
        } else if (rawMode === 'white' || rawMode === 'g10' || rawMode === 'light') {
          updateThemeSetting('light');
        } else if (rawMode === 'system') {
          updateThemeSetting('system');
        }
      }

      if (
        headerInverseRow &&
        typeof headerInverseRow.effective_value === 'boolean' &&
        headerInverseRow.source_level !== 'default'
      ) {
        updateHeaderInverse(headerInverseRow.effective_value);
      }

      if (
        languageRow &&
        typeof languageRow.effective_value === 'string' &&
        languageRow.source_level !== 'default' &&
        ['en', 'de', 'pt-BR', 'ja-JP', 'jp-JP', 'zh-CN'].includes(languageRow.effective_value)
      ) {
        const canonicalLanguage = languageRow.effective_value === 'jp-JP' ? 'ja-JP' : languageRow.effective_value;
        if (i18nRef.current?.language !== canonicalLanguage) {
          i18nRef.current?.changeLanguage(canonicalLanguage);
        }
      }
    },
    [updateHeaderInverse, updateThemeSetting],
  );

  const loadEffectiveSettings = useCallback(
    async (orgId, wsId, prjId, personId = null) => {
      if (typeof window === 'undefined' || !orgId) return;
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.rpc('resolve_effective_settings', {
          p_organization_id: orgId,
          p_workspace_id: wsId,
          p_project_id: prjId,
          p_person_id: personId,
        });
        if (error) {
          setStatusMessage(error.message);
          return;
        }
        if (Array.isArray(data)) {
          setEffectiveSettings(data);
          syncSettingsSideEffects(data);
        }
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : 'Failed to load settings');
      }
    },
    [syncSettingsSideEffects],
  );

  const refreshTenantData = useCallback(
    async (targetOrgId, targetWsId, targetPrjId, { silent = false } = {}) => {
      if (typeof window === 'undefined') return;
      const orgId = targetOrgId || activeOrgIdRef.current;
      const wsId = targetWsId || activeWsIdRef.current;
      const prjId = targetPrjId || activePrjIdRef.current;
      const currentUser = userRef.current;

      // Hydration safety: the mount-time refresh must not flip the global
      // loading flag. Lazy route subtrees hydrate AFTER this effect fires,
      // and a loading=true render there no longer matches the SSR HTML
      // (gate for anonymous, page content for authenticated) — React raises
      // "Hydration failed because the server rendered HTML didn't match the
      // client". Explicit user-triggered refreshes keep the spinner.
      if (!silent) {
        setLoading(true);
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const [orgsRes, wsRes, prjRes, docsRes, mediaRes, auditsRes, personsRes] = await Promise.all([
          supabase.from('organizations').select('*').order('name'),
          supabase.from('workspaces').select('*').order('name'),
          supabase.from('projects').select('*').order('name'),
          supabase
            .from('knowledge_documents')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(25),
          supabase
            .from('media_objects')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(25),
          supabase
            .from('audit_actions')
            .select('*')
            .eq('organization_id', orgId)
            .order('start_time', { ascending: false })
            .limit(25),
          supabase
            .from('persons')
            .select('id, name, email, active_organization_id, active_workspace_id, active_project_id')
            .order('name'),
        ]);

        const queryError = [orgsRes, wsRes, prjRes, docsRes, mediaRes, auditsRes, personsRes].find((r) => r.error);
        if (queryError?.error) {
          setStatusMessage(queryError.error.message);
          return;
        }

        let resolvedOrgId = orgId;
        const nextOrganizations = Array.isArray(orgsRes.data) ? orgsRes.data : [];
        setOrganizations(nextOrganizations);
        if (nextOrganizations.length > 0 && !nextOrganizations.some((o) => o.id === resolvedOrgId)) {
          resolvedOrgId = nextOrganizations[0].id;
          setActiveOrganizationId(resolvedOrgId);
          activeOrgIdRef.current = resolvedOrgId;
        }

        setWorkspaces(Array.isArray(wsRes.data) ? wsRes.data : []);
        setProjects(Array.isArray(prjRes.data) ? prjRes.data : []);
        setKnowledgeDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
        setMediaObjects(Array.isArray(mediaRes.data) ? mediaRes.data : []);
        setAuditActions(Array.isArray(auditsRes.data) ? auditsRes.data : []);
        setPersons(Array.isArray(personsRes.data) ? personsRes.data : []);

        await loadEffectiveSettings(resolvedOrgId, wsId, prjId, currentUser ? currentUser.id : null);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : 'Failed to load tenant data');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [loadEffectiveSettings],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        const sessionUser = data?.session?.user ?? null;
        setUser(sessionUser);
        userRef.current = sessionUser;

        let targetOrgId = activeOrgIdRef.current;
        let targetWsId = activeWsIdRef.current;
        let targetPrjId = activePrjIdRef.current;

        if (sessionUser) {
          const [personRes, passkeyRes] = await Promise.all([
            supabase.from('persons').select('*').eq('id', sessionUser.id).maybeSingle(),
            supabase
              .from('passkey_credentials')
              .select('*')
              .eq('person_id', sessionUser.id)
              .order('created_at', { ascending: false }),
          ]);
          if (!isMounted) return;

          if (personRes.data) {
            setPerson(personRes.data);
            personRef.current = personRes.data;
            if (personRes.data.active_organization_id) {
              targetOrgId = personRes.data.active_organization_id;
              setActiveOrganizationId(targetOrgId);
              activeOrgIdRef.current = targetOrgId;
            }
            if (personRes.data.active_workspace_id) {
              targetWsId = personRes.data.active_workspace_id;
              setActiveWorkspaceId(targetWsId);
              activeWsIdRef.current = targetWsId;
            }
            if (personRes.data.active_project_id) {
              targetPrjId = personRes.data.active_project_id;
              setActiveProjectId(targetPrjId);
              activePrjIdRef.current = targetPrjId;
            }
          }
          if (Array.isArray(passkeyRes.data)) {
            setPasskeys(passkeyRes.data);
          }
          await refreshTenantData(targetOrgId, targetWsId, targetPrjId, { silent: true });
        } else {
          await refreshTenantData(targetOrgId, targetWsId, targetPrjId, { silent: true });
        }
      } catch {
        // Fallback
      }
    };

    initializeSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      userRef.current = nextUser;
      if (!nextUser) {
        setPerson(null);
        personRef.current = null;
        setPasskeys([]);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [refreshTenantData]);

  const switchActiveContext = useCallback(
    async ({ organizationId, workspaceId, projectId }) => {
      const nextOrgId = organizationId || activeOrgIdRef.current;
      const nextWsId = workspaceId !== undefined ? workspaceId : activeWsIdRef.current;
      const nextPrjId = projectId !== undefined ? projectId : activePrjIdRef.current;
      const currentUser = userRef.current;
      if (!currentUser?.id) throw new Error('Sign in before changing the active organization.');
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('switch_active_context', {
        p_organization_id: nextOrgId,
        p_workspace_id: nextWsId,
        p_project_id: nextPrjId,
      });
      if (error) {
        setStatusMessage(error.message);
        throw error;
      }
      if (!data?.active_organization_id) throw new Error('The server did not confirm the active organization.');

      const confirmedOrgId = data.active_organization_id;
      const confirmedWsId = data.active_workspace_id ?? null;
      const confirmedPrjId = data.active_project_id ?? null;
      setActiveOrganizationId(confirmedOrgId);
      setActiveWorkspaceId(confirmedWsId);
      setActiveProjectId(confirmedPrjId);
      activeOrgIdRef.current = confirmedOrgId;
      activeWsIdRef.current = confirmedWsId;
      activePrjIdRef.current = confirmedPrjId;

      try {
        await loadEffectiveSettings(confirmedOrgId, confirmedWsId, confirmedPrjId, currentUser.id);
      } catch {
        // Fallback
      }
    },
    [loadEffectiveSettings],
  );

  const createOrganizationHierarchy = useCallback(
    async ({ name, identifier, workspaceName, projectName }) => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('create_organization_hierarchy', {
        p_name: name,
        p_identifier: identifier,
        p_in_language: i18nRef.current?.language || 'en',
        p_workspace_name: workspaceName || 'Core Workspace',
        p_project_name: projectName || 'Default Project',
      });
      if (error) {
        setStatusMessage(error.message);
        throw error;
      }
      await refreshTenantData();
      if (data?.organization_id) {
        await switchActiveContext({
          organizationId: data.organization_id,
          workspaceId: data.workspace_id,
          projectId: data.project_id,
        });
      }
      setStatusMessage(`Created organization ${name}`);
      return data;
    },
    [refreshTenantData, switchActiveContext],
  );

  const saveOnboardingProgress = useCallback(
    async ({ accountType = 'individual', countryCode = 'BR', currentStep = 2, stepData = {}, isCompleted = false }) => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('save_onboarding_progress', {
        p_account_type: accountType,
        p_country_code: countryCode,
        p_current_step: currentStep,
        p_step_data: stepData,
        p_is_completed: isCompleted,
      });
      if (error) {
        setStatusMessage(error.message);
        throw error;
      }
      await refreshTenantData();
      return data;
    },
    [refreshTenantData],
  );

  /**
   * Loads the persisted onboarding progress for the authenticated person.
   * Returns the normalized onboarding object or null when none exists.
   * Errors propagate — callers decide how to surface them.
   */
  const loadOnboardingProgress = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const currentUser = userRef.current;
    if (!currentUser?.id) return null;
    const { data, error } = await supabase
      .from('persons')
      .select('additional_property')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) {
      setStatusMessage(error.message);
      throw error;
    }
    const onboarding = data?.additional_property?.onboarding;
    if (!onboarding || typeof onboarding !== 'object') return null;
    return {
      accountType: onboarding.account_type ?? null,
      countryCode: onboarding.country_code ?? null,
      currentStep: typeof onboarding.current_step === 'number' ? onboarding.current_step : null,
      status: onboarding.status ?? null,
      stepData: onboarding.step_data && typeof onboarding.step_data === 'object' ? onboarding.step_data : {},
    };
  }, []);

  const recordTenantOnboardingStep = useCallback(async (stepName) => {
    const currentUser = userRef.current;
    if (!currentUser?.id) throw new Error('Sign in before saving onboarding progress.');
    const allowedSteps = new Set(['identity', 'organization', 'workspace']);
    if (!allowedSteps.has(stepName)) throw new Error('Unknown tenant onboarding step.');

    const supabase = getSupabaseBrowserClient();
    const wizardKey = 'onboarding.tenant';
    const wizardVersion = '1.0.0';
    const stepKey = `${wizardKey}.${stepName}`;
    const { data: activeRun, error: activeRunLookupError } = await supabase
      .from('onboarding_runs')
      .select('id, run_state')
      .eq('actor_id', currentUser.id)
      .eq('subject_user_id', currentUser.id)
      .eq('wizard_key', wizardKey)
      .eq('wizard_version', wizardVersion)
      .eq('run_state', 'active')
      .order('created_at', { ascending: false })
      .limit(2)
      .maybeSingle();
    if (activeRunLookupError) throw activeRunLookupError;

    let runId = activeRun?.id;
    let runState = activeRun?.run_state;
    if (!runId) {
      const { data: previousRun, error: previousRunLookupError } = await supabase
        .from('onboarding_runs')
        .select('id, run_state')
        .eq('actor_id', currentUser.id)
        .eq('subject_user_id', currentUser.id)
        .eq('wizard_key', wizardKey)
        .eq('wizard_version', wizardVersion)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousRunLookupError) throw previousRunLookupError;
      if (previousRun && previousRun.run_state !== 'completed') {
        throw new Error(`Onboarding run is ${previousRun.run_state} and cannot accept steps.`);
      }

      // The key is stable for a given attempt. Simultaneous tabs therefore
      // collide on the scoped unique index and resume the same run instead of
      // creating ambiguous active runs. A completed run id starts the next key.
      const idempotencyKey = `tenant-onboarding:${currentUser.id}:${wizardVersion}:${previousRun?.id ?? 'first'}`;
      const { data: createdRun, error: createRunError } = await supabase
        .from('onboarding_runs')
        .insert({
          wizard_key: wizardKey,
          wizard_version: wizardVersion,
          actor_id: currentUser.id,
          subject_user_id: currentUser.id,
          target_organization_id: null,
          idempotency_key: idempotencyKey,
        })
        .select('id, run_state')
        .single();
      if (createRunError) {
        // A concurrent tab may have created the same idempotent run.
        const { data: retriedRun, error: retryLookupError } = await supabase
          .from('onboarding_runs')
          .select('id, run_state')
          .eq('actor_id', currentUser.id)
          .eq('subject_user_id', currentUser.id)
          .eq('wizard_key', wizardKey)
          .eq('wizard_version', wizardVersion)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (retryLookupError || !retriedRun) throw createRunError;
        runId = retriedRun.id;
        runState = retriedRun.run_state;
      } else {
        runId = createdRun.id;
        runState = createdRun.run_state;
      }
    }

    if (runState && runState !== 'active') {
      if (runState === 'completed') return { runId, alreadyCompleted: true };
      throw new Error(`Onboarding run is ${runState} and cannot accept steps.`);
    }

    const { error: stepError } = await supabase.from('onboarding_step_states').upsert(
      {
        run_id: runId,
        step_key: stepKey,
        state: 'completed',
        payload_minimized: {},
        validation_state: 'unverified',
      },
      { onConflict: 'run_id,step_key' },
    );
    if (stepError) throw stepError;
    return { runId };
  }, []);

  const completeTenantOnboardingRun = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser?.id) throw new Error('Sign in before completing onboarding.');
    const supabase = getSupabaseBrowserClient();
    // Readiness is the server's completion authority. Keep the fully satisfied
    // run active: the resolver intentionally treats a terminal run as superseded
    // and offers a fresh journey, while an active run with every required step
    // complete is the only state that yields `allow`.
    const { data, error } = await supabase.rpc('resolve_onboarding_readiness', {
      p_wizard_key: 'onboarding.tenant',
      p_wizard_version: '1.0.0',
    });
    if (error) throw error;
    if (data?.decision !== 'allow') {
      throw new Error(`The server has not confirmed onboarding readiness (${data?.reason ?? 'unknown'}).`);
    }
    return data;
  }, []);

  const createOrUpdateCorporateTenant = useCallback(
    async ({
      name,
      identifier,
      legalName,
      taxId,
      countryCode = 'BR',
      sizeCategory = 'MICRO',
      revenueRange = null,
      registrationNumber = null,
      industryCode = null,
      address = {},
      inLanguage = 'pt-BR',
      workspaceName = 'Core Workspace',
      projectName = 'Default Project',
    }) => {
      const supabase = getSupabaseBrowserClient();
      // Safe-provisioning successor (migration 20261026140000): identical 13-arg
      // signature to the legacy create_or_update_corporate_tenant, but takeover-safe —
      // a conflicting identifier requires the caller to ALREADY be org_owner/org_admin
      // (else 42501) and never promotes on conflict / never overwrites org data.
      const { data, error } = await supabase.rpc('provision_corporate_tenant', {
        p_name: name,
        p_identifier: identifier,
        p_legal_name: legalName,
        p_tax_id: taxId,
        p_country_code: countryCode,
        p_size_category: sizeCategory,
        p_revenue_range: revenueRange,
        p_registration_number: registrationNumber,
        p_industry_code: industryCode,
        p_address: address,
        p_in_language: inLanguage,
        p_workspace_name: workspaceName,
        p_project_name: projectName,
      });
      if (error) {
        setStatusMessage(error.message);
        throw error;
      }
      await refreshTenantData();
      return data;
    },
    [refreshTenantData],
  );

  const applySettingCascade = useCallback(
    async ({ level, propertyId, value, cascadeRule = 'INHERIT_OVERRIDABLE', clearChildOverrides = false }) => {
      const supabase = getSupabaseBrowserClient();
      const currentOrgId = activeOrgIdRef.current;
      const currentWsId = activeWsIdRef.current;
      const currentPrjId = activePrjIdRef.current;
      const currentUser = userRef.current;

      const targetPersonId = level === 'person' ? (currentUser ? currentUser.id : personRef.current?.id || null) : null;

      // Backend first: the override is only visible after the RPC confirms it.
      // No optimistic write to effectiveSettings and no optimistic side effects
      // (theme/language) — a rejected apply must leave the UI exactly as it
      // was (settings-cascade contract: the interface never shows an override
      // the backend did not confirm).
      const { data, error } = await supabase.rpc('apply_setting_cascade', {
        p_organization_id: currentOrgId,
        p_level: level,
        p_property_id: propertyId,
        p_value: value,
        p_cascade_rule: cascadeRule,
        p_workspace_id: level === 'workspace' || level === 'project' ? currentWsId : null,
        p_project_id: level === 'project' ? currentPrjId : null,
        p_person_id: targetPersonId,
        p_clear_child_overrides: clearChildOverrides,
      });

      if (error) {
        console.warn('apply_setting_cascade RPC error:', error.message);
        throw error;
      }

      // Side effects only AFTER backend confirmation.
      if (propertyId === 'i18n.in_language' && typeof value === 'string') {
        if (['en', 'de', 'pt-BR', 'ja-JP', 'jp-JP', 'zh-CN'].includes(value)) {
          const canonical = value === 'jp-JP' ? 'ja-JP' : value;
          i18nRef.current?.changeLanguage(canonical);
        }
      } else if (propertyId === 'theme.mode' && typeof value === 'string') {
        if (value === 'g90' || value === 'g100' || value === 'dark') {
          updateThemeSetting('dark');
        } else if (value === 'white' || value === 'g10' || value === 'light') {
          updateThemeSetting('light');
        } else if (value === 'system') {
          updateThemeSetting('system');
        }
      } else if (propertyId === 'theme.header_inverse') {
        updateHeaderInverse(Boolean(value));
      }

      await refreshTenantData();
      return data;
    },
    [refreshTenantData, updateHeaderInverse, updateThemeSetting],
  );

  const uploadTenantMedia = useCallback(
    async ({ bucketId = 'project-knowledge', file }) => {
      if (!file) return null;
      const supabase = getSupabaseBrowserClient();
      const currentOrgId = activeOrgIdRef.current;
      const currentWsId = activeWsIdRef.current;
      const currentPrjId = activePrjIdRef.current;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `${currentOrgId}/${currentWsId}/${Date.now()}-${safeName}`;
      let contentUrl = `storage://${bucketId}/${storagePath}`;

      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketId)
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
          });
        if (!uploadError && uploadData?.path) {
          contentUrl = `storage://${bucketId}/${uploadData.path}`;
        }
      } catch {
        // Storage bucket write requires authenticated org membership; still record Schema.org MediaObject metadata
      }

      const { data, error } = await supabase.rpc('record_media_object', {
        p_organization_id: currentOrgId,
        p_workspace_id: currentWsId,
        p_project_id: currentPrjId,
        p_bucket_id: bucketId,
        p_content_url: contentUrl,
        p_name: file.name,
        p_encoding_format: file.type || 'application/octet-stream',
        p_content_size: file.size || 0,
      });

      if (error) {
        setStatusMessage(error.message);
        throw error;
      }

      await refreshTenantData();
      setStatusMessage(`Uploaded MediaObject "${file.name}" to ${bucketId}`);
      return data;
    },
    [refreshTenantData],
  );

  const signInWithPassword = useCallback(
    async (email, password) => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatusMessage(error.message);
        throw error;
      }
      const sessionUser = data?.user ?? null;
      setUser(sessionUser);
      userRef.current = sessionUser;

      let personData = null;
      let targetOrgId = activeOrgIdRef.current;
      let targetWsId = activeWsIdRef.current;
      let targetPrjId = activePrjIdRef.current;

      if (sessionUser?.id) {
        const [personRes, passkeyRes] = await Promise.all([
          supabase.from('persons').select('*').eq('id', sessionUser.id).maybeSingle(),
          supabase
            .from('passkey_credentials')
            .select('*')
            .eq('person_id', sessionUser.id)
            .order('created_at', { ascending: false }),
        ]);

        if (personRes.data) {
          personData = personRes.data;
          setPerson(personRes.data);
          personRef.current = personRes.data;
          if (personRes.data.active_organization_id) {
            targetOrgId = personRes.data.active_organization_id;
            setActiveOrganizationId(targetOrgId);
            activeOrgIdRef.current = targetOrgId;
          }
          if (personRes.data.active_workspace_id) {
            targetWsId = personRes.data.active_workspace_id;
            setActiveWorkspaceId(targetWsId);
            activeWsIdRef.current = targetWsId;
          }
          if (personRes.data.active_project_id) {
            targetPrjId = personRes.data.active_project_id;
            setActiveProjectId(targetPrjId);
            activePrjIdRef.current = targetPrjId;
          }
        }
        if (Array.isArray(passkeyRes.data)) {
          setPasskeys(passkeyRes.data);
        }
      }

      setStatusMessage(`Signed in as ${email}`);
      await refreshTenantData(targetOrgId, targetWsId, targetPrjId);
      return { ...data, person: personData };
    },
    [refreshTenantData],
  );

  const signInWithOtp = useCallback(async (email) => {
    const supabase = getSupabaseBrowserClient();
    // Explicit redirect so the magic link returns to this app's origin (works
    // on Preview/production domains, not just the Auth-configured site_url).
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatusMessage(error.message);
      throw error;
    }
    setStatusMessage(`Magic link sent to ${email}`);
    return data;
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const supabase = getSupabaseBrowserClient();
    // Supabase sends a recovery email with a link that lands on /reset-password.
    // The redirect must point at an app route that handles the recovery token.
    const redirectTo = `${window.location.origin}/reset-password`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setStatusMessage(error.message);
      throw error;
    }
    setStatusMessage(`Password reset link sent to ${email}`);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Ignored if offline or test environment
    }
    setUser(null);
    userRef.current = null;
    setPerson(null);
    personRef.current = null;
    setPasskeys([]);
    setOrganizations([]);
    setWorkspaces([]);
    setProjects([]);
    setKnowledgeDocuments([]);
    setMediaObjects([]);
    setAuditActions([]);
    setEffectiveSettings([]);
    setActiveOrganizationId(null);
    setActiveWorkspaceId(null);
    setActiveProjectId(null);
    activeOrgIdRef.current = null;
    activeWsIdRef.current = null;
    activePrjIdRef.current = null;
    setStatusMessage('Signed out successfully');
  }, []);

  /**
   * Passkeys are not available in this version.
   *
   * The passkey-auth Edge Function does not implement the WebAuthn ceremony
   * yet, so there is no server-verified registration or assertion flow. These
   * helpers fail closed: they never fabricate challenges, credentials or
   * Passkeys via Supabase Auth's NATIVE WebAuthn support (supabase-js 2.118+):
   * auth.registerPasskey() and auth.signInWithPasskey() drive the full FIDO2
   * ceremony — attestation and assertion are verified server-side by Supabase
   * Auth, never pseudo-verified client-side. WebAuthn requires a secure
   * context (HTTPS or localhost); callers surface the browser's errors
   * honestly (unsupported browser, user cancel, no platform authenticator).
   */
  /**
   * Authoritative passkey list — via Supabase Auth's NATIVE WebAuthn store.
   *
   * The legacy `public.passkey_credentials` table is NOT written by native
   * registration (native Supabase Auth stores credentials in the auth schema,
   * surfaced via `auth.passkey.list()`). Reading the public table would always
   * report "no passkey" even for users who registered — so detection MUST use
   * the native list.
   *
   * Returns a DISCRIMINATED result, never a collapsed error (Fase E / the plan's
   * P0 fix): a list failure is NOT the same as "no credentials", and a caller
   * must be able to tell them apart.
   *   { status: 'ready', passkeys: [...] }   — list succeeded (possibly empty)
   *   { status: 'unknown' }                  — list failed (network/RLS/API); NOT "no credentials"
   *   { status: 'unsupported' }              — passkey API absent in this client/context
   *   { status: 'unauthenticated' }          — no signed-in user
   */
  const listPasskeys = useCallback(async () => {
    if (!userRef.current?.id) return { status: 'unauthenticated', passkeys: [] };
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return { status: 'unknown', passkeys: [] };
    }
    if (typeof supabase.auth?.passkey?.list !== 'function') {
      return { status: 'unsupported', passkeys: [] };
    }
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (error) return { status: 'unknown', passkeys: [], error: error.message };
      const list = Array.isArray(data) ? data : (data?.passkeys ?? []);
      return { status: 'ready', passkeys: list };
    } catch (err) {
      return { status: 'unknown', passkeys: [], error: err instanceof Error ? err.message : 'list failed' };
    }
  }, []);

  /** Refresh the `passkeys` state from the authoritative native store.
   * Only overwrites state on a 'ready' result; an 'unknown'/'unsupported' result
   * is returned for the caller to surface honestly (never rendered as "no passkey"). */
  const refreshPasskeys = useCallback(async () => {
    const result = await listPasskeys();
    if (result.status === 'ready') {
      setPasskeys(result.passkeys);
    }
    return result;
  }, [listPasskeys]);

  const registerPasskey = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const currentUser = userRef.current;
    if (!currentUser?.id) {
      const err = new Error('Sign in before registering a passkey.');
      setStatusMessage(err.message);
      throw err;
    }
    const { data, error } = await supabase.auth.registerPasskey();
    if (error) {
      setStatusMessage(error.message);
      throw error;
    }
    // Refresh from the authoritative native store (never assume success).
    try {
      await refreshPasskeys();
    } catch {
      // Non-fatal: the registration succeeded; the list will refresh on next load.
    }
    setStatusMessage('Passkey registered');
    return data;
  }, [refreshPasskeys]);

  const authenticateWithPasskey = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error) {
      setStatusMessage(error.message);
      throw error;
    }
    // Native passkey sign-in establishes the session via onAuthStateChange,
    // which sets the user and refreshes tenant data.
    setStatusMessage('Signed in with passkey');
    return data;
  }, []);

  const activeOrganization = useMemo(
    () => organizations.find((o) => o.id === activeOrganizationId) || organizations[0] || null,
    [organizations, activeOrganizationId],
  );

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((w) => w.id === activeWorkspaceId) ||
      workspaces.find((w) => w.organization_id === activeOrganizationId) ||
      null,
    [workspaces, activeWorkspaceId, activeOrganizationId],
  );

  const activeProject = useMemo(
    () =>
      projects.find((p) => p.id === activeProjectId) ||
      projects.find((p) => p.workspace_id === activeWorkspaceId) ||
      null,
    [projects, activeProjectId, activeWorkspaceId],
  );

  const value = useMemo(
    () => ({
      user,
      person,
      persons,
      organizations,
      workspaces,
      projects,
      activeOrganizationId,
      activeWorkspaceId,
      activeProjectId,
      activeOrganization,
      activeWorkspace,
      activeProject,
      effectiveSettings,
      knowledgeDocuments,
      mediaObjects,
      auditActions,
      passkeys,
      loading,
      statusMessage,
      themeSetting,
      headerInverse,
      isSignInModalOpen,
      signInStep,
      setSignInStep,
      openSignInModal,
      closeSignInModal,
      isOnboardingOpen,
      onboardingInitialStep,
      openOnboardingFlow,
      closeOnboardingFlow,
      updateThemeSetting,
      updateHeaderInverse,
      switchActiveContext,
      createOrganizationHierarchy,
      applySettingCascade,
      uploadTenantMedia,
      signInWithPassword,
      signInWithOtp,
      requestPasswordReset,
      signOut,
      listPasskeys,
      refreshPasskeys,
      registerPasskey,
      authenticateWithPasskey,
      refreshTenantData,
      saveOnboardingProgress,
      loadOnboardingProgress,
      recordTenantOnboardingStep,
      completeTenantOnboardingRun,
      createOrUpdateCorporateTenant,
    }),
    [
      user,
      person,
      persons,
      organizations,
      workspaces,
      projects,
      activeOrganizationId,
      activeWorkspaceId,
      activeProjectId,
      activeOrganization,
      activeWorkspace,
      activeProject,
      effectiveSettings,
      knowledgeDocuments,
      mediaObjects,
      auditActions,
      passkeys,
      loading,
      statusMessage,
      themeSetting,
      headerInverse,
      isSignInModalOpen,
      signInStep,
      setSignInStep,
      openSignInModal,
      closeSignInModal,
      isOnboardingOpen,
      onboardingInitialStep,
      openOnboardingFlow,
      closeOnboardingFlow,
      updateThemeSetting,
      updateHeaderInverse,
      switchActiveContext,
      createOrganizationHierarchy,
      applySettingCascade,
      uploadTenantMedia,
      signInWithPassword,
      signInWithOtp,
      requestPasswordReset,
      signOut,
      listPasskeys,
      refreshPasskeys,
      registerPasskey,
      authenticateWithPasskey,
      refreshTenantData,
      saveOnboardingProgress,
      loadOnboardingProgress,
      recordTenantOnboardingStep,
      completeTenantOnboardingRun,
      createOrUpdateCorporateTenant,
    ],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

TenantProvider.propTypes = {
  children: PropTypes.node,
  initialThemeSetting: PropTypes.string,
  initialHeaderInverse: PropTypes.bool,
  initialServerUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string,
  }),
};
