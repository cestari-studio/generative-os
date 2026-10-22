/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import {
  Button,
  Column,
  FormGroup,
  Grid,
  Heading,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  Section,
  Select,
  SelectItem,
  Tile,
  Toggle,
} from '@carbon/react';
import { Launch, Save, SettingsAdjust } from '@carbon/icons-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const DashboardSettingsTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    effectiveSettings = [],
    themeSetting,
    headerInverse,
    updateThemeSetting,
    updateHeaderInverse,
    applySettingCascade,
  } = useTenant();

  const [notification, setNotification] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const themeModeMeta = effectiveSettings.find((s) => s.property_id === 'theme.mode');
  const isThemeLocked = themeModeMeta?.is_locked;

  const handleLanguageChange = async (event) => {
    const nextLang = event.target.value;
    setIsSaving(true);
    try {
      i18n.changeLanguage(nextLang);
      if (user) {
        await applySettingCascade({
          level: 'person',
          propertyId: 'i18n.in_language',
          value: nextLang,
          cascadeRule: 'INHERIT_OVERRIDABLE',
        });
      }
      setNotification({
        kind: 'success',
        title: t('dashboard.settings.savedTitle', 'Language preference updated'),
        subtitle: t(
          'dashboard.settings.persistedDesc',
          'Configuration persisted to your personal tenant profile in database.',
        ),
      });
    } catch {
      setNotification({
        kind: 'error',
        title: t('common.error', 'Error'),
        subtitle: t('dashboard.settings.saveError', 'Failed to persist setting.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeModeChange = async (value) => {
    if (isThemeLocked) return;
    setIsSaving(true);
    try {
      updateThemeSetting(value);
      if (user) {
        await applySettingCascade({
          level: 'person',
          propertyId: 'theme.mode',
          value,
          cascadeRule: 'INHERIT_OVERRIDABLE',
        });
      }
      setNotification({
        kind: 'success',
        title: t('dashboard.settings.savedTitle', 'Theme preference updated'),
        subtitle: t(
          'dashboard.settings.persistedDesc',
          'Configuration persisted to your personal tenant profile in database.',
        ),
      });
    } catch {
      setNotification({
        kind: 'error',
        title: t('common.error', 'Error'),
        subtitle: t('dashboard.settings.saveError', 'Failed to persist setting.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplementToggle = async (checked) => {
    setIsSaving(true);
    try {
      updateHeaderInverse(checked);
      if (user) {
        await applySettingCascade({
          level: 'person',
          propertyId: 'theme.header_inverse',
          value: checked,
          cascadeRule: 'INHERIT_OVERRIDABLE',
        });
      }
      setNotification({
        kind: 'success',
        title: t('dashboard.settings.savedTitle', 'Menu theme updated'),
        subtitle: t(
          'dashboard.settings.persistedDesc',
          'Configuration persisted to your personal tenant profile in database.',
        ),
      });
    } catch {
      setNotification({
        kind: 'error',
        title: t('common.error', 'Error'),
        subtitle: t('dashboard.settings.saveError', 'Failed to persist setting.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const lockedCount = effectiveSettings.filter((s) => s.effective_cascade_rule === 'LOCKED').length;

  return (
    <Section as="section" className="cs--dashboard-tab-pane" aria-labelledby="settings-tab-heading">
      <Grid className="cs--dashboard-settings-overview">
        {notification && (
          <Column sm={4} md={8} lg={16}>
            <InlineNotification
              kind={notification.kind}
              title={notification.title}
              subtitle={notification.subtitle}
              onCloseButtonClick={() => setNotification(null)}
              lowContrast
            />
          </Column>
        )}

        {/* Personal Configurations Tile */}
        <Column sm={4} md={8} lg={8}>
          <Tile className="cs--dashboard-settings-tile">
            <Heading id="settings-tab-heading" className="cs--dashboard-settings-tile__title">
              {t('dashboard.settings.personalTitle', 'Personal User Preferences')}
            </Heading>
            <p className="cs--dashboard-settings-tile__subtitle">
              {t(
                'dashboard.settings.personalSubtitle',
                'Parametrized settings persisted per-user to your Schema.org Person entity in database.',
              )}
            </p>

            <FormGroup legendText={t('profile.auth.languageLabel', 'Interface language')}>
              <Select
                id="dashboard-language-select"
                size="md"
                labelText={t('profile.auth.languageLabel', 'Interface language')}
                value={i18n.language === 'jp-JP' ? 'ja-JP' : i18n.language || 'en'}
                onChange={handleLanguageChange}
                disabled={isSaving}
                hideLabel
              >
                <SelectItem value="en" text="English (en)" />
                <SelectItem value="de" text="Deutsch (de)" />
                <SelectItem value="pt-BR" text="Português (pt-BR)" />
                <SelectItem value="ja-JP" text="日本語 (ja-JP)" />
                <SelectItem value="zh-CN" text="简体中文 (zh-CN)" />
              </Select>
            </FormGroup>

            <FormGroup legendText={t('profile.settings.themeLegend', 'Theme Mode')}>
              <RadioButtonGroup
                name="dashboard-theme-mode-group"
                valueSelected={themeSetting}
                onChange={handleThemeModeChange}
                disabled={isThemeLocked || isSaving}
              >
                <RadioButton value="system" labelText="System default" id="theme-radio-system" />
                <RadioButton value="light" labelText="Light (White / Gray 10)" id="theme-radio-light" />
                <RadioButton value="dark" labelText="Dark (Gray 90 / Gray 100)" id="theme-radio-dark" />
              </RadioButtonGroup>
            </FormGroup>

            <FormGroup legendText={t('profile.settings.complementMenuTheme', 'Complement menu theme')}>
              <Toggle
                id="dashboard-header-inverse-toggle"
                labelText={t('profile.settings.complementMenuTheme', 'Complement menu theme')}
                toggled={headerInverse}
                onToggle={handleComplementToggle}
                disabled={isSaving}
                size="sm"
                hideLabel
              />
            </FormGroup>
          </Tile>
        </Column>

        {/* Governance Policies & Cascade Architecture */}
        <Column sm={4} md={8} lg={8}>
          <Tile className="cs--dashboard-settings-tile">
            <div className="cs--dashboard-summary-tile__header">
              <SettingsAdjust size={24} className="cs--dashboard-summary-tile__icon" />
              <div>
                <Heading className="cs--dashboard-settings-tile__title">
                  {t('dashboard.settings.governanceTitle', 'Tenant Cascade Governance')}
                </Heading>
                <p className="cs--dashboard-settings-tile__subtitle">
                  {t(
                    'dashboard.settings.governanceSubtitle',
                    'Multi-tier policy inheritance: Platform -> Organization -> Workspace -> Person.',
                  )}
                </p>
              </div>
            </div>

            <div className="cs--dashboard-governance-stats">
              <div className="cs--dashboard-governance-stat-item">
                <span className="cs--dashboard-governance-stat-item__value">{effectiveSettings.length}</span>
                <span className="cs--dashboard-governance-stat-item__label">
                  {t('dashboard.settings.activePolicies', 'Active Cascade Rules')}
                </span>
              </div>
              <div className="cs--dashboard-governance-stat-item">
                <span className="cs--dashboard-governance-stat-item__value">{lockedCount}</span>
                <span className="cs--dashboard-governance-stat-item__label">
                  {t('dashboard.settings.lockedPolicies', 'Locked Policies')}
                </span>
              </div>
            </div>

            <div className="cs--dashboard-settings-tile__actions">
              <Button kind="tertiary" size="md" renderIcon={Launch} onClick={() => navigate('/settings')}>
                {t('dashboard.settings.openMatrixButton', 'Open Cascade Matrix & JSON-LD Graph')}
              </Button>
            </div>
          </Tile>
        </Column>
      </Grid>
    </Section>
  );
};

export default DashboardSettingsTab;
