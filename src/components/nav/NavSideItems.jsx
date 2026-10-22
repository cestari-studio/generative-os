/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SideNavLink, SideNavMenu, SideNavMenuItem } from '@carbon/react';
import { Link as RouterLink } from 'react-router';
import { useTranslation } from 'react-i18next';

const destinationProps = (path, carbon, currentPath) =>
  path
    ? {
        as: RouterLink,
        to: path,
        isActive: path === currentPath,
      }
    : {
        href: carbon.href,
      };

export const NavSideItems = ({ routesInSideNav, currentPath }) => {
  const { t } = useTranslation();

  return (
    <>
      {routesInSideNav.map(({ path, carbon }) => {
        const itemKey = path || carbon.virtualPath || carbon.labelKey || carbon.label;
        if (carbon.inSubMenu || !carbon?.label) return null;

        return carbon.subMenu ? (
          <SideNavMenu key={itemKey} renderIcon={carbon.icon} title={t(carbon.labelKey, carbon.label)}>
            {carbon.subMenu.map((subRoute) => (
              <SideNavMenuItem
                key={subRoute.path ?? subRoute.carbon.label}
                {...destinationProps(subRoute.path, subRoute.carbon, currentPath)}
              >
                {t(subRoute.carbon.labelKey, subRoute.carbon.label)}
              </SideNavMenuItem>
            ))}
          </SideNavMenu>
        ) : (
          <SideNavLink key={itemKey} renderIcon={carbon.icon} {...destinationProps(path, carbon, currentPath)}>
            {t(carbon.labelKey, carbon.label)}
          </SideNavLink>
        );
      })}
    </>
  );
};
