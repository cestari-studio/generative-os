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
      title: t('welcome.about.purpose.title', 'Multi-tenant operations'),
      content: t(
        'welcome.about.purpose.description',
        'Organizations, workspaces, projects and people in a governed hierarchy, with per-tier settings cascade and audit trail.',
      ),
    },
    {
      key: 'consistency',
      title: t('welcome.about.consistency.title', 'Governance & accessibility'),
      content: t(
        'welcome.about.consistency.description',
        'Cascade policies (locked, inheritable, merged) enforce consistent configuration, WCAG 2.2 AA accessibility and AI guardrails across every tier.',
      ),
    },
    {
      key: 'customize',
      title: t('welcome.about.customize.title', 'Knowledge & billing'),
      content: t(
        'welcome.about.customize.description',
        'Each workspace keeps its own knowledge corpus and billing configuration, within the boundaries defined by its organization.',
      ),
    },
  ];

  return (
    <WelcomeCallout className="cs--welcome__about" heading={t('welcome.about.heading', 'What is genOS?')}>
      {aboutItems.map((item) => (
        <WelcomeHighlightTile key={item.key} title={item.title}>
          {item.content}
        </WelcomeHighlightTile>
      ))}
    </WelcomeCallout>
  );
};
