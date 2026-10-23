/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Header,
  HeaderContainer,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  HeaderNavigation,
  HeaderSideNavItems,
  SideNav,
  SideNavItems,
  SkipToContent,
} from '@carbon/react';
import { Profile } from '@carbon-labs/react-ui-shell';
import { UserAvatar } from '@carbon/icons-react';
import { Link as RouterLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ProfilePanel } from '../profilePanel/ProfilePanel';
import { SignInModal } from '../auth/SignInModal';
import { OnboardingTearsheet } from '../onboarding/OnboardingTearsheet';
import { useTenant } from '../../context/useTenant';

import { routesInHeader, routesInSideNav } from '../../routes/config';
import { NavHeaderItems } from './NavHeaderItems';
import { NavSideItems } from './NavSideItems';

export const Nav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useTenant();
  const isAuthenticated = Boolean(user);

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Header aria-label={t('nav.header.shellLabel', 'Cestari Studio')}>
            <SkipToContent />
            {isAuthenticated && (
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? t('nav.menu.close', 'Close menu') : t('nav.menu.open', 'Open menu')}
                onClick={onClickSideNavExpand}
                isCollapsible={true}
                isActive={isSideNavExpanded}
                aria-expanded={isSideNavExpanded}
              />
            )}
            <HeaderName as={RouterLink} to="/" prefix={t('nav.header.prefix', 'Cestari')}>
              {t('nav.header.name', 'Studio')}
            </HeaderName>
            {isAuthenticated && routesInHeader.length > 0 && (
              <HeaderNavigation aria-label={t('nav.header.navigationAria', 'Primary navigation')}>
                <NavHeaderItems routesInHeader={routesInHeader} currentPath={location.pathname} />
              </HeaderNavigation>
            )}
            <HeaderGlobalBar>
              <Profile.Root label={t('nav.actions.userProfile', 'User profile')} renderIcon={<UserAvatar size={20} />}>
                <ProfilePanel />
              </Profile.Root>
            </HeaderGlobalBar>
          </Header>

          <SignInModal />
          <OnboardingTearsheet />

          {isAuthenticated && (
            <SideNav
              aria-label={t('nav.sideNav.ariaLabel', 'Side navigation')}
              expanded={isSideNavExpanded}
              isPersistent={false}
            >
              <SideNavItems>
                {routesInHeader.length > 0 && (
                  <HeaderSideNavItems hasDivider>
                    <NavHeaderItems routesInHeader={routesInHeader} currentPath={location.pathname} />
                  </HeaderSideNavItems>
                )}

                <NavSideItems routesInSideNav={routesInSideNav} currentPath={location.pathname} />
              </SideNavItems>
            </SideNav>
          )}
        </>
      )}
    />
  );
};

export default Nav;
