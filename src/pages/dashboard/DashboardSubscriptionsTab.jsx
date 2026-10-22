/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Button, Column, Grid, Heading, ProgressBar, Section, Tile } from '@carbon/react';
import { Checkmark, Purchase, Wallet } from '@carbon/icons-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardSubscriptionsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrganization, persons = [], workspaces = [], knowledgeDocuments = [] } = useTenant();

  const planTier = (activeOrganization?.plan_tier || 'free').toUpperCase();
  const isPaid = planTier !== 'FREE';

  const memberLimit = isPaid ? (planTier === 'ENTERPRISE' ? 100 : 25) : 5;
  const workspaceLimit = isPaid ? (planTier === 'ENTERPRISE' ? 50 : 10) : 2;
  const docLimit = isPaid ? (planTier === 'ENTERPRISE' ? 10000 : 1000) : 50;

  return (
    <Section as="section" className="cs--dashboard-tab-pane" aria-labelledby="subscriptions-tab-heading">
      <Grid className="cs--dashboard-subscriptions-overview">
        {/* Active Plan Focus Tile */}
        <Column sm={4} md={8} lg={16}>
          <Tile className="cs--dashboard-summary-tile">
            <div className="cs--dashboard-summary-tile__header">
              <Wallet size={24} className="cs--dashboard-summary-tile__icon" />
              <div>
                <Heading id="subscriptions-tab-heading" className="cs--dashboard-summary-tile__title">
                  {t('dashboard.subscriptions.currentPlan', 'Active Subscription: {{tier}}', { tier: planTier })}
                </Heading>
                <p className="cs--dashboard-summary-tile__subtitle">
                  {t(
                    'dashboard.subscriptions.subtitle',
                    'PagBank FinOps processing with Schema.org MonetaryGrant auditing and automated billing cycles.',
                  )}
                </p>
              </div>
            </div>
            <div className="cs--dashboard-summary-tile__actions">
              <Button kind="primary" size="md" renderIcon={Purchase} onClick={() => navigate('/payments')}>
                {t('dashboard.subscriptions.manageButton', 'Manage Billing & PagBank')}
              </Button>
            </div>
          </Tile>
        </Column>

        {/* Quota Consumption Row */}
        <Column sm={4} md={4} lg={5}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.membersQuota', 'Team Members Quota')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">
              {persons.length} / {memberLimit}
            </p>
            <ProgressBar
              label={t('dashboard.subscriptions.quotaProgress', 'Utilization')}
              value={persons.length}
              max={memberLimit}
              hideLabel
            />
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={5}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.workspacesQuota', 'Workspaces Quota')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">
              {workspaces.length} / {workspaceLimit}
            </p>
            <ProgressBar
              label={t('dashboard.subscriptions.quotaProgress', 'Utilization')}
              value={workspaces.length}
              max={workspaceLimit}
              hideLabel
            />
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={6}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.ragQuota', 'Vector Knowledge Documents')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">
              {knowledgeDocuments.length} / {docLimit}
            </p>
            <ProgressBar
              label={t('dashboard.subscriptions.quotaProgress', 'Utilization')}
              value={knowledgeDocuments.length}
              max={docLimit}
              hideLabel
            />
          </Tile>
        </Column>

        {/* Available Tier Options Section Header */}
        <Column sm={4} md={8} lg={16}>
          <div className="cs--dashboard-plan-section-header">
            <Heading className="cs--dashboard-plan-section-title">
              {t('dashboard.subscriptions.plansHeading', 'Available Subscription Tiers')}
            </Heading>
            <p className="cs--dashboard-plan-section-subtitle">
              {t(
                'dashboard.subscriptions.plansDesc',
                'Choose a plan matching your multi-tenant scale and escrow management requirements.',
              )}
            </p>
          </div>
        </Column>

        {/* Available Tier Options */}
        <Column sm={4} md={4} lg={5}>
          <Tile className={`cs--dashboard-plan-card ${planTier === 'FREE' ? 'cs--dashboard-plan-card--active' : ''}`}>
            <Heading className="cs--dashboard-plan-card__tier">FREE</Heading>
            <p className="cs--dashboard-plan-card__price">$0 / month</p>
            <ul className="cs--dashboard-plan-card__features">
              <li>
                <Checkmark size={16} /> 5 Schema.org Persons
              </li>
              <li>
                <Checkmark size={16} /> 2 Workspaces
              </li>
              <li>
                <Checkmark size={16} /> 50 pgvector Documents
              </li>
            </ul>
            <Button
              kind={planTier === 'FREE' ? 'ghost' : 'tertiary'}
              size="md"
              disabled={planTier === 'FREE'}
              onClick={() => navigate('/payments')}
            >
              {planTier === 'FREE' ? t('common.selected', 'Current Plan') : t('common.select', 'Select')}
            </Button>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={5}>
          <Tile className={`cs--dashboard-plan-card ${planTier === 'PRO' ? 'cs--dashboard-plan-card--active' : ''}`}>
            <Heading className="cs--dashboard-plan-card__tier">PRO</Heading>
            <p className="cs--dashboard-plan-card__price">$49 / month</p>
            <ul className="cs--dashboard-plan-card__features">
              <li>
                <Checkmark size={16} /> 25 Schema.org Persons
              </li>
              <li>
                <Checkmark size={16} /> 10 Workspaces
              </li>
              <li>
                <Checkmark size={16} /> 1,000 pgvector Documents
              </li>
              <li>
                <Checkmark size={16} /> PagBank Invoicing
              </li>
            </ul>
            <Button
              kind={planTier === 'PRO' ? 'ghost' : 'primary'}
              size="md"
              disabled={planTier === 'PRO'}
              onClick={() => navigate('/payments')}
            >
              {planTier === 'PRO'
                ? t('common.selected', 'Current Plan')
                : t('dashboard.subscriptions.upgrade', 'Upgrade to Pro')}
            </Button>
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={6}>
          <Tile
            className={`cs--dashboard-plan-card ${planTier === 'ENTERPRISE' ? 'cs--dashboard-plan-card--active' : ''}`}
          >
            <Heading className="cs--dashboard-plan-card__tier">ENTERPRISE</Heading>
            <p className="cs--dashboard-plan-card__price">$199 / month</p>
            <ul className="cs--dashboard-plan-card__features">
              <li>
                <Checkmark size={16} /> 100 Schema.org Persons
              </li>
              <li>
                <Checkmark size={16} /> 50 Workspaces
              </li>
              <li>
                <Checkmark size={16} /> 10,000 pgvector Documents
              </li>
              <li>
                <Checkmark size={16} /> 4-Tier Cascade Locking
              </li>
              <li>
                <Checkmark size={16} /> Dedicated PagBank Escrow
              </li>
            </ul>
            <Button
              kind={planTier === 'ENTERPRISE' ? 'ghost' : 'primary'}
              size="md"
              disabled={planTier === 'ENTERPRISE'}
              onClick={() => navigate('/payments')}
            >
              {planTier === 'ENTERPRISE'
                ? t('common.selected', 'Current Plan')
                : t('dashboard.subscriptions.upgrade', 'Upgrade to Enterprise')}
            </Button>
          </Tile>
        </Column>
      </Grid>
    </Section>
  );
};

export default DashboardSubscriptionsTab;
