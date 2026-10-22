/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import classNames from 'classnames';
import { ContainedList, ContainedListItem, Select, SelectItem } from '@carbon/react';
import { Locked, Login, Logout, UserFollow, Wallet } from '@carbon/icons-react';
import { Profile } from '@carbon-labs/react-ui-shell';
import { ThemeSettings, ThemeMenuComplement, ThemeSwitcher } from '@carbon-labs/react-theme-settings';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTenant } from '../../context/useTenant';

export const ProfilePanel = ({ className, onClose }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    person,
    activeOrganization,
    activeWorkspace,
    activeWorkspaceId,
    effectiveSettings,
    themeSetting,
    headerInverse,
    updateThemeSetting,
    updateHeaderInverse,
    openSignInModal,
    openOnboardingFlow,
    signOut,
    applySettingCascade,
  } = useTenant();

  const themeModeMeta = effectiveSettings.find((s) => s.property_id === 'theme.mode');
  const isThemeLocked = themeModeMeta?.is_locked;

  const dismissProfileMenu = () => {
    onClose?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  };

  const handleNavigate = (path) => {
    dismissProfileMenu();
    navigate(path);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      dismissProfileMenu();
      navigate('/', { replace: true });
    }
  };

  const handleThemeSettingChange = (value) => {
    if (isThemeLocked) return;
    updateThemeSetting(value);
    if (user) {
      applySettingCascade({
        level: 'person',
        propertyId: 'theme.mode',
        value,
        cascadeRule: 'INHERIT_OVERRIDABLE',
      }).catch(() => {});
    }
  };

  const handleThemeMenuComplementChange = (value) => {
    updateHeaderInverse(value);
  };

  const handleLanguageChange = (event) => {
    const nextLang = event.target.value;
    i18n.changeLanguage(nextLang);
    if (user) {
      applySettingCascade({
        level: 'person',
        propertyId: 'i18n.in_language',
        value: nextLang,
        cascadeRule: 'INHERIT_OVERRIDABLE',
      }).catch(() => {});
    }
  };

  const userProfile = {
    name: person?.name || user?.email || '',
    email: person?.email || user?.email || '',
  };

  // Dynamic values wired from database / active context with NO hardcoded fallback strings
  const instanceValue = activeOrganization?.identifier || activeOrganization?.id || '';
  const organizationValue = activeOrganization?.name || '';
  const workspaceIdValue = activeWorkspace?.id || activeWorkspaceId || '';
  const brandValue = activeOrganization?.legal_name || activeOrganization?.name || activeOrganization?.identifier || '';
  const planName = (activeOrganization?.plan_tier || 'free').toUpperCase();

  const readOnlyItems = user
    ? [
        {
          label: t('profile.readOnly.instance', 'Instance'),
          title: instanceValue,
        },
        {
          label: t('profile.readOnly.organization', 'Organization'),
          title: organizationValue,
        },
        {
          label: t('profile.readOnly.workspaceId', 'Workspace ID'),
          title: workspaceIdValue,
        },
        {
          label: t('profile.readOnly.plan', 'Plan'),
          title: planName,
        },
        {
          label: t('profile.readOnly.brand', 'Brand'),
          title: brandValue,
        },
      ]
    : [];

  return (
    <div className={classNames(className, 'cs--profile-panel')}>
      {/* 1. User Info Header: ONLY visible after sign-in */}
      {user ? (
        <div className="cs--profile-user-header">
          <Profile.UserInfo name={userProfile.name} email={userProfile.email} />
        </div>
      ) : (
        <div className="cs--profile-guest-header">
          <div className="cs--profile-guest-header__title">{t('profile.guest.welcome', 'Guest Session')}</div>
          <p className="cs--profile-guest-header__subtitle">
            {t('profile.guest.signInPrompt', 'Sign in to access your tenant workspace and resources.')}
          </p>
        </div>
      )}

      {/* 2. Theme Settings with Carbon ThemeSwitcher and Complement menu theme */}
      <ThemeSettings legendText={t('profile.settings.themeLegend', 'Theme')}>
        {isThemeLocked && (
          <p className="cs--profile-status-note">
            <Locked size={14} style={{ verticalAlign: 'middle', marginInlineEnd: 4 }} />
            {t('cascadeSettings.lockedBadge', {
              level: themeModeMeta?.locked_by_level || 'organization',
              defaultValue: `Locked by ${themeModeMeta?.locked_by_level || 'organization'}`,
            })}
          </p>
        )}
        <ThemeSwitcher lowContrast size="sm" onChange={handleThemeSettingChange} value={themeSetting} />
        <ThemeMenuComplement
          id="theme-menu-complement"
          labelText={t('profile.settings.complementMenuTheme', 'Complement menu theme')}
          checked={headerInverse}
          onChange={handleThemeMenuComplementChange}
        />
      </ThemeSettings>

      {/* 3. Dynamic Read-Only Tenant Account Information (No hardcoded values) */}
      {user && readOnlyItems.length > 0 && <Profile.ReadOnly items={readOnlyItems} />}

      {/* 4. Language Selection */}
      <div className="cs--profile-section">
        <Select
          id="profile-language-select"
          size="sm"
          labelText={t('profile.auth.languageLabel', 'Interface language')}
          value={i18n.language || 'en'}
          onChange={handleLanguageChange}
        >
          <SelectItem value="en" text="English (en)" />
          <SelectItem value="de" text="Deutsch (de)" />
          <SelectItem value="pt-BR" text="Português (pt-BR)" />
          <SelectItem value="jp-JP" text="日本語 (jp-JP)" />
          <SelectItem value="zh-CN" text="简体中文 (zh-CN)" />
        </Select>
      </div>

      {/* 5. Streamlined Profile Actions: Profile Settings, Plan {dynamic}, Logout */}
      <ContainedList
        label={
          user ? t('profile.links.label', 'Tenant Settings & Links') : t('profile.links.authSection', 'Authentication')
        }
        kind="on-page"
      >
        {user ? (
          <>
            <ContainedListItem
              renderIcon={UserFollow}
              onClick={() => {
                dismissProfileMenu();
                openOnboardingFlow();
              }}
            >
              {t('profile.links.profileSettings', 'Profile Settings')}
            </ContainedListItem>
            <ContainedListItem renderIcon={Wallet} onClick={() => handleNavigate('/payments')}>
              {t('profile.links.planFormat', 'Plan {{plan}}', {
                plan: planName,
                defaultValue: `Plan ${planName}`,
              })}
            </ContainedListItem>
            <ContainedListItem renderIcon={Logout} onClick={handleSignOut}>
              {t('profile.auth.signOut', 'Logout')}
            </ContainedListItem>
          </>
        ) : (
          <ContainedListItem
            renderIcon={Login}
            onClick={() => {
              dismissProfileMenu();
              openSignInModal(0);
            }}
          >
            {t('profile.auth.signIn', 'Log in')}
          </ContainedListItem>
        )}
      </ContainedList>
    </div>
  );
};

ProfilePanel.propTypes = {
  className: PropTypes.string,
  onClose: PropTypes.func,
};

export default ProfilePanel;
