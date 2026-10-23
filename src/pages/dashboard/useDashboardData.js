/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

/**
 * Format a number using compact notation in the current locale.
 * Examples: 3 -> "3", 1200 -> "1.2K", 500000 -> "500K"
 */
export const formatCompactNumber = (num, locale = 'en') => {
  const parsed = Number(num);
  if (Number.isNaN(parsed)) return '0';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(parsed);
};


const displayOrNotReported = (value, notReportedLabel) => {
  if (value === null || value === undefined || value === '') return notReportedLabel;
  return String(value);
};

export const buildActivityChartData = (
  filteredAudits,
  referenceTimestamp,
  timeHorizon,
  labels = {},
) => {
  const buckets = {};
  const days = timeHorizon === '24h' ? 24 : timeHorizon === '7d' ? 7 : timeHorizon === '30d' ? 30 : 90;
  const isHourly = timeHorizon === '24h';

  const now = new Date(referenceTimestamp);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    if (isHourly) {
      d.setHours(d.getHours() - i);
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      buckets[label] = { completed: 0, pending: 0, other: 0 };
    } else {
      d.setDate(d.getDate() - i);
      const label = d.toISOString().slice(5, 10);
      buckets[label] = { completed: 0, pending: 0, other: 0 };
    }
  }

  filteredAudits.forEach((audit) => {
    if (!audit.created_at) return;
    const timestamp = new Date(audit.created_at);
    if (Number.isNaN(timestamp.getTime())) return;
    const label = isHourly
      ? `${String(timestamp.getHours()).padStart(2, '0')}:00`
      : timestamp.toISOString().slice(5, 10);
    if (!buckets[label]) return;

    const status = String(audit.action_status ?? '').toLowerCase();
    if (status.includes('complete')) {
      buckets[label].completed += 1;
    } else if (/(pending|potential|in.?progress|processing)/.test(status)) {
      buckets[label].pending += 1;
    } else {
      // Missing, failed, canceled and other unfamiliar statuses must not be
      // silently presented as pending/in-progress actions.
      buckets[label].other += 1;
    }
  });

  const rows = [];
  Object.entries(buckets).forEach(([date, counts]) => {
    rows.push({ group: labels.completed ?? 'Completed actions', date, value: counts.completed });
    rows.push({ group: labels.pending ?? 'Pending / in progress', date, value: counts.pending });
    rows.push({ group: labels.other ?? 'Other / unclassified statuses', date, value: counts.other });
  });
  return rows;
};

export const buildCascadeDonutData = (effectiveSettings) => {
  const counts = { LOCKED: 0, INHERIT_OVERRIDABLE: 0, MERGE: 0 };
  effectiveSettings.forEach((setting) => {
    const rule = setting?.effective_cascade_rule;
    if (Object.prototype.hasOwnProperty.call(counts, rule)) counts[rule] += 1;
  });
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([group, value]) => ({ group, value }));
};

export const buildCorpusBarData = (
  knowledgeDocuments,
  mediaObjects,
  labels = {},
) => {
  const formats = {};
  knowledgeDocuments.forEach((document) => {
    const format = document.file_type || document.encoding_format || labels.documentFormatNotReported || 'Unspecified document format';
    formats[format] = (formats[format] || 0) + 1;
  });
  mediaObjects.forEach((media) => {
    const format = media.encoding_format || labels.mediaFormatNotReported || 'Unspecified media format';
    formats[format] = (formats[format] || 0) + 1;
  });
  return Object.entries(formats).map(([group, value]) => ({ group, value }));
};

export const buildGovernanceRows = (effectiveSettings, search, notReportedLabel) => {
  const rows = effectiveSettings.map((setting, index) => ({
    // This generated ID is an internal table key only; unknown property IDs
    // are displayed as missing, never filled with a made-up domain value.
    id: setting.property_id || `unidentified-setting-${index}`,
    property_id: displayOrNotReported(setting.property_id, notReportedLabel),
    scope: displayOrNotReported(setting.scope, notReportedLabel),
    source_level: displayOrNotReported(setting.source_level, notReportedLabel),
    effective_cascade_rule: displayOrNotReported(setting.effective_cascade_rule, notReportedLabel),
    effective_value:
      setting.effective_value === null || setting.effective_value === undefined
        ? ''
        : typeof setting.effective_value === 'object'
          ? JSON.stringify(setting.effective_value)
          : String(setting.effective_value),
  }));
  const query = search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    [row.property_id, row.scope, row.source_level, row.effective_cascade_rule]
      .some((value) => value.toLowerCase().includes(query)),
  );
};

