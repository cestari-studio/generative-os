/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useTranslation } from 'react-i18next';
import { WelcomeCallout } from './WelcomeCallout';
import { WelcomeFeatureTile } from './WelcomeFeatureTile';

export const WelcomeFeaturesSection = () => {
  const { t } = useTranslation();

  const features = [
    {
      title: t('welcome.features.multiTenancyTitle', 'Multi-Tenancy'),
      feature: t('welcome.features.multiTenancyDesc', 'Schema.org 4-Tier Hierarchy'),
    },
    {
      title: t('welcome.features.vectorRagTitle', 'Cognitive RAG'),
      feature: t('welcome.features.vectorRagDesc', 'pgvector 384-d HNSW Embeddings'),
    },
    {
      title: t('welcome.features.designSystemTitle', 'Carbon Design System'),
      feature: t('welcome.features.designSystemDesc', 'Accessible v11 Components & Tokens'),
    },
  ];

  return (
    <WelcomeCallout className="cs--welcome__features" heading={t('welcome.features.heading', 'Features')}>
      {features.map((item) => (
        <WelcomeFeatureTile key={item.feature} {...item} />
      ))}
    </WelcomeCallout>
  );
};
