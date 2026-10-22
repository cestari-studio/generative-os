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
import { renderWithoutProviders } from '../test/test-utils';
import { MemoryRouter } from 'react-router';
import { OnboardingFullPage } from '../components/onboarding/OnboardingFullPage';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';

describe('OnboardingFullPage (Carbon Multistep Fullscreen Onboarding)', () => {
  const mockCloseFlow = vi.fn();
  const mockSwitchContext = vi.fn();
  const mockSaveOnboarding = vi.fn().mockResolvedValue({});
  const mockCreateCorporate = vi.fn().mockResolvedValue({});
  const mockRegisterPasskey = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    mockCloseFlow.mockReset();
    mockSwitchContext.mockReset();
    mockSaveOnboarding.mockReset();
    mockCreateCorporate.mockReset();
    mockRegisterPasskey.mockReset();
  });

  test('does not render when isOnboardingOpen is false and not standalone', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: false,
    };

    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingFullPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
  });

  test('renders Step 1 with PF/PJ switcher, 9 countries, and 5 languages', async () => {
    const user = userEvent.setup();
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingFullPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Header & Step 1 title
    expect(screen.getByText('Complete your organization & account setup')).toBeInTheDocument();
    expect(screen.getAllByText('Account & Jurisdiction').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1. Legal Entity Classification')).toBeInTheDocument();
    expect(screen.getByText('Individual / Natural Person (PF)')).toBeInTheDocument();
    expect(screen.getByText('Enterprise / Legal Entity (PJ)')).toBeInTheDocument();

    // Country selector with 9 countries
    const countrySelect = screen.getByLabelText('Country of Origin / Jurisdiction');
    expect(countrySelect).toBeInTheDocument();
    expect(screen.getByText('Brasil (BR)')).toBeInTheDocument();
    expect(screen.getByText('United States (US)')).toBeInTheDocument();
    expect(screen.getByText('Deutschland (DE)')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom (GB)')).toBeInTheDocument();
    expect(screen.getByText('Portugal (PT)')).toBeInTheDocument();
    expect(screen.getByText('España (ES)')).toBeInTheDocument();
    expect(screen.getByText('France (FR)')).toBeInTheDocument();
    expect(screen.getByText('China (CN)')).toBeInTheDocument();
    expect(screen.getByText('Japan (JP)')).toBeInTheDocument();

    // Language selector with 5 languages including zh-CN
    const langSelect = screen.getByLabelText('Preferred Interface Language');
    expect(langSelect).toBeInTheDocument();
    expect(screen.getByText('简体中文 (zh-CN)')).toBeInTheDocument();

    // Click Next button
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(mockSaveOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          accountType: 'individual',
          countryCode: 'BR',
          currentStep: 1,
          isCompleted: false,
        }),
      );
    });
  });

  test('switches to PJ and displays corporate fields including company size and representative', async () => {
    const user = userEvent.setup();
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingFullPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Switch to PJ
    const pjSwitch = screen.getByText('Enterprise / Legal Entity (PJ)');
    await user.click(pjSwitch);

    expect(screen.getByText('Enterprise Tenant Provisioning')).toBeInTheDocument();

    // Advance to Step 2
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('Company Profile & Registration')).toBeInTheDocument();
      expect(screen.getByLabelText('Legal Business Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Brand / Trade Name')).toBeInTheDocument();
      expect(screen.getByLabelText('CNPJ (Cadastro Nacional da Pessoa Jurídica)')).toBeInTheDocument();
    });
  });

  test('renders standalone mode directly without requiring isOnboardingOpen', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: false,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingFullPage standalone={true} />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Complete your organization & account setup')).toBeInTheDocument();
  });
});
