/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { enable, disable } from '@carbon/feature-flags';

/**
 * Canonical Carbon Feature Flags
 * Activates modern Carbon v12 behaviors,
 * sentinel-free focus wrapping, CSS grid, and CSS custom properties,
 * while maintaining stable CSS popover positioning for Carbon Labs UI Shell.
 */
export const CARBON_V12_FLAGS = {
  'enable-focus-wrap-without-sentinels': true,
  'enable-v12-tile-default-icons': true,
  'enable-v12-tile-radio-icons': true,
  'enable-v12-overflowmenu': true,
  'enable-v12-structured-list-visible-icons': true,
  'enable-v12-toggle-reduced-label-spacing': true,
  'enable-dialog-element': false,
  'enable-css-custom-properties': true,
  'enable-css-grid': true,
};

// Enable focus wrapping and disable dialog element
enable('enable-focus-wrap-without-sentinels');
disable('enable-dialog-element');

// Suppress repetitive development notification for dynamic floating styles
if (typeof console !== 'undefined' && console.info) {
  const originalInfo = console.info.bind(console);
  console.info = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('enable-v12-dynamic-floating-styles')) {
      return;
    }
    originalInfo(...args);
  };
}
