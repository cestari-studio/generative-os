/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Column,
  FormGroup,
  Grid,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  Stack,
  TextInput,
  Toggle,
} from '@carbon/react';
import { preview__Tearsheet as Tearsheet } from '@carbon/ibm-products';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const OnboardingTearsheet = ({ className }) => {
  const { t } = useTranslation();
  const {
    isOnboardingOpen,
    onboardingInitialStep = 0,
    closeOnboardingFlow,
    activeOrganization,
    workspaces = [],
    saveOnboardingProgress,
    createOrUpdateCorporateTenant,
    refreshTenantData,
  } = useTenant();

  const [currentStep, setCurrentStep] = useState(onboardingInitialStep || 0);
  const [prevInitialStep, setPrevInitialStep] = useState(onboardingInitialStep);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Form State
  // Step 0: DNA & Identity
  const [orgName, setOrgName] = useState(activeOrganization?.name || '');
  const [legalName, setLegalName] = useState(activeOrganization?.legal_name || '');
  const [countryCode, setCountryCode] = useState('BR');
  const [taxId, setTaxId] = useState(activeOrganization?.tax_id || '');
  const [postalCode, setPostalCode] = useState('');

  // Step 1: Workspaces
  const [workspaceName, setWorkspaceName] = useState(workspaces[0]?.name || 'Core Operations');
  const [workspaceSlug, setWorkspaceSlug] = useState(workspaces[0]?.identifier || 'core-ops');
  const [environmentType, setEnvironmentType] = useState('production');

  // Step 2: Vector Knowledge & pgvector RAG
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [chunkSize, setChunkSize] = useState('512');
  const [distanceMetric, setDistanceMetric] = useState('cosine');
  const [autoIndexing, setAutoIndexing] = useState(true);

  // Step 3: Subscriptions & FinOps
  const [planTier, setPlanTier] = useState(activeOrganization?.plan_tier || 'starter');
  const [billingCycle, setBillingCycle] = useState('annual');

  if (onboardingInitialStep !== prevInitialStep) {
    setPrevInitialStep(onboardingInitialStep);
    setCurrentStep(onboardingInitialStep || 0);
    setNotification(null);
  }

  const stepMeta = [
    {
      label: t('dashboard.onboarding.step1.label', 'Step 1 of 4'),
      title: t('dashboard.onboarding.step1.title', 'Configure Tenant DNA & Identity'),
      description: t(
        'dashboard.onboarding.step1.desc',
        'Set legal organization details, multi-country validation, tax registry, and enterprise brand identity.',
      ),
    },
    {
      label: t('dashboard.onboarding.step2.label', 'Step 2 of 4'),
      title: t('dashboard.onboarding.step2.title', 'Provision Workspaces & Projects'),
      description: t(
        'dashboard.onboarding.step2.desc',
        'Organize creative teams, define project boundaries, and set tenant isolation scopes.',
      ),
    },
    {
      label: t('dashboard.onboarding.step3.label', 'Step 3 of 4'),
      title: t('dashboard.onboarding.step3.title', 'Index Vector Knowledge & Documents'),
      description: t(
        'dashboard.onboarding.step3.desc',
        'Upload documents to chunk and generate 384-dimensional pgvector embeddings for cognitive RAG.',
      ),
    },
    {
      label: t('dashboard.onboarding.step4.label', 'Step 4 of 4'),
      title: t('dashboard.onboarding.step4.title', 'Activate Subscription & FinOps'),
      description: t(
        'dashboard.onboarding.step4.desc',
        'Provision recurring billing plans, PagBank gateway integration, and transparent multi-tenant ledger.',
      ),
    },
  ];

  const handleNext = async () => {
    setIsSubmitting(true);
    setNotification(null);
    try {
      if (currentStep === 0) {
        if (!orgName.trim()) {
          setNotification({
            kind: 'error',
            title: t('onboarding.validation.required', 'Organization name is required'),
          });
          setIsSubmitting(false);
          return;
        }

        if (typeof createOrUpdateCorporateTenant === 'function') {
          await createOrUpdateCorporateTenant({
            name: orgName.trim(),
            identifier: orgName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            legalName: legalName.trim() || orgName.trim(),
            taxId: taxId.trim(),
            countryCode,
            workspaceName,
          });
        }
      }

      if (typeof saveOnboardingProgress === 'function') {
        await saveOnboardingProgress({
          countryCode,
          currentStep: currentStep + 1,
          stepData: {
            orgName,
            legalName,
            countryCode,
            taxId,
            postalCode,
            workspaceName,
            workspaceSlug,
            environmentType,
            embeddingModel,
            chunkSize,
            distanceMetric,
            autoIndexing,
            planTier,
            billingCycle,
          },
          isCompleted: currentStep === 3,
        });
      }

      if (currentStep < 3) {
        setCurrentStep((prev) => prev + 1);
      } else {
        if (typeof refreshTenantData === 'function') {
          await refreshTenantData();
        }
        closeOnboardingFlow();
      }
    } catch (err) {
      setNotification({
        kind: 'error',
        title: t('common.error', 'Error saving configuration'),
        subtitle: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setNotification(null);
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const footerActions = [
    {
      label: t('common.cancel', 'Cancel'),
      kind: 'ghost',
      onClick: closeOnboardingFlow,
    },
    {
      label: t('common.back', 'Back'),
      kind: 'secondary',
      onClick: handleBack,
      disabled: currentStep === 0 || isSubmitting,
    },
    {
      label: currentStep === 3 ? t('common.finish', 'Finish') : t('common.next', 'Next'),
      kind: 'primary',
      onClick: handleNext,
      disabled: isSubmitting,
    },
  ];

  return (
    <Tearsheet
      open={isOnboardingOpen}
      onClose={closeOnboardingFlow}
      variant="wide"
      ariaLabel={t('dashboard.onboarding.title', 'Complete Your Tenant Onboarding')}
      className={className}
    >
      <Tearsheet.Header closeIconDescription={t('common.close', 'Close')}>
        <Tearsheet.HeaderContent
          label={stepMeta[currentStep]?.label}
          title={stepMeta[currentStep]?.title}
          description={stepMeta[currentStep]?.description}
        />
      </Tearsheet.Header>

      <Tearsheet.Body>
        <Tearsheet.MainContent>
          <Stack gap={6} className="cs--tearsheet-step-body">
            {notification && (
              <InlineNotification
                kind={notification.kind}
                title={notification.title}
                subtitle={notification.subtitle}
                onClose={() => setNotification(null)}
              />
            )}

            {/* Step 0: DNA & Legal Identity */}
            {currentStep === 0 && (
              <Grid>
                <Column sm={4} md={8} lg={8}>
                  <Stack gap={5}>
                    <TextInput
                      id="onboarding-org-name"
                      labelText={t('settings.profile.orgName', 'Organization Name')}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                    <TextInput
                      id="onboarding-legal-name"
                      labelText={t('settings.profile.legalName', 'Legal Registered Name')}
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                    <Select
                      id="onboarding-country"
                      labelText={t('settings.profile.country', 'Jurisdiction / Country')}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      <SelectItem value="BR" text="Brazil (BR)" />
                      <SelectItem value="US" text="United States (US)" />
                      <SelectItem value="DE" text="Germany (DE)" />
                      <SelectItem value="JP" text="Japan (JP)" />
                    </Select>
                  </Stack>
                </Column>

                <Column sm={4} md={8} lg={8}>
                  <Stack gap={5}>
                    <TextInput
                      id="onboarding-tax-id"
                      labelText={countryCode === 'BR' ? 'CNPJ (Cadastro de Pessoa Jurídica)' : 'EIN / Tax ID'}
                      placeholder={countryCode === 'BR' ? '00.000.000/0001-00' : 'XX-XXXXXXX'}
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                    />
                    <TextInput
                      id="onboarding-postal-code"
                      labelText={t('settings.profile.postalCode', 'Postal Code / CEP')}
                      placeholder={countryCode === 'BR' ? '00000-000' : '00000'}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                    />
                  </Stack>
                </Column>
              </Grid>
            )}

            {/* Step 1: Workspaces & Isolation */}
            {currentStep === 1 && (
              <Grid>
                <Column sm={4} md={8} lg={8}>
                  <Stack gap={5}>
                    <TextInput
                      id="onboarding-ws-name"
                      labelText={t('dashboard.workspaces.nameLabel', 'Workspace Name')}
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      required
                    />
                    <TextInput
                      id="onboarding-ws-slug"
                      labelText={t('dashboard.workspaces.slugLabel', 'Identifier Slug')}
                      value={workspaceSlug}
                      onChange={(e) => setWorkspaceSlug(e.target.value)}
                    />
                  </Stack>
                </Column>

                <Column sm={4} md={8} lg={8}>
                  <Select
                    id="onboarding-env-type"
                    labelText={t('dashboard.workspaces.envLabel', 'Environment Type')}
                    value={environmentType}
                    onChange={(e) => setEnvironmentType(e.target.value)}
                  >
                    <SelectItem value="production" text="Production (Isolated)" />
                    <SelectItem value="staging" text="Staging / Pre-release" />
                    <SelectItem value="development" text="Development Sandbox" />
                  </Select>
                </Column>
              </Grid>
            )}

            {/* Step 2: Vector Knowledge & pgvector RAG */}
            {currentStep === 2 && (
              <Grid>
                <Column sm={4} md={8} lg={8}>
                  <Stack gap={5}>
                    <Select
                      id="onboarding-embed-model"
                      labelText={t('knowledge.modelLabel', 'Vector Indexing Pipeline')}
                      value={embeddingModel}
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                    >
                      <SelectItem
                        value="deterministic-lexical-hash"
                        text={t('knowledge.modelLexicalHash', 'Deterministic lexical hash (384 dims, experimental)')}
                      />
                    </Select>

                    <Select
                      id="onboarding-chunk-size"
                      labelText={t('knowledge.chunkSizeLabel', 'Document Chunk Size')}
                      value={chunkSize}
                      onChange={(e) => setChunkSize(e.target.value)}
                    >
                      <SelectItem value="256" text="256 tokens (Granular)" />
                      <SelectItem value="512" text="512 tokens (Balanced Recommended)" />
                      <SelectItem value="1024" text="1024 tokens (Long Context)" />
                    </Select>
                  </Stack>
                </Column>

                <Column sm={4} md={8} lg={8}>
                  <Stack gap={5}>
                    <Select
                      id="onboarding-distance-metric"
                      labelText={t('knowledge.metricLabel', 'pgvector Distance Metric')}
                      value={distanceMetric}
                      onChange={(e) => setDistanceMetric(e.target.value)}
                    >
                      <SelectItem value="cosine" text="Cosine Similarity (<=>)" />
                      <SelectItem value="l2" text="Euclidean Distance (<->)" />
                      <SelectItem value="inner_product" text="Inner Product (<#>)" />
                    </Select>

                    <Toggle
                      id="onboarding-auto-index"
                      labelText={t('knowledge.autoIndexLabel', 'Auto-chunk and vectorize uploads')}
                      labelA={t('common.off', 'Off')}
                      labelB={t('common.on', 'On')}
                      toggled={autoIndexing}
                      onToggle={(checked) => setAutoIndexing(checked)}
                    />
                  </Stack>
                </Column>
              </Grid>
            )}

            {/* Step 3: Subscriptions & FinOps */}
            {currentStep === 3 && (
              <Grid>
                <Column sm={4} md={8} lg={8}>
                  <FormGroup legendText={t('dashboard.subscriptions.planSelect', 'Select Subscription Tier')}>
                    <RadioButtonGroup
                      name="onboarding-plan-tier"
                      valueSelected={planTier}
                      onChange={(val) => setPlanTier(val)}
                      orientation="vertical"
                    >
                      <RadioButton id="plan-free" labelText="Free Tier • $0/mo (Community)" value="free" />
                      <RadioButton id="plan-starter" labelText="Starter • $49/mo (Small Teams)" value="starter" />
                      <RadioButton
                        id="plan-enterprise"
                        labelText="Enterprise • $199/mo (Full Governance)"
                        value="enterprise"
                      />
                      <RadioButton
                        id="plan-sovereign"
                        labelText="Sovereign Cloud • Custom (Dedicated VPC)"
                        value="sovereign"
                      />
                    </RadioButtonGroup>
                  </FormGroup>
                </Column>

                <Column sm={4} md={8} lg={8}>
                  <FormGroup legendText={t('dashboard.subscriptions.billingCycle', 'Billing Frequency')}>
                    <RadioButtonGroup
                      name="onboarding-billing-cycle"
                      valueSelected={billingCycle}
                      onChange={(val) => setBillingCycle(val)}
                      orientation="vertical"
                    >
                      <RadioButton id="cycle-annual" labelText="Annual (20% discount applied)" value="annual" />
                      <RadioButton id="cycle-monthly" labelText="Monthly Billing" value="monthly" />
                    </RadioButtonGroup>
                  </FormGroup>
                </Column>
              </Grid>
            )}
          </Stack>
        </Tearsheet.MainContent>
      </Tearsheet.Body>

      <Tearsheet.Footer actions={footerActions} />
    </Tearsheet>
  );
};

OnboardingTearsheet.propTypes = {
  className: PropTypes.string,
};

export default OnboardingTearsheet;
