/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useMemo } from 'react';
import { useNormativeCatalog } from '../../data/useNormativeCatalog';
import {
  Button,
  CodeSnippet,
  Column,
  Grid,
  Layer,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Tile,
} from '@carbon/react';
import {
  Application,
  ArrowRight,
  Catalog,
  CheckmarkFilled,
  DataStructured,
  Events,
  SettingsAdjust,
} from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { PageLayout } from '../../layouts/page-layout';
import { Footer } from '../../components/footer/Footer';
import { useTenant } from '../../context/useTenant';
import { RESOURCE_TAXONOMY } from '../../routes/config';

const ProductsCatalogPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrganization, activeWorkspace, activeProject } = useTenant();

  // Normative catalog from the backend (migration 20261022060000 + seed).
  // When the catalog store is not provisioned, we show the factual empty
  // state — never the static constant as a silent runtime fallback.
  const catalog = useNormativeCatalog();
  const catalogReady = catalog.status === 'ready';

  // Schema.org JSON-LD Representation
  const schemaOrgJsonLd = useMemo(() => {
    return JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `urn:genos:org:${activeOrganization?.identifier || 'cestari-studio'}`,
            name: activeOrganization?.name || 'Cestari Studio Agency',
            url: 'https://genos.cloud',
            owns: catalog.products.map((prod) => ({
              '@type': 'Product',
              name: prod.name,
              identifier: prod.key,
              description: prod.summary,
              category: 'genOS product suite',
            })),
          },
          ...Object.values(RESOURCE_TAXONOMY).map((res) => ({
            '@type': res.shortSchema.replace('schema:', ''),
            '@id': `urn:genos:taxonomy:${res.id}`,
            name: res.defaultLabel,
            description: res.defaultDescription,
            url: res.primaryRoute,
          })),
        ],
      },
      null,
      2,
    );
  }, [activeOrganization, catalog.products]);

  return (
    <PageLayout className="cs--products-page">
      <PageHeader
        title={t('productsCatalog.title', 'Products & Brand DNA Catalog')}
        subtitle={t(
          'productsCatalog.subtitle',
          'Autonomous multi-tenant product suites, Brand DNA profiles, and platform services governed under Schema.org taxonomies.',
        )}
        className="cs--products-page__header"
        navigation={
          <p className="cds--type-caption cs--products-page__header-caption">
            {[
              activeOrganization?.name || 'Cestari Studio Agency',
              activeWorkspace?.name || 'Core Platform',
              activeProject?.name || 'Production Tenant',
              'schema:Product',
            ].join(' • ')}
          </p>
        }
      />

      <Tabs className="cs--products-page__tabs">
        <TabList aria-label={t('productsCatalog.tabsAriaLabel', 'Products and Brand DNA Sections')}>
          <Tab renderIcon={Catalog}>{t('productsCatalog.tabProducts', 'Product Suites (5)')}</Tab>
          <Tab renderIcon={Application}>{t('productsCatalog.tabBrandDna', 'Brand DNA Profiles')}</Tab>
          <Tab renderIcon={Events}>{t('productsCatalog.tabPlatform', 'Platform Services & Capabilities')}</Tab>
          <Tab renderIcon={DataStructured}>{t('productsCatalog.tabTaxonomy', 'Schema.org Taxonomy Graph')}</Tab>
        </TabList>

        <TabPanels>
          {/* TAB 1: PRODUCT SUITES (normative catalog from backend) */}
          <TabPanel>
            <Stack gap={6}>
              <Tile className="cs--products-page__banner">
                <Stack gap={3}>
                  <div className="cs--products-page__banner-header">
                    <div>
                      <h3 className="cs--products-page__banner-title">
                        {t('productsCatalog.suitesTitle', 'Multi-Tenant genOS Product Suites')}
                      </h3>
                      <p className="cs--products-page__banner-lead">
                        {t(
                          'productsCatalog.suitesDesc',
                          'Normative product suites from the versioned catalog source, with subproducts, capabilities and outcomes.',
                        )}
                      </p>
                    </div>
                    {catalogReady && (
                      <Tag type="cyan" size="md">
                        {t('productsCatalog.suitesCount', '{{count}} Suites', { count: catalog.products.length })}
                      </Tag>
                    )}
                  </div>
                </Stack>
              </Tile>

              {catalog.status === 'error' ? (
                <Tile className="cs--products-page__empty" role="alert">
                  <Stack gap={3}>
                    <h3 className="cs--products-page__empty-title">
                      {t('productsCatalog.loadErrorTitle', 'Could not load product catalog')}
                    </h3>
                    <p className="cs--products-page__empty-text">
                      {catalog.error || t('productsCatalog.loadError', 'The product catalog request failed.')}
                    </p>
                    <Button kind="tertiary" onClick={catalog.retry}>
                      {t('common.retry', 'Retry')}
                    </Button>
                  </Stack>
                </Tile>
              ) : !catalogReady ? (
                <Tile className="cs--products-page__empty">
                  <Stack gap={3}>
                    <h3 className="cs--products-page__empty-title">
                      {t('productsCatalog.notProvisionedTitle', 'Product catalog not provisioned')}
                    </h3>
                    <p className="cs--products-page__empty-text">
                      {catalog.status === 'loading'
                        ? t('productsCatalog.loading', 'Loading the normative product catalog…')
                        : t(
                            'productsCatalog.notProvisionedDesc',
                            'The normative product catalog is not provisioned in this environment yet. When the catalog source (migration + seed) is applied, the five product suites with their subproducts, capabilities and outcomes will appear here.',
                          )}
                    </p>
                  </Stack>
                </Tile>
              ) : (
                <Grid narrow>
                  {catalog.products.map((product) => {
                    const subs = catalog.subproductsByProduct[product.key] || [];
                    return (
                      <Column sm={4} md={8} lg={8} key={product.key} className="cs--products-page__product-col">
                        <Layer level={1}>
                          <Tile className="cs--products-page__product-card">
                            <Stack gap={5}>
                              <div className="cs--products-page__product-card-top">
                                <div>
                                  <div className="cs--products-page__product-badges">
                                    <Tag size="sm" type="cool-gray">
                                      schema:Product
                                    </Tag>
                                    {product.status && (
                                      <Tag size="sm" type="green">
                                        {product.status}
                                      </Tag>
                                    )}
                                  </div>
                                  <h4 className="cs--products-page__product-title">{product.name}</h4>
                                  <p className="cs--products-page__product-key">{product.key}</p>
                                </div>
                              </div>

                              <p className="cs--products-page__product-tagline">{product.summary}</p>
                              {product.value && <p className="cs--products-page__product-desc">{product.value}</p>}

                              {Array.isArray(product.outcomes) && product.outcomes.length > 0 && (
                                <div>
                                  <h5 className="cs--products-page__section-subtitle">
                                    {t('productsCatalog.verifiableOutcomes', 'Verifiable Outcomes')}
                                  </h5>
                                  <div className="cs--products-page__outcomes-list">
                                    {product.outcomes.map((outcome, idx) => (
                                      <div key={idx} className="cs--products-page__outcome-item">
                                        <CheckmarkFilled size={16} className="cs--products-page__checkmark" />
                                        <span>
                                          {typeof outcome === 'string'
                                            ? outcome
                                            : outcome?.outcome || JSON.stringify(outcome)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {subs.length > 0 && (
                                <div>
                                  <h5 className="cs--products-page__section-subtitle">
                                    {t('productsCatalog.subproductsHeading', 'Subproducts & Components')}
                                  </h5>
                                  <div className="cs--products-page__subproducts-tags">
                                    {subs.map((sub) => (
                                      <Tag key={sub.key} size="sm" type="teal" title={sub.summary}>
                                        {sub.name}
                                      </Tag>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </Stack>
                          </Tile>
                        </Layer>
                      </Column>
                    );
                  })}
                </Grid>
              )}
            </Stack>
          </TabPanel>

          {/* TAB 2: BRAND DNA PROFILES (no backend brand registry yet — honest state) */}
          <TabPanel>
            <Tile className="cs--products-page__empty">
              <Stack gap={3}>
                <h3 className="cs--products-page__empty-title">
                  {t('productsCatalog.brandDnaNotProvisionedTitle', 'Brand DNA registry not provisioned')}
                </h3>
                <p className="cs--products-page__empty-text">
                  {t(
                    'productsCatalog.brandDnaNotProvisionedDesc',
                    'There is no provisioned Brand DNA registry in this environment yet. Tenant brand profiles will be listed here once the brand registry service and schema exist — never from a static demonstration list.',
                  )}
                </p>
              </Stack>
            </Tile>
          </TabPanel>

          {/* TAB 3: PLATFORM SERVICES & CAPABILITIES (normative catalog from backend) */}
          <TabPanel>
            {!catalogReady ? (
              <Tile className="cs--products-page__empty">
                <Stack gap={3}>
                  <h3 className="cs--products-page__empty-title">
                    {t('productsCatalog.notProvisionedTitle', 'Product catalog not provisioned')}
                  </h3>
                  <p className="cs--products-page__empty-text">
                    {catalog.status === 'loading'
                      ? t('productsCatalog.loading', 'Loading the normative product catalog…')
                      : t(
                          'productsCatalog.notProvisionedDesc',
                          'The normative product catalog is not provisioned in this environment yet. When the catalog source (migration + seed) is applied, platform services and shared capabilities will appear here.',
                        )}
                  </p>
                </Stack>
              </Tile>
            ) : (
              <Stack gap={6}>
                <div>
                  <h3 className="cs--products-page__tab-heading">
                    {t('productsCatalog.servicesHeading', 'Foundational Platform Services')}
                  </h3>
                  <p className="cs--products-page__tab-sub">
                    {t(
                      'productsCatalog.servicesSub',
                      'Transversal services underpinning authentication, UI shell, cascading rules, and release gates.',
                    )}
                  </p>

                  <Grid narrow className="cs--products-page__services-grid">
                    {catalog.platformServices.map((srv) => (
                      <Column sm={4} md={4} lg={5} key={srv.key} className="cs--products-page__service-col">
                        <Layer level={1}>
                          <Tile className="cs--products-page__service-tile">
                            <Stack gap={3}>
                              <Tag size="sm" type="cyan">
                                platform_service
                              </Tag>
                              <h4 className="cs--products-page__service-title">{srv.name}</h4>
                              <p className="cs--products-page__service-key">{srv.key}</p>
                              <p className="cs--products-page__service-desc">{srv.summary}</p>
                              <div className="cs--products-page__entities-tag-list">
                                {(Array.isArray(srv.entities) ? srv.entities : []).map((ent) => (
                                  <Tag
                                    key={typeof ent === 'string' ? ent : JSON.stringify(ent)}
                                    size="sm"
                                    type="cool-gray"
                                  >
                                    {typeof ent === 'string' ? ent : (ent?.name ?? JSON.stringify(ent))}
                                  </Tag>
                                ))}
                              </div>
                            </Stack>
                          </Tile>
                        </Layer>
                      </Column>
                    ))}
                  </Grid>
                </div>

                <div>
                  <h3 className="cs--products-page__tab-heading">
                    {t('productsCatalog.capabilitiesHeadingTitle', 'Shared Platform Capabilities')}
                  </h3>
                  <p className="cs--products-page__tab-sub">
                    {t(
                      'productsCatalog.capabilitiesSub',
                      'Reusable capabilities consumed uniformly across all 5 genOS product suites.',
                    )}
                  </p>

                  <Grid narrow className="cs--products-page__services-grid">
                    {catalog.capabilities.map((cap) => (
                      <Column sm={4} md={4} lg={5} key={cap.key} className="cs--products-page__service-col">
                        <Layer level={1}>
                          <Tile className="cs--products-page__service-tile">
                            <Stack gap={3}>
                              <Tag size="sm" type="purple">
                                shared_capability
                              </Tag>
                              <h4 className="cs--products-page__service-title">{cap.name}</h4>
                              <p className="cs--products-page__service-key">{cap.key}</p>
                              <p className="cs--products-page__service-desc">{cap.summary}</p>
                              <div className="cs--products-page__entities-tag-list">
                                {(Array.isArray(cap.entities) ? cap.entities : []).map((ent) => (
                                  <Tag key={typeof ent === 'string' ? ent : JSON.stringify(ent)} size="sm" type="teal">
                                    {typeof ent === 'string' ? ent : (ent?.name ?? JSON.stringify(ent))}
                                  </Tag>
                                ))}
                              </div>
                            </Stack>
                          </Tile>
                        </Layer>
                      </Column>
                    ))}
                  </Grid>
                </div>
              </Stack>
            )}
          </TabPanel>

          {/* TAB 4: SCHEMA.ORG TAXONOMY GRAPH */}
          <TabPanel>
            <Stack gap={6}>
              <Tile className="cs--products-page__banner">
                <Stack gap={3}>
                  <div className="cs--products-page__banner-header">
                    <div>
                      <h3 className="cs--products-page__banner-title">
                        {t('productsCatalog.taxonomyTitle', 'Schema.org Multi-Tenant Taxonomy Graph')}
                      </h3>
                      <p className="cs--products-page__banner-lead">
                        {t(
                          'productsCatalog.taxonomyDesc',
                          'Formal alignment of all platform pages, entities, and actions to standard Schema.org vocabulary.',
                        )}
                      </p>
                    </div>
                    <Tag type="green" size="md">
                      JSON-LD Compliant
                    </Tag>
                  </div>
                </Stack>
              </Tile>

              <Grid narrow>
                {Object.values(RESOURCE_TAXONOMY).map((res) => {
                  const Icon = res.icon;
                  return (
                    <Column sm={4} md={4} lg={5} key={res.id} className="cs--products-page__taxonomy-col">
                      <Layer level={1}>
                        <Tile className="cs--products-page__taxonomy-card">
                          <Stack gap={4}>
                            <div className="cs--products-page__taxonomy-header">
                              <Icon size={24} />
                              <Tag size="sm" type="blue">
                                {res.shortSchema}
                              </Tag>
                            </div>
                            <h4 className="cs--products-page__taxonomy-title">{res.defaultLabel}</h4>
                            <p className="cs--products-page__taxonomy-desc">{res.defaultDescription}</p>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={ArrowRight}
                              onClick={() => navigate(res.primaryRoute)}
                            >
                              {t('productsCatalog.openModule', 'Open Module')}
                            </Button>
                          </Stack>
                        </Tile>
                      </Layer>
                    </Column>
                  );
                })}
              </Grid>

              <div>
                <h4 className="cs--products-page__section-subtitle">
                  {t('productsCatalog.jsonLdSnippet', 'Live Schema.org JSON-LD Context')}
                </h4>
                <CodeSnippet type="multi" feedback="Copied to clipboard">
                  {schemaOrgJsonLd}
                </CodeSnippet>
              </div>
            </Stack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Footer />
    </PageLayout>
  );
};

export default ProductsCatalogPage;
