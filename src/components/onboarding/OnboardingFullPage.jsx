/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { CreateFullPage, CreateFullPageStep } from '@carbon/ibm-products';
import {
  Button,
  ContentSwitcher,
  InlineNotification,
  Select,
  SelectItem,
  Stack,
  Switch,
  Tag,
  TextInput,
} from '@carbon/react';
import {
  Building,
  Checkmark,
  Enterprise,
  FaceActivated,
  FingerprintRecognition,
  Identification,
  Location,
  Password,
  User,
  Workspace,
} from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTenant } from '../../context/useTenant';

const COUNTRY_DOC_CONFIG = {
  BR: {
    pfTaxLabel: 'CPF (Cadastro de Pessoas Físicas)',
    pfTaxPlaceholder: '000.000.000-00',
    pfSecLabel: 'RG (com Órgão Emissor/UF)',
    pfSecPlaceholder: '12.345.678-9 SSP/SP',
    pjTaxLabel: 'CNPJ (Cadastro Nacional da Pessoa Jurídica)',
    pjTaxPlaceholder: '00.000.000/0001-00',
    pjSecLabel: 'Inscrição Estadual (IE)',
    pjSecPlaceholder: 'Isento ou 000.000.000.000',
    postalLabel: 'CEP (Código de Endereçamento Postal)',
    postalPlaceholder: '01310-100',
  },
  US: {
    pfTaxLabel: 'SSN / ITIN (Social Security Number)',
    pfTaxPlaceholder: '000-00-0000',
    pfSecLabel: "Driver's License / State ID",
    pfSecPlaceholder: 'D12345678 (NY)',
    pjTaxLabel: 'EIN (Employer Identification Number)',
    pjTaxPlaceholder: '00-0000000',
    pjSecLabel: 'D-U-N-S Number',
    pjSecPlaceholder: '00-000-0000',
    postalLabel: 'ZIP Code (5+4 digits)',
    postalPlaceholder: '10001',
  },
  DE: {
    pfTaxLabel: 'Steuer-ID (Identifikationsnummer)',
    pfTaxPlaceholder: '11-stellige Nummer (12 345 678 901)',
    pfSecLabel: 'Personalausweisnummer / Reisepass',
    pfSecPlaceholder: 'L01X00T47',
    pjTaxLabel: 'Handelsregisternummer (HRB/HRA)',
    pjTaxPlaceholder: 'HRB 12345 B (Amtsgericht Berlin)',
    pjSecLabel: 'USt-IdNr. (Umsatzsteuer-ID)',
    pjSecPlaceholder: 'DE123456789',
    postalLabel: 'Postleitzahl (PLZ)',
    postalPlaceholder: '10115',
  },
  GB: {
    pfTaxLabel: 'National Insurance Number (NINO)',
    pfTaxPlaceholder: 'QQ 12 34 56 A',
    pfSecLabel: 'UK Passport / Driving Licence',
    pfSecPlaceholder: '123456789',
    pjTaxLabel: 'Companies House CRN',
    pjTaxPlaceholder: '01234567',
    pjSecLabel: 'VAT Registration Number',
    pjSecPlaceholder: 'GB 123 4567 89',
    postalLabel: 'Postcode',
    postalPlaceholder: 'EC1A 1BB',
  },
  PT: {
    pfTaxLabel: 'NIF (Número de Identificação Fiscal)',
    pfTaxPlaceholder: '123 456 789',
    pfSecLabel: 'Cartão de Cidadão / Passaporte',
    pfSecPlaceholder: '00000000 0 ZZ0',
    pjTaxLabel: 'NIPC (Pessoa Coletiva)',
    pjTaxPlaceholder: '500 123 456',
    pjSecLabel: 'Código de Certidão Permanente',
    pjSecPlaceholder: '1234-5678-9012',
    postalLabel: 'Código Postal',
    postalPlaceholder: '1000-001',
  },
  ES: {
    pfTaxLabel: 'NIF / NIE',
    pfTaxPlaceholder: '12345678Z',
    pfSecLabel: 'DNI (Documento Nacional de Identidad)',
    pfSecPlaceholder: '12345678-A',
    pjTaxLabel: 'CIF (NIF de Empresa)',
    pjTaxPlaceholder: 'B-12345678',
    pjSecLabel: 'Registro Mercantil (Tomo, Folio, Hoja)',
    pjSecPlaceholder: 'Tomo 1234, Folio 56, Hoja M-789',
    postalLabel: 'Código Postal',
    postalPlaceholder: '28001',
  },
  FR: {
    pfTaxLabel: 'Numéro Fiscal de Référence',
    pfTaxPlaceholder: '13 chiffres (1234567890123)',
    pfSecLabel: 'NIR (Numéro de Sécurité Sociale)',
    pfSecPlaceholder: '1 85 04 75 123 456 78',
    pjTaxLabel: 'Numéro SIREN (9) / SIRET (14)',
    pjTaxPlaceholder: '123 456 789 00012',
    pjSecLabel: 'Numéro TVA Intracommunautaire',
    pjSecPlaceholder: 'FR 12 345678901',
    postalLabel: 'Code Postal',
    postalPlaceholder: '75001',
  },
  CN: {
    pfTaxLabel: '居民身份证号码 (SFZ)',
    pfTaxPlaceholder: '18位公民身份证号码',
    pfSecLabel: '户口簿号 / 护照号',
    pfSecPlaceholder: 'E12345678',
    pjTaxLabel: '统一社会信用代码 (USCC)',
    pjTaxPlaceholder: '91110108MA00XXXXXX',
    pjSecLabel: '国民经济行业分类代码',
    pjSecPlaceholder: 'I6510',
    postalLabel: '邮政编码',
    postalPlaceholder: '100000',
  },
  JP: {
    pfTaxLabel: 'マイナンバー (Individual Number)',
    pfTaxPlaceholder: '12桁の個人番号',
    pfSecLabel: '運転免許証番号 / 在留カード',
    pfSecPlaceholder: '第123456789012号',
    pjTaxLabel: '法人番号 (Corporate Number)',
    pjTaxPlaceholder: '13桁の法人番号',
    pjSecLabel: '適格請求書発行事業者登録番号',
    pjSecPlaceholder: 'T1234567890123',
    postalLabel: '郵便番号 (〒)',
    postalPlaceholder: '100-0001',
  },
};

