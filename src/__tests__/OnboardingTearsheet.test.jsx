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
    expect(screen.getByLabelText(/Organization Name/i)).not.toHaveAttribute('placeholder');
    expect(screen.getByLabelText(/Legal Registered Name/i)).not.toHaveAttribute('placeholder');
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

  test('FS2: does NOT provision at step 0; provisions only at step-3 confirm', async () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      onboardingInitialStep: 0,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
      createOrUpdateCorporateTenant: mockCreateCorporate,
      refreshTenantData: vi.fn().mockResolvedValue({}),
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Organization Name/i), { target: { value: 'Acme Cloud' } });

    // Step 0 -> 1: must NOT provision
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Provision Workspaces & Projects')).toBeInTheDocument());
    expect(mockCreateCorporate).not.toHaveBeenCalled();

    // Step 1 -> 2 -> 3
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Index Vector Knowledge & Documents')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Activate Subscription & FinOps')).toBeInTheDocument());
    expect(mockCreateCorporate).not.toHaveBeenCalled();

    // Step 3 "Finish" -> provisions exactly once
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(mockCreateCorporate).toHaveBeenCalledTimes(1));
    expect(mockCreateCorporate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme Cloud', identifier: 'acme-cloud' }),
    );
  });

  test('FS2: takeover-denial (42501) at confirm surfaces an honest identifier-taken message', async () => {
    mockCreateCorporate.mockRejectedValueOnce(
      Object.assign(new Error('provision_corporate_tenant: identifier conflict'), { code: '42501' }),
    );
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isOnboardingOpen: true,
      onboardingInitialStep: 0,
      closeOnboardingFlow: mockCloseFlow,
      saveOnboardingProgress: mockSaveOnboarding,
      createOrUpdateCorporateTenant: mockCreateCorporate,
      refreshTenantData: vi.fn().mockResolvedValue({}),
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <OnboardingTearsheet />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Organization Name/i), { target: { value: 'Acme Cloud' } });
    // Navigate to the final confirm step (step 3)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Provision Workspaces & Projects')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Index Vector Knowledge & Documents')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Activate Subscription & FinOps')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(screen.getByText(/This organization identifier is already in use/i)).toBeInTheDocument(),
    );
    // The flow stays open (no silent close on failure)
    expect(mockCloseFlow).not.toHaveBeenCalled();
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
