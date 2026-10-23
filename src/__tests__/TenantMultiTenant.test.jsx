/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import { TenantProvider } from '../context/TenantContext';
import { DEFAULT_CONTEXT_VALUE, TenantContext } from '../context/useTenant';
import { WorkspaceSwitcherPanel } from '../components/workspaceSwitcher/WorkspaceSwitcherPanel';
import { ProfilePanel } from '../components/profilePanel/ProfilePanel';
import TenantCascadeSettings from '../pages/settings/TenantCascadeSettings';
import KnowledgeVectorPage from '../pages/knowledge/KnowledgeVectorPage';
import Dashboard from '../pages/dashboard/Dashboard';
import Placeholder from '../pages/placeholder/Placeholder';
import NotFound from '../pages/not-found/NotFound';
import enLocale from '../locales/en.json';
import deLocale from '../locales/de.json';
import ptBrLocale from '../locales/pt-BR.json';
import jaJpLocale from '../locales/ja-JP.json';
import jpJpLocale from '../locales/jp-JP.json';

describe('Multi-Tenant Schema.org & Cascade Engine UI', () => {
  test('renders WorkspaceSwitcherPanel with 3-tier hierarchy selectors', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <WorkspaceSwitcherPanel />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Multi-Tenant Context (Schema.org)')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization (Tier 1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace / Department (Tier 2)')).toBeInTheDocument();
    expect(screen.getByLabelText('Project / CreativeWork (Tier 3)')).toBeInTheDocument();
  });

  test('renders TenantCascadeSettings with an honest empty state when no settings are provisioned', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <TenantCascadeSettings />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Multi-Tenant Cascade Settings')).toBeInTheDocument();
    // No synthetic settings rows are rendered without a backend provisioning them.
    expect(screen.getByText('No settings configured')).toBeInTheDocument();
    expect(screen.queryByText('Carbon Theme Mode')).not.toBeInTheDocument();
    expect(screen.getByText('Schema.org JSON-LD Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Cascade Audit Ledger (Schema.org Action)')).toBeInTheDocument();
  });

  test('renders backend failures with error tone rather than success', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantContext.Provider
          value={{
            ...DEFAULT_CONTEXT_VALUE,
            statusMessage: 'Permission denied by backend.',
            statusMessageKind: 'error',
          }}
        >
          <TenantCascadeSettings />
        </TenantContext.Provider>
      </MemoryRouter>,
    );

    const message = screen.getByText('Permission denied by backend.');
    const notification = message.closest('.cds--inline-notification');
    expect(notification).toHaveClass('cds--inline-notification--error');
    expect(notification).not.toHaveClass('cds--inline-notification--success');
  });

  test('renders KnowledgeVectorPage with semantic search, document ingestion, and tenant storage buckets', () => {
    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <KnowledgeVectorPage />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Knowledge Base & pgvector RAG')).toBeInTheDocument();
    expect(screen.getByText('Search Vectors')).toBeInTheDocument();
    expect(screen.getByText('Chunk & Index Document')).toBeInTheDocument();
    expect(screen.getByText('Tenant Storage Buckets')).toBeInTheDocument();
    expect(screen.getByText('Tenant Storage MediaObjects (Schema.org MediaObject)')).toBeInTheDocument();
    expect(screen.getByText('Indexed Knowledge Corpus (Schema.org DigitalDocument)')).toBeInTheDocument();
  });

  test('renders Dashboard wired to live TenantProvider KPIs and Carbon DataTables', () => {
    renderWithoutProviders(
      <MemoryRouter initialEntries={['/dashboard/1234?q=xyz&name=Anne']}>
        <TenantProvider>
          <Dashboard />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Active members')).toBeInTheDocument();
    expect(screen.getByText('CreativeWork projects')).toBeInTheDocument();
    expect(screen.getByText('Effective Cascade Governance')).toBeInTheDocument();
    expect(screen.getByText('Schema.org Audit Action Stream')).toBeInTheDocument();
  });

  test('renders Placeholder and NotFound pages with CommonHeader and PageLayout', () => {
    const { unmount } = renderWithoutProviders(
      <MemoryRouter initialEntries={['/link-1']}>
        <TenantProvider>
          <Placeholder />
        </TenantProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('This page is not ready yet')).toBeInTheDocument();
    unmount();

    renderWithoutProviders(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <TenantProvider>
          <NotFound />
        </TenantProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  test('validates en, de, pt-BR, and ja-JP / jp-JP locale key parity and ProfilePanel ja-JP selector', () => {
    expect(Object.keys(jaJpLocale)).toEqual(Object.keys(enLocale));
    expect(Object.keys(jpJpLocale)).toEqual(Object.keys(jaJpLocale));
    expect(Object.keys(ptBrLocale)).toEqual(Object.keys(enLocale));
    expect(Object.keys(deLocale)).toEqual(Object.keys(enLocale));
    expect(jaJpLocale.dashboard.title).toBe('ダッシュボード');
    expect(jaJpLocale.cascadeSettings.title).toBe('マルチテナント・カスケード設定');

    renderWithoutProviders(
      <MemoryRouter>
        <TenantProvider>
          <ProfilePanel />
        </TenantProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('option', { name: '日本語 (ja-JP)' })).toBeInTheDocument();
  });

  test('validates canonical Carbon SCSS foundations and generated archetype classes', () => {
    const foundationsScss = fs.readFileSync(path.resolve('src/styles/_carbon-foundations.scss'), 'utf8');
    const generatedScss = fs.readFileSync(path.resolve('src/styles/_carbon-generated.scss'), 'utf8');

    expect(foundationsScss).toContain('@mixin cs-light-brand()');
    expect(foundationsScss).toContain('@mixin cs-dark-brand()');
    expect(foundationsScss).toContain('@mixin cs-page-header()');
    expect(foundationsScss).toContain('@mixin cs-section-grid()');
    expect(foundationsScss).toContain('@mixin cs-tile-base()');
    expect(foundationsScss).toContain('@mixin cs-tile-number()');
    expect(foundationsScss).toContain('@mixin cs-tile-data()');
    expect(foundationsScss).toContain('@mixin cs-motion-productive(');
    expect(generatedScss).toContain('.cs--page__header');
    expect(generatedScss).toContain('.cs--page__section-grid');
    expect(generatedScss).toContain('.cs--page__tile--data');
  });
});
