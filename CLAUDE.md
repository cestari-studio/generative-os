# AI Agent Instructions for Generative OS

This document provides context for AI agents (GitHub Copilot, Cursor, Claude Code, Gemini CLI) working on the generative-os project.

## 🏗️ Project Architecture

### Tech Stack
- **Framework**: React 19 + Vite 8 (SSR with Node.js/Express)
- **Design System**: Carbon Design System (v11) + @carbon/ibm-products
- **Styling**: SCSS with Carbon Design Tokens
- **i18n**: react-i18next (Server-Side Rendering ready)
- **State**: React Hooks (no Redux, no Context for core state)

### Project Structure
```
generative-os/
├── src/
│   ├── components/        # Carbon-based UI components
│   ├── pages/            # Full pages (routes)
│   ├── layouts/          # Layout components
│   ├── locales/          # Translation files (en, de, pt-BR)
│   ├── i18n.client.js    # Client-side i18n config
│   ├── i18n.server.js    # Server-side i18n config
│   ├── routes/           # React Router config
│   ├── api/              # API endpoints
│   ├── service/          # Service handlers
│   └── utils/            # Utility functions
├── .agents/skills/       # Skill definitions for AI agents
├── scripts/              # Automation scripts
└── public/               # Static assets
```

## 🎯 Key Principles

### 1. Carbon Design System Compliance
**All UI must follow Carbon Design System patterns exactly:**

- Use only `@carbon/react` and `@carbon/ibm-products` components
- Apply tokens from `@carbon/react/scss/*` (spacing, theme, type)
- Never use hardcoded values (px, hex, etc.)
- Follow grid system: 16 columns (sm/md/lg breakpoints)

**Skill Reference**: See `.agents/skills/carbon-builder/SKILL.md`

### 2. Server-Side Rendering (SSR) Requirements
- Components must render identically on server and client
- No direct access to `window`, `document`, or `localStorage` outside `useEffect`
- Styles must be loaded globally (not dynamically) to prevent FOUC
- All text visible to users must be translatable via i18next

### 3. Internationalization (i18n)
**Mandatory for all visible text:**
```jsx
const { t } = useTranslation();
return <h1>{t('namespace.key', 'Default English Text')}</h1>;
```

**Supported languages**: en, de, pt-BR
**Source language**: en (always use English as fallback)

**Automated workflow:**
```bash
npm run i18n:sync  # Extracts keys and initializes pt-BR translations
```

### 4. Styling Rules
```scss
// ALWAYS import from Carbon tokens
@use '@carbon/react/scss/spacing' as *;
@use '@carbon/react/scss/theme' as *;
@use '@carbon/react/scss/type' as *;

.my-component {
  padding: $spacing-05;
  @include type-style('heading-03');
}
```

### 5. Code Quality
- **ESLint**: Strict rules, no warnings allowed
- **Stylelint**: Carbon token validation
- **Prettier**: 2-space indent, single quotes, 120 char width
- **CSpell**: Project-specific dictionary in `cspell-dictionaries/`

## 🚀 Development Commands

```bash
# Start development server (SSR + HMR)
npm run dev

# Build for production
npm run build

# Run all linters
npm run lint

# Run tests
npm run test

# Sync translations and regenerate Carbon SCSS
npm run i18n:sync && npm run scss:generate
```

## 🌐 AI Agent Instructions

### For Code Generation
- Follow Carbon Design System patterns exactly (see skill)
- Use `react-i18next` for all visible text
- Import SCSS styles from `src/index.scss`, not from components
- Use only `Grid`/`Column` from Carbon for layouts
- Access browser APIs only inside `useEffect` hooks

### For Documentation
- English as primary language
- Include Carbon component references
- Explain SSR implications
- Mention i18n requirements

### For Bug Fixes
- Check existing tests first
- Reproduce SSR vs client behavior differences
- Verify Carbon token usage
- Check translation fallbacks

## 🔒 Project-Specific Notes

### Repository
- **Owner**: cestari-studio
- **Name**: generative-os
- **Type**: Private
- **URL**: https://github.com/cestari-studio/generative-os

### Environment Variables
```bash
# Required for local development
NODE_ENV=development
PORT=5173

# Disable IBM telemetry (required for private repo)
IBM_TELEMETRY_DISABLED=true
```

### Build Output
- Client: `dist/client/` (static assets + HTML)
- Server: `dist/server/` (Node.js SSR entry point)

### Theme Support
The app supports 4 Carbon themes via `data-carbon-theme` attribute:
- `white` (default)
- `g10` (light gray)
- `g90` (dark gray)
- `g100` (black)

## 📚 Additional Resources

- [Carbon Design System](https://carbondesignsystem.com/)
- [Carbon React Next](https://carbon-react-next.netlify.app/)
- [i18next Documentation](https://www.i18next.com/)
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [React Router V8](https://reactrouter.com/)

## 🤝 Get Help

If you're unsure about any requirement, check:
1. `.agents/skills/carbon-builder/SKILL.md` for Carbon-specific rules
2. Existing component implementations in `src/components/`
3. Linter output for style enforcement
4. Test files for usage patterns

---

**Remember**: This is a production-ready enterprise application. Consistency with Carbon patterns and SSR/i18n requirements is more important than novelty or personal preference.
