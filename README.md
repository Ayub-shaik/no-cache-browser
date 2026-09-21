# No Cache Browser

Cross-platform, developer-focused browser with normal browsing plus an optional **no-cache** mode, thin inspection/logging, and one-click debug session export.

**Status:** MVP host + DevEx capture/export on `main`. Linux packaging slice: pinned Chromium resolve + sandbox flags.

## MVP (frozen)

| Area | v1 |
|------|----|
| Engine | Bundled Chromium + thin host over CDP |
| Platforms | Linux first; Windows / macOS later |
| Default launch | Normal browsing |
| No-cache | Per-tab toggle: HTTP cache off + SW bypass/unregister; one `reload(ignoreCache)` when enabling on a loaded page |
| DevEx | Console + network list/details + HAR / session export |
| Out of scope | Full DevTools, storage wipe, external log shippers, telemetry |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Host language

Thin **TypeScript / Node.js 20+** CDP shell (not Electron). Chromium is spawned as a separate process; CDP stays inside `src/engine/chromium/`.

## Run locally (Linux)

```bash
npm install
# optional if chromium is on PATH / well-known path:
export NCB_CHROMIUM_PATH=/usr/bin/chromium
npm run build
npm start -- https://example.com
```

Headless:

```bash
NCB_HEADLESS=1 npm start -- https://example.com
npm test
```

Containers/CI if sandbox fails: `NCB_CHROMIUM_NO_SANDBOX=1`. Persistent profile: `NCB_USER_DATA_DIR=...`.

See [docs/LINUX.md](docs/LINUX.md) and [`config/chromium-linux.json`](config/chromium-linux.json).

## Docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product freezes, engine choice, sequence, ownership |
| [ENGINE-SESSION.md](docs/ENGINE-SESSION.md) | `Engine` / `Session` / `Tab` boundary + CDP mapping |
| [LINUX.md](docs/LINUX.md) | Chromium path pin, sandbox flags, OS glue |
| [MODULE-LAYOUT.md](docs/MODULE-LAYOUT.md) | Linux module folders + ownership |
| [EXPORT-SCHEMA.md](docs/EXPORT-SCHEMA.md) | `ncb-session.json` / HAR export schema |

## License

[MIT](LICENSE)
