/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createContext, useContext } from 'react';
import { setHeaderInverse, setThemeSetting } from '../utils/theme.js';

/**
 * Tenant context contract.
 *
 * Runtime state always starts empty. Organizations, workspaces, projects,
 * settings, documents, media and audit entries are loaded from the backend;
 * a network or permission failure surfaces as an error/empty state and must
 * never fall back to synthetic tenant entities. Test fixtures live under
 * src/test/fixtures and are imported only by test files.
 */
export const DEFAULT_CONTEXT_VALUE = {
  user: null,
  person: null,
  persons: [],
  organizations: [],
  workspaces: [],
  projects: [],
  activeOrganizationId: null,
  activeWorkspaceId: null,
  activeProjectId: null,
  activeOrganization: null,
  activeWorkspace: null,
  activeProject: null,
  effectiveSettings: [],
  knowledgeDocuments: [],
  mediaObjects: [],
  auditActions: [],
  passkeys: [],
  loading: false,
  statusMessage: '',
  themeSetting: 'system',
  headerInverse: false,
  isSignInModalOpen: false,
  signInStep: 0,
  openSignInModal: () => {},
  closeSignInModal: () => {},
  setSignInStep: () => {},
  isOnboardingOpen: false,
  onboardingInitialStep: 0,
  openOnboardingFlow: () => {},
  closeOnboardingFlow: () => {},
  updateThemeSetting: (newTheme) => setThemeSetting(newTheme),
  updateHeaderInverse: (newInverse) => setHeaderInverse(newInverse),
  switchActiveContext: async () => {},
  createOrganizationHierarchy: async () => {},
  applySettingCascade: async () => {},
  uploadTenantMedia: async () => {},
  signInWithPassword: async () => {},
  signInWithOtp: async () => {},
  requestPasswordReset: async () => {},
  signOut: async () => {},
  registerPasskey: async () => {},
  authenticateWithPasskey: async () => {},
  refreshTenantData: async () => {},
  saveOnboardingProgress: async () => {},
  loadOnboardingProgress: async () => null,
  recordTenantOnboardingStep: async () => {},
  completeTenantOnboardingRun: async () => {},
  createOrUpdateCorporateTenant: async () => {},
};

export const TenantContext = createContext(DEFAULT_CONTEXT_VALUE);

export const useTenant = () => useContext(TenantContext);
