# GitHub Copilot Instructions for generative-os

## 🎯 Mission Critical Rules

When working on this repository, AI agents **MUST** follow these rules before writing any code:

### 1. Carbon Design System Compliance
✅ **ALWAYS** use `@carbon/react` components (Button, Modal, Grid, Column)
❌ **NEVER** create custom CSS grids or use hardcoded pixel values

### 2. Server-Side Rendering (SSR)
✅ **ALWAYS** use `useEffect` for `window`/`document`/`localStorage` access
❌ **NEVER** access browser APIs in component body or hooks that run during render

### 3. Internationalization (i18n)
✅ **ALWAYS** use `const { t } = useTranslation();` for all visible text
❌ **NEVER** hardcode strings in JSX (even in English)

### 4. Styling
✅ **ALWAYS** import SCSS from `src/index.scss`, never from component .jsx files
✅ **ALWAYS** use Carbon tokens: `$spacing-05`, `$layer-01`, `$text-primary`
❌ **NEVER** use hardcoded colors (hex), font sizes, or spacing

## 📋 Quick Reference

### Grid Layout Pattern
```jsx
import { Grid, Column } from '@carbon/react';

return (
  <Grid>
    <Column sm={4} md={8} lg={16}>
      Content here
    </Column>
  </Grid>
);
```

### i18n Text Pattern
```jsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<h1>{t('my.section.title', 'Default English Title')}</h1>
```

### Theme-Aware SCSS
```scss
@use '@carbon/react/scss/theme' as *;

.component {
  background: $layer-01;
  padding: $spacing-05;
}
```

## ⚠️ Common Pitfalls

| What You Want | Wrong Approach | Right Approach |
|---------------|----------------|----------------|
| Custom grid | `display: grid; grid-template-columns: 1fr 2fr;` | `<Grid><Column sm={4} md={8}>` |
| Text with variable | `<h1>{title}</h1>` | `<h1>{t('key', title)}</h1>` |
| Theme switcher | `if (theme === 'dark') { background: #000; }` | `[data-carbon-theme='g100'] { background: $layer-01; }` |
| LocalStorage | `const data = localStorage.getItem('key');` | Use `useEffect` with `useState` |

## 🧪 Testing Requirements

- All new components need unit tests in `src/__tests__/`
- React Testing Library for component tests
- Vitest as test runner
- Coverage is mandatory (run `npm run test`)

## 📦 Package Prefixes

**Allowed**: `@carbon/`, `@carbon-labs/`, `@carbon/ibm-products`
**Prohibited**: `@mui/`, `@tanstack/`, `react-icons`, `styled-components`

## 🔗 Related Documentation

- [Full AI Agent Guide](./CLAUDE.md)
- [Carbon Builder Skill](../.agents/skills/carbon-builder/SKILL.md)
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [React Router V8](https://reactrouter.com/)

---

**Remember**: This is an enterprise React SSR application using Carbon Design System. Consistency > novelty.
