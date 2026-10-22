/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { useMemo } from 'react';
import {
  Column,
  DataTable,
  DataTableSkeleton,
  Grid,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tile,
} from '@carbon/react';
import { NoDataEmptyState } from '@carbon/ibm-products';
import { useTranslation } from 'react-i18next';

export const DashboardTables = ({
  governanceRows,
  auditRows,
  governanceSearch,
  onGovernanceSearchChange,
  auditSearch,
  onAuditSearchChange,
  loading,
}) => {
  const { t } = useTranslation();

  const governanceHeaders = useMemo(
    () => [
      { key: 'property_id', header: t('dashboard.tables.propertyId', 'Property ID') },
      { key: 'scope', header: t('dashboard.tables.domain', 'Domain') },
      { key: 'source_level', header: t('dashboard.tables.sourceTier', 'Source tier') },
      { key: 'effective_cascade_rule', header: t('dashboard.tables.cascadeRule', 'Cascade rule') },
    ],
    [t],
  );

  const auditHeaders = useMemo(
    () => [
      { key: 'schema_type', header: t('dashboard.tables.actionType', 'Action @type') },
      { key: 'object_type', header: t('dashboard.tables.entity', 'Entity') },
      { key: 'instrument', header: t('dashboard.tables.instrument', 'Instrument') },
      { key: 'action_status', header: t('dashboard.tables.status', 'Status') },
    ],
    [t],
  );

  return (
    <section
      className="cs--dashboard__section"
      aria-label={t('dashboard.tablesRegion', 'Operational Ledgers and Governance Matrix')}
    >
      <Grid className="cs--dashboard__tables-grid">
        {/* 1. Effective Cascade Governance DataTable */}
        <Column sm={4} md={8} lg={8}>
          <Layer>
            <Tile className="cs--dashboard__table-tile">
              {loading ? (
                <DataTableSkeleton
                  headers={governanceHeaders}
                  rowCount={5}
                  columnCount={governanceHeaders.length}
                  showHeader
                  showToolbar
                />
              ) : (
                <DataTable rows={governanceRows} headers={governanceHeaders} size="sm">
                  {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                    <TableContainer
                      title={t('dashboard.tables.governanceTitle', 'Effective Cascade Governance')}
                      description={t(
                        'dashboard.tables.governanceDesc',
                        'Resolved Schema.org PropertyValue parameters computed across 4 hierarchical tiers.',
                      )}
                    >
                      <TableToolbar>
                        <TableToolbarContent>
                          <TableToolbarSearch
                            persistent
                            placeholder={t('dashboard.tables.searchGovernance', 'Filter policies...')}
                            value={governanceSearch}
                            onChange={(e, val) => onGovernanceSearchChange(val ?? e?.target?.value ?? '')}
                            onClear={() => onGovernanceSearchChange('')}
                          />
                        </TableToolbarContent>
                      </TableToolbar>

                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => {
                              const { key: _headerKey, ...headerProps } = getHeaderProps({ header });
                              return (
                                <TableHeader key={header.key} {...headerProps}>
                                  {header.header}
                                </TableHeader>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                                <NoDataEmptyState
                                  size="sm"
                                  title={t('dashboard.emptyStates.searchTitle', 'No matching results')}
                                  subtitle={t(
                                    'dashboard.emptyStates.searchSubtitle',
                                    'No records match "{{query}}". Clear search to see all entries.',
                                    { query: governanceSearch },
                                  )}
                                  action={{
                                    kind: 'tertiary',
                                    text: t('dashboard.emptyStates.clearSearch', 'Clear search'),
                                    onClick: () => onGovernanceSearchChange(''),
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ) : (
                            rows.map((row) => {
                              const { key: _rowKey, ...rowProps } = getRowProps({ row });
                              return (
                                <TableRow key={row.id} {...rowProps}>
                                  {row.cells.map((cell) => {
                                    if (cell.info.header === 'effective_cascade_rule') {
                                      const isLocked = cell.value === 'LOCKED';
                                      return (
                                        <TableCell key={cell.id}>
                                          <span
                                            className={`cs--dashboard__table-cell-badge ${
                                              isLocked
                                                ? 'cs--dashboard__table-cell-badge--locked'
                                                : 'cs--dashboard__table-cell-badge--neutral'
                                            }`}
                                          >
                                            {cell.value}
                                          </span>
                                        </TableCell>
                                      );
                                    }
                                    if (cell.info.header === 'source_level') {
                                      return (
                                        <TableCell key={cell.id}>
                                          <span className="cs--dashboard__table-cell-badge cs--dashboard__table-cell-badge--tier">
                                            {cell.value}
                                          </span>
                                        </TableCell>
                                      );
                                    }
                                    return <TableCell key={cell.id}>{cell.value}</TableCell>;
                                  })}
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              )}
            </Tile>
          </Layer>
        </Column>

        {/* 2. Schema.org Audit Action Stream DataTable */}
        <Column sm={4} md={8} lg={8}>
          <Layer>
            <Tile className="cs--dashboard__table-tile">
              {loading ? (
                <DataTableSkeleton
                  headers={auditHeaders}
                  rowCount={5}
                  columnCount={auditHeaders.length}
                  showHeader
                  showToolbar
                />
              ) : (
                <DataTable rows={auditRows} headers={auditHeaders} size="sm">
                  {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                    <TableContainer
                      title={t('dashboard.tables.auditTitle', 'Schema.org Audit Action Stream')}
                      description={t(
                        'dashboard.tables.auditDesc',
                        'Immutable multi-tenant operational ledger recorded in PostgreSQL public.audit_actions.',
                      )}
                    >
                      <TableToolbar>
                        <TableToolbarContent>
                          <TableToolbarSearch
                            persistent
                            placeholder={t('dashboard.tables.searchAudits', 'Filter audit actions...')}
                            value={auditSearch}
                            onChange={(e, val) => onAuditSearchChange(val ?? e?.target?.value ?? '')}
                            onClear={() => onAuditSearchChange('')}
                          />
                        </TableToolbarContent>
                      </TableToolbar>

                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => {
                              const { key: _headerKey, ...headerProps } = getHeaderProps({ header });
                              return (
                                <TableHeader key={header.key} {...headerProps}>
                                  {header.header}
                                </TableHeader>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                                <NoDataEmptyState
                                  size="sm"
                                  title={t('dashboard.emptyStates.searchTitle', 'No matching results')}
                                  subtitle={t(
                                    'dashboard.emptyStates.searchSubtitle',
                                    'No records match "{{query}}". Clear search to see all entries.',
                                    { query: auditSearch },
                                  )}
                                  action={{
                                    kind: 'tertiary',
                                    text: t('dashboard.emptyStates.clearSearch', 'Clear search'),
                                    onClick: () => onAuditSearchChange(''),
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ) : (
                            rows.map((row) => {
                              const { key: _rowKey, ...rowProps } = getRowProps({ row });
                              return (
                                <TableRow key={row.id} {...rowProps}>
                                  {row.cells.map((cell) => {
                                    if (cell.info.header === 'action_status') {
                                      const isComplete = (cell.value || '').toLowerCase().includes('complete');
                                      return (
                                        <TableCell key={cell.id}>
                                          <span
                                            className={`cs--dashboard__table-cell-badge ${
                                              isComplete
                                                ? 'cs--dashboard__table-cell-badge--success'
                                                : 'cs--dashboard__table-cell-badge--neutral'
                                            }`}
                                          >
                                            {cell.value}
                                          </span>
                                        </TableCell>
                                      );
                                    }
                                    return <TableCell key={cell.id}>{cell.value}</TableCell>;
                                  })}
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              )}
            </Tile>
          </Layer>
        </Column>
      </Grid>
    </section>
  );
};

DashboardTables.propTypes = {
  governanceRows: PropTypes.arrayOf(PropTypes.object).isRequired,
  auditRows: PropTypes.arrayOf(PropTypes.object).isRequired,
  governanceSearch: PropTypes.string.isRequired,
  onGovernanceSearchChange: PropTypes.func.isRequired,
  auditSearch: PropTypes.string.isRequired,
  onAuditSearchChange: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};
