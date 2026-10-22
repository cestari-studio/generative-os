# Catálogo de Padrões Carbon Design System — genOS / Cestari Studio

**Projeto:** `cestari-studio/generative-os`  
**Data:** 22 de outubro de 2026  
**Documento de Referência:** `contrato-rebuild-ui-carbon-generative-os.md`  
**Skill:** `.agents/skills/carbon-builder/SKILL.md`  
**Consultas MCP:** Carbon MCP Server (Local `carbon-mcp` + schemas Carbon v11/v12)

---

## 1. Fundamentos e Stack do Design System

Versões resolvidas a partir do `package-lock.json` (fonte autoritativa — não declarar versões não verificadas):

| Dependência                         | Versão resolvida (lockfile) |
| :---------------------------------- | :-------------------------- |
| `react` / `react-dom`               | **19.3.0**                  |
| `@carbon/react`                     | **1.117.0**                 |
| `@carbon/icons-react`               | **11.89.0**                 |
| `@carbon/ibm-products`              | **2.100.0**                 |
| `@carbon-labs/react-ui-shell`       | **0.106.0**                 |
| `@carbon-labs/react-theme-settings` | **0.30.0**                  |
| `@carbon/charts-react`              | **1.27.21**                 |
| `@carbon/pictograms-react`          | **11.113.0**                |
| `react-router`                      | **8.4.0**                   |
| `vite`                              | **8.3.3**                   |
| `sass`                              | **1.105.1**                 |

- **Design System:** Carbon Design System (dependência técnica; nunca apresentado como marca do produto — a marca do produto é **genOS / Cestari Studio Inc.**)
- **Tipografia Canônica:** IBM Plex Sans (produtiva e UI padrão), IBM Plex Mono (código e chaves de telemetria), IBM Plex Serif (momentos editoriais específicos)
- **Tokens de Estilo:** variáveis CSS oficiais `--cds-*` (Camada 0) expostas ao produto via aliases semânticos `--genos-*` (`src/styles/_genos-brand-tokens.scss`, Camada 1); overrides de marca autorizados pelo manifest validado `src/brand/brand-manifest.json` (Camada 2); cascata de tenant conforme policy (Camada 3). Fallback integral aos temas Carbon `white` (light) e `g100` (dark) quando um override está ausente ou é inválido.
- **`@carbon/ibm-products`:** dependência em transição — componentes IBM-specific serão substituídos por equivalentes `@carbon/react` componente a componente, sem remoção mecânica que quebre o bundle (decisão registrada no direcionamento global §8.1).

---

## 2. Grid Responsivo e Estrutura de Layout

Todo layout deve utilizar o sistema de 16 colunas do Carbon Grid:

```jsx
import { Grid, Column } from '@carbon/react';

<Grid fullWidth={false} className="cds--grid--narrow">
  {/* Mobile (4 colunas): sm=4, Tablet (8 colunas): md=8, Desktop (16 colunas): lg=16 */}
  <Column sm={4} md={8} lg={16}>
    {/* Conteúdo principal */}
  </Column>
</Grid>;
```

### Regras de Ouro do Grid:

1. Nunca utilizar `flex` ou CSS Grid artesanais para compor seções de página inteira.
2. Usar breakpoints explícitos (`sm`, `md`, `lg`, `xlg`).
3. Agrupar cards e painéis em grids distintos para respeitar fluxos semânticos.
4. Manter margens e gutters geridos nativamente pelas classes `.cds--grid` e `.cds--subgrid`.

---

## 3. Tokens de Espaçamento, Cores e Tipografia

### 3.1 Espaçamento (`--cds-spacing-*`)

Validados via Carbon MCP (`get_carbon_tokens(category: "spacing")`):

