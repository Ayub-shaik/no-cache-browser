# No Cache Browser

Cross-platform, developer-focused browser with normal browsing plus an optional **no-cache** mode, thin inspection/logging, and one-click debug session export.

**Status:** architecture frozen for MVP. Host / DevEx implementation has not started yet.

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

## Docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product freezes, engine choice, sequence, ownership |
| [ENGINE-SESSION.md](docs/ENGINE-SESSION.md) | `Engine` / `Session` / `Tab` boundary + CDP mapping |
| [EXPORT-SCHEMA.md](docs/EXPORT-SCHEMA.md) | `ncb-session.json` / HAR export schema |

## License

[MIT](LICENSE)
