/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { BreadcrumbItem, Button, Tab, TabList } from '@carbon/react';
import { Dashboard as DashboardIcon, Download, Renew, SettingsAdjust } from '@carbon/icons-react';
import { preview__PageHeader as PageHeader } from '@carbon/ibm-products';
import { useTranslation } from 'react-i18next';

export const DashboardHeader = ({ activeOrganization, activeWorkspace, onExport, onOpenSettings, onRefresh }) => {
  const { t } = useTranslation();

  const pageTitle = activeOrganization?.name
    ? `${activeOrganization.name} ${t('dashboard.header.title', 'Dashboard')}`
    : t('dashboard.header.title', 'Tenant Dashboard');

  const pageSubtitle = activeWorkspace?.name
    ? `${activeWorkspace.name} • ${activeOrganization?.identifier || activeOrganization?.id || ''}`
    : t(
        'dashboard.header.subtitle',
        'Enterprise multi-tenant telemetry, onboarding orchestration, and governance operations',
      );

  const contentActions = [
    {
      id: 'action-refresh',
      menuItem: { label: t('dashboard.toolbar.refresh', 'Refresh telemetry') },
      body: (
        <Button
          hasIconOnly
          iconDescription={t('dashboard.toolbar.refresh', 'Refresh telemetry')}
          kind="ghost"
          renderIcon={Renew}
          size="md"
          onClick={onRefresh}
        />
      ),
      onClick: onRefresh,
    },
    {
      id: 'action-export',
      menuItem: { label: t('dashboard.toolbar.export', 'Export report') },
      body: (
        <Button
          hasIconOnly
          iconDescription={t('dashboard.toolbar.export', 'Export report')}
          kind="ghost"
          renderIcon={Download}
          size="md"
          onClick={onExport}
        />
      ),
      onClick: onExport,
    },
    {
      id: 'primary-action',
      menuItem: { label: t('nav.links.cascadeSettings', 'Cascade Settings') },
      body: (
        <Button
          aria-label={t('nav.links.cascadeSettings', 'Cascade Settings')}
          kind="primary"
          renderIcon={SettingsAdjust}
          size="md"
          onClick={onOpenSettings}
        >
          {t('nav.links.cascadeSettings', 'Cascade Settings')}
        </Button>
      ),
      onClick: onOpenSettings,
    },
  ];

  const breadcrumbActions = [
    {
      id: 'breadcrumb-action-1',
      label: t('dashboard.toolbar.refresh', 'Refresh telemetry'),
      onClick: onRefresh,
      renderIcon: Renew,
    },
    {
      id: 'breadcrumb-action-2',
      label: t('dashboard.toolbar.export', 'Export report'),
      onClick: onExport,
      renderIcon: Download,
    },
    {
      id: 'breadcrumb-action-3',
      label: t('nav.links.cascadeSettings', 'Cascade Settings'),
      onClick: onOpenSettings,
      renderIcon: SettingsAdjust,
    },
  ];

  return (
    <PageHeader.Root className="cs--dashboard-page-header">
      <PageHeader.BreadcrumbBar
        border
        contentActions={
          <PageHeader.ContentPageActions
            actions={contentActions}
            menuButtonLabel={t('dashboard.header.actionsButton', 'Actions')}
          />
        }
        contentActionsFlush
        pageActions={<PageHeader.BreadcrumbPageActions actions={breadcrumbActions} />}
        renderIcon={DashboardIcon}
      >
        <PageHeader.BreadcrumbOverflow noTrailingSlash>
          <BreadcrumbItem href="/">{t('dashboard.breadcrumbs.home', 'Home')}</BreadcrumbItem>
          <PageHeader.TitleBreadcrumb data-fixed>{pageTitle}</PageHeader.TitleBreadcrumb>
        </PageHeader.BreadcrumbOverflow>
      </PageHeader.BreadcrumbBar>

      <PageHeader.Content
        pageActions={
          <PageHeader.ContentPageActions
            actions={contentActions}
            menuButtonLabel={t('dashboard.header.actionsButton', 'Actions')}
          />
        }
        title={pageTitle}
      >
        <PageHeader.ContentText subtitle={pageSubtitle} />
      </PageHeader.Content>

      <PageHeader.TabBar>
        <TabList aria-label={t('dashboard.tabs.ariaLabel', 'Dashboard views')}>
          <Tab id="tab-dashboard">{t('dashboard.tabs.dashboard', 'Dashboard')}</Tab>
          <Tab id="tab-workspace">{t('dashboard.tabs.workspace', 'Workspace')}</Tab>
          <Tab id="tab-users">{t('dashboard.tabs.users', 'Users')}</Tab>
          <Tab id="tab-subscriptions">{t('dashboard.tabs.subscriptions', 'Subscriptions')}</Tab>
          <Tab id="tab-settings">{t('dashboard.tabs.settings', 'Settings')}</Tab>
        </TabList>
      </PageHeader.TabBar>
    </PageHeader.Root>
  );
};

DashboardHeader.propTypes = {
  activeOrganization: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    identifier: PropTypes.string,
    plan_tier: PropTypes.string,
  }),
  activeWorkspace: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  }),
  onExport: PropTypes.func,
  onOpenSettings: PropTypes.func,
  onRefresh: PropTypes.func,
};

export default DashboardHeader;
