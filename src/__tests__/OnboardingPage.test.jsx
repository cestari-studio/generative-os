/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithoutProviders } from '../test/test-utils';
import { MemoryRouter } from 'react-router';
import { OnboardingPage } from '../pages/onboarding/OnboardingPage';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';

describe('OnboardingPage (Dedicated Route /onboarding)', () => {
  test('renders OnboardingFullPage in standalone mode on direct navigation', () => {
    const mockSaveOnboarding = vi.fn().mockResolvedValue({});
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: false, // In standalone mode, does not require modal flag
      saveOnboardingProgress: mockSaveOnboarding,
    };

    renderWithoutProviders(
      <MemoryRouter initialEntries={['/onboarding']}>
        <TenantContext.Provider value={contextValue}>
          <OnboardingPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Should render the full page onboarding wizard directly
    expect(screen.getByText('Complete your organization & account setup')).toBeInTheDocument();
    expect(screen.getByText('1. Legal Entity Classification')).toBeInTheDocument();
    expect(screen.getByText('Individual / Natural Person (PF)')).toBeInTheDocument();
    expect(screen.getByText('Enterprise / Legal Entity (PJ)')).toBeInTheDocument();
  });
});
