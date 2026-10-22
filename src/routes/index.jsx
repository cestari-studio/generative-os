/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { FeatureFlags, Loading } from '@carbon/react';

import PropTypes from 'prop-types';
import { routes } from './config.js';
import { TenantProvider } from '../context/TenantContext.jsx';
import { ProtectedRoute } from '../components/auth/ProtectedRoute.jsx';
import { CARBON_V12_FLAGS } from '../config/carbon-flags.js';

export const Router = ({ initialThemeSetting, initialHeaderInverse, serverUser = null }) => {
  return (
    <FeatureFlags flags={CARBON_V12_FLAGS}>
      <TenantProvider
        initialThemeSetting={initialThemeSetting}
        initialHeaderInverse={initialHeaderInverse}
        initialServerUser={serverUser}
      >
        <Suspense
          fallback={
            <div className="cs--route-loading-container">
              <Loading withOverlay={false} description="Loading page..." />
            </div>
          }
        >
          <Routes>
            {routes.map(({ element: Element, isPrivate, carbon, ...rest }) => (
              <Route
                key={rest.path || 'index'}
                {...rest}
                element={
                  isPrivate ? (
                    <ProtectedRoute category={carbon?.settingCategory}>{Element && <Element />}</ProtectedRoute>
                  ) : (
                    Element && <Element />
                  )
                }
              />
            ))}
          </Routes>
        </Suspense>
      </TenantProvider>
    </FeatureFlags>
  );
};

Router.propTypes = {
  initialThemeSetting: PropTypes.string,
  initialHeaderInverse: PropTypes.bool,
  serverUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string,
  }),
};
