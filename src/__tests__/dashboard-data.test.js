/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  buildActivityChartData,
  buildAuditRows,
  buildCascadeDonutData,
  buildCorpusBarData,
  buildGovernanceRows,
} from '../pages/dashboard/useDashboardData';

describe('dashboard data builders preserve only reported telemetry', () => {
  test('an empty corpus produces no fabricated bar groups or positive counts', () => {
    expect(buildCorpusBarData([], [])).toEqual([]);
  });

  test('corpus records with unknown format are counted under an explicit unknown format', () => {
    expect(buildCorpusBarData([{ id: 'doc-1' }], [{ id: 'media-1' }])).toEqual([
      { group: 'Unspecified document format', value: 1 },
      { group: 'Unspecified media format', value: 1 },
    ]);
  });

  test('missing or unrecognized cascade rules are not counted as inherited rules', () => {
    expect(
      buildCascadeDonutData([
        {},
        { effective_cascade_rule: null },
        { effective_cascade_rule: 'LOCKED' },
        { effective_cascade_rule: 'INHERIT_OVERRIDABLE' },
        { effective_cascade_rule: 'MERGE' },
        { effective_cascade_rule: 'UNKNOWN_RULE' },
      ]),
    ).toEqual([
      { group: 'LOCKED', value: 1 },
      { group: 'INHERIT_OVERRIDABLE', value: 1 },
      { group: 'MERGE', value: 1 },
    ]);
  });

  test('missing governance properties are shown as not reported, not fabricated defaults', () => {
    expect(buildGovernanceRows([{ property_id: 'setting.unknown' }], '', 'Not reported')).toEqual([
      {
        id: 'setting.unknown',
        property_id: 'setting.unknown',
        scope: 'Not reported',
        source_level: 'Not reported',
        effective_cascade_rule: 'Not reported',
        effective_value: '',
      },
    ]);
  });

  test('missing audit fields are not displayed as successful system actions', () => {
    expect(buildAuditRows([{}], '', 'Not reported', 'en')[0]).toMatchObject({
      schema_type: 'Not reported',
      object_type: 'Not reported',
      instrument: 'Not reported',
      action_status: 'Not reported',
      created_at: 'Not reported',
    });
  });

  test('failed and unknown audit actions are not reported as pending/in progress', () => {
    const referenceTimestamp = new Date('2026-10-22T12:00:00.000Z').getTime();
    const result = buildActivityChartData(
      [
        { created_at: '2026-10-22T12:00:00.000Z', action_status: 'CompletedActionStatus' },
        { created_at: '2026-10-22T12:00:00.000Z', action_status: 'PotentialActionStatus' },
        { created_at: '2026-10-22T12:00:00.000Z', action_status: 'FailedActionStatus' },
        { created_at: '2026-10-22T12:00:00.000Z' },
      ],
      referenceTimestamp,
      '30d',
    );
    const todays = result.filter((row) => row.date === '10-22');
    expect(todays.find((row) => row.group === 'Completed actions').value).toBe(1);
    expect(todays.find((row) => row.group === 'Pending / in progress').value).toBe(1);
    expect(todays.find((row) => row.group === 'Other / unclassified statuses').value).toBe(2);
  });
});
