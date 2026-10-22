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
  Tag,
  TextInput,
} from '@carbon/react';
import {
  ArrowLeft,
  ArrowRight,
  CheckmarkFilled,
  FaceActivated,
  FingerprintRecognition,
  Login,
  Renew,
} from '@carbon/icons-react';
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
    authenticateWithPasskey,
  } = useTenant();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberId, setRememberId] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [mfaModality, setMfaModality] = useState('touch'); // 'touch' | 'camera'
  const [mfaStatus, setMfaStatus] = useState('idle'); // 'idle' | 'scanning' | 'verified' | 'error'

  const handleQuickSelectEmail = (selectedEmail) => {
    setEmail(selectedEmail);
    setPassword('Carbon2026!');
    setErrorMessage('');
  };

  const handleStep1Continue = (e) => {
    e?.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('signInModal.error.invalidEmail', 'Enter a valid IBMid or email address.'));
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
      setErrorMessage(t('signInModal.error.invalidCredentials', 'Incorrect IBMid or password. Try again.'));
    }
  };

  const handleBiometricAuth = async (targetEmail = email, modality = mfaModality) => {
    setIsLoading(true);
    setMfaStatus('scanning');
    setErrorMessage('');
    try {
      const result = await authenticateWithPasskey(targetEmail.trim(), modality);
      setMfaStatus('verified');
      setIsLoading(false);
      closeSignInModal();

      const authenticatedPerson = result?.person || person;
      if (!authenticatedPerson?.account_type) {
        openOnboardingFlow();
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setIsLoading(false);
      setMfaStatus('error');
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        setErrorMessage(
          t(
            'signInModal.mfa.cancelled',
            'Biometric verification was cancelled. You can retry or choose an alternative method.',
          ),
        );
      } else {
        setErrorMessage(
          err?.message ||
            t('signInModal.mfa.failed', 'Biometric authentication failed. Try again or use email verification.'),
        );
      }
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('signInModal.error.invalidEmail', 'Enter a valid IBMid or email address.'));
      return;
    }
    setIsLoading(true);
    try {
      await signInWithOtp(email.trim());
      setIsLoading(false);
      setOtpSent(true);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to send magic link');
    }
  };

  const ActiveSensorIcon =
    mfaStatus === 'verified' ? CheckmarkFilled : mfaModality === 'camera' ? FaceActivated : FingerprintRecognition;

  return (
    <ComposedModal
      open={isSignInModalOpen}
      onClose={closeSignInModal}
      className={classNames('cs--sign-in-modal', className)}
      size="md"
      aria-label={t('signInModal.title', 'Log in to Generative OS')}
    >
      <ModalHeader
        title={t('signInModal.title', 'Log in to Generative OS')}
        label={t('signInModal.headerLabel', 'Enterprise Authentication')}
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
          <ProgressStep
            label={t('signInModal.steps.mfa', '3. Multi-Factor (MFA)')}
            description={t('signInModal.steps.mfaDesc', 'Touch or Camera')}
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
                labelText={t('signInModal.emailLabel', 'IBMid or work email')}
                placeholder="architect@ibm.com"
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

              {/* Fast-track Passkey Biometric Action */}
              <div className="cs--sign-in-modal__fast-track">
                <div className="cs--sign-in-modal__fast-track-header">
                  <span className="cs--sign-in-modal__fast-track-title">
                    {t('signInModal.fastTrackTitle', 'Passwordless Biometric MFA:')}
                  </span>
                  <Tag size="sm" type="blue">
                    FIDO2 / WebAuthn
                  </Tag>
                </div>
                <Button
                  type="button"
                  kind="tertiary"
                  size="md"
                  renderIcon={FingerprintRecognition}
                  onClick={() => {
                    if (email.trim() && email.includes('@')) {
                      handleBiometricAuth(email, 'touch');
                    } else {
                      setSignInStep(2);
                    }
                  }}
                  disabled={isLoading}
                >
                  {t('signInModal.fastTrackPasskey', 'Sign in with Biometrics (Passkey)')}
                </Button>
              </div>

              {/* Demo Enterprise Identities */}
              <div className="cs--sign-in-modal__quick-accounts">
                <div className="cs--sign-in-modal__quick-title">
                  {t('signInModal.quickFillTitle', 'Demo Enterprise Identities (Single Click):')}
                </div>
                <div className="cs--sign-in-modal__quick-tags">
                  <Button
                    type="button"
                    kind="tertiary"
                    size="sm"
                    className="cs--sign-in-modal__quick-btn"
                    onClick={() => handleQuickSelectEmail('architect@ibm.com')}
                  >
                    Ruth Leach (architect@ibm.com)
                  </Button>
                  <Button
                    type="button"
                    kind="tertiary"
                    size="sm"
                    className="cs--sign-in-modal__quick-btn"
                    onClick={() => handleQuickSelectEmail('anne.profile@ibm.com')}
                  >
                    Anne Profile (anne.profile@ibm.com)
                  </Button>
                  <Button
                    type="button"
                    kind="tertiary"
                    size="sm"
                    className="cs--sign-in-modal__quick-btn"
                    onClick={() => handleQuickSelectEmail('ruth.leach@ibm.com')}
                  >
                    Platform Owner (ruth.leach@ibm.com)
                  </Button>
                </div>
              </div>
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
                <Button kind="ghost" size="sm" onClick={handleMagicLink} disabled={isLoading}>
                  {t('signInModal.magicLinkBtn', 'Email magic link instead')}
                </Button>
                <Button kind="ghost" size="sm" renderIcon={FingerprintRecognition} onClick={() => setSignInStep(2)}>
                  {t('signInModal.proceedMfa', 'Verify with Biometric MFA →')}
                </Button>
              </div>

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

        {/* Step 2: Multi-Factor Authentication (MFA) via Biometric Passkey */}
        {signInStep === 2 && (
          <div className="cs--sign-in-modal__step">
            <Stack gap={5}>
              <div className="cs--sign-in-modal__identity-bar">
                <span className="cs--sign-in-modal__identity-email">{email || 'architect@ibm.com'}</span>
                <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={() => setSignInStep(1)}>
                  {t('signInModal.mfa.backToPassword', 'Back to Password')}
                </Button>
              </div>

              <div className="cs--sign-in-modal__mfa-card">
                <div>
                  <h4 className="cs--sign-in-modal__mfa-heading">
                    {t('signInModal.mfa.heading', 'Multi-Factor Biometric Authentication')}
                  </h4>
                  <p className="cs--sign-in-modal__mfa-sub">
                    {t(
                      'signInModal.mfa.subheading',
                      'Verify your identity using your device sensor via touch or facial recognition camera.',
                    )}
                  </p>
                </div>

                {/* Modality Selector: Touch vs Camera */}
                <div className="cs--sign-in-modal__mfa-modalities">
                  <button
                    type="button"
                    className={classNames('cs--sign-in-modal__modality-tile', {
                      'cs--sign-in-modal__modality-tile--active': mfaModality === 'touch',
                    })}
                    onClick={() => setMfaModality('touch')}
                    aria-label={t('signInModal.mfa.touchMethodAria', 'Touch Method (Touch ID / Fingerprint)')}
                  >
                    <div className="cs--sign-in-modal__modality-header">
                      <FingerprintRecognition size={24} />
                      <Tag size="sm" type={mfaModality === 'touch' ? 'cyan' : 'cool-gray'}>
                        {mfaModality === 'touch' ? t('common.selected', 'Active') : t('common.select', 'Select')}
                      </Tag>
                    </div>
                    <span className="cs--sign-in-modal__modality-name">
                      {t('signInModal.mfa.touchMethod', 'Touch Method')}
                    </span>
                    <span className="cs--sign-in-modal__modality-desc">
                      {t('signInModal.mfa.touchDesc', 'Touch ID / Fingerprint sensor')}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={classNames('cs--sign-in-modal__modality-tile', {
                      'cs--sign-in-modal__modality-tile--active': mfaModality === 'camera',
                    })}
                    onClick={() => setMfaModality('camera')}
                    aria-label={t(
                      'signInModal.mfa.cameraMethodAria',
                      'Camera Method (Facial Recognition / Windows Hello)',
                    )}
                  >
                    <div className="cs--sign-in-modal__modality-header">
                      <FaceActivated size={24} />
                      <Tag size="sm" type={mfaModality === 'camera' ? 'cyan' : 'cool-gray'}>
                        {mfaModality === 'camera' ? t('common.selected', 'Active') : t('common.select', 'Select')}
                      </Tag>
                    </div>
                    <span className="cs--sign-in-modal__modality-name">
                      {t('signInModal.mfa.cameraMethod', 'Camera Method')}
                    </span>
                    <span className="cs--sign-in-modal__modality-desc">
                      {t('signInModal.mfa.cameraDesc', 'Facial Recognition / Windows Hello')}
                    </span>
                  </button>
                </div>

                {/* Sensor Feedback Panel */}
                <div className="cs--sign-in-modal__sensor-panel">
                  <div
                    className={classNames('cs--sign-in-modal__sensor-icon-wrapper', {
                      'cs--sign-in-modal__sensor-icon--scanning': mfaStatus === 'scanning',
                    })}
                  >
                    <ActiveSensorIcon size={24} />
                  </div>
                  <div className="cs--sign-in-modal__sensor-text">
                    <span className="cs--sign-in-modal__sensor-status-label">
                      {mfaStatus === 'scanning'
                        ? t('signInModal.mfa.scanning', 'Awaiting Biometric Sensor Interaction...')
                        : mfaStatus === 'verified'
                          ? t('signInModal.mfa.verified', 'Biometric Signature Verified')
                          : t('signInModal.mfa.ready', 'Biometric Authenticator Ready')}
                    </span>
                    <span className="cs--sign-in-modal__sensor-status-msg">
                      {mfaStatus === 'scanning'
                        ? mfaModality === 'camera'
                          ? t('signInModal.mfa.cameraScanPrompt', 'Look at your camera to confirm your identity.')
                          : t(
                              'signInModal.mfa.touchScanPrompt',
                              'Touch the fingerprint sensor to confirm your identity.',
                            )
                        : t(
                            'signInModal.mfa.sensorPrompt',
                            'Click Authenticate to trigger your device hardware security check.',
                          )}
                    </span>
                  </div>
                </div>

                <div className="cs--sign-in-modal__alt-actions">
                  <Button kind="ghost" size="sm" onClick={handleMagicLink} disabled={isLoading}>
                    {t('signInModal.mfa.fallbackMagicLink', 'Send Email One-Time Link instead')}
                  </Button>
                </div>
              </div>
            </Stack>
          </div>
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

        {signInStep === 2 && (
          <Button
            kind="primary"
            renderIcon={isLoading ? Renew : mfaModality === 'camera' ? FaceActivated : FingerprintRecognition}
            onClick={() => handleBiometricAuth(email || 'architect@ibm.com', mfaModality)}
            disabled={isLoading}
          >
            {isLoading
              ? t('signInModal.mfa.authenticating', 'Authenticating...')
              : t('signInModal.mfa.authenticateBtn', 'Authenticate with Biometrics')}
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
