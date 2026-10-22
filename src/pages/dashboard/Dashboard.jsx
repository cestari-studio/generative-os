/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import { Column, FeatureFlags, Grid, Stack, TabPanel, TabPanels, Tabs } from '@carbon/react';
import { useTranslation } from 'react-i18next';

import { CARBON_V12_FLAGS } from '../../config/carbon-flags';
import { Footer } from '../../components/footer/Footer';
import { PageLayout } from '../../layouts/page-layout';
import { useDashboardData } from './useDashboardData';
import { DashboardHeader } from './DashboardHeader';
import { DashboardOnboarding } from './DashboardOnboarding';
import { DashboardFilters } from './DashboardFilters';
import { DashboardKpis } from './DashboardKpis';
import { DashboardCharts } from './DashboardCharts';
import { DashboardTables } from './DashboardTables';
import { DashboardWorkspaceTab } from './DashboardWorkspaceTab';
import { DashboardUsersTab } from './DashboardUsersTab';
import { DashboardSubscriptionsTab } from './DashboardSubscriptionsTab';
import { DashboardSettingsTab } from './DashboardSettingsTab';

const Dashboard = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    activeOrganization,
    activeWorkspace,
    activeProject,
    workspaces,
    timeHorizon,
    setTimeHorizon,
    workspaceFilter,
    setWorkspaceFilter,
    governanceSearch,
    setGovernanceSearch,
    auditSearch,
    setAuditSearch,
    kpis,
    activityChartData,
    cascadeDonutData,
    corpusBarData,
    governanceRows,
    auditRows,
    loading,
    refreshTenantData,
  } = useDashboardData();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (typeof refreshTenantData === 'function') {
        await refreshTenantData();
      }
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const handleExport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      organization: activeOrganization?.name || 'Organization',
      workspace: activeWorkspace?.name || 'Workspace',
      project: activeProject?.name || 'Project',
      timeHorizon,
      metrics: {
        activeMembers: kpis.members.raw,
        projects: kpis.projects.raw,
        knowledgeAssets: kpis.assets.raw,
        lockedCascadeRules: kpis.lockedRules.raw,
      },
      effectiveSettingsCount: governanceRows.length,
      auditActionsCount: auditRows.length,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genos-dashboard-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <FeatureFlags flags={CARBON_V12_FLAGS}>
      <PageLayout className="cs--dashboard" fallback={<p>{t('dashboard.loading', 'Loading dashboard...')}</p>}>
        <Tabs
          selectedIndex={activeTab}
          onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
          className="cs--dashboard-tabs-root"
        >
          {/* 1. Canonical Carbon PageHeader (Storybook Reference) */}
          <DashboardHeader
            activeOrganization={activeOrganization}
            activeWorkspace={activeWorkspace}
            onExport={handleExport}
            onOpenSettings={() => setActiveTab(4)}
            onRefresh={handleRefresh}
          />

          {/* 2. Coordinated TabPanels matching Carbon Products Storybook architecture */}
          <TabPanels className="cs--dashboard-tab-panels">
            {/* Tab 0: Executive Dashboard View */}
            <TabPanel className="page-header-story--tall-tab-panel cs--dashboard-tab-panel">
              <Stack gap={7} className="cs--dashboard__content-stack">
                {/* Onboarding Journey using previewCandidate__GetStartedCard */}
                <DashboardOnboarding />

                {/* Global Telemetry Filters */}
                <Grid className="cs--dashboard__filters-grid">
                  <Column sm={4} md={8} lg={16}>
                    <DashboardFilters
                      timeHorizon={timeHorizon}
                      onTimeHorizonChange={setTimeHorizon}
                      workspaceFilter={workspaceFilter}
                      onWorkspaceFilterChange={setWorkspaceFilter}
                      workspaces={workspaces}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                    />
                  </Column>
                </Grid>

                {/* 4-KPI Metric Row */}
                <DashboardKpis kpis={kpis} loading={loading} />

                {/* Telemetry and Governance Charts */}
                <DashboardCharts
                  activityChartData={activityChartData}
                  cascadeDonutData={cascadeDonutData}
                  corpusBarData={corpusBarData}
                  loading={loading}
                />

                {/* Live Governance & Audit Ledgers */}
                <DashboardTables
                  governanceRows={governanceRows}
                  auditRows={auditRows}
                  governanceSearch={governanceSearch}
                  onGovernanceSearchChange={setGovernanceSearch}
                  auditSearch={auditSearch}
                  onAuditSearchChange={setAuditSearch}
                  loading={loading}
                />
              </Stack>
            </TabPanel>

            {/* Tab 1: Provisioned Workspaces */}
            <TabPanel className="page-header-story--tall-tab-panel cs--dashboard-tab-panel">
              <DashboardWorkspaceTab />
            </TabPanel>

            {/* Tab 2: Tenant Members & Roles */}
            <TabPanel className="page-header-story--tall-tab-panel cs--dashboard-tab-panel">
              <DashboardUsersTab />
            </TabPanel>

            {/* Tab 3: Subscriptions & Billing */}
            <TabPanel className="page-header-story--tall-tab-panel cs--dashboard-tab-panel">
              <DashboardSubscriptionsTab />
            </TabPanel>

            {/* Tab 4: Cascade Governance & Preferences */}
            <TabPanel className="page-header-story--tall-tab-panel cs--dashboard-tab-panel">
              <DashboardSettingsTab />
            </TabPanel>
          </TabPanels>
        </Tabs>

        <Footer />
      </PageLayout>
    </FeatureFlags>
  );
};

export default Dashboard;
