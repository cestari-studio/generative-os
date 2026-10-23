/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Button,
  Column,
  DataTable,
  Grid,
  Heading,
  Section,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react';
import { Add, Launch, Workspace } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardWorkspaceTab = () => {
  const { t } = useTranslation();
  const notReported = t('common.notReported', 'Not reported');
  const {
    activeOrganization,
    activeWorkspace,
    workspaces = [],
    projects = [],
    openOnboardingFlow,
    switchActiveContext,
  } = useTenant();

  const headers = [
    { key: 'name', header: t('dashboard.workspaces.colName', 'Workspace Name') },
    { key: 'identifier', header: t('dashboard.workspaces.colIdentifier', 'Identifier / ID') },
    { key: 'projectsCount', header: t('dashboard.workspaces.colProjects', 'CreativeWork Projects') },
    { key: 'status', header: t('dashboard.workspaces.colStatus', 'Status') },
    { key: 'actions', header: t('common.actions', 'Actions') },
  ];

  const rows = workspaces.map((ws) => {
    const wsProjects = projects.filter((p) => p.workspace_id === ws.id);
    const isActive = ws.id === activeWorkspace?.id;

    return {
      id: ws.id,
      name: ws.name || notReported,
      identifier: ws.identifier || ws.id,
      projectsCount: wsProjects.length,
      status: isActive ? t('common.selected', 'Active') : t('common.standby', 'Available'),
      actions: (
        <Button
          kind={isActive ? 'ghost' : 'tertiary'}
          size="sm"
          disabled={isActive}
          onClick={() => switchActiveContext({ workspaceId: ws.id })}
        >
          {isActive ? t('common.selected', 'Active') : t('common.select', 'Switch')}
        </Button>
      ),
    };
  });

  return (
    <Section as="section" className="cs--dashboard-tab-pane" aria-labelledby="workspace-tab-heading">
      <Grid className="cs--dashboard-workspace-overview">
        {/* Active Workspace Focus Tile */}
        <Column sm={4} md={8} lg={16}>
          <Tile className="cs--dashboard-summary-tile">
            <div className="cs--dashboard-summary-tile__header">
              <Workspace size={24} className="cs--dashboard-summary-tile__icon" />
              <div>
                <Heading id="workspace-tab-heading" className="cs--dashboard-summary-tile__title">
                  {activeWorkspace?.name || t('dashboard.workspaces.current', 'Active Workspace')}
                </Heading>
                <p className="cs--dashboard-summary-tile__subtitle">
                  {t('dashboard.workspaces.organization', 'Organization')}: {activeOrganization?.name || notReported} •{' '}
                  {t('dashboard.workspaces.identifier', 'ID')}: {activeWorkspace?.id || notReported}
                </p>
              </div>
            </div>
            <div className="cs--dashboard-summary-tile__actions">
              <Button kind="primary" size="md" renderIcon={Add} onClick={() => openOnboardingFlow(1)}>
                {t('dashboard.workspaces.createButton', 'Create New Workspace')}
              </Button>
            </div>
          </Tile>
        </Column>

        {/* Workspaces DataTable */}
        <Column sm={4} md={8} lg={16}>
          <DataTable rows={rows} headers={headers}>
            {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer
                title={t('dashboard.workspaces.tableTitle', 'Provisioned Workspaces')}
                description={t(
                  'dashboard.workspaces.tableDesc',
                  'Isolated multi-tenant execution contexts governed by Schema.org creative work models.',
                )}
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {tableHeaders.map((header) => (
                        <TableHeader {...getHeaderProps({ header })} key={header.key}>
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </Column>
      </Grid>
    </Section>
  );
};

export default DashboardWorkspaceTab;
