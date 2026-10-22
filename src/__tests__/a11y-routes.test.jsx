/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, describe } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantProvider } from '../context/TenantContext';
import Welcome from '../pages/welcome/Welcome';
import NotFound from '../pages/not-found/NotFound';
import Placeholder from '../pages/placeholder/Placeholder';
import Dashboard from '../pages/dashboard/Dashboard';
import TenantCascadeSettings from '../pages/settings/TenantCascadeSettings';
import KnowledgeVectorPage from '../pages/knowledge/KnowledgeVectorPage';
import PaymentManagementPage from '../pages/payments/PaymentManagementPage';
import { OnboardingFullPage } from '../components/onboarding/OnboardingFullPage';
import { SignInModal } from '../components/auth/SignInModal';
import { TenantContext, DEFAULT_CONTEXT_VALUE } from '../context/useTenant';

/**
 * Runs axe on a container and returns only serious/critical violations.
 * axe-core WCAG 2.x rules; we scope to the automated layer — manual keyboard
 * and screen-reader review remains a separate (Fase 7) gate.
 */
async function runAxe(container) {
  const results = await axe.run(container, {
    resultTypes: ['violations'],
    rules: {
      // Color-contrast analysis can be flaky under jsdom's limited layout/CSS
      // engine; real contrast is verified visually via screenshots (Fase 7).
      'color-contrast': { enabled: false },
    },
  });
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

function expectNoSeriousViolations(violations) {
  if (violations.length > 0) {
    const summary = violations
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s) [${v.nodes.map((n) => n.target).join(', ')}]`,
      )
      .join('\n');
    throw new Error(`axe serious/critical violations:\n${summary}`);
  }
  expect(violations).toEqual([]);
}

describe('WCAG 2.2 AA — automated axe layer per route (white theme)', () => {
  test('/ (Welcome) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Welcome />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 15000);

  test('404 (NotFound) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <TenantProvider>
          <NotFound />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 15000);

  test('Placeholder page has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter initialEntries={['/link-1']}>
        <TenantProvider>
          <Placeholder />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 15000);

  test('SignInModal (authenticated shell entry) has no serious/critical axe violations', async () => {
    const contextValue = {
      ...DEFAULT_CONTEXT_VALUE,
      isSignInModalOpen: true,
      signInStep: 0,
    };
    const { container } = render(
      <MemoryRouter>
        <TenantContext.Provider value={contextValue}>
          <SignInModal />
        </TenantContext.Provider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 15000);

  test('/dashboard has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 20000);

  test('/settings (TenantCascadeSettings) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <TenantCascadeSettings />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 20000);

  test('/knowledge (KnowledgeVectorPage) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <KnowledgeVectorPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 20000);

  test('/payments (PaymentManagementPage) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <PaymentManagementPage />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 20000);

  test('/onboarding (OnboardingFullPage standalone) has no serious/critical axe violations', async () => {
    const { container } = renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <OnboardingFullPage standalone />
        </TenantProvider>
      </MemoryRouter>,
    );
    expectNoSeriousViolations(await runAxe(container));
  }, 20000);
});
