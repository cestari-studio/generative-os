/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

export default {
  contextSeparator: '_',
  createOldCatalogs: false,
  defaultNamespace: 'translation',
  defaultValue: (locale, _namespace, key, value) => {
    if (locale === 'en') {
      return value || key;
    }
    return value || '';
  },
  indentation: 2,
  keepRemoved: true,
  keySeparator: '.',
  lexers: {
    js: ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    default: ['JavascriptLexer'],
  },
  lineEnding: 'lf',
  locales: ['en', 'de', 'pt-BR', 'ja-JP', 'jp-JP', 'zh-CN'],
  namespaceSeparator: ':',
  output: 'src/locales/$LOCALE.json',
  pluralSeparator: '_',
  input: ['src/**/*.{js,jsx}', '!src/**/*.test.{js,jsx}', '!src/__tests__/**', '!src/test/**'],
  sort: true,
};
