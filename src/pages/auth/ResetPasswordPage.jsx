/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import { Button, Column, Grid, InlineNotification, Layer, PasswordInput, Stack, Tile } from '@carbon/react';
import { ArrowRight, CheckmarkFilled } from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { PageLayout } from '../../layouts/page-layout';
import { Footer } from '../../components/footer/Footer';
import { getSupabaseBrowserClient } from '../../lib/supabase.client.js';

/**
 * Password reset completion page. The user lands here from the recovery link
 * Supabase emails after requestPasswordReset (redirectTo = /reset-password).
 * Supabase delivers the recovery session via the URL; updateUser then sets the
 * new password. No demo/fake paths — a real recovery session is required.
 */
const ResetPasswordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMessage('');
    if (password.length < 8) {
      setErrorMessage(t('resetPassword.error.tooShort', 'Use at least 8 characters.'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('resetPassword.error.mismatch', 'Passwords do not match.'));
      return;
    }
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }
      setCompleted(true);
      setIsLoading(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t('resetPassword.error.generic', 'Failed to update password.'),
      );
      setIsLoading(false);
    }
  };

  return (
    <PageLayout className="cs--reset-password-page">
      <PageHeader
        title={t('resetPassword.title', 'Choose a new password')}
        subtitle={t(
          'resetPassword.subtitle',
          'Set a new password for your Cestari Studio account. The recovery link works once and expires.',
        )}
        className="cs--reset-password-page__header"
      />

      <Grid narrow className="cs--reset-password-page__grid">
        <Column sm={4} md={6} lg={6} className="cs--reset-password-page__col">
          <Layer level={1}>
            <Tile className="cs--reset-password-page__card">
              {completed ? (
                <Stack gap={5}>
                  <InlineNotification
                    lowContrast
                    hideCloseButton
                    kind="success"
                    title={t('resetPassword.successTitle', 'Password updated')}
                    subtitle={t('resetPassword.successDesc', 'Your password was changed. You can sign in with it now.')}
                  />
                  <Button kind="primary" renderIcon={CheckmarkFilled} onClick={() => navigate('/')}>
                    {t('resetPassword.backToSignIn', 'Back to sign in')}
                  </Button>
                </Stack>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Stack gap={5}>
                    {errorMessage && (
                      <InlineNotification
                        lowContrast
                        kind="error"
                        title={t('resetPassword.errorTitle', 'Could not update password')}
                        subtitle={errorMessage}
                        onClose={() => setErrorMessage('')}
                      />
                    )}

                    <PasswordInput
                      id="reset-password-new"
                      labelText={t('resetPassword.newLabel', 'New password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      size="md"
                    />

                    <PasswordInput
                      id="reset-password-confirm"
                      labelText={t('resetPassword.confirmLabel', 'Confirm new password')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      size="md"
                    />

                    <Button
                      type="submit"
                      kind="primary"
                      renderIcon={ArrowRight}
                      disabled={!password || !confirmPassword || isLoading}
                    >
                      {isLoading
                        ? t('resetPassword.updating', 'Updating password...')
                        : t('resetPassword.submit', 'Set new password')}
                    </Button>
                  </Stack>
                </form>
              )}
            </Tile>
          </Layer>
        </Column>
      </Grid>

      <Footer />
    </PageLayout>
  );
};

export default ResetPasswordPage;
