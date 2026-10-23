/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { CommonHeader } from '../../components/commonHeader/CommonHeader';
import { PageLayout } from '../../layouts/page-layout';

import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';

const Placeholder = () => {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <PageLayout className="cs--placeholder" fallback={<p>{t('placeholder.loading', 'Loading page…')}</p>}>
      <CommonHeader
        title={t('placeholder.title', 'Route not implemented')}
        paragraphs={[
          <>
            {t(
              'placeholder.description1',
              'This route is registered, but its functional page implementation is not available in this build.',
            )}
          </>,
          <>{t('placeholder.description2', 'No sample, demo, or placeholder records are displayed on this route.')}</>,
          <>
            {t('placeholder.routeInfo', "The registered route is '{{pathname}}'.", {
              pathname: location.pathname,
            })}
          </>,
          <>{t('placeholder.maintainer', 'Maintained by Cestari Studio Inc.')}</>,
        ]}
      />
    </PageLayout>
  );
};

export default Placeholder;