export const OnboardingFullPage = ({ className, standalone = false }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    person,
    organizations,
    workspaces,
    projects,
    activeOrganizationId,
    activeWorkspaceId,
    activeProjectId,
    isOnboardingOpen,
    closeOnboardingFlow,
    switchActiveContext,
    registerPasskey,
    applySettingCascade,
    saveOnboardingProgress,
    createOrUpdateCorporateTenant,
  } = useTenant();

  const initialName = person?.name || user?.user_metadata?.name || '';

  // Step 1 States: Account classification, Jurisdiction, Language
  const [accountType, setAccountType] = useState('individual'); // 'individual' (PF) | 'organization_member' (PJ)
  const [countryCode, setCountryCode] = useState('BR');
  const [preferredLanguage, setPreferredLanguage] = useState(i18n.language || 'en');

  // Step 2 States: Personal Identity (PF) or Legal Name & Fiscal (PJ)
  const [fullName, setFullName] = useState(initialName);
  const [birthDate, setBirthDate] = useState('');
  const [pfTaxId, setPfTaxId] = useState('');
  const [pfSecId, setPfSecId] = useState('');

  // Step 3 States: Corporate PJ Profile & Governance
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [pjTaxId, setPjTaxId] = useState('');
  const [pjSecId, setPjSecId] = useState('');
  const [sizeCategory, setSizeCategory] = useState('MICRO');
  const [repName, setRepName] = useState(initialName);
  const [repRole, setRepRole] = useState('Diretor Executivo / CEO');
  const [repDoc, setRepDoc] = useState('');

  // Step 4 States: Structured PostalAddress
  const [postalCode, setPostalCode] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [region, setRegion] = useState('');

  // Step 5 States: Workspace Hierarchy & Passkey
  const [selectedOrgId, setSelectedOrgId] = useState(activeOrganizationId);
  const [selectedWsId, setSelectedWsId] = useState(activeWorkspaceId);
  const [selectedPrjId, setSelectedPrjId] = useState(activeProjectId);
  const [passkeyModality, setPasskeyModality] = useState('touch'); // 'touch' | 'camera' | 'securityKey'
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const docConfig = COUNTRY_DOC_CONFIG[countryCode] || COUNTRY_DOC_CONFIG.BR;
  const filteredWorkspaces = workspaces.filter((ws) => ws.organization_id === selectedOrgId);
  const filteredProjects = projects.filter((prj) => prj.workspace_id === selectedWsId);

  // If not standalone route and modal is not open, do not render
  if (!standalone && !isOnboardingOpen) {
    return null;
  }

  const handleLanguageChange = (e) => {
    const nextLang = e.target.value;
    setPreferredLanguage(nextLang);
    i18n.changeLanguage(nextLang);
  };

  const handleAccountTypeChange = (name) => {
    setAccountType(name);
    if (name === 'organization_member' && !repName) {
      setRepName(fullName || initialName);
    }
  };

  const handleOrgChange = (e) => {
    const nextOrgId = e.target.value;
    setSelectedOrgId(nextOrgId);
    const nextWs = workspaces.find((w) => w.organization_id === nextOrgId);
    setSelectedWsId(nextWs?.id || '');
    const nextPrj = projects.find((p) => p.workspace_id === nextWs?.id);
    setSelectedPrjId(nextPrj?.id || '');
  };

  const handleWsChange = (e) => {
    const nextWsId = e.target.value;
    setSelectedWsId(nextWsId);
    const nextPrj = projects.find((p) => p.workspace_id === nextWsId);
    setSelectedPrjId(nextPrj?.id || '');
  };

  const handlePrjChange = (e) => {
    setSelectedPrjId(e.target.value);
  };

  const handleRegisterPasskey = async () => {
    try {
      const deviceLabel =
        passkeyModality === 'camera'
          ? 'Facial Recognition / Windows Hello'
          : passkeyModality === 'securityKey'
            ? 'FIDO2 Security Key'
            : 'Biometric Touch ID';
      await registerPasskey(deviceLabel);
      setPasskeyRegistered(true);
    } catch (err) {
      setErrorMessage(
        err?.message ||
          'Passkey registration is currently under FIDO2 certification and disabled for security compliance.',
      );
    }
  };

  // Intermediate Step Progress Savers
  const handleStep1Next = async () => {
    try {
      await saveOnboardingProgress({
        accountType,
        countryCode,
        currentStep: 1,
        stepData: {
          account_type: accountType,
          country_code: countryCode,
          language: preferredLanguage,
        },
        isCompleted: false,
      });
    } catch (err) {
      console.warn('Progress save warning (step 1):', err);
    }
  };

  const handleStep2Next = async () => {
    try {
      const stepData =
        accountType === 'individual'
          ? { full_name: fullName, tax_id: pfTaxId, national_identity: pfSecId, birth_date: birthDate }
          : { corporate_name: legalName, trade_name: tradeName, tax_id: pjTaxId, registration_number: pjSecId };

      await saveOnboardingProgress({
        accountType,
        countryCode,
        currentStep: 2,
        stepData,
        isCompleted: false,
      });
    } catch (err) {
      console.warn('Progress save warning (step 2):', err);
    }
  };

  const handleStep3Next = async () => {
    if (accountType !== 'organization_member') return;
    try {
      await saveOnboardingProgress({
        accountType,
        countryCode,
        currentStep: 3,
        stepData: {
          size_category: sizeCategory,
          legal_representative: {
            name: repName || fullName || initialName,
            role: repRole,
            document: repDoc,
          },
        },
        isCompleted: false,
      });
    } catch (err) {
      console.warn('Progress save warning (step 3):', err);
    }
  };

  const handleStep4Next = async () => {
    try {
      await saveOnboardingProgress({
        accountType,
        countryCode,
        currentStep: 4,
        stepData: {
          address: {
            postal_code: postalCode,
            street_address: streetAddress,
            locality,
            region,
            country: countryCode,
          },
        },
        isCompleted: false,
      });
    } catch (err) {
      console.warn('Progress save warning (step 4):', err);
    }
  };

  // Final Onboarding Completion Handler
  const handleCompleteSetup = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const addressData = {
        postal_code: postalCode,
        street_address: streetAddress,
        locality,
        region,
        country: countryCode,
      };

      if (accountType === 'individual') {
        await saveOnboardingProgress({
          accountType: 'individual',
          countryCode,
          currentStep: 5,
          stepData: {
            full_name: fullName || initialName || user?.email,
            tax_id: pfTaxId,
            national_identity: pfSecId,
            birth_date: birthDate,
            address: addressData,
          },
          isCompleted: true,
        }).catch(() => {});

        await Promise.race([
          switchActiveContext({
            organizationId: selectedOrgId,
            workspaceId: selectedWsId,
            projectId: selectedPrjId,
          }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } else {
        const slug = (tradeName || legalName || 'corp')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 20);
        const orgIdentifier = `${slug || 'tenant'}-${Date.now().toString(36).slice(-4)}`;

        const tenantResult = await createOrUpdateCorporateTenant({
          name: tradeName || legalName || 'Enterprise Tenant',
          identifier: orgIdentifier,
          legalName: legalName || tradeName,
          taxId: pjTaxId,
          countryCode,
          sizeCategory,
          registrationNumber: pjSecId,
          address: addressData,
          inLanguage: preferredLanguage || 'en',
          workspaceName: `${tradeName || legalName || 'Corporate'} Workspace`,
          projectName: 'Default Project',
        }).catch(() => {});

        await saveOnboardingProgress({
          accountType: 'organization_member',
          countryCode,
          currentStep: 5,
          stepData: {
            corporate_name: legalName,
            trade_name: tradeName,
            tax_id: pjTaxId,
            registration_number: pjSecId,
            size_category: sizeCategory,
            legal_representative: {
              name: repName || fullName || initialName || user?.email,
              role: repRole,
              document: repDoc,
            },
            address: addressData,
          },
          isCompleted: true,
        }).catch(() => {});

        const targetOrgId = tenantResult?.organization_id || selectedOrgId;
        const targetWsId = tenantResult?.workspace_id || selectedWsId;
        const targetPrjId = tenantResult?.project_id || selectedPrjId;

        await Promise.race([
          switchActiveContext({
            organizationId: targetOrgId,
            workspaceId: targetWsId,
            projectId: targetPrjId,
          }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      if (user && preferredLanguage) {
        applySettingCascade({
          level: 'person',
          propertyId: 'i18n.in_language',
          value: preferredLanguage,
          cascadeRule: 'INHERIT_OVERRIDABLE',
        }).catch(() => {});
      }

      closeOnboardingFlow();
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding submission error:', err);
      closeOnboardingFlow();
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const content = (
    <CreateFullPage
      className={classNames('cs--onboarding-full-page', className)}
      title={t('onboarding.title', 'Complete your organization & account setup')}
      modalTitle={t('onboarding.cancelModalTitle', 'Are you sure you want to exit setup?')}
      modalDescription={t(
        'onboarding.cancelModalDesc',
        'Your progress is progressively stored. You can resume onboarding anytime from your profile.',
      )}
      modalDangerButtonText={t('onboarding.exitSetup', 'Exit setup')}
      modalSecondaryButtonText={t('onboarding.continueSetup', 'Continue setup')}
      submitButtonText={
        isLoading
          ? t('onboarding.completing', 'Completing setup...')
          : t('onboarding.completeButton', 'Complete setup & enter')
      }
      nextButtonText={t('onboarding.nextButton', 'Next')}
      backButtonText={t('onboarding.backButton', 'Back')}
      cancelButtonText={t('onboarding.cancelButton', 'Cancel')}
      onClose={closeOnboardingFlow}
      onRequestSubmit={handleCompleteSetup}
    >
      {/* Step 1: Account Classification & Jurisdiction */}
      <CreateFullPageStep
        title={t('onboarding.steps.classificationTitle', 'Account & Jurisdiction')}
        subtitle={t(
          'onboarding.steps.classificationSubtitle',
          'Select account legal category, jurisdiction, and interface language',
        )}
        onNext={handleStep1Next}
      >
        <div className="cs--onboarding-step-content">
          <div className="cs--onboarding-badge-cluster">
            <Tag type="blue" renderIcon={Enterprise}>
              {person?.name || user?.email || 'Enterprise Member'}
            </Tag>
            <Tag type="green" renderIcon={Checkmark}>
              {t('signInModal.verifiedBadge', 'Identity Verified')}
            </Tag>
          </div>

          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <User size={18} />
              {t('onboarding.accountTypeHeading', '1. Legal Entity Classification')}
            </div>
            <ContentSwitcher
              selectedIndex={accountType === 'individual' ? 0 : 1}
              onChange={(e) => handleAccountTypeChange(e.name)}
              size="md"
            >
              <Switch name="individual" text={t('signInModal.accountTypePF', 'Individual / Natural Person (PF)')} />
              <Switch
                name="organization_member"
                text={t('signInModal.accountTypePJ', 'Enterprise / Legal Entity (PJ)')}
              />
            </ContentSwitcher>
          </div>

          <div className="cs--onboarding-grid-2">
            <Select
              id="onboard-country-select"
              labelText={t('signInModal.countryLabel', 'Country of Origin / Jurisdiction')}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              <SelectItem value="BR" text={t('signInModal.countries.BR', 'Brasil (BR)')} />
              <SelectItem value="US" text={t('signInModal.countries.US', 'United States (US)')} />
              <SelectItem value="DE" text={t('signInModal.countries.DE', 'Deutschland (DE)')} />
              <SelectItem value="GB" text={t('signInModal.countries.GB', 'United Kingdom (GB)')} />
              <SelectItem value="PT" text={t('signInModal.countries.PT', 'Portugal (PT)')} />
              <SelectItem value="ES" text={t('signInModal.countries.ES', 'España (ES)')} />
              <SelectItem value="FR" text={t('signInModal.countries.FR', 'France (FR)')} />
              <SelectItem value="CN" text={t('signInModal.countries.CN', 'China (CN)')} />
              <SelectItem value="JP" text={t('signInModal.countries.JP', 'Japan (JP)')} />
            </Select>

            <Select
              id="onboard-lang-select"
              labelText={t('profile.language.label', 'Preferred Interface Language')}
              value={preferredLanguage === 'jp-JP' ? 'ja-JP' : preferredLanguage}
              onChange={handleLanguageChange}
            >
              <SelectItem value="en" text="English (en)" />
              <SelectItem value="de" text="Deutsch (de)" />
              <SelectItem value="pt-BR" text="Português (pt-BR)" />
              <SelectItem value="ja-JP" text="日本語 (ja-JP)" />
              <SelectItem value="zh-CN" text="简体中文 (zh-CN)" />
            </Select>
          </div>

          <div className="cs--onboarding-callout-card">
            <div className="cs--onboarding-callout-card__title">
              {accountType === 'individual'
                ? t('onboarding.cardPFTitle', 'Personal Account Workflow')
                : t('onboarding.cardPJTitle', 'Enterprise Tenant Provisioning')}
            </div>
            <div className="cs--onboarding-callout-card__desc">
              {accountType === 'individual'
                ? t(
                    'onboarding.cardPFDesc',
                    'Your account will be provisioned with personal workspace privileges and individual fiscal data.',
                  )
                : t(
                    'onboarding.cardPJDesc',
                    'A corporate tenant hierarchy will be provisioned with legal governance, multiple workspaces, and departmental access.',
                  )}
            </div>
          </div>
        </div>
      </CreateFullPageStep>

      {/* Step 2: Legal Identity & Fiscal Registration */}
      <CreateFullPageStep
        title={t('onboarding.steps.identityTitle', 'Identity & Fiscal Registration')}
        subtitle={t(
          'onboarding.steps.identitySubtitle',
          'Official government registry numbers and legal identification',
        )}
        onNext={handleStep2Next}
      >
        <div className="cs--onboarding-step-content">
          {accountType === 'individual' ? (
            <div className="cs--onboarding-section">
              <div className="cs--onboarding-section__title">
                <User size={18} />
                {t('signInModal.pfDetailsTitle', 'Individual Identity & Documents')}
              </div>
              <div className="cs--onboarding-grid-2">
                <TextInput
                  id="pf-full-name"
                  labelText={t('signInModal.fullName', 'Full Name')}
                  placeholder="Alex Morgan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <TextInput
                  id="pf-birth-date"
                  labelText={t('onboarding.birthDate', 'Date of Birth (YYYY-MM-DD)')}
                  placeholder="1985-06-15"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="cs--onboarding-grid-2">
                <TextInput
                  id="pf-tax-id"
                  labelText={docConfig.pfTaxLabel}
                  placeholder={docConfig.pfTaxPlaceholder}
                  value={pfTaxId}
                  onChange={(e) => setPfTaxId(e.target.value)}
                />
                <TextInput
                  id="pf-sec-id"
                  labelText={docConfig.pfSecLabel}
                  placeholder={docConfig.pfSecPlaceholder}
                  value={pfSecId}
                  onChange={(e) => setPfSecId(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="cs--onboarding-section">
              <div className="cs--onboarding-section__title">
                <Building size={18} />
                {t('signInModal.pjDetailsTitle', 'Company Profile & Registration')}
              </div>
              <div className="cs--onboarding-grid-2">
                <TextInput
                  id="pj-legal-name"
                  labelText={t('signInModal.legalName', 'Legal Business Name')}
                  placeholder="Enterprise Corp LLC"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                />
                <TextInput
                  id="pj-trade-name"
                  labelText={t('signInModal.tradeName', 'Brand / Trade Name')}
                  placeholder="Tech Solutions"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                />
              </div>
              <div className="cs--onboarding-grid-2">
                <TextInput
                  id="pj-tax-id"
                  labelText={docConfig.pjTaxLabel}
                  placeholder={docConfig.pjTaxPlaceholder}
                  value={pjTaxId}
                  onChange={(e) => setPjTaxId(e.target.value)}
                />
                <TextInput
                  id="pj-sec-id"
                  labelText={docConfig.pjSecLabel}
                  placeholder={docConfig.pjSecPlaceholder}
                  value={pjSecId}
                  onChange={(e) => setPjSecId(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </CreateFullPageStep>

      {/* Step 3: Corporate Governance & Scale (Included for PJ only) */}
      <CreateFullPageStep
        title={t('onboarding.steps.corporateTitle', 'Corporate Governance & Scale')}
        subtitle={t(
          'onboarding.steps.corporateSubtitle',
          'Enterprise size classification, legal representative, and signatory role',
        )}
        includeStep={accountType === 'organization_member'}
        onNext={handleStep3Next}
      >
        <div className="cs--onboarding-step-content">
          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <Enterprise size={18} />
              {t('signInModal.companySizeLabel', 'Company Size Category')}
            </div>
            <Select
              id="pj-size-category"
              labelText={t('signInModal.companySizeLabel', 'Company Size Category')}
              value={sizeCategory}
              onChange={(e) => setSizeCategory(e.target.value)}
            >
              <SelectItem
                value="MICRO"
                text={t('signInModal.companySizes.MICRO', 'Micro Enterprise (1-9 employees / Micro)')}
              />
              <SelectItem
                value="SMALL"
                text={t('signInModal.companySizes.SMALL', 'Small Business (10-49 employees / Small)')}
              />
              <SelectItem
                value="MEDIUM"
                text={t('signInModal.companySizes.MEDIUM', 'Medium Enterprise (50-249 employees / Medium)')}
              />
              <SelectItem
                value="ENTERPRISE"
                text={t('signInModal.companySizes.ENTERPRISE', 'Large Enterprise (250+ employees / Enterprise)')}
              />
            </Select>
          </div>

          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <Identification size={18} />
              {t('signInModal.repDetailsTitle', 'Legal Representative / Signatory')}
            </div>
            <TextInput
              id="pj-rep-name"
              labelText={t('signInModal.repName', 'Legal Representative Full Name')}
              placeholder="Jane Doe"
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
            />
            <div className="cs--onboarding-grid-2">
              <TextInput
                id="pj-rep-role"
                labelText={t('signInModal.repPosition', 'Executive Role / Position')}
                placeholder="Chief Executive Officer"
                value={repRole}
                onChange={(e) => setRepRole(e.target.value)}
              />
              <TextInput
                id="pj-rep-doc"
                labelText={t('signInModal.repDoc', 'Personal Identity / Tax Document')}
                placeholder="Tax or Identity Document Number"
                value={repDoc}
                onChange={(e) => setRepDoc(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CreateFullPageStep>

      {/* Step 4: Official Structured Address */}
      <CreateFullPageStep
        title={t('onboarding.steps.addressTitle', 'Official Address')}
        subtitle={t('onboarding.steps.addressSubtitle', 'Registered headquarters or fiscal domicile address')}
        onNext={handleStep4Next}
      >
        <div className="cs--onboarding-step-content">
          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <Location size={18} />
              {t('signInModal.addressTitle', 'Official Address (Postal Address)')}
            </div>
            <div className="cs--onboarding-grid-2">
              <TextInput
                id="addr-postal-code"
                labelText={docConfig.postalLabel}
                placeholder={docConfig.postalPlaceholder}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
              <TextInput
                id="addr-street"
                labelText={t('signInModal.streetAddress', 'Street Address & Number')}
                placeholder="123 Main St, Suite 400"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
              />
            </div>
            <div className="cs--onboarding-grid-2">
              <TextInput
                id="addr-locality"
                labelText={t('signInModal.locality', 'City / Locality')}
                placeholder="City"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
              />
              <TextInput
                id="addr-region"
                labelText={t('signInModal.region', 'State / Province / Region')}
                placeholder="State or Province"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CreateFullPageStep>

      {/* Step 5: Multi-Tenant Workspace & Security */}
      <CreateFullPageStep
        title={t('onboarding.steps.workspaceTitle', 'Workspace & Security')}
        subtitle={t(
          'onboarding.steps.workspaceSubtitle',
          'Multi-tenant hierarchy configuration and FIDO2/WebAuthn enrollment',
        )}
      >
        <div className="cs--onboarding-step-content">
          {errorMessage && (
            <InlineNotification
              lowContrast
              kind="error"
              title={t('common.error', 'Error')}
              subtitle={errorMessage}
              onClose={() => setErrorMessage('')}
            />
          )}

          {/* Provisioning Summary / Context for PJ */}
          {accountType === 'organization_member' && (
            <div className="cs--onboarding-callout-card">
              <div className="cs--onboarding-callout-card__title">
                {t('onboarding.newTenantTitle', 'Provisioning Target:')} {tradeName || legalName || 'Enterprise Tenant'}
              </div>
              <div className="cs--onboarding-callout-card__desc">
                {t(
                  'onboarding.newTenantDesc',
                  'A dedicated tenant organization will be provisioned with an isolated PostgreSQL schema, initial workspace, and default project.',
                )}
              </div>
            </div>
          )}

          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <Workspace size={18} />
              {t('onboarding.workspaceHeading', 'Instance & Workspace Hierarchy')}
            </div>

            <Select
              id="onboard-org-select"
              labelText={t('onboarding.orgSelectLabel', 'Organization (Tier 1)')}
              value={selectedOrgId}
              onChange={handleOrgChange}
            >
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id} text={org.name} />
              ))}
            </Select>

            <div className="cs--onboarding-grid-2">
              <Select
                id="onboard-ws-select"
                labelText={t('onboarding.wsSelectLabel', 'Workspace / Department (Tier 2)')}
                value={selectedWsId}
                onChange={handleWsChange}
              >
                {filteredWorkspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id} text={ws.name} />
                ))}
              </Select>

              <Select
                id="onboard-prj-select"
                labelText={t('onboarding.prjSelectLabel', 'Project / CreativeWork (Tier 3)')}
                value={selectedPrjId}
                onChange={handlePrjChange}
              >
                {filteredProjects.map((prj) => (
                  <SelectItem key={prj.id} value={prj.id} text={prj.name} />
                ))}
              </Select>
            </div>
          </div>

          <div className="cs--onboarding-section">
            <div className="cs--onboarding-section__title">
              <Password size={18} />
              {t('onboarding.passkeyHeading', 'FIDO2 / WebAuthn Biometric Security')}
            </div>

            <Stack gap={4}>
              <p>
                {t(
                  'onboarding.passkeyDesc',
                  'Register your hardware device authenticator (Touch ID, Face ID, Windows Hello, or YubiKey) for passwordless multi-factor authentication.',
                )}
              </p>

              {/* Modality selector for Passkey enrollment */}
              <div className="cs--onboarding-auth-options">
                <button
                  type="button"
                  className={classNames('cs--onboarding-auth-tile', {
                    'cs--onboarding-auth-tile--active': passkeyModality === 'touch',
                  })}
                  onClick={() => setPasskeyModality('touch')}
                  aria-label={t('onboarding.touchAria', 'Touch ID / Fingerprint sensor')}
                >
                  <div className="cs--onboarding-auth-tile-header">
                    <FingerprintRecognition size={20} />
                    <Tag size="sm" type={passkeyModality === 'touch' ? 'cyan' : 'cool-gray'}>
                      {passkeyModality === 'touch' ? t('common.selected', 'Active') : t('common.select', 'Select')}
                    </Tag>
                  </div>
                  <span className="cs--onboarding-auth-tile-name">
                    {t('signInModal.mfa.touchMethod', 'Touch Method')}
                  </span>
                  <span className="cs--onboarding-auth-tile-desc">
                    {t('onboarding.touchAuth', 'Touch ID / Fingerprint')}
                  </span>
                </button>

                <button
                  type="button"
                  className={classNames('cs--onboarding-auth-tile', {
                    'cs--onboarding-auth-tile--active': passkeyModality === 'camera',
                  })}
                  onClick={() => setPasskeyModality('camera')}
                  aria-label={t('onboarding.cameraAria', 'Facial Recognition / Windows Hello')}
                >
                  <div className="cs--onboarding-auth-tile-header">
                    <FaceActivated size={20} />
                    <Tag size="sm" type={passkeyModality === 'camera' ? 'cyan' : 'cool-gray'}>
                      {passkeyModality === 'camera' ? t('common.selected', 'Active') : t('common.select', 'Select')}
                    </Tag>
                  </div>
                  <span className="cs--onboarding-auth-tile-name">
                    {t('signInModal.mfa.cameraMethod', 'Camera Method')}
                  </span>
                  <span className="cs--onboarding-auth-tile-desc">
                    {t('onboarding.cameraAuth', 'Facial Recognition')}
                  </span>
                </button>

                <button
                  type="button"
                  className={classNames('cs--onboarding-auth-tile', {
                    'cs--onboarding-auth-tile--active': passkeyModality === 'securityKey',
                  })}
                  onClick={() => setPasskeyModality('securityKey')}
                  aria-label={t('onboarding.securityKeyAria', 'FIDO2 Security Key / YubiKey')}
                >
                  <div className="cs--onboarding-auth-tile-header">
                    <Password size={20} />
                    <Tag size="sm" type={passkeyModality === 'securityKey' ? 'cyan' : 'cool-gray'}>
                      {passkeyModality === 'securityKey'
                        ? t('common.selected', 'Active')
                        : t('common.select', 'Select')}
                    </Tag>
                  </div>
                  <span className="cs--onboarding-auth-tile-name">
                    {t('onboarding.securityKeyLabel', 'Security Key')}
                  </span>
                  <span className="cs--onboarding-auth-tile-desc">
                    {t('onboarding.securityKeyAuth', 'FIDO2 Hardware Key')}
                  </span>
                </button>
              </div>

              <div>
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={
                    passkeyModality === 'camera'
                      ? FaceActivated
                      : passkeyModality === 'touch'
                        ? FingerprintRecognition
                        : Password
                  }
                  onClick={handleRegisterPasskey}
                  disabled={passkeyRegistered}
                >
                  {passkeyRegistered
                    ? t('signInModal.passkeyRegistered', 'Passkey credential enrolled')
                    : t('onboarding.enrollPasskeyBtn', 'Enroll WebAuthn Passkey')}
                </Button>
              </div>

              {passkeyRegistered && (
                <InlineNotification
                  lowContrast
                  kind="success"
                  title={t('signInModal.passkeyRegistered', 'Passkey credential enrolled')}
                  subtitle={t(
                    'onboarding.passkeySuccessDesc',
                    'Your hardware biometric credential is now enrolled for passwordless enterprise sign-in.',
                  )}
                />
              )}
            </Stack>
          </div>
        </div>
      </CreateFullPageStep>
    </CreateFullPage>
  );

  if (standalone) {
    return content;
  }

  return <div className="cs--onboarding-full-page-overlay">{content}</div>;
};

OnboardingFullPage.propTypes = {
  className: PropTypes.string,
  standalone: PropTypes.bool,
};

export default OnboardingFullPage;
