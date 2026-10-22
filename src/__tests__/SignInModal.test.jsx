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
import { SignInModal } from '../components/auth/SignInModal';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';

describe('SignInModal (Fixed-Dimension Enterprise Authentication)', () => {
  const mockCloseModal = vi.fn();
  const mockSetStep = vi.fn();
  const mockSignIn = vi.fn();
  const mockOpenOnboarding = vi.fn();

  beforeEach(() => {
    mockCloseModal.mockReset();
    mockSetStep.mockReset();
    mockSignIn.mockReset();
    mockOpenOnboarding.mockReset();
  });

  test('renders Step 1: Identity with fixed dialog and single-click demo credentials', async () => {
    const user = userEvent.setup();
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 0,
      setSignInStep: mockSetStep,
      closeSignInModal: mockCloseModal,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Log in to Generative OS')).toBeInTheDocument();
    expect(screen.getByLabelText('IBMid or work email')).toBeInTheDocument();
    expect(screen.getByLabelText('Remember user ID')).toBeInTheDocument();
    expect(screen.getByText('Demo Enterprise Identities (Single Click):')).toBeInTheDocument();

    // Click demo identity tag
    const ruthTag = screen.getByText('Ruth Leach (architect@ibm.com)');
    await user.click(ruthTag);

    expect(screen.getByDisplayValue('architect@ibm.com')).toBeInTheDocument();

    // Click Continue
    const continueBtn = screen.getByText('Continue');
    await user.click(continueBtn);

    expect(mockSetStep).toHaveBeenCalledWith(1);
  });

  test('renders Step 2: Credentials with password input and triggers onboarding when profile is incomplete', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValueOnce({ user: { email: 'architect@ibm.com' } });

    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 1,
      setSignInStep: mockSetStep,
      closeSignInModal: mockCloseModal,
      openOnboardingFlow: mockOpenOnboarding,
      signInWithPassword: mockSignIn,
      person: null, // Incomplete onboarding
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Email magic link instead')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'Carbon2026!');

    const logInBtn = screen.getByRole('button', { name: 'Log in' });
    await user.click(logInBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('', 'Carbon2026!');
      expect(mockCloseModal).toHaveBeenCalled();
      expect(mockOpenOnboarding).toHaveBeenCalled();
    });
  });

  test('validates email before proceeding to Step 2', async () => {
    const user = userEvent.setup();
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 0,
      setSignInStep: mockSetStep,
      closeSignInModal: mockCloseModal,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    const emailInput = screen.getByLabelText('IBMid or work email');
    await user.type(emailInput, 'invalid-email');

    const continueBtn = screen.getByText('Continue');
    await user.click(continueBtn);

    expect(screen.getByText('Enter a valid IBMid or email address.')).toBeInTheDocument();
    expect(mockSetStep).not.toHaveBeenCalled();
  });

  test('renders Step 3: Multi-Factor Authentication (MFA) with Touch and Camera modalities and completes biometric verification', async () => {
    const user = userEvent.setup();
    const mockAuthPasskey = vi.fn().mockResolvedValueOnce({
      user: { id: 'usr_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'architect@ibm.com' },
      person: { account_type: 'PF', name: 'Ruth Leach' },
      modality: 'touch',
    });

    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 2,
      setSignInStep: mockSetStep,
      closeSignInModal: mockCloseModal,
      authenticateWithPasskey: mockAuthPasskey,
      person: { account_type: 'PF', name: 'Ruth Leach' },
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    // Verify MFA Heading and Biometric Modalities are present
    expect(screen.getByText('Multi-Factor Biometric Authentication')).toBeInTheDocument();
    expect(screen.getByText('Touch Method')).toBeInTheDocument();
    expect(screen.getByText('Camera Method')).toBeInTheDocument();
    expect(screen.getByText('Biometric Authenticator Ready')).toBeInTheDocument();

    // Select Camera Method
    const cameraTile = screen.getByRole('button', {
      name: /Camera Method/i,
    });
    await user.click(cameraTile);

    // Click Authenticate with Biometrics
    const authBtn = screen.getByRole('button', { name: 'Authenticate with Biometrics' });
    await user.click(authBtn);

    await waitFor(() => {
      expect(mockAuthPasskey).toHaveBeenCalledWith('architect@ibm.com', 'camera');
      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  test('allows navigating from Credentials to Biometric MFA step', async () => {
    const user = userEvent.setup();
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 1,
      setSignInStep: mockSetStep,
      closeSignInModal: mockCloseModal,
    };

    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    const mfaBtn = screen.getByRole('button', { name: /Verify with Biometric MFA/i });
    expect(mfaBtn).toBeInTheDocument();
    await user.click(mfaBtn);

    expect(mockSetStep).toHaveBeenCalledWith(2);
  });
});
