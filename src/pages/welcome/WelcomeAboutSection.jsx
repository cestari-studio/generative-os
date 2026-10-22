/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useTranslation } from 'react-i18next';
import { WelcomeCallout } from './WelcomeCallout';
import { WelcomeHighlightTile } from './WelcomeHighlightTile';

export const WelcomeAboutSection = () => {
  const { t } = useTranslation();

  const aboutItems = [
    {
      key: 'purpose',
      title: t('welcome.about.purpose.title', 'Purpose'),
      content: t(
        'welcome.about.purpose.description',
        'Combines React 19 SSR, Carbon Design System v11, and Supabase Multi-Tenant hierarchy (Organization → Workspace → Project → Person).',
      ),
    },
    {
      key: 'consistency',
      title: t('welcome.about.consistency.title', 'Standards & Governance'),
      content: t(
        'welcome.about.consistency.description',
        'LOCKED, INHERIT_OVERRIDABLE, and MERGE cascade policies enforce visual consistency, WCAG 2.2 AA accessibility, and AI safety guardrails.',
      ),
    },
    {
      key: 'customize',
      title: t('welcome.about.customize.title', 'Granular Customization'),
      content: t(
        'welcome.about.customize.description',
        'Each workspace and project can customize Carbon themes, languages, and vector knowledge corpora within organization boundary rules.',
      ),
    },
  ];

  return (
    <WelcomeCallout className="cs--welcome__about" heading={t('welcome.about.heading', 'What is this about?')}>
      {aboutItems.map((item) => (
        <WelcomeHighlightTile key={item.key} title={item.title}>
          {item.content}
        </WelcomeHighlightTile>
      ))}
    </WelcomeCallout>
  );
};
