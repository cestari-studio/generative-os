/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { Column, Grid, Layer, SkeletonText, Tile } from '@carbon/react';
import { Document, Locked, Portfolio, UserMultiple } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';

export const DashboardKpis = ({ kpis, loading }) => {
  const { t } = useTranslation();

  const cards = [
    {
      id: 'kpi-members',
      label: t('dashboard.kpis.membersLabel', 'Active members'),
      value: kpis.members.formatted,
      raw: kpis.members.raw,
      subtitle: t('dashboard.kpis.membersSub', 'Schema.org Persons registered in organization'),
      icon: UserMultiple,
      tagType: 'blue',
      tagText: t('dashboard.kpis.membersTag', 'Tier 4 Persons'),
    },
    {
      id: 'kpi-projects',
      label: t('dashboard.kpis.projectsLabel', 'CreativeWork projects'),
      value: kpis.projects.formatted,
      raw: kpis.projects.raw,
      subtitle: t('dashboard.kpis.projectsSub', 'Active initiatives across workspaces'),
      icon: Portfolio,
      tagType: 'teal',
      tagText: t('dashboard.kpis.projectsTag', 'Tier 3 Projects'),
    },
    {
      id: 'kpi-assets',
      label: t('dashboard.kpis.assetsLabel', 'Knowledge assets'),
      value: kpis.assets.formatted,
      raw: kpis.assets.raw,
      subtitle: t('dashboard.kpis.assetsSub', 'Vector embeddings & media objects'),
      icon: Document,
      tagType: 'purple',
      tagText: t('dashboard.kpis.assetsTag', 'pgvector & Storage'),
    },
    {
      id: 'kpi-rules',
      label: t('dashboard.kpis.rulesLabel', 'Locked cascade rules'),
      value: kpis.lockedRules.formatted,
      raw: kpis.lockedRules.raw,
      subtitle: t('dashboard.kpis.rulesSub', 'Enforced policies from higher tiers'),
      icon: Locked,
      tagType: 'warm-gray',
      tagText: t('dashboard.kpis.rulesTag', 'Strict Governance'),
    },
  ];

  return (
    <section className="cs--dashboard__section" aria-label={t('dashboard.kpisRegion', 'Operational KPIs')}>
      <Grid className="cs--dashboard__kpis-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Column sm={4} md={4} lg={4} key={card.id}>
              <Layer>
                <Tile className="cs--dashboard__kpi-tile">
                  <div className="cs--dashboard__kpi-header">
                    <span className="cs--dashboard__kpi-label">{card.label}</span>
                    <Icon className="cs--dashboard__kpi-icon" aria-hidden="true" size={20} />
                  </div>

                  <div className="cs--dashboard__kpi-value-row">
                    {loading ? (
                      <SkeletonText heading width="60%" />
                    ) : (
                      <span className="cs--dashboard__kpi-value">{card.value}</span>
                    )}
                    <span className="cs--dashboard__kpi-badge">{card.tagText}</span>
                  </div>

                  <p className="cs--dashboard__kpi-subtitle">{card.subtitle}</p>
                </Tile>
              </Layer>
            </Column>
          );
        })}
      </Grid>
    </section>
  );
};

DashboardKpis.propTypes = {
  kpis: PropTypes.shape({
    members: PropTypes.shape({ raw: PropTypes.number, formatted: PropTypes.string }).isRequired,
    projects: PropTypes.shape({ raw: PropTypes.number, formatted: PropTypes.string }).isRequired,
    assets: PropTypes.shape({ raw: PropTypes.number, formatted: PropTypes.string }).isRequired,
    lockedRules: PropTypes.shape({ raw: PropTypes.number, formatted: PropTypes.string }).isRequired,
  }).isRequired,
  loading: PropTypes.bool.isRequired,
};
