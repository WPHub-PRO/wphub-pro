# WP Hub Pro — documentation

Agent reference docs for the **`wphub-pro`** monorepo. Cursor rules in **`.cursor/rules/`** point here.

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | This index |
| [WORKSPACE.md](WORKSPACE.md) | Monorepo layout, paths, bootstrap |
| [AGENTS.md](AGENTS.md) | Agent entry: dev commands, schema workflow |
| [FUNCTIONS.md](FUNCTIONS.md) | All 13 Appwrite functions + **wp-proxy plugins/themes bulk** |
| [SHARED.md](SHARED.md) | `@code045/wphubpro-shared` — publish & version sync |
| [MODULAR-LAYERS.md](MODULAR-LAYERS.md) | App domains + function handler structure |
| *(rule)* | [wphub-docs-sync.mdc](../rules/wphub-docs-sync.mdc) — keep docs in sync after code or config changes |
| *(rule)* | [wphub-bridge-extensions.mdc](../rules/wphub-bridge-extensions.mdc) — bulk plugins/themes flow (Hub → wp-proxy → bridge) |
| *(rule)* | [wphub-bridge-plugin.mdc](../rules/wphub-bridge-plugin.mdc) — bridge plugin edits; **version bump** in `wphubpro-bridge.php` |

Plans and inventories: **`../planning/`** (not agent reference docs).

**Repository:** [github.com/wphub-pro/wphub-pro](https://github.com/wphub-pro/wphub-pro) — single monorepo (`.cursor/`, `functions/`, `sites/wphubpro/` are subdirectories, not separate clones).

**Source of truth for deploy:** [`appwrite.config.json`](../../appwrite.config.json) at the **repository root** — run Appwrite CLI from the repo root.
