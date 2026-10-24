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

describe('SignInModal (Enterprise Authentication)', () => {
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

  test('renders Step 1: Identity without demo credentials or quick-fill identities', async () => {
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

    expect(screen.getByText('Log in to genOS')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
    expect(screen.getByLabelText('Remember user ID')).toBeInTheDocument();

    // No demo identities, quick-fill buttons or hardcoded passwords.
    expect(screen.queryByText(/Demo Enterprise Identities/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/architect@ibm\.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/anne\.profile@ibm\.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ruth\.leach@ibm\.com/i)).not.toBeInTheDocument();

    // Passkeys are offered as a real passwordless action (native Supabase
    // WebAuthn), not a disabled stub. No fake credentials anywhere.
    expect(screen.getByRole('button', { name: /Sign in with passkey/i })).toBeInTheDocument();

    const emailInput = screen.getByLabelText('Work email');
    await user.type(emailInput, 'person@example.com');

    const continueBtn = screen.getByText('Continue');
    await user.click(continueBtn);

    expect(mockSetStep).toHaveBeenCalledWith(1);
  });

  test('renders Step 2: Credentials with password input and triggers onboarding when profile is incomplete', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValueOnce({ user: { email: 'person@example.com' } });

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
    await user.type(passwordInput, 'test-password-123');

    const logInBtn = screen.getByRole('button', { name: 'Log in' });
    await user.click(logInBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('', 'test-password-123');
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

    const emailInput = screen.getByLabelText('Work email');
    await user.type(emailInput, 'invalid-email');

    const continueBtn = screen.getByText('Continue');
    await user.click(continueBtn);

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(mockSetStep).not.toHaveBeenCalled();
  });

  test('does not render a biometric/MFA step', () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 2,
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

    // There is no third step content and no passkey action buttons.
    expect(screen.queryByText(/Multi-Factor Biometric Authentication/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authenticate with Biometrics/i })).not.toBeInTheDocument();
  });
});
