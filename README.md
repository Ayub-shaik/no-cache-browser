# No Cache Browser

Cross-platform, developer-focused browser with normal browsing plus an optional **no-cache** mode, thin inspection/logging, and one-click debug session export.

**Status:** architecture frozen for MVP. Step 2 (Linux host + Chromium lifecycle) is in progress on `feat/step2-engine-host`.

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

## Host language (step 2)

Thin **TypeScript / Node.js 22+** CDP shell (not Electron). Chromium is spawned as a separate process; the host talks DevTools Protocol only inside `src/engine/chromium/`.

## Run locally (Linux)

```bash
npm install
export NCB_CHROMIUM_PATH=/usr/bin/chromium   # or google-chrome
npm run build
npm start -- https://example.com
```

Headless smoke:

```bash
NCB_HEADLESS=1 NCB_CHROMIUM_PATH=/usr/bin/chromium npm start -- https://example.com
npm test   # skips cleanly if Chromium is missing
```

Chromium is **not** vendored in git. Point `NCB_CHROMIUM_PATH` at a local binary for now; a pinned bundled Chromium under `third_party/chromium/` (gitignored) comes later.

## Docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product freezes, engine choice, sequence, ownership |
| [ENGINE-SESSION.md](docs/ENGINE-SESSION.md) | `Engine` / `Session` / `Tab` boundary + CDP mapping |
| [MODULE-LAYOUT.md](docs/MODULE-LAYOUT.md) | Linux module folders + ownership |
| [EXPORT-SCHEMA.md](docs/EXPORT-SCHEMA.md) | `ncb-session.json` / HAR export schema |

## License

[MIT](LICENSE)
