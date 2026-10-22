/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Column, Grid, Link } from '@carbon/react';
import { useTranslation } from 'react-i18next';

export const Footer = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <Grid as="footer" className="cs--footer">
      <Column sm={4} md={8} lg={16} className="cs--footer__content">
        <p className="cs--footer__evaluation">
          {t('footer.evaluation', 'Learn more about how genOS applications are evaluated at')}{' '}
          <Link href="https://cestari.studio/genos" target="_blank" rel="noopener noreferrer" inline>
            cestari.studio/genos
          </Link>
          .
        </p>
        <p className="cs--footer__disclaimer">
          {t(
            'footer.disclaimer',
            'genOS is the generative operational system from Cestari Studio Inc. Access to production workspaces requires an active subscription.',
          )}
        </p>
        <p className="cs--footer__copyright">
          {t('footer.copyright', 'Copyright © {{currentYear}} Cestari Studio Inc.', {
            currentYear,
          })}
        </p>
      </Column>
    </Grid>
  );
};
