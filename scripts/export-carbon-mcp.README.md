# Exporting Carbon MCP storybook data for the registry regen

`scripts/regen-carbon-patterns.mjs` validates/refreshes the curated component-pattern
registry against authoritative Carbon storybook data. It reads a JSON export via the
`CARBON_PATTERNS_MCP_JSON` env var, shaped:

```json
{
  "Button": { "variants": ["default", "secondary", "ghost"], "storybook_url": "..." },
  "Modal": { "variants": ["default", "passive-modal"], "storybook_url": "..." }
}
```

## How to produce the export

The authoritative source is the **Carbon MCP `code_search`** tool (storybook index).
For each curated component, call `code_search` with the component name and
`filters: { component_type: "React" }` (plus `ibm_products: "yes"` for IBM Products
components), then read `results[0].source`:

- `component_name` → registry key
- `variants[].variant_id` → `variants[]`
- `variants[0].storybook_url` → `storybook_url`

The agent performs this live (it has MCP access) and writes the export file, then runs:

```bash
CARBON_PATTERNS_MCP_JSON=/tmp/carbon-mcp-export.json node scripts/regen-carbon-patterns.mjs --check
```

## Why curated + validated (not fully auto-generated)

The MCP index mixes **feature-flag stories** (e.g. `components-tile-feature-flag--clickable`)
and fuzzy matches (e.g. `TextInput` → `components-passwordinput`), so a naive auto-regen
would corrupt the curated `storybookPath` and conformance rules. The registry is therefore
**curated by hand** (story path, scope, rules), and this script only validates/refreshes the
auto-derivable **variant lists** against upstream — failing loudly on drift, never
overwriting curation.
