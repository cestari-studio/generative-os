/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, Column, Grid, InlineNotification, Layer, Loading, Stack, Tag, Tile } from '@carbon/react';
import { ArrowLeft, Locked, Login } from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';

import { useTenant } from '../../context/useTenant';
import { PageLayout } from '../../layouts/page-layout';
import { TENANT_SETTINGS_CATEGORIES } from '../../routes/config';
import { useOnboardingReadiness, TENANT_ONBOARDING_WIZARD_KEY } from '../../data/useOnboardingReadiness';

/**
 * Fail-closed non-authorized state rendered when the readiness gate resolves to
 * anything other than `allow`. Shows an explicit notification — never children,
 * never a fabricated allow.
 */
const NonAuthorizedState = ({ kind, title, subtitle }) => (
  <div className="cs--protected-gate-non-authorized" role="status" aria-live="polite">
    <InlineNotification lowContrast hideCloseButton kind={kind} title={title} subtitle={subtitle} />
  </div>
);
NonAuthorizedState.propTypes = {
  kind: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
};

export const ProtectedRoute = ({ children, category }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, openSignInModal, openOnboardingFlow, activeOrganizationId } = useTenant();

  // Server-authoritative onboarding readiness (ADR 0001 / Fase C). The gate asks
  // the server whether required steps are incomplete; it never infers completion
  // from account_type/name/counts/plan_tier, and never sends a client-chosen list
  // of required steps — it only names WHICH wizard it is gating. When the backend
  // RPC is not yet deployed, the adapter surfaces `unavailable_backend` and we keep
  // the session-only gate (the recorded dependency), never a fabricated readiness.
  const { readiness, resolve } = useOnboardingReadiness({
    isAuthenticated: () => Boolean(user),
    wizardKey: TENANT_ONBOARDING_WIZARD_KEY,
  });

  useEffect(() => {
    if (user) {
      resolve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeOrganizationId, location.key]);

  // Server says required steps are incomplete -> route to the onboarding flow at
  // the next required step (not the dashboard). This closes FS4's direct-route bypass.
  useEffect(() => {
    if (readiness?.status === 'ready' && readiness.decision === 'require_steps') {
      openOnboardingFlow(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness]);

  if (loading) {
    return (
      <div className="cs--protected-gate-loading" role="status" aria-live="polite">
        <Loading withOverlay={false} description={t('auth.protected.validating', 'Validating tenant session...')} />
      </div>
    );
  }

  if (user) {
    // Fail-closed: render authorized children ONLY on an explicit server-side
    // decision='allow'. Every other outcome — checking, unknown, unauthenticated,
    // unavailable_backend, blocked, unavailable, malformed payload, network
    // timeout — must NOT render the private surface.

    // Readiness still resolving — show a loading state, never children.
    if (readiness.status === 'checking') {
      return (
        <div className="cs--protected-gate-loading" role="status" aria-live="polite">
          <Loading withOverlay={false} description={t('auth.protected.resolving', 'Resolving tenant readiness...')} />
        </div>
      );
    }

    // Explicit allow — the ONLY authorized path.
    if (readiness.status === 'ready' && readiness.decision === 'allow') {
      return children;
    }

    // require_steps — the onboarding flow opens via the effect above; render nothing.
    if (readiness.status === 'ready' && readiness.decision === 'require_steps') {
      return (
        <div className="cs--protected-gate-loading" role="status" aria-live="polite">
          <Loading withOverlay={false} description={t('auth.protected.redirecting', 'Redirecting to onboarding...')} />
        </div>
      );
    }

    // blocked — server-side policy denial.
    if (readiness.status === 'ready' && readiness.decision === 'blocked') {
      return (
        <NonAuthorizedState
          kind="error"
          title={t('auth.protected.blockedTitle', 'Access Blocked')}
          subtitle={t(
            'auth.protected.blockedSubtitle',
            'Your access to this tenant workspace has been restricted by a server-side policy. Contact your administrator for assistance.',
          )}
        />
      );
    }

    // unavailable — the readiness service is unavailable.
    if (readiness.status === 'ready' && readiness.decision === 'unavailable') {
      return (
        <NonAuthorizedState
          kind="warning"
          title={t('auth.protected.unavailableTitle', 'Service Unavailable')}
          subtitle={t(
            'auth.protected.unavailableSubtitle',
            'The tenant readiness service is temporarily unavailable. Please try again later.',
          )}
        />
      );
    }

    // unavailable_backend — the readiness RPC is not deployed.
    if (readiness.status === 'unavailable_backend') {
      return (
        <NonAuthorizedState
          kind="warning"
          title={t('auth.protected.backendUnavailableTitle', 'Service Unavailable')}
          subtitle={t(
            'auth.protected.backendUnavailableSubtitle',
            'The tenant readiness service is not yet available. Please try again later.',
          )}
        />
      );
    }

    // unknown — resolution failed (RPC error, timeout, malformed payload).
    // This is a fail-closed catch-all: any unrecognized state is non-authorized.
    return (
      <NonAuthorizedState
        kind="error"
        title={t('auth.protected.unknownTitle', 'Unable to Verify Access')}
        subtitle={t(
          'auth.protected.unknownSubtitle',
          'We could not verify your access to this tenant workspace. Please try again later.',
        )}
      />
    );
  }

  const activeCategory = TENANT_SETTINGS_CATEGORIES.find(
    (cat) => cat.id === category || cat.alias === category || cat.shortSchema?.toLowerCase().includes(category),
  );
  const CategoryIcon = activeCategory?.icon || Locked;

  return (
    <PageLayout className="cs--protected-gate">
      <PageHeader
        title={t('auth.protected.title', 'Tenant-Level Settings Access Restricted')}
        subtitle={t(
          'auth.protected.subtitle',
          'All application workspaces, services, and operational configurations belong to Tenant-Level Settings categories and require an authenticated session.',
        )}
        className="cs--protected-gate__header"
        navigation={
          activeCategory ? (
            <div className="cs--protected-gate__category-tag">
              <Tag type="magenta" size="md" renderIcon={CategoryIcon}>
                {t(activeCategory.labelKey, activeCategory.defaultLabel)}
              </Tag>
              {activeCategory.shortSchema && (
                <Tag type="cool-gray" size="md">
                  {activeCategory.shortSchema}
                </Tag>
              )}
            </div>
          ) : null
        }
      />

      <div className="cs--protected-gate__content">
        <Grid narrow>
          <Column sm={4} md={8} lg={12}>
            <Stack gap={7}>
              <Tile className="cs--protected-gate__card">
                <Stack gap={5}>
                  <div className="cs--protected-gate__lock-indicator">
                    <Locked size={32} className="cs--protected-gate__lock-icon" />
                    <div>
                      <h3 className="cs--protected-gate__card-heading">
                        {t('auth.protected.cardHeading', 'Authenticated Tenant Session Required')}
                      </h3>
                      <p className="cs--protected-gate__card-lead">
                        {activeCategory
                          ? t('auth.protected.cardCategoryPrompt', {
                              category: t(activeCategory.labelKey, activeCategory.defaultLabel),
                              defaultValue: `You are attempting to access ${activeCategory.defaultLabel}. This area is restricted to authenticated members of organization workspaces.`,
                            })
                          : t(
                              'auth.protected.cardDefaultPrompt',
                              'This area is restricted to authenticated members of organization workspaces.',
                            )}
                      </p>
                    </div>
                  </div>

                  <InlineNotification
                    lowContrast
                    hideCloseButton
                    kind="warning"
                    title={t('auth.protected.warningTitle', 'Access Gate Active')}
                    subtitle={t(
                      'auth.protected.warningSubtitle',
                      'Guest visitors cannot read or alter multi-tenant configurations, pgvector embeddings, or financial records.',
                    )}
                  />

                  <div className="cs--protected-gate__actions">
                    <Button kind="primary" renderIcon={Login} onClick={() => openSignInModal(0)}>
                      {t('auth.protected.signInButton', 'Sign in to Tenant Workspace')}
                    </Button>
                    <Button kind="tertiary" renderIcon={ArrowLeft} onClick={() => navigate('/')}>
                      {t('auth.protected.returnHome', 'Return to Public Welcome')}
                    </Button>
                  </div>
                </Stack>
              </Tile>

              <div className="cs--protected-gate__categories-section">
                <h4 className="cs--protected-gate__categories-heading">
                  {t('auth.protected.allCategoriesTitle', 'Tenant-Level Settings Categories')}
                </h4>
                <p className="cs--protected-gate__categories-sub">
                  {t(
                    'auth.protected.allCategoriesSubtitle',
                    'The following modular setting domains are managed under verified tenant governance:',
                  )}
                </p>

                <Grid narrow className="cs--protected-gate__categories-grid">
                  {TENANT_SETTINGS_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isCurrent = cat.id === category;
                    return (
                      <Column sm={4} md={4} lg={4} key={cat.id} className="cs--protected-gate__category-col">
                        <Layer level={isCurrent ? 2 : 1}>
                          <Tile
                            className={`cs--protected-gate__category-tile ${
                              isCurrent ? 'cs--protected-gate__category-tile--active' : ''
                            }`}
                          >
                            <Stack gap={4}>
                              <div className="cs--protected-gate__category-tile-header">
                                <Icon size={20} />
                                <Tag size="sm" type={isCurrent ? 'cyan' : 'cool-gray'}>
                                  {isCurrent
                                    ? t('auth.protected.targetCategory', 'Target')
                                    : t('auth.protected.privateCategory', 'Private')}
                                </Tag>
                              </div>
                              <h5 className="cs--protected-gate__category-tile-title">
                                {t(cat.labelKey, cat.defaultLabel)}
                              </h5>
                              {cat.shortSchema && (
                                <Tag size="sm" type="blue">
                                  {cat.shortSchema}
                                </Tag>
                              )}
                              <p className="cs--protected-gate__category-tile-desc">
                                {t(cat.descriptionKey, cat.defaultDescription)}
                              </p>
                            </Stack>
                          </Tile>
                        </Layer>
                      </Column>
                    );
                  })}
                </Grid>
              </div>
            </Stack>
          </Column>
        </Grid>
      </div>
    </PageLayout>
  );
};

ProtectedRoute.propTypes = {
  children: PropTypes.node,
  category: PropTypes.string,
};

export default ProtectedRoute;
