/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Column, Grid, Heading, Section } from '@carbon/react';
import { ArrowRight, SkillLevel, Time } from '@carbon/icons-react';
import { previewCandidate__GetStartedCard as GetStartedCard } from '@carbon/ibm-products';
import { Cloud, DataBackup, FinanceStrategy, UserSearch } from '@carbon/pictograms-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardOnboarding = () => {
  const { t } = useTranslation();
  const { activeOrganization, workspaces = [], knowledgeDocuments = [], openOnboardingFlow } = useTenant();

  const isStep1Done = Boolean(activeOrganization?.name);
  const isStep2Done = workspaces.length > 0;
  const isStep3Done = knowledgeDocuments.length > 0;
  const isStep4Done = Boolean(activeOrganization?.plan_tier && activeOrganization.plan_tier !== 'free');

  const completedCount = [isStep1Done, isStep2Done, isStep3Done, isStep4Done].filter(Boolean).length;

  const renderAbstractMedia = () => (
    <img
      alt={t('dashboard.onboarding.mediaAlt', 'Abstract onboarding illustration')}
      src="/abstract-image.svg"
      className="cs--get-started-media-img"
    />
  );

  return (
    <Section as="section" className="cs--dashboard-onboarding" aria-labelledby="onboarding-heading">
      <div className="cs--dashboard-onboarding__header">
        <Heading id="onboarding-heading" className="cs--dashboard-onboarding__title">
          {t('dashboard.onboarding.title', 'Complete Your Tenant Onboarding')}
        </Heading>
        <p className="cs--dashboard-onboarding__subtitle">
          {t(
            'dashboard.onboarding.subtitleWithProgress',
            'Follow these 4 essential steps to configure and provision your multi-tenant operating system ({{completed}} of 4 completed).',
            { completed: completedCount },
          )}
        </p>
      </div>

      <Grid className="cs--dashboard-onboarding__grid">
        {/* Step 1: DNA & Identity */}
        <Column sm={4} md={4} lg={4}>
          <GetStartedCard
            label={t('dashboard.onboarding.step1.label', 'Step 1 of 4')}
            title={t('dashboard.onboarding.step1.title', 'Configure Tenant DNA & Identity')}
            status={isStep1Done ? 'complete' : 'incomplete'}
            pictogram={UserSearch}
            media={renderAbstractMedia()}
            metadata={[
              {
                id: '1',
                icon: Time,
                iconDescription: t('dashboard.onboarding.step1.time', '2 mins'),
              },
              {
                id: '2',
                icon: SkillLevel,
                iconDescription: t('dashboard.onboarding.step1.skill', 'Beginner'),
              },
            ]}
            footerActionIcon={ArrowRight}
            onClick={() => openOnboardingFlow(0)}
            className="cs--get-started-card"
          >
            {t(
              'dashboard.onboarding.step1.desc',
              'Set legal organization details, multi-country validation, tax registry, and enterprise brand identity.',
            )}
          </GetStartedCard>
        </Column>

        {/* Step 2: Workspaces & Projects */}
        <Column sm={4} md={4} lg={4}>
          <GetStartedCard
            label={t('dashboard.onboarding.step2.label', 'Step 2 of 4')}
            title={t('dashboard.onboarding.step2.title', 'Provision Workspaces & Projects')}
            status={isStep2Done ? 'complete' : 'incomplete'}
            pictogram={Cloud}
            media={renderAbstractMedia()}
            metadata={[
              {
                id: '1',
                icon: Time,
                iconDescription: t('dashboard.onboarding.step2.time', '3 mins'),
              },
              {
                id: '2',
                icon: SkillLevel,
                iconDescription: t('dashboard.onboarding.step2.skill', 'Intermediate'),
              },
            ]}
            footerActionIcon={ArrowRight}
            onClick={() => openOnboardingFlow(1)}
            className="cs--get-started-card"
          >
            {t(
              'dashboard.onboarding.step2.desc',
              'Organize creative teams, define project boundaries, and set tenant isolation scopes.',
            )}
          </GetStartedCard>
        </Column>

        {/* Step 3: Vector Knowledge & Documents */}
        <Column sm={4} md={4} lg={4}>
          <GetStartedCard
            label={t('dashboard.onboarding.step3.label', 'Step 3 of 4')}
            title={t('dashboard.onboarding.step3.title', 'Index Vector Knowledge & Documents')}
            status={isStep3Done ? 'complete' : 'incomplete'}
            pictogram={DataBackup}
            media={renderAbstractMedia()}
            metadata={[
              {
                id: '1',
                icon: Time,
                iconDescription: t('dashboard.onboarding.step3.time', '5 mins'),
              },
              {
                id: '2',
                icon: SkillLevel,
                iconDescription: t('dashboard.onboarding.step3.skill', 'Intermediate'),
              },
            ]}
            footerActionIcon={ArrowRight}
            onClick={() => openOnboardingFlow(2)}
            className="cs--get-started-card"
          >
            {t(
              'dashboard.onboarding.step3.desc',
              'Upload documents to chunk and generate 384-dimensional pgvector embeddings for cognitive RAG.',
            )}
          </GetStartedCard>
        </Column>

        {/* Step 4: Subscription & FinOps */}
        <Column sm={4} md={4} lg={4}>
          <GetStartedCard
            label={t('dashboard.onboarding.step4.label', 'Step 4 of 4')}
            title={t('dashboard.onboarding.step4.title', 'Activate Subscription & FinOps')}
            status={isStep4Done ? 'complete' : 'incomplete'}
            pictogram={FinanceStrategy}
            media={renderAbstractMedia()}
            metadata={[
              {
                id: '1',
                icon: Time,
                iconDescription: t('dashboard.onboarding.step4.time', '2 mins'),
              },
              {
                id: '2',
                icon: SkillLevel,
                iconDescription: t('dashboard.onboarding.step4.skill', 'Beginner'),
              },
            ]}
            footerActionIcon={ArrowRight}
            onClick={() => openOnboardingFlow(3)}
            className="cs--get-started-card"
          >
            {t(
              'dashboard.onboarding.step4.desc',
              'Set up PagBank payment processing, select tier limits, and automate tenant fiscal billing.',
            )}
          </GetStartedCard>
        </Column>
      </Grid>
    </Section>
  );
};

export default DashboardOnboarding;
