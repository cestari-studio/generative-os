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
import { Add, UserFollow, UserMultiple } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardUsersTab = () => {
  const { t } = useTranslation();
  const { activeOrganization, persons = [], user } = useTenant();

  const headers = [
    { key: 'name', header: t('dashboard.users.colName', 'Member Name') },
    { key: 'email', header: t('dashboard.users.colEmail', 'Email Address') },
    { key: 'role', header: t('dashboard.users.colRole', 'Organization Role') },
    { key: 'status', header: t('dashboard.users.colStatus', 'Status') },
    { key: 'identifier', header: t('dashboard.users.colId', 'Person ID') },
  ];

  const rows = persons.map((person, index) => {
    const isCurrentUser = user?.email === person.email;

    return {
      id: person.id || `person-${index}`,
      name: person.name || person.email || t('dashboard.users.unnamed', 'Anonymous Person'),
      email: person.email || '—',
      role: isCurrentUser
        ? t('dashboard.users.roleOwner', 'Tenant Owner / Administrator')
        : t('dashboard.users.roleMember', 'Workspace Member'),
      status: t('common.selected', 'Active'),
      identifier: person.id || '—',
    };
  });

  return (
    <Section as="section" className="cs--dashboard-tab-pane" aria-labelledby="users-tab-heading">
      <Grid className="cs--dashboard-users-overview">
        {/* Team Members Summary Tile */}
        <Column sm={4} md={8} lg={16}>
          <Tile className="cs--dashboard-summary-tile">
            <div className="cs--dashboard-summary-tile__header">
              <UserMultiple size={24} className="cs--dashboard-summary-tile__icon" />
              <div>
                <Heading id="users-tab-heading" className="cs--dashboard-summary-tile__title">
                  {t('dashboard.users.title', 'Tenant Members & Permissions')}
                </Heading>
                <p className="cs--dashboard-summary-tile__subtitle">
                  {t(
                    'dashboard.users.subtitle',
                    'Schema.org Person entities registered in {{org}} with isolated RBAC scopes.',
                    { org: activeOrganization?.name || 'organization' },
                  )}
                </p>
              </div>
            </div>
            <div className="cs--dashboard-summary-tile__actions">
              <Button
                kind="primary"
                size="md"
                renderIcon={Add}
                disabled
                title={t(
                  'dashboard.users.inviteUnavailableTitle',
                  'Member invitation is not available yet — the invitation flow is not provisioned for this organization.',
                )}
              >
                {t('dashboard.users.inviteButton', 'Invite Team Member')}
              </Button>
              <p className="cs--dashboard-summary-tile__note">
                {t(
                  'dashboard.users.inviteUnavailableNote',
                  'Member invitation is not provisioned for this organization yet. Manage members directly in the organization roster.',
                )}
              </p>
            </div>
          </Tile>
        </Column>

        {/* Members DataTable */}
        <Column sm={4} md={8} lg={16}>
          <DataTable rows={rows} headers={headers}>
            {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer
                title={t('dashboard.users.tableTitle', 'Organization Members')}
                description={t(
                  'dashboard.users.tableDesc',
                  'Audited personnel authorized under multi-tenant enterprise governance policies.',
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

export default DashboardUsersTab;
