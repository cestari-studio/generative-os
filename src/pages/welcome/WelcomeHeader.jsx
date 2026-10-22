/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Button } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CommonHeader } from '../../components/commonHeader/CommonHeader';
import { useTenant } from '../../context/useTenant';

export const WelcomeHeader = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, openSignInModal } = useTenant();

  return (
    <CommonHeader
      title={t('welcomeHeader.title', 'Welcome to Cestari Studio')}
      paragraphs={[
        <>
          {t(
            'welcomeHeader.description1',
            'Enterprise AI operating system with Schema.org multi-tenant cascade governance, cognitive vector RAG, and PagBank FinOps.',
          )}
        </>,
        <>{t('welcomeHeader.maintainer', 'Engineered with the IBM Carbon Design System v11 & v12.')}</>,
      ]}
      action={
        user ? (
          <Button renderIcon={ArrowRight} onClick={() => navigate('/dashboard')}>
            {t('welcomeHeader.button.enterApp', 'Enter Tenant Dashboard')}
          </Button>
        ) : (
          <Button renderIcon={ArrowRight} onClick={() => openSignInModal(0)}>
            {t('welcomeHeader.button.signIn', 'Sign in to Workspace')}
          </Button>
        )
      }
    />
  );
};
