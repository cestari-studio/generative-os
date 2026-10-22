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
      title={t('welcomeHeader.title', 'genOS by Cestari Studio')}
      paragraphs={[
        <>
          {t(
            'welcomeHeader.description1',
            'genOS is the generative operational system from Cestari Studio Inc.: multi-tenant workspaces with cascade governance, knowledge retrieval and integrated billing.',
          )}
        </>,
        <>{t('welcomeHeader.description2', 'Sign in to access your organization, workspaces and projects.')}</>,
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
