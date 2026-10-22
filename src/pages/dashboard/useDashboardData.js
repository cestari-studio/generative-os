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

export const useDashboardData = () => {
  const { i18n } = useTranslation();
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
  const activityChartData = useMemo(() => {
    const buckets = {};
    const days = timeHorizon === '24h' ? 24 : timeHorizon === '7d' ? 7 : timeHorizon === '30d' ? 30 : 90;
    const isHourly = timeHorizon === '24h';

    // Seed empty buckets
    const now = new Date(referenceTimestamp);
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      if (isHourly) {
        d.setHours(d.getHours() - i);
        const label = `${String(d.getHours()).padStart(2, '0')}:00`;
        buckets[label] = { completed: 0, pending: 0 };
      } else {
        d.setDate(d.getDate() - i);
        const label = d.toISOString().slice(5, 10); // MM-DD
        buckets[label] = { completed: 0, pending: 0 };
      }
    }

    // Populate from real audits
    filteredAudits.forEach((a) => {
      const ts = a.created_at ? new Date(a.created_at) : null;
      if (!ts) return;
      const label = isHourly ? `${String(ts.getHours()).padStart(2, '0')}:00` : ts.toISOString().slice(5, 10);
      if (buckets[label]) {
        const isCompleted = (a.action_status || '').toLowerCase().includes('complete');
        if (isCompleted) {
          buckets[label].completed += 1;
        } else {
          buckets[label].pending += 1;
        }
      }
    });

    const rows = [];
    Object.entries(buckets).forEach(([date, counts]) => {
      rows.push({ group: 'Completed Actions', date, value: counts.completed });
      rows.push({ group: 'Pending / In Progress', date, value: counts.pending });
    });
    return rows;
  }, [filteredAudits, referenceTimestamp, timeHorizon]);

  // 5. Cascade Governance Donut Chart Data (@carbon/charts DonutChart)
  const cascadeDonutData = useMemo(() => {
    const counts = { LOCKED: 0, INHERIT_OVERRIDABLE: 0, MERGE: 0 };
    effectiveSettings.forEach((s) => {
      const rule = s.effective_cascade_rule || 'INHERIT_OVERRIDABLE';
      if (counts[rule] !== undefined) {
        counts[rule] += 1;
      } else {
        counts[rule] = 1;
      }
    });
    return [
      { group: 'LOCKED', value: counts.LOCKED },
      { group: 'INHERIT_OVERRIDABLE', value: counts.INHERIT_OVERRIDABLE },
      { group: 'MERGE', value: counts.MERGE },
    ].filter((item) => item.value > 0);
  }, [effectiveSettings]);

  // 6. Corpus by Format SimpleBarChart Data (@carbon/charts SimpleBarChart)
  const corpusBarData = useMemo(() => {
    const formats = {};
    knowledgeDocuments.forEach((doc) => {
      const fmt = doc.file_type || doc.encoding_format || 'Document';
      formats[fmt] = (formats[fmt] || 0) + 1;
    });
    mediaObjects.forEach((media) => {
      const fmt = media.encoding_format || 'Media Object';
      formats[fmt] = (formats[fmt] || 0) + 1;
    });

    const entries = Object.entries(formats);
    if (!entries.length) {
      return [
        { group: 'Schema.org Documents', value: knowledgeDocuments.length || 1 },
        { group: 'Storage Assets', value: mediaObjects.length || 0 },
      ];
    }
    return entries.map(([group, value]) => ({ group, value }));
  }, [knowledgeDocuments, mediaObjects]);

  // 7. Table Rows
  const governanceRows = useMemo(() => {
    const query = governanceSearch.trim().toLowerCase();
    const rows = effectiveSettings.map((s) => ({
      id: s.property_id,
      property_id: s.property_id,
      scope: s.scope || 'general',
      source_level: s.source_level || 'organization',
      effective_cascade_rule: s.effective_cascade_rule || 'INHERIT_OVERRIDABLE',
      effective_value:
        typeof s.effective_value === 'object' ? JSON.stringify(s.effective_value) : String(s.effective_value ?? ''),
    }));
    if (!query) return rows;
    return rows.filter(
      (r) =>
        r.property_id.toLowerCase().includes(query) ||
        r.scope.toLowerCase().includes(query) ||
        r.source_level.toLowerCase().includes(query) ||
        r.effective_cascade_rule.toLowerCase().includes(query),
    );
  }, [effectiveSettings, governanceSearch]);

  const auditRows = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    const rows = filteredAudits.map((a, idx) => ({
      id: a.id || `audit-${idx}`,
      schema_type: a.schema_type || 'Action',
      object_type: a.object_type || 'Entity',
      instrument: a.instrument || 'system',
      action_status: a.action_status || 'CompletedActionStatus',
      created_at: a.created_at ? new Date(a.created_at).toLocaleTimeString() : 'Recent',
    }));
    if (!query) return rows;
    return rows.filter(
      (r) =>
        r.schema_type.toLowerCase().includes(query) ||
        r.object_type.toLowerCase().includes(query) ||
        r.instrument.toLowerCase().includes(query) ||
        r.action_status.toLowerCase().includes(query),
    );
  }, [filteredAudits, auditSearch]);

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
