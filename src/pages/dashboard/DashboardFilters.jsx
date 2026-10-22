/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { Button, Dropdown } from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';

export const DashboardFilters = ({
  timeHorizon,
  onTimeHorizonChange,
  workspaceFilter,
  onWorkspaceFilterChange,
  workspaces,
  onRefresh,
  isRefreshing,
}) => {
  const { t } = useTranslation();

  const horizonItems = [
    { id: '24h', label: t('dashboard.toolbar.horizon24h', 'Last 24 hours') },
    { id: '7d', label: t('dashboard.toolbar.horizon7d', 'Last 7 days') },
    { id: '30d', label: t('dashboard.toolbar.horizon30d', 'Last 30 days') },
    { id: '90d', label: t('dashboard.toolbar.horizon90d', 'Quarterly (90 days)') },
  ];

  const workspaceItems = [
    { id: 'all', label: t('dashboard.toolbar.allWorkspaces', 'All workspaces') },
    ...workspaces.map((w) => ({ id: w.id, label: w.name })),
  ];

  const currentHorizon = horizonItems.find((h) => h.id === timeHorizon) || horizonItems[2];
  const currentWorkspace = workspaceItems.find((w) => w.id === workspaceFilter) || workspaceItems[0];

  return (
    <div
      className="cs--dashboard__filters"
      role="region"
      aria-label={t('dashboard.filtersRegion', 'Dashboard filters')}
    >
      <div className="cs--dashboard__filters-group">
        <Dropdown
          id="dashboard-horizon-dropdown"
          size="md"
          titleText={t('dashboard.toolbar.timeHorizonLabel', 'Time horizon')}
          label={currentHorizon.label}
          items={horizonItems}
          itemToString={(item) => (item ? item.label : '')}
          selectedItem={currentHorizon}
          onChange={({ selectedItem }) => onTimeHorizonChange(selectedItem?.id || '30d')}
        />
        <Dropdown
          id="dashboard-workspace-dropdown"
          size="md"
          titleText={t('dashboard.toolbar.workspaceScopeLabel', 'Workspace scope')}
          label={currentWorkspace.label}
          items={workspaceItems}
          itemToString={(item) => (item ? item.label : '')}
          selectedItem={currentWorkspace}
          onChange={({ selectedItem }) => onWorkspaceFilterChange(selectedItem?.id || 'all')}
        />
      </div>

      <div className="cs--dashboard__filters-actions">
        <Button
          kind="tertiary"
          size="md"
          renderIcon={Renew}
          iconDescription={t('dashboard.toolbar.refresh', 'Refresh metrics')}
          disabled={isRefreshing}
          onClick={onRefresh}
        >
          {isRefreshing
            ? t('dashboard.toolbar.refreshing', 'Refreshing...')
            : t('dashboard.toolbar.refresh', 'Refresh metrics')}
        </Button>
      </div>
    </div>
  );
};

DashboardFilters.propTypes = {
  timeHorizon: PropTypes.string.isRequired,
  onTimeHorizonChange: PropTypes.func.isRequired,
  workspaceFilter: PropTypes.string.isRequired,
  onWorkspaceFilterChange: PropTypes.func.isRequired,
  workspaces: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onRefresh: PropTypes.func.isRequired,
  isRefreshing: PropTypes.bool.isRequired,
};
