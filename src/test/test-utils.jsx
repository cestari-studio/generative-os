/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { render as rtlRender } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { FeatureFlags } from '@carbon/react';
import { Router } from '../routes';
import i18n from '../i18n.client.js';
import { CARBON_V12_FLAGS } from '../config/carbon-flags.js';

/**
 * Renders a component with all providers (Router, etc.)
 * Use this for page components or components that need routing
 */
export function renderWithAllProviders(ui, { route = '/', ...renderOptions } = {}) {
  // Push the route we want to test
  window.history.pushState({}, 'Test page', route);

  function Wrapper() {
    return (
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>
            <Router />
          </BrowserRouter>
        </I18nextProvider>
      </StrictMode>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Renders a component without any providers
 * Use this for pure components that don't depend on any context
 */
export function renderWithoutProviders(ui, renderOptions = {}) {
  function Wrapper({ children }) {
    return (
      <StrictMode>
        <FeatureFlags flags={CARBON_V12_FLAGS}>
          <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        </FeatureFlags>
      </StrictMode>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}
