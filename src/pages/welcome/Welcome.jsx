/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Footer } from '../../components/footer/Footer';
import { WelcomeHeader } from './WelcomeHeader.jsx';
import { PageLayout } from '../../layouts/page-layout.jsx';
import { WelcomeAboutSection } from './WelcomeAboutSection';
import { WelcomeFeaturesSection } from './WelcomeFeaturesSection';

const Welcome = () => {
  return (
    <PageLayout className="cs--welcome" fallback={<p>Loading welcome page...</p>}>
      <WelcomeHeader />

      <WelcomeAboutSection />

      <WelcomeFeaturesSection />

      <Footer />
    </PageLayout>
  );
};

export default Welcome;
