/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'node:child_process';

console.log('Synchronizing i18n locale catalogs (en, de, pt-BR, jp-JP, zh-CN)...');
execSync('npx i18next -c i18next-parser.config.js', { stdio: 'inherit' });
console.log('i18n catalogs synchronized successfully.');