export const buildAuditRows = (filteredAudits, search, notReportedLabel, locale) => {
  const rows = filteredAudits.map((audit, index) => {
    const parsedTime = audit.created_at ? new Date(audit.created_at) : null;
    const hasValidTime = parsedTime && !Number.isNaN(parsedTime.getTime());
    return {
      id: audit.id || `audit-${index}`,
      schema_type: displayOrNotReported(audit.schema_type, notReportedLabel),
      object_type: displayOrNotReported(audit.object_type, notReportedLabel),
      instrument: displayOrNotReported(audit.instrument, notReportedLabel),
      action_status: displayOrNotReported(audit.action_status, notReportedLabel),
      created_at: hasValidTime ? parsedTime.toLocaleTimeString(locale) : notReportedLabel,
    };
  });
  const query = search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    [row.schema_type, row.object_type, row.instrument, row.action_status]
      .some((value) => value.toLowerCase().includes(query)),
  );
};

export const useDashboardData = () => {
  const { t, i18n } = useTranslation();
  const {
    activeOrganization,
    activeWorkspace,
    activeProject,
    workspaces = [],
    projects = [],
    persons = [],
    effectiveSettings = [],
    knowledgeDocuments = [],
    mediaObjects = [],
    auditActions = [],
    loading,
    refreshTenantData,
  } = useTenant();

  const [timeHorizon, setTimeHorizon] = useState('30d');
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [governanceSearch, setGovernanceSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [referenceTimestamp, setReferenceTimestamp] = useState(() => Date.now());

  // 1. Filtered Projects based on workspace selection
  const filteredProjects = useMemo(() => {
    if (workspaceFilter === 'all') return projects;
    return projects.filter((p) => p.workspace_id === workspaceFilter);
  }, [projects, workspaceFilter]);

  // 2. Filtered Audit actions by time horizon
  const filteredAudits = useMemo(() => {
    if (!auditActions.length) return [];
    const now = referenceTimestamp;
    const horizonMs =
      {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
      }[timeHorizon] || 30 * 24 * 60 * 60 * 1000;

    return auditActions.filter((a) => {
      if (!a.created_at) return true;
      const ts = new Date(a.created_at).getTime();
      return now - ts <= horizonMs;
    });
  }, [auditActions, referenceTimestamp, timeHorizon]);

  // 3. Metric Counters
  const kpis = useMemo(() => {
    const locale = i18n.language || 'en';
    const memberCount = persons.length;
    const projectCount = filteredProjects.length;
    const assetCount = knowledgeDocuments.length + mediaObjects.length;
    const lockedCount = effectiveSettings.filter((s) => s.effective_cascade_rule === 'LOCKED').length;

    return {
      members: {
        raw: memberCount,
        formatted: formatCompactNumber(memberCount, locale),
      },
      projects: {
        raw: projectCount,
        formatted: formatCompactNumber(projectCount, locale),
      },
      assets: {
        raw: assetCount,
        formatted: formatCompactNumber(assetCount, locale),
      },
      lockedRules: {
        raw: lockedCount,
        formatted: formatCompactNumber(lockedCount, locale),
      },
    };
  }, [persons, filteredProjects, knowledgeDocuments, mediaObjects, effectiveSettings, i18n.language]);

  // 4. Activity Timeline Chart Data (@carbon/charts LineChart/StackedAreaChart)
  const activityChartData = useMemo(
    () =>
      buildActivityChartData(filteredAudits, referenceTimestamp, timeHorizon, {
        completed: t('dashboard.charts.completedActions', 'Completed actions'),
        pending: t('dashboard.charts.pendingActions', 'Pending / in progress'),
        other: t('dashboard.charts.otherActions', 'Other / unclassified statuses'),
      }),
    [filteredAudits, referenceTimestamp, timeHorizon, t],
  );

  // 5. Cascade Governance Donut Chart Data (@carbon/charts DonutChart)
  const cascadeDonutData = useMemo(
    () => buildCascadeDonutData(effectiveSettings),
    [effectiveSettings],
  );

  // 6. Corpus by Format SimpleBarChart Data (@carbon/charts SimpleBarChart)
  const corpusBarData = useMemo(
    () =>
      buildCorpusBarData(knowledgeDocuments, mediaObjects, {
        documentFormatNotReported: t('dashboard.charts.documentFormatNotReported', 'Unspecified document format'),
        mediaFormatNotReported: t('dashboard.charts.mediaFormatNotReported', 'Unspecified media format'),
      }),
    [knowledgeDocuments, mediaObjects, t],
  );

  // 7. Table Rows
  const notReportedLabel = t('common.notReported', 'Not reported');
  const governanceRows = useMemo(
    () => buildGovernanceRows(effectiveSettings, governanceSearch, notReportedLabel),
    [effectiveSettings, governanceSearch, notReportedLabel],
  );

  const auditRows = useMemo(
    () => buildAuditRows(filteredAudits, auditSearch, notReportedLabel, i18n.language || 'en'),
    [filteredAudits, auditSearch, notReportedLabel, i18n.language],
  );

  const handleRefreshTenantData = useCallback(async () => {
    setReferenceTimestamp(Date.now());
    if (typeof refreshTenantData === 'function') {
      return refreshTenantData();
    }
  }, [refreshTenantData]);

  return {
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
    refreshTenantData: handleRefreshTenantData,
  };
};
