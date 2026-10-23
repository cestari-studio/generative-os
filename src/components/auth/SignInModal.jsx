/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {
  Button,
  Checkbox,
  ComposedModal,
  Form,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PasswordInput,
  ProgressIndicator,
  ProgressStep,
  Stack,
  TextInput,
} from '@carbon/react';
import { ArrowLeft, ArrowRight, Login } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTenant } from '../../context/useTenant';

export const SignInModal = ({ className }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    person,
    isSignInModalOpen,
    signInStep,
    setSignInStep,
    closeSignInModal,
    openOnboardingFlow,
    signInWithPassword,
    signInWithOtp,
    requestPasswordReset,
  } = useTenant();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberId, setRememberId] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleStep1Continue = (e) => {
    e?.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('signInModal.error.invalidEmail', 'Enter a valid email address.'));
      return;
    }
    setErrorMessage('');
    setSignInStep(1);
  };

  const handleStep2Submit = async (e) => {
    e?.preventDefault();
    if (!password) {
      setErrorMessage(t('signInModal.error.emptyPassword', 'Password is required.'));
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const authResult = await signInWithPassword(email.trim(), password);
      setIsLoading(false);
      closeSignInModal();

      // If user profile has not finished onboarding (no account_type registered), launch fullscreen onboarding flow
      const authenticatedPerson = authResult?.person || person;
      if (!authenticatedPerson?.account_type) {
        openOnboardingFlow();
      } else {
        navigate('/dashboard');
      }
    } catch {
      setIsLoading(false);
      setPassword('');
      setErrorMessage(t('signInModal.error.invalidCredentials', 'Incorrect email or password. Try again.'));
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('signInModal.error.invalidEmail', 'Enter a valid email address.'));
      return;
    }
    setIsLoading(true);
    try {
      await signInWithOtp(email.trim());
      setIsLoading(false);
      setOtpSent(true);
      setResetSent(false);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to send magic link');
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('signInModal.error.invalidEmail', 'Enter a valid email address.'));
      return;
    }
    setIsLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setIsLoading(false);
      setResetSent(true);
      setOtpSent(false);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || t('signInModal.error.resetFailed', 'Failed to send password reset link'));
    }
  };

  return (
    <ComposedModal
      open={isSignInModalOpen}
      onClose={closeSignInModal}
      className={classNames('cs--sign-in-modal', className)}
      size="md"
      aria-label={t('signInModal.title', 'Log in to genOS')}
    >
      <ModalHeader
        title={t('signInModal.title', 'Log in to genOS')}
        label={t('signInModal.headerLabel', 'Cestari Studio Authentication')}
      />
      <ModalBody hasForm>
        <ProgressIndicator currentIndex={signInStep} spaceEqually className="cs--sign-in-modal__progress">
          <ProgressStep
            label={t('signInModal.steps.identity', '1. Identity')}
            description={t('signInModal.steps.identityDesc', 'User ID')}
          />
          <ProgressStep
            label={t('signInModal.steps.credentials', '2. Credentials')}
            description={t('signInModal.steps.credentialsDesc', 'Password & Verify')}
          />
        </ProgressIndicator>

        {errorMessage && (
          <InlineNotification
            lowContrast
            kind="error"
            title={t('signInModal.error.title', 'Authentication error')}
            subtitle={errorMessage}
            onClose={() => setErrorMessage('')}
          />
        )}

        {/* Step 0: Identity */}
        {signInStep === 0 && (
          <Form onSubmit={handleStep1Continue} className="cs--sign-in-modal__step">
            <Stack gap={5}>
              <TextInput
                id="sign-in-email"
                labelText={t('signInModal.emailLabel', 'Work email')}
                placeholder={t('signInModal.emailPlaceholder', 'you@company.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="md"
              />

              <Checkbox
                id="sign-in-remember-id"
                labelText={t('signInModal.rememberId', 'Remember user ID')}
                checked={rememberId}
                onChange={(_e, { checked }) => setRememberId(checked)}
              />

              <InlineNotification
                lowContrast
                hideCloseButton
                kind="info"
                title={t('signInModal.passkeyUnavailableTitle', 'Passkeys unavailable in this version')}
                subtitle={t(
                  'signInModal.passkeyUnavailableDesc',
                  'Passwordless sign-in will be enabled after server-verified WebAuthn registration is available.',
                )}
              />
            </Stack>
          </Form>
        )}

        {/* Step 1: Credentials */}
        {signInStep === 1 && (
          <Form onSubmit={handleStep2Submit} className="cs--sign-in-modal__step">
            <Stack gap={5}>
              <div className="cs--sign-in-modal__identity-bar">
                <span className="cs--sign-in-modal__identity-email">{email}</span>
                <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={() => setSignInStep(0)}>
                  {t('signInModal.changeEmail', 'Change')}
                </Button>
              </div>

              <PasswordInput
                id="sign-in-password"
                labelText={t('signInModal.passwordLabel', 'Password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="md"
              />

              <div className="cs--sign-in-modal__alt-actions">
                <Button kind="ghost" size="sm" onClick={handleForgotPassword} disabled={isLoading}>
                  {t('signInModal.forgotPasswordBtn', 'Forgot password?')}
                </Button>
                <Button kind="ghost" size="sm" onClick={handleMagicLink} disabled={isLoading}>
                  {t('signInModal.magicLinkBtn', 'Email magic link instead')}
                </Button>
              </div>

              {resetSent && (
                <InlineNotification
                  lowContrast
                  kind="info"
                  title={t('signInModal.resetSentTitle', 'Password reset link sent')}
                  subtitle={t(
                    'signInModal.resetSentDesc',
                    'Check your email inbox for the password reset link to choose a new password.',
                  )}
                />
              )}

              {otpSent && (
                <InlineNotification
                  lowContrast
                  kind="info"
                  title={t('signInModal.otpSentTitle', 'Magic link sent')}
                  subtitle={t('signInModal.otpSentDesc', 'Check your email inbox for the direct login link.')}
                />
              )}
            </Stack>
          </Form>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeSignInModal}>
          {t('common.cancel', 'Cancel')}
        </Button>

        {signInStep === 0 && (
          <Button kind="primary" renderIcon={ArrowRight} onClick={handleStep1Continue} disabled={!email.trim()}>
            {t('signInModal.continue', 'Continue')}
          </Button>
        )}

        {signInStep === 1 && (
          <Button kind="primary" renderIcon={Login} onClick={handleStep2Submit} disabled={!password || isLoading}>
            {isLoading ? t('signInModal.authenticating', 'Authenticating...') : t('signInModal.logIn', 'Log in')}
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  );
};

SignInModal.propTypes = {
  className: PropTypes.string,
};

export default SignInModal;
