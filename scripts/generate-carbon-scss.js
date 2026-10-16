import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve('src');
const OUTPUT_DIR = path.resolve('src/styles');
const OUTPUT_FILE = path.join(OUTPUT_DIR, '_carbon-generated.scss');

// Cria diretório se não existir
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Busca recursivamente todos os arquivos .js/.jsx em src/
function getSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['__tests__', '__test__', 'test'].includes(entry.name)) {
      getSourceFiles(fullPath, files);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getSourceFiles(SRC_DIR);
let usesIbmProducts = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('@carbon/ibm-products')) {
    usesIbmProducts = true;
    break;
  }
}

const scssBanner = `// ============================================================================
// ARQUIVO GERADO AUTOMATICAMENTE POR scripts/generate-carbon-scss.js
// Não edite manualmente. Execute: npm run scss:generate
// ============================================================================

@use '@carbon/react/scss/config' with (
  $font-path: '@ibm/plex',
  $use-flexbox-grid: false
);

@use '@carbon/feature-flags' with (
  $feature-flags: (
    'enable-v12-release': true,
    'enable-v12-dynamic-floating-styles': true,
    'enable-css-custom-properties': true
  )
);

@use '@carbon/react/scss/themes';
@use '@carbon/react/scss/theme' with (
  $theme: themes.$g100
);
@use '@carbon/react';
${usesIbmProducts ? "@use '@carbon/ibm-products/scss/index';\n" : ''}
// Suporte dinâmico aos 4 temas oficiais via atributo data-carbon-theme
:root {
  @include theme.theme(themes.$white);
}
[data-carbon-theme='g10'] {
  @include theme.theme(themes.$g10);
}
[data-carbon-theme='g90'] {
  @include theme.theme(themes.$g90);
}
[data-carbon-theme='g100'] {
  @include theme.theme(themes.$g100);
}
`;

fs.writeFileSync(OUTPUT_FILE, scssBanner, 'utf8');
console.log(`✅ SCSS do Carbon gerado em: ${OUTPUT_FILE}`);
console.log(`IBM Products ativo: ${usesIbmProducts}`);
