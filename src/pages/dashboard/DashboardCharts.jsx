/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { useMemo, useSyncExternalStore } from 'react';
import { Column, Grid, Layer, SkeletonPlaceholder, Tile } from '@carbon/react';
import { AreaChart, DonutChart, SimpleBarChart } from '@carbon/charts-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const ClientOnlyChart = ({ children }) => {
  const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  if (!isClient) {
    return <SkeletonPlaceholder style={{ inlineSize: '100%', blockSize: '280px' }} />;
  }
  return children;
};

ClientOnlyChart.propTypes = {
  children: PropTypes.node.isRequired,
};

export const DashboardCharts = ({ activityChartData, cascadeDonutData, corpusBarData, loading }) => {
  const { t } = useTranslation();
  const { themeSetting } = useTenant();

  const chartTheme = useMemo(() => {
    if (themeSetting === 'g100' || themeSetting === 'g90') return 'g100';
    if (themeSetting === 'g10') return 'g10';
    return 'white';
  }, [themeSetting]);

  const activityOptions = useMemo(
    () => ({
      title: t('dashboard.charts.activityTitle', 'Tenant Activity & Audit Timeline'),
      axes: {
        bottom: {
          title: t('dashboard.charts.timelineAxis', 'Timeline'),
          mapsTo: 'date',
          scaleType: 'labels',
        },
        left: {
          title: t('dashboard.charts.actionsAxis', 'Actions recorded'),
          mapsTo: 'value',
          scaleType: 'linear',
        },
      },
      curve: 'curveMonotoneX',
      height: '300px',
      theme: chartTheme,
      legend: {
        alignment: 'center',
      },
    }),
    [t, chartTheme],
  );

  const donutOptions = useMemo(
    () => ({
      title: t('dashboard.charts.cascadeTitle', 'Cascade Governance Rule Distribution'),
      resizable: true,
      height: '300px',
      theme: chartTheme,
      donut: {
        center: {
          label: t('dashboard.charts.rulesTotal', 'Effective rules'),
        },
      },
      legend: {
        alignment: 'center',
      },
    }),
    [t, chartTheme],
  );

  const barOptions = useMemo(
    () => ({
      title: t('dashboard.charts.corpusTitle', 'Knowledge & Media Assets by Format'),
      axes: {
        left: {
          mapsTo: 'value',
          title: t('dashboard.charts.itemsCount', 'Count'),
        },
        bottom: {
          mapsTo: 'group',
          scaleType: 'labels',
        },
      },
      height: '260px',
      theme: chartTheme,
      legend: {
        enabled: false,
      },
    }),
    [t, chartTheme],
  );

  return (
    <section
      className="cs--dashboard__section"
      aria-label={t('dashboard.chartsRegion', 'Telemetry and Governance Analytics')}
    >
      <Grid className="cs--dashboard__charts-grid">
        {/* 1. Activity Timeline AreaChart */}
        <Column sm={4} md={8} lg={10}>
          <Layer>
            <Tile className="cs--dashboard__chart-tile">
              <h3 className="cs--dashboard__chart-heading">
                {t('dashboard.charts.activityTitle', 'Tenant Activity & Audit Timeline')}
              </h3>
              <p className="cs--dashboard__chart-desc">
                {t(
                  'dashboard.charts.activityDesc',
                  'Audited actions recorded in public.audit_actions across active horizons.',
                )}
              </p>
              {loading ? (
                <SkeletonPlaceholder style={{ inlineSize: '100%', blockSize: '300px' }} />
              ) : (
                <ClientOnlyChart>
                  <AreaChart data={activityChartData} options={activityOptions} />
                </ClientOnlyChart>
              )}
            </Tile>
          </Layer>
        </Column>

        {/* 2. Cascade DonutChart */}
        <Column sm={4} md={8} lg={6}>
          <Layer>
            <Tile className="cs--dashboard__chart-tile">
              <h3 className="cs--dashboard__chart-heading">
                {t('dashboard.charts.cascadeTitle', 'Cascade Governance Rule Distribution')}
              </h3>
              <p className="cs--dashboard__chart-desc">
                {t(
                  'dashboard.charts.cascadeDesc',
                  'Breakdown of active settings by inheritance and locking directives.',
                )}
              </p>
              {loading ? (
                <SkeletonPlaceholder style={{ inlineSize: '100%', blockSize: '300px' }} />
              ) : (
                <ClientOnlyChart>
                  <DonutChart data={cascadeDonutData} options={donutOptions} />
                </ClientOnlyChart>
              )}
            </Tile>
          </Layer>
        </Column>

        {/* 3. Corpus BarChart */}
        <Column sm={4} md={8} lg={16}>
          <Layer>
            <Tile className="cs--dashboard__chart-tile">
              <h3 className="cs--dashboard__chart-heading">
                {t('dashboard.charts.corpusTitle', 'Knowledge & Media Assets by Format')}
              </h3>
              <p className="cs--dashboard__chart-desc">
                {t(
                  'dashboard.charts.corpusDesc',
                  'Breakdown of indexed Schema.org DigitalDocument and MediaObject files.',
                )}
              </p>
              {loading ? (
                <SkeletonPlaceholder style={{ inlineSize: '100%', blockSize: '260px' }} />
              ) : (
                <ClientOnlyChart>
                  <SimpleBarChart data={corpusBarData} options={barOptions} />
                </ClientOnlyChart>
              )}
            </Tile>
          </Layer>
        </Column>
      </Grid>
    </section>
  );
};

DashboardCharts.propTypes = {
  activityChartData: PropTypes.arrayOf(PropTypes.object).isRequired,
  cascadeDonutData: PropTypes.arrayOf(PropTypes.object).isRequired,
  corpusBarData: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool.isRequired,
};
