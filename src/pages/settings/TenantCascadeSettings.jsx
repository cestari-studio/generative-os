/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  CodeSnippet,
  Column,
  DataTable,
  Grid,
  InlineNotification,
  Layer,
  NumberInput,
  Select,
  SelectItem,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Tile,
  Toggle,
} from '@carbon/react';
import { ArrowRight, DataStructured, Events, Locked, Save, SettingsAdjust, Workspace } from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../layouts/page-layout';
import { Footer } from '../../components/footer/Footer';
import { useTenant } from '../../context/useTenant';
import { TENANT_SETTINGS_CATEGORIES } from '../../routes/config';

const CASCADE_RULES = [
  { value: 'INHERIT_OVERRIDABLE', label: 'INHERIT_OVERRIDABLE (Default)' },
  { value: 'LOCKED', label: 'LOCKED (Enforce on child tiers)' },
  { value: 'MERGE', label: 'MERGE (Deep union arrays/objects)' },
];

const TIER_LEVELS = [
  { value: 'organization', label: 'Tier 1: Organization (Schema.org Organization)' },
  { value: 'workspace', label: 'Tier 2: Workspace / Department' },
  { value: 'project', label: 'Tier 3: Project (Schema.org CreativeWork)' },
  { value: 'person', label: 'Tier 4: Person (Schema.org Person)' },
];

function formatJsonValue(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function parseInputJsonValue(rawText, fallbackValue) {
  if (typeof rawText === 'boolean' || typeof rawText === 'number') {
    return rawText;
  }
  const trimmed = String(rawText || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return fallbackValue;
    }
  }
  return trimmed;
}

const TenantCascadeSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeWorkspace,
    activeProject,
    effectiveSettings,
    auditActions,
    applySettingCascade,
    statusMessage,
    statusMessageKind,
  } = useTenant();

  const [selectedTier, setSelectedTier] = useState('organization');
  const [selectedScope, setSelectedScope] = useState('all');
  const [clearChildOverrides, setClearChildOverrides] = useState(false);
  const [draftValues, setDraftValues] = useState({});
  const [draftRules, setDraftRules] = useState({});

  const scopes = useMemo(() => {
    const unique = new Set(effectiveSettings.map((s) => s.scope));
    return ['all', ...Array.from(unique)];
  }, [effectiveSettings]);

  const filteredSettings = useMemo(() => {
    if (selectedScope === 'all') return effectiveSettings;
    return effectiveSettings.filter((s) => s.scope === selectedScope);
  }, [effectiveSettings, selectedScope]);

  const jsonLdSnapshot = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      identifier: activeOrganization?.identifier,
      name: activeOrganization?.name,
      department: {
        '@type': 'Organization',
        identifier: activeWorkspace?.identifier,
        name: activeWorkspace?.name,
      },
      workExample: {
        '@type': 'CreativeWork',
        identifier: activeProject?.identifier,
        name: activeProject?.name,
      },
      additionalProperty: effectiveSettings.map((s) => ({
        '@type': 'PropertyValue',
        propertyID: s.property_id,
        name: s.name,
        value: s.effective_value,
        measurementTechnique: s.effective_cascade_rule,
      })),
    }),
    [activeOrganization, activeWorkspace, activeProject, effectiveSettings],
  );

  const auditRows = useMemo(
    () =>
      (auditActions || []).slice(0, 10).map((item) => ({
        id: String(item.id),
        schema_type: item.schema_type || 'CascadeAction',
        object_type: item.object_type || 'PropertyValue',
        instrument: item.instrument || 'rpc_cascade',
        action_status: item.action_status || 'CompletedActionStatus',
      })),
    [auditActions],
  );

  const auditHeaders = useMemo(
    () => [
      { key: 'schema_type', header: 'Schema.org @type' },
      { key: 'object_type', header: 'Target Entity' },
      { key: 'instrument', header: 'Instrument' },
      { key: 'action_status', header: 'Status' },
    ],
    [],
  );

  const handleApplySetting = async (setting) => {
    const rawDraft =
      draftValues[setting.property_id] !== undefined
        ? draftValues[setting.property_id]
        : formatJsonValue(setting.effective_value);
    const parsedValue = parseInputJsonValue(rawDraft, setting.effective_value);
    const rule = draftRules[setting.property_id] || setting.effective_cascade_rule || 'INHERIT_OVERRIDABLE';

    try {
      await applySettingCascade({
        level: selectedTier,
        propertyId: setting.property_id,
        value: parsedValue,
        cascadeRule: rule,
        clearChildOverrides,
      });
    } catch {
      // Status message handled in context
    }
  };

  return (
    <PageLayout className="cs--cascade-settings">
      <PageHeader
        title={t('cascadeSettings.title', 'Multi-Tenant Cascade Settings')}
        subtitle={t(
          'cascadeSettings.subtitle',
          'Granular 4-tier settings engine (Organization → Workspace → Project → Person) with Schema.org PropertyValue taxonomy and inheritance rules.',
        )}
        className="cs--cascade-settings__page-header"
      />

      <Tabs className="cs--cascade-settings__tabs">
        <TabList aria-label={t('cascadeSettings.tabsAriaLabel', 'Cascade Governance Sections')}>
          <Tab renderIcon={SettingsAdjust}>{t('cascadeSettings.tabMatrix', 'Policy Matrix')}</Tab>
          <Tab renderIcon={DataStructured}>{t('cascadeSettings.tabJsonLd', 'Schema.org JSON-LD')}</Tab>
          <Tab renderIcon={Events}>{t('cascadeSettings.tabAudit', 'Audit Ledger')}</Tab>
          <Tab renderIcon={Workspace}>{t('cascadeSettings.tabCategories', 'Tenant Settings Hub')}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <Stack gap={6}>
              <Tile className="cs--cascade-settings__toolbar">
                <Stack gap={5}>
                  <Grid narrow>
                    <Column sm={4} md={4} lg={6}>
                      <Layer>
                        <Select
                          id="cascade-tier-selector"
                          labelText={t('cascadeSettings.tierSelectorLabel', 'Editing Scope Tier')}
                          value={selectedTier}
                          onChange={(e) => setSelectedTier(e.target.value)}
                        >
                          {TIER_LEVELS.map((tier) => (
                            <SelectItem key={tier.value} value={tier.value} text={tier.label} />
                          ))}
                        </Select>
                      </Layer>
                    </Column>
                    <Column sm={4} md={4} lg={5}>
                      <Layer>
                        <Select
                          id="cascade-scope-filter"
                          labelText={t('cascadeSettings.filterScopeLabel', 'Filter by Domain')}
                          value={selectedScope}
                          onChange={(e) => setSelectedScope(e.target.value)}
                        >
                          {scopes.map((sc) => (
                            <SelectItem
                              key={sc}
                              value={sc}
                              text={sc === 'all' ? t('cascadeSettings.allScopes', 'All Domains') : sc}
                            />
                          ))}
                        </Select>
                      </Layer>
                    </Column>
                    <Column sm={4} md={8} lg={5} className="cs--cascade-settings__checkbox-col">
                      <Checkbox
                        id="cascade-clear-children"
                        labelText={t('cascadeSettings.purgeChildrenLabel', 'Clear lower-tier overrides when applying')}
                        checked={clearChildOverrides}
                        onChange={(_, { checked }) => setClearChildOverrides(checked)}
                      />
                    </Column>
                  </Grid>

                  {statusMessage && (
                    <InlineNotification
                      lowContrast
                      hideCloseButton
                      kind={statusMessageKind || 'info'}
                      title={t('cascadeSettings.title', 'Multi-Tenant Cascade Settings')}
                      subtitle={statusMessage}
                    />
                  )}
                </Stack>
              </Tile>

              {filteredSettings.length === 0 && (
                <Tile className="cs--cascade-settings__empty">
                  <Stack gap={3}>
                    <h3 className="cs--cascade-settings__card-title">
                      {t('cascadeSettings.emptyTitle', 'No settings configured')}
                    </h3>
                    <p className="cs--cascade-settings__card-desc">
                      {t(
                        'cascadeSettings.emptyDesc',
                        'Effective settings for this context are not configured yet or could not be loaded. When the settings service provisions cascade policies for this organization, they will appear here.',
                      )}
                    </p>
                  </Stack>
                </Tile>
              )}

              <Grid className="cs--cascade-settings__content-grid">
                {filteredSettings.map((setting) => {
                  const isLockedForLowerTier =
                    setting.is_locked &&
                    setting.locked_by_level &&
                    setting.locked_by_level !== selectedTier &&
                    selectedTier !== 'organization';

                  const currentDraftValue =
                    draftValues[setting.property_id] !== undefined
                      ? draftValues[setting.property_id]
                      : formatJsonValue(setting.effective_value);

                  const currentDraftRule =
                    draftRules[setting.property_id] || setting.effective_cascade_rule || 'INHERIT_OVERRIDABLE';

                  return (
                    <Column key={setting.property_id} sm={4} md={8} lg={16}>
                      <Tile className="cs--cascade-settings__card">
                        <Stack gap={4}>
                          <div className="cs--cascade-settings__card-header">
                            <div>
                              <h3 className="cs--cascade-settings__card-title">
                                {setting.name || setting.property_id}
                              </h3>
                              <p className="cs--cascade-settings__card-desc">
                                <code>{setting.property_id}</code> — {setting.description}
                              </p>
                            </div>
                            <div className="cs--cascade-settings__badges">
                              <Tag type="cool-gray" size="sm" renderIcon={SettingsAdjust}>
                                {setting.scope}
                              </Tag>
                              <Tag type="teal" size="sm">
                                {t('cascadeSettings.inheritedFrom', {
                                  level: setting.source_level,
                                  defaultValue: `Effective from: ${setting.source_level}`,
                                })}
                              </Tag>
                              {setting.is_locked ? (
                                <Tag type="red" size="sm" renderIcon={Locked}>
                                  {t('cascadeSettings.lockedBadge', {
                                    level: setting.locked_by_level || 'organization',
                                    defaultValue: `LOCKED by ${setting.locked_by_level || 'organization'}`,
                                  })}
                                </Tag>
                              ) : (
                                <Tag type="purple" size="sm">
                                  {setting.effective_cascade_rule}
                                </Tag>
                              )}
                            </div>
                          </div>

                          <Layer>
                            <Grid narrow>
                              <Column sm={4} md={4} lg={6}>
                                {setting.property_id === 'theme.mode' ? (
                                  <Select
                                    id={`setting-val-${setting.property_id}`}
                                    labelText={t('cascadeSettings.valueLabel', 'Setting Value')}
                                    value={currentDraftValue}
                                    disabled={isLockedForLowerTier}
                                    onChange={(e) =>
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [setting.property_id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <SelectItem value="white" text="White (Clean Light)" />
                                    <SelectItem value="g10" text="Gray 10 (Cool Light)" />
                                    <SelectItem value="g90" text="Gray 90 (Corporate Dark)" />
                                    <SelectItem value="g100" text="Gray 100 (Deep Dark)" />
                                    <SelectItem value="system" text="System Preference" />
                                  </Select>
                                ) : setting.property_id === 'theme.header_inverse' ? (
                                  <div className="cs--cascade-settings__toggle-wrapper">
                                    <Toggle
                                      id={`setting-val-${setting.property_id}`}
                                      labelText={t('cascadeSettings.valueLabel', 'Setting Value')}
                                      labelA="Standard"
                                      labelB="Inverted Header"
                                      toggled={currentDraftValue === 'true' || currentDraftValue === true}
                                      disabled={isLockedForLowerTier}
                                      onToggle={(checked) =>
                                        setDraftValues((prev) => ({
                                          ...prev,
                                          [setting.property_id]: checked,
                                        }))
                                      }
                                    />
                                  </div>
                                ) : typeof setting.effective_value === 'number' ||
                                  setting.property_id === 'auth.session_ttl_minutes' ? (
                                  <NumberInput
                                    id={`setting-val-${setting.property_id}`}
                                    label={t('cascadeSettings.valueLabel', 'Setting Value')}
                                    min={1}
                                    max={10080}
                                    step={15}
                                    value={Number(currentDraftValue) || 480}
                                    disabled={isLockedForLowerTier}
                                    onChange={(_, { value }) =>
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [setting.property_id]: value,
                                      }))
                                    }
                                  />
                                ) : Array.isArray(setting.effective_value) ||
                                  setting.property_id === 'ai.system_rules' ? (
                                  <TextArea
                                    id={`setting-val-${setting.property_id}`}
                                    labelText={t('cascadeSettings.valueLabel', 'Setting Value')}
                                    rows={3}
                                    value={currentDraftValue}
                                    disabled={isLockedForLowerTier}
                                    onChange={(e) =>
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [setting.property_id]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : setting.property_id === 'i18n.in_language' ? (
                                  <Select
                                    id={`setting-val-${setting.property_id}`}
                                    labelText={t('cascadeSettings.valueLabel', 'Setting Value')}
                                    value={currentDraftValue === 'jp-JP' ? 'ja-JP' : currentDraftValue || 'en'}
                                    disabled={isLockedForLowerTier}
                                    onChange={(e) =>
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [setting.property_id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <SelectItem value="en" text="English (en)" />
                                    <SelectItem value="pt-BR" text="Português (pt-BR)" />
                                    <SelectItem value="de" text="Deutsch (de)" />
                                    <SelectItem value="ja-JP" text="日本語 (ja-JP)" />
                                    <SelectItem value="zh-CN" text="简体中文 (zh-CN)" />
                                  </Select>
                                ) : (
                                  <TextInput
                                    id={`setting-val-${setting.property_id}`}
                                    labelText={t('cascadeSettings.valueLabel', 'Setting Value')}
                                    value={currentDraftValue}
                                    disabled={isLockedForLowerTier}
                                    onChange={(e) =>
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [setting.property_id]: e.target.value,
                                      }))
                                    }
                                    size="md"
                                  />
                                )}
                              </Column>

                              <Column sm={4} md={4} lg={6}>
                                <Select
                                  id={`setting-rule-${setting.property_id}`}
                                  labelText={t('cascadeSettings.ruleLabel', 'Cascade Rule')}
                                  value={currentDraftRule}
                                  disabled={isLockedForLowerTier || selectedTier === 'person'}
                                  onChange={(e) =>
                                    setDraftRules((prev) => ({
                                      ...prev,
                                      [setting.property_id]: e.target.value,
                                    }))
                                  }
                                >
                                  {CASCADE_RULES.map((r) => (
                                    <SelectItem key={r.value} value={r.value} text={r.label} />
                                  ))}
                                </Select>
                              </Column>

                              <Column sm={4} md={8} lg={4} className="cs--cascade-settings__action-col">
                                <Button
                                  type="button"
                                  size="md"
                                  kind="primary"
                                  renderIcon={Save}
                                  disabled={isLockedForLowerTier}
                                  onClick={() => handleApplySetting(setting)}
                                >
                                  {t('cascadeSettings.applyButton', 'Save & Cascade')}
                                </Button>
                              </Column>
                            </Grid>
                          </Layer>
                        </Stack>
                      </Tile>
                    </Column>
                  );
                })}
              </Grid>
            </Stack>
          </TabPanel>

          <TabPanel>
            <Grid>
              <Column sm={4} md={8} lg={16}>
                <Tile className="cs--cascade-settings__jsonld-tile">
                  <Stack gap={4}>
                    <div className="cs--cascade-settings__card-header">
                      <div>
                        <h3 className="cs--cascade-settings__card-title">
                          {t('cascadeSettings.jsonLdPreview', 'Schema.org JSON-LD Snapshot')}
                        </h3>
                        <p className="cs--cascade-settings__card-desc">
                          {t(
                            'cascadeSettings.jsonLdDesc',
                            'Unified multi-tier Schema.org entity graph dynamically composed from active Organization, Workspace, and CreativeWork project hierarchy.',
                          )}
                        </p>
                      </div>
                      <Tag type="blue" size="sm">
                        @context: schema.org
                      </Tag>
                    </div>
                    <Layer>
                      <CodeSnippet type="multi" wrapText feedback="Copied JSON-LD">
                        {JSON.stringify(jsonLdSnapshot, null, 2)}
                      </CodeSnippet>
                    </Layer>
                  </Stack>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>

          <TabPanel>
            <Grid>
              <Column sm={4} md={8} lg={16}>
                <Tile className="cs--cascade-settings__audit-tile">
                  <DataTable rows={auditRows} headers={auditHeaders} size="sm">
                    {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                      <TableContainer
                        title={t('cascadeSettings.auditHeading', 'Cascade Audit Ledger (Schema.org Action)')}
                        description={t(
                          'cascadeSettings.auditSubtitle',
                          'Live PostgreSQL public.audit_actions events recorded by RPC and Edge Functions.',
                        )}
                      >
                        <Table {...getTableProps()}>
                          <TableHead>
                            <TableRow>
                              {headers.map((header) => (
                                <TableHeader key={header.key} {...getHeaderProps({ header })}>
                                  {header.header}
                                </TableHeader>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.map((row) => (
                              <TableRow key={row.id} {...getRowProps({ row })}>
                                {row.cells.map((cell) => (
                                  <TableCell key={cell.id}>
                                    {cell.info.header === 'action_status' ? (
                                      <Tag type="green" size="sm">
                                        {cell.value}
                                      </Tag>
                                    ) : (
                                      cell.value
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>

          <TabPanel>
            <Stack gap={6}>
              <Tile className="cs--cascade-settings__hub-banner">
                <Stack gap={4}>
                  <div className="cs--cascade-settings__hub-header">
                    <div>
                      <h3 className="cs--cascade-settings__hub-title">
                        {t('cascadeSettings.hubTitle', 'Tenant-Level Settings Categories')}
                      </h3>
                      <p className="cs--cascade-settings__hub-desc">
                        {t(
                          'cascadeSettings.hubDesc',
                          'All platform modules and operational services operate as Tenant-Level Settings, isolated to your active organization context.',
                        )}
                      </p>
                    </div>
                    <Tag type="blue" size="md">
                      {activeOrganization?.name || 'Enterprise'}
                    </Tag>
                  </div>
                </Stack>
              </Tile>

              <Grid narrow>
                {TENANT_SETTINGS_CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Column sm={4} md={4} lg={4} key={category.id} className="cs--cascade-settings__hub-col">
                      <Layer level={1}>
                        <Tile className="cs--cascade-settings__hub-tile">
                          <Stack gap={4}>
                            <div className="cs--cascade-settings__hub-tile-header">
                              <Icon size={24} />
                              <div className="cs--cascade-settings__badges">
                                {category.shortSchema && (
                                  <Tag size="sm" type="blue">
                                    {category.shortSchema}
                                  </Tag>
                                )}
                                <Tag size="sm" type="purple">
                                  {t('cascadeSettings.privateBadge', 'Private')}
                                </Tag>
                              </div>
                            </div>
                            <h4 className="cs--cascade-settings__hub-tile-title">
                              {t(category.labelKey, category.defaultLabel)}
                            </h4>
                            <p className="cs--cascade-settings__hub-tile-desc">
                              {t(category.descriptionKey, category.defaultDescription)}
                            </p>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={ArrowRight}
                              onClick={() => navigate(category.path)}
                            >
                              {t('cascadeSettings.openCategory', 'Open Setting')}
                            </Button>
                          </Stack>
                        </Tile>
                      </Layer>
                    </Column>
                  );
                })}
              </Grid>
            </Stack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Footer />
    </PageLayout>
  );
};

export default TenantCascadeSettings;
