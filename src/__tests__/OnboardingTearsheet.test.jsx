/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithoutProviders } from '../test/test-utils';
import { MemoryRouter } from 'react-router';
import { OnboardingTearsheet } from '../components/onboarding/OnboardingTearsheet';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';

describe('OnboardingTearsheet (Carbon preview__Tearsheet Architecture)', () => {
  const mockCloseFlow = vi.fn();
  const mockSaveOnboarding = vi.fn().mockResolvedValue({});
  const mockCreateCorporate = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    mockCloseFlow.mockReset();
    mockSaveOnboarding.mockReset();
    mockCreateCorporate.mockReset();
  });

  test('does not render tearsheet dialog when isOnboardingOpen is false', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: false,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders Step 0 DNA & Identity when opened', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      onboardingInitialStep: 0,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
      createOrUpdateCorporateTenant: mockCreateCorporate,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Configure Tenant DNA & Identity')).toBeInTheDocument();
    expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Legal Registered Name/i)).toBeInTheDocument();
  });

  test('navigates through steps using Back and Next buttons', async () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      onboardingInitialStep: 0,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
      createOrUpdateCorporateTenant: mockCreateCorporate,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Fill in org name
    const orgInput = screen.getByLabelText(/Organization Name/i);
    fireEvent.change(orgInput, { target: { value: 'Acme Cloud' } });

    // Click Next -> moves to Step 1
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('Provision Workspaces & Projects')).toBeInTheDocument();
    });

    // Click Back -> moves back to Step 0
    const backBtn = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Configure Tenant DNA & Identity')).toBeInTheDocument();
    });
  });

  test('invokes closeOnboardingFlow when Cancel is clicked', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      onboardingInitialStep: 0,
      closeOnboardingFlow: mockCloseFlow,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(mockCloseFlow).toHaveBeenCalled();
  });
});
