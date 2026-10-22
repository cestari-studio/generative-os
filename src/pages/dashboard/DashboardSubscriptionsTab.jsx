/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Button, Column, Grid, Heading, Section, Tile } from '@carbon/react';
import { Purchase, Wallet } from '@carbon/icons-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardSubscriptionsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrganization, persons = [], workspaces = [], knowledgeDocuments = [] } = useTenant();

  // The active plan tier comes from the organization record. Prices, limits
  // and bundles are served by the versioned billing catalog API; until the
  // catalog is configured for this organization there is no price to show.
  const planTier = (activeOrganization?.plan_tier || '').toUpperCase() || null;

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
                  {planTier
                    ? t('dashboard.subscriptions.currentPlan', 'Active Subscription: {{tier}}', { tier: planTier })
                    : t('dashboard.subscriptions.noPlan', 'No active subscription')}
                </Heading>
                <p className="cs--dashboard-summary-tile__subtitle">
                  {t(
                    'dashboard.subscriptions.subtitle',
                    'Billing, usage and subscription management for this organization.',
                  )}
                </p>
              </div>
            </div>
            <div className="cs--dashboard-summary-tile__actions">
              <Button kind="primary" size="md" renderIcon={Purchase} onClick={() => navigate('/payments')}>
                {t('dashboard.subscriptions.manageButton', 'Manage Billing & Payments')}
              </Button>
            </div>
          </Tile>
        </Column>

        {/* Usage counters — raw counts only; quota denominators come from the billing catalog */}
        <Column sm={4} md={4} lg={5}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.membersQuota', 'Team Members')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">{persons.length}</p>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={5}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.workspacesQuota', 'Workspaces')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">{workspaces.length}</p>
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={6}>
          <Tile className="cs--dashboard-quota-tile">
            <Heading className="cs--dashboard-quota-tile__title">
              {t('dashboard.subscriptions.ragQuota', 'Knowledge Documents')}
            </Heading>
            <p className="cs--dashboard-quota-tile__value">{knowledgeDocuments.length}</p>
          </Tile>
        </Column>

        {/* Catalog empty state — no fabricated tiers or prices */}
        <Column sm={4} md={8} lg={16}>
          <Tile className="cs--dashboard-plan-catalog-empty">
            <Heading className="cs--dashboard-plan-section-title">
              {t('dashboard.subscriptions.plansHeading', 'Subscription Plans')}
            </Heading>
            <p className="cs--dashboard-plan-section-subtitle">
              {t(
                'dashboard.subscriptions.pricingNotConfigured',
                'Pricing is not configured for this organization yet. Plans, prices and limits are published by the platform administrator through the versioned billing catalog.',
              )}
            </p>
          </Tile>
        </Column>
      </Grid>
    </Section>
  );
};

export default DashboardSubscriptionsTab;