- `--cds-spacing-01`: `0.125rem` (2px)
- `--cds-spacing-02`: `0.25rem` (4px)
- `--cds-spacing-03`: `0.5rem` (8px)
- `--cds-spacing-04`: `0.75rem` (12px)
- `--cds-spacing-05`: `1rem` (16px) — espaçamento padrão de containers
- `--cds-spacing-06`: `1.5rem` (24px)
- `--cds-spacing-07`: `2rem` (32px) — separação de seções lógicas
- `--cds-spacing-08`: `2.5rem` (40px)
- `--cds-spacing-09`: `3rem` (48px)
- `--cds-spacing-10`: `4rem` (64px)

### 3.2 Temas de Cores Oficiais

- **Temas Suportados:** `white` e `g10` (Light), `g90` e `g100` (Dark).
- Proibido uso de hex codes arbitrários (ex: `#1a1a1a` ou `#0066cc`).
- Tokens semânticos:
  - Fundo: `$background` / `var(--cds-background)`
  - Camada 1: `$layer-01` / `var(--cds-layer-01)`
  - Camada 2: `$layer-02` / `var(--cds-layer-02)`
  - Texto Principal: `$text-primary` / `var(--cds-text-primary)`
  - Texto Secundário: `$text-secondary` / `var(--cds-text-secondary)`
  - Borda: `$border-subtle` / `var(--cds-border-subtle)`
  - Destaque Interativo: `$interactive` / `var(--cds-interactive)`
  - Alerta de Erro: `$support-error` / `var(--cds-support-error)`
  - Sucesso: `$support-success` / `var(--cds-support-success)`

---

## 4. Templates e Arquétipos de Página Oficiais

### Template 1: Public / Auth (`Welcome` & `SignInModal`)

- **Propósito:** Landing pública e modal de login com anti-enumeração.
- **Componentes Oficiais:**
  ```jsx
  import {
    Modal,
    Form,
    TextInput,
    PasswordInput,
    ButtonSet,
    Button,
    InlineLoading,
    InlineNotification,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
  } from '@carbon/react';
  ```
- **Padrão de Formulário:** Campos rotulados com `id`, `labelText`, `invalid` e `invalidText` semânticos. Botão submit desabilitado durante submissão com `InlineLoading`.

### Template 2: Multi-step Wizard (`OnboardingPage` / `OnboardingFullPage`)

- **Propósito:** Provisionamento de organização e identidade fiscal em 4 etapas lineares.
- **Componentes Oficiais:**
  ```jsx
  import {
    ProgressIndicator,
    ProgressStep,
    Form,
    FormGroup,
    TextInput,
    Select,
    SelectItem,
    ButtonSet,
    Button,
    InlineNotification,
    InlineLoading,
    Grid,
    Column,
  } from '@carbon/react';
  ```
- **Padrão Carbon Obrigatório (Fluxos de 3+ etapas):**
  - Uso imperativo de `ProgressIndicator` com `currentIndex`.
  - Cada etapa é um `ProgressStep` com `label`, `description`, `complete` e `invalid`.
  - Validação no client antes do avanço para o próximo passo.
  - Validação fiscal estrita: CPF (11 dígitos, módulo 11) ou CNPJ (14 dígitos, módulo 11), sem fallbacks sintéticos.
  - Botões de navegação: `Secondary` para "Back" / "Previous" e `Primary` para "Next" / "Create Organization".

### Template 3: Dashboard & Telemetria (`DashboardPage`)

- **Propósito:** Visão operacional multi-tenant e monitoramento de auditoria.
- **Componentes Oficiais:**
  ```jsx
  import {
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Grid,
    Column,
    Tile,
    DataTable,
    Table,
    TableHead,
    TableRow,
    TableHeader,
    TableBody,
    TableCell,
    TableContainer,
    TableToolbar,
    TableToolbarSearch,
    Pagination,
    Tag,
  } from '@carbon/react';
  import { PageHeader } from '@carbon/ibm-products';
  ```
- **Padrão de Gráficos:** Para gráficos Carbon, utilizar dados e opções estruturados conformes ao schema oficial do Carbon Charts, sem inventar propriedades.

