/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { ProfilePanel } from '../components/profilePanel/ProfilePanel';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';
import * as themeUtils from '../utils/theme';
import * as cookieUtils from '../utils/cookies';

// Setup test environment
beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

// Mock the theme utilities
const mockSetThemeSetting = vi.fn();
const mockSetHeaderInverse = vi.fn();

beforeEach(() => {
  // Reset mocks before each test
  mockSetThemeSetting.mockReset();
  mockSetHeaderInverse.mockReset();

  // Mock the theme utility functions
  vi.spyOn(themeUtils, 'setThemeSetting').mockImplementation(mockSetThemeSetting);
  vi.spyOn(themeUtils, 'setHeaderInverse').mockImplementation(mockSetHeaderInverse);

  // Mock cookie utilities to return default values
  vi.spyOn(cookieUtils, 'getThemeFromCookies').mockReturnValue({
    themeSetting: 'light',
    headerInverse: 'false',
  });

  // Mock getThemeSettings to return the same values
  vi.spyOn(themeUtils, 'getThemeSettings').mockReturnValue({
    themeSetting: 'light',
    headerInverse: false, // boolean value
  });
});

test('renders guest profile panel when unauthenticated (tenant info hidden before signin)', () => {
  renderWithoutProviders(
    <MemoryRouter>
      <ProfilePanel />
    </MemoryRouter>,
  );

  // Tenant/Account info should NOT be visible before signin
  expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  expect(screen.queryByText('jane.doe@example.com')).not.toBeInTheDocument();

  // Guest welcome and Log in action should be visible
  expect(screen.getByText('Guest Session')).toBeInTheDocument();
  expect(screen.getByText('Log in')).toBeInTheDocument();

  // Theme settings are visible
  expect(screen.getByText('Complement menu theme')).toBeInTheDocument();
});

test('renders authenticated profile panel with user and tenant read-only info after signin', () => {
  const authContext = {
    ...DEFAULT_CONTEXT_VALUE,
    user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'jane.doe@example.com' },
    person: { name: 'Jane Doe', email: 'jane.doe@example.com' },
    activeOrganization: {
      identifier: 'acme-labs',
      name: 'Acme Labs',
      legal_name: 'Acme Labs LLC',
      plan_tier: 'enterprise',
    },
    activeWorkspace: { id: 'ws-core-ai-123', name: 'Core AI Platform' },
    activeProject: { id: 'prj-agentic-456', name: 'Agentic Workflows' },
    activeWorkspaceId: 'ws-core-ai-123',
  };

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider value={authContext}>
        <ProfilePanel />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  // Authenticated user information is displayed
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();

  // Read-only tenant details are displayed dynamically without hardcoded values
  expect(screen.getByText('Instance')).toBeInTheDocument();
  expect(screen.getByText('acme-labs')).toBeInTheDocument();
  expect(screen.getByText('Organization')).toBeInTheDocument();
  // 'Acme Labs' now appears in both the workspace switcher tag and the
  // read-only account info — assert the switcher is rendered for signed-in users.
  expect(screen.getAllByText('Acme Labs').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('Multi-Tenant Context (Schema.org)')).toBeInTheDocument();
  expect(screen.getByText('Workspace ID')).toBeInTheDocument();
  expect(screen.getByText('ws-core-ai-123')).toBeInTheDocument();
  expect(screen.getByText('Brand')).toBeInTheDocument();
  expect(screen.getByText('Acme Labs LLC')).toBeInTheDocument();

  // Profile actions are displayed
  expect(screen.getByText('Profile Settings')).toBeInTheDocument();
  expect(screen.getByText('Plan ENTERPRISE')).toBeInTheDocument();
  expect(screen.getByText('Logout')).toBeInTheDocument();
});

test('changes theme when theme switcher is used', async () => {
  const user = userEvent.setup();
  renderWithoutProviders(
    <MemoryRouter>
      <ProfilePanel />
    </MemoryRouter>,
  );

  // Find all tab buttons in the theme switcher
  const buttons = screen.getAllByRole('tab');

  const darkButton = Array.from(buttons).find((button) => {
    return (
      button.textContent.toLowerCase().includes('dark') ||
      button.getAttribute('aria-label')?.toLowerCase().includes('dark')
    );
  });

  if (darkButton) {
    await user.click(darkButton);

    await waitFor(() => {
      expect(mockSetThemeSetting).toHaveBeenCalledWith('dark');
    });
  } else {
    throw new Error('Could not find dark theme button');
  }
});

test('toggles menu complement when checkbox is clicked', async () => {
  const user = userEvent.setup();
  renderWithoutProviders(
    <MemoryRouter>
      <ProfilePanel />
    </MemoryRouter>,
  );

  const complementLabel = screen.getByText('Complement menu theme');
  const checkboxes = screen.getAllByRole('checkbox');
  const complementCheckbox = checkboxes.find((checkbox) => {
    const labelFor = complementLabel.getAttribute('for');
    if (labelFor && labelFor === checkbox.id) {
      return true;
    }
    return complementLabel.contains(checkbox) || complementLabel.parentElement?.contains(checkbox);
  });

  if (complementCheckbox) {
    await user.click(complementCheckbox);

    await waitFor(() => {
      expect(mockSetHeaderInverse).toHaveBeenCalledWith(true);
    });
  } else {
    await user.click(complementLabel);

    await waitFor(() => {
      expect(mockSetHeaderInverse).toHaveBeenCalledWith(true);
    });
  }
});

test('triggers signOut and navigates on logout click', async () => {
  const user = userEvent.setup();
  const mockSignOut = vi.fn().mockResolvedValue();

  renderWithoutProviders(
    <MemoryRouter>
      <TenantContext.Provider
        value={{
          ...DEFAULT_CONTEXT_VALUE,
          user: { id: 'test-user', email: 'test@ibm.com' },
          signOut: mockSignOut,
        }}
      >
        <ProfilePanel />
      </TenantContext.Provider>
    </MemoryRouter>,
  );

  const logoutButton = screen.getByText('Logout');
  await user.click(logoutButton);

  await waitFor(() => {
    expect(mockSignOut).toHaveBeenCalled();
  });
});
