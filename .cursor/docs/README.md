# WP Hub Pro — documentation

Agent reference docs for the **`wphubpro`** orchestration repo. Cursor rules in **`.cursor/rules/`** point here.

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | This index |
| [WORKSPACE.md](WORKSPACE.md) | On-disk layout, nested clones, bootstrap |
| [AGENTS.md](AGENTS.md) | Agent entry: repos, dev commands, schema workflow |
| [FUNCTIONS.md](FUNCTIONS.md) | All 12 Appwrite functions (from `appwrite.config.json`) |
| [SHARED.md](SHARED.md) | `@code045/wphubpro-shared` npm package — publish & version sync (`wphub-shared-publish.mdc`) |
| [MODULAR-LAYERS.md](MODULAR-LAYERS.md) | App domains + function handler structure |
| *(rule)* | [wphub-docs-sync.mdc](../rules/wphub-docs-sync.mdc) — keep docs/README in sync after code or config changes |

Plans and inventories: **`../planning/`** (not agent reference docs).

**Cursor:** Open the **`wphubpro`** repository root so `appwrite.config.json`, nested clones (`functions/`, `sites/wphubpro/`), and `.cursor/` resolve — see [WORKSPACE.md](WORKSPACE.md).

**Source of truth for deploy:** [`.cursor/appwrite.config.json`](../appwrite.config.json) — run Appwrite CLI from `.cursor/`.
