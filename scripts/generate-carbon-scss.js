import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_FILE = path.resolve('src/styles/_carbon-generated.scss');

// Gera o arquivo SCSS para tema do Carbon v12
// Feature flags são carregadas em src/index.scss (antes de @carbon/react)
const scssBanner = [
  '// ============================================================================',
  '// ARQUIVO GERADO AUTOMATICAMENTE POR scripts/generate-carbon-scss.js',
  '// Não edite manualmente. Execute: npm run scss:generate',
  '// ============================================================================',
  '//',
  '// NOTE: This file provides theme support for Carbon v12.',
  '// The @carbon/react/scss/config and @carbon/feature-flags are loaded first in',
  '// src/index.scss to avoid "This module was already loaded" errors.',
  '//',
  '// ============================================================================',
  '//',
  '// Suporte dinâmico aos 4 temas oficiais via atributo data-carbon-theme',
  ':root {',
  '  @include theme.theme(themes.$white);',
  '}',
  "[data-carbon-theme='g10'] {",
  '  @include theme.theme(themes.$g10);',
  '}',
  "[data-carbon-theme='g90'] {",
  '  @include theme.theme(themes.$g90);',
  '}',
  "[data-carbon-theme='g100'] {",
  '  @include theme.theme(themes.$g100);',
  '}'
].filter(line => line !== undefined).join('\n') + '\n';

fs.writeFileSync(OUTPUT_FILE, scssBanner, 'utf8');
console.log(`✅ SCSS do Carbon gerado em: ${OUTPUT_FILE}`);