### Template 4: Catálogo de Produtos e Brand DNA (`ProductsCatalogPage`)

- **Propósito:** Exibição das 5 suites de produto (Content Factory, Client Ops, Schedule Ops, Reputation Ops, Academy Ops) e Brand DNA profiles.
- **Componentes Oficiais:**
  ```jsx
  import { Search, ContentSwitcher, Switch, Grid, Column, Tile, ClickableTile, Tag, Button } from '@carbon/react';
  import { PageHeader, SidePanel } from '@carbon/ibm-products';
  ```
- **Padrão de Detalhe:** Ao clicar em um subproduto, abre-se um `SidePanel` com capabilities reais, sem inventar páginas estáticas fictícias.

### Template 5: Files e Base de Conhecimento (`KnowledgeVectorPage`)

- **Propósito:** Gestão de corpus e indexação vetorial.
- **Componentes Oficiais:**
  ```jsx
  import {
    FileUploader,
    FileUploaderDropContainer,
    FileUploaderItem,
    Search,
    DataTable,
    ProgressBar,
    Tag,
    InlineNotification,
  } from '@carbon/react';
  import { PageHeader } from '@carbon/ibm-products';
  ```

### Template 6: FinOps e Pagamentos (`PaymentManagementPage`)

- **Propósito:** Cobranças PagBank, split e status de gateway.
- **Componentes Oficiais:**
  ```jsx
  import { Grid, Column, Tile, DataTable, Button, Tag, InlineNotification, Modal } from '@carbon/react';
  import { PageHeader } from '@carbon/ibm-products';
  ```
- **Padrão de Estado:** Estados de cobrança mapeados rigorosamente para tags semânticas Carbon:
  - `PAID`: `Tag type="green"` (Liquidado)
  - `WAITING_PAYMENT`: `Tag type="blue"` (Pendente)
  - `IN_ANALYSIS`: `Tag type="purple"` (Em análise de risco)
  - `DECLINED`: `Tag type="red"` (Recusado)
  - `CANCELED`: `Tag type="gray"` (Cancelado)

### Template 7: Configurações e Governança (`TenantCascadeSettings`)

- **Propósito:** Parametrização em cascata (Organização → Workspace → Projeto → Pessoa).
- **Componentes Oficiais:**
  ```jsx
  import {
    ContainedList,
    ContainedListItem,
    Form,
    TextInput,
    Select,
    SelectItem,
    Toggle,
    Button,
    InlineNotification,
  } from '@carbon/react';
  import { PageHeader } from '@carbon/ibm-products';
  ```

### Template 8: Global Shared UIShell

- **Propósito:** Shell privada com consistência global.
- **Componentes Oficiais:**
  ```jsx
  import {
    Header,
    HeaderName,
    HeaderNavigation,
    HeaderMenuItem,
    HeaderMenu,
    HeaderGlobalBar,
    HeaderGlobalAction,
    HeaderPanel,
    SideNav,
    SideNavItems,
    SideNavLink,
    SideNavMenu,
    SideNavMenuItem,
    SkipToContent,
  } from '@carbon/react';
  ```

---

## 5. Diretrizes de Acessibilidade (WCAG 2.2 AA)

1. **Alvos de Foco e Ordem Tabular:** Todos os componentes interativos devem possuir foco visível nativo Carbon (`:focus-visible`).
2. **Atributos ARIA:** Modais e Drawers devem possuir `aria-modal="true"`, `aria-label` descritivo e foco preso no elemento ativo até fechamento com tecla `Escape`.
3. **Contrastes Mínimos:** Relação de contraste de texto normal de no mínimo 4.5:1 e texto grande/ícones de no mínimo 3:1 em todos os 4 temas Carbon.
4. **Alvos de Toque:** Dimensão mínima de 44x44px nos alvos de toque em visualizações móveis.
