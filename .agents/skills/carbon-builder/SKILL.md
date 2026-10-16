---
name: carbon-builder
description: Gera páginas, rotas SSR, componentes e estilos usando @carbon/react, @carbon/ibm-products e @carbon-labs no projeto generative-os.
---

# Regras de Construção Carbon (Generative OS)

Este arquivo instrui o agente de IA a construir interfaces seguindo estritamente os padrões do Carbon Design System e as convenções do projeto generative-os.

## 🎯 Regras Estritas de Construção

### 1. Grid e Layout
Use **exclusivamente** `<Grid>` e `<Column>` de `@carbon/react`:

- Sempre use o sistema de 16 colunas: `sm={4}`, `md={8}`, `lg={16}`
- Nunca crie grids CSS manuais fora dos tokens do Carbon
- Exemplo:
```jsx
<Grid>
  <Column sm={4} md={8} lg={16}>
    {/* conteúdo */}
  </Column>
</Grid>
```

### 2. Estilos e Tokens SCSS
**NUNCA** use valores hardcoded em pixels ou cores hexadecimais:

```scss
// CORRETO - usar tokens do Carbon
@use '@carbon/react/scss/spacing' as *;
@use '@carbon/react/scss/theme' as *;
@use '@carbon/react/scss/type' as *;

.my-component {
  padding: $spacing-05;
  background: $layer-01;
  color: $text-primary;
  
  @include type-style('heading-03');
}
```

```scss
// ERRADO - valores hardcoded
.my-component {
  padding: 16px; // ❌
  background: #ffffff; // ❌
  font-size: 18px; // ❌
}
```

### 3. Prevenção de FOUC (SSR)
- Todo novo arquivo `.scss` de componente **DEVE** ser importado na árvore do `src/index.scss`
- Nunca use import dinâmico dentro do `.jsx` para estilos
- O arquivo `src/index.scss` carregado via `index.html` deve conter:
```scss
@use './styles/carbon-generated';
@use './components/MyComponent/MyComponent';
```

### 4. Internacionalização OBRIGATÓRIA
Todo texto visível na UI DEVE usar `react-i18next`:

```jsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();
  
  // key é a chave única; texto é o fallback em inglês
  return <h1>{t('myComponent.title', 'Default Title')}</h1>;
}
```

**NUNCA** use strings hardcoded diretas no JSX:
```jsx
// ERRADO
return <h1>Título do Componente</h1>; // ❌

// ERRADO
return <h1>{'Título do Componente'}</h1>; // ❌
```

### 5. Compatibilidade SSR
- **NUNCA** acesse `window`, `document` ou `localStorage` fora de hooks `useEffect`
- Para acesso a APIs do navegador, sempre use:
```jsx
import { useEffect, useState } from 'react';

export function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Apenas aqui é seguro acessar window/localStorage
    const stored = localStorage.getItem('key');
    setData(stored);
  }, []);
  
  return <div>{data}</div>;
}
```

## 📦 Pacotes Autorizados

### @carbon/react (V11)
- Componentes: Button, Modal, DataTable, Dropdown, etc.
- Tokens: spacing, theme, type, colors
- Grid: Grid, Column

### @carbon/ibm-products (V11)
- Componentes de produtos: ExpressionInput, SideNav, etc.
- Use apenas componentes estáveis

### @carbon-labs/*
- Componentes experimentais: react-theme-settings, etc.

## 🛠️ DevOps e Ferramentas

### Estrutura de Arquivos
```
src/
├── components/          # Componentes Carbon (reutilizáveis)
│   └── MyComponent/
│       ├── MyComponent.jsx
│       ├── MyComponent.scss
│       └── README.md
├── pages/              # Páginas completas (rotas)
│   └── new-page/
│       └── NewPage.jsx
├── styles/            # Estilos globais e _carbon-generated.scss
├── locales/           # Traduções (en.json, de.json, pt-BR.json)
└── i18n.client.js     # Configuração i18n cliente
```

### Comandos Úteis
```bash
npm run dev              # Iniciar dev server (SSR + HMR)
npm run build           # Build de produção
npm run i18n:sync       # Sincronizar chaves i18n e gerar pt-BR
npm run scss:generate   # Regenerar _carbon-generated.scss
npm run lint            # Executar todos os linters
```

## 🚨 Regras de Não-Permissão

1. **NÃO** usar CSS-in-JS (styled-components, emotion, etc.)
2. **NÃO** usar Tailwind CSS ou similares
3. **NÃO** criar componentes React sem suporte SSR
4. **NÃO** usar APIs do navegador sem `useEffect`
5. **NÃO** esquecer das traduções (fallback em inglês é obrigatório)

## ✅ Checklist de Revisão

Antes de considerar um componente "pronto", verifique:

- [ ] Usa apenas `Grid`/`Column` do Carbon para layout
- [ ] Todos os tokens SCSS vêm de `@carbon/react/scss/*`
- [ ] Não há valores hardcoded (px, hex, font-size direto)
- [ ] Todos os textos visíveis usam `t('key', 'fallback')`
- [ ] Estilo SCSS importado em `src/index.scss` (não no JSX)
- [ ] Acessos a `window`/`document`/`localStorage` dentro de `useEffect`
- [ ] Nenhum alerta de linter (ESLint, Stylelint, CSpell)
- [ ] Tradução para inglês inline no fallback

## 🔗 Recursos Oficiais

- [Carbon Design System Docs](https://carbondesignsystem.com/)
- [Carbon React Package](https://carbon-react-next.netlify.app/?path=/docs/getting-started-overview--docs)
- [IBM Products](https://www.ibm.com/design/language/)
- [i18next Documentation](https://www.i18next.com/)

---

**Nota**: Esta skill substitui regras genéricas de UI. Sempre priorize estes padrões específicos do generative-os quando houver conflito.
