/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PropTypes from 'prop-types';
import { Column, Grid, Heading, Tag } from '@carbon/react';
import { useTranslation } from 'react-i18next';

export const CommonHeader = ({ title, paragraphs = [], action, tags = [] }) => {
  const { t } = useTranslation();
  return (
    <Grid as="header" className="cs--common-header">
      <Column sm={4} md={8} lg={16}>
        <div className="cs--common-header__content">
          <Heading className="cs--common-header__title">{title}</Heading>
          {tags.length > 0 && (
            <div className="cs--common-header__tags" aria-label={t('commonHeader.tagsLabel', 'Header tags')}>
              {tags.map((tag, idx) => (
                <Tag
                  key={tag.key || `header-tag-${idx}`}
                  type={tag.type || 'cool-gray'}
                  size="sm"
                  renderIcon={tag.renderIcon}
                >
                  {tag.label || tag}
                </Tag>
              ))}
            </div>
          )}
          <div className="cs--common-header__other">
            {paragraphs.map((paragraph, i) => (
              <p key={`common-header-paragraph-${i}`}>{paragraph}</p>
            ))}
          </div>
          <div className="cs--common-header__image-banner">
            <img
              src="/icon.dark.svg?version=0.1.0"
              className="cs--common-header__logo"
              alt={t('commonHeader.logoAlt', 'Generative OS logo')}
            />
          </div>
          {action}
        </div>
      </Column>
    </Grid>
  );
};

CommonHeader.propTypes = {
  title: PropTypes.node.isRequired,
  paragraphs: PropTypes.arrayOf(PropTypes.node),
  action: PropTypes.node,
  tags: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        key: PropTypes.string,
        label: PropTypes.string.isRequired,
        type: PropTypes.string,
        renderIcon: PropTypes.elementType,
      }),
    ]),
  ),
};
