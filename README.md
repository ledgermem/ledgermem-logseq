# LedgerMem for Logseq

Sync your Logseq graph to [LedgerMem](https://proofly.dev) — every block and page becomes durable, searchable memory.

## Features

- **Slash command `/lm-save`** — push the active block as a memory.
- **Command: `LedgerMem: sync graph`** — backfill every page in the current graph.
- **Settings panel** — API key + workspace ID configurable via Logseq's plugin settings UI.
- **Refs as relations** — every page reference inside a block is captured into `metadata.relations`.

## Install

### Marketplace

Search **LedgerMem** in Logseq's Plugin Marketplace.

### Manual

1. Run `npm install && npm run build`.
2. In Logseq: **Settings → Plugins → Load unpacked plugin** and pick this folder.

## Configure

Open the LedgerMem plugin settings:

| Setting | Description |
| --- | --- |
| API key | Your LedgerMem API key. |
| Workspace ID | Target workspace for memories. |

## Develop

```bash
npm install
npm run build
npm test
```

## License

MIT
