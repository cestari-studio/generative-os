/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithoutProviders } from '../test/test-utils';
import { useTenant } from '../context/useTenant';
import { DashboardUsersTab } from '../pages/dashboard/DashboardUsersTab';
import { DashboardWorkspaceTab } from '../pages/dashboard/DashboardWorkspaceTab';

vi.mock('../context/useTenant', () => ({ useTenant: vi.fn() }));

beforeEach(() => {
  useTenant.mockReset().mockReturnValue({
    activeOrganization: null,
    activeWorkspace: null,
    persons: [],
    workspaces: [],
    projects: [],
    user: { email: 'owner@example.invalid' },
    switchActiveContext: vi.fn(),
    openOnboardingFlow: vi.fn(),
  });
});

describe('dashboard tenant roster states do not invent identity or permission data', () => {
  test('does not infer organization-owner role or active status from the current session', () => {
    useTenant.mockReturnValue({
      activeOrganization: null,
      activeWorkspace: null,
      persons: [{ id: 'person-1', email: 'owner@example.invalid' }],
      workspaces: [],
      projects: [],
      user: { email: 'owner@example.invalid' },
      switchActiveContext: vi.fn(),
      openOnboardingFlow: vi.fn(),
    });
    renderWithoutProviders(<DashboardUsersTab />);

    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.queryByText('Tenant Owner / Administrator')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace Member')).not.toBeInTheDocument();
    expect(screen.queryByText('Anonymous Person')).not.toBeInTheDocument();
  });

  test('does not fabricate default workspace names or organization context', () => {
    useTenant.mockReturnValue({
      activeOrganization: null,
      activeWorkspace: null,
      persons: [],
      workspaces: [{ id: 'workspace-real-1' }],
      projects: [],
      switchActiveContext: vi.fn(),
      openOnboardingFlow: vi.fn(),
    });
    renderWithoutProviders(<DashboardWorkspaceTab />);

    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.queryByText('Default Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Organization:\s*•/)).not.toBeInTheDocument();
  });
});
