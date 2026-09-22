# No Cache Browser

Developer-focused browser with **NCB-branded shell**, normal browsing plus optional **save-nothing** (ephemeral) no-cache mode, thin inspection/logging, and one-click debug session export.

**Status:** MVP host + NCB shell + DevEx capture/export on `main`. Linux packaging: pinned engine binary (not a system browser by default).

## MVP (frozen)

| Area | v1 |
|------|----|
| Shell | **Our own** top pane (title **NCB**): URL, nav, **Duplicate**, save-nothing toggle. No vendor-browser lookalike. No separate Incognito — the toggle *is* that mode. |
| Engine | Bundled/pinned engine binary + thin host over CDP |
| Platforms | Linux first; Windows / macOS later |
| Default launch | Normal browsing (non-ephemeral context) |
| Save-nothing ON | Ephemeral BrowserContext + HTTP cache off + SW bypass (`Network.setCacheDisabled` + `Network.setBypassServiceWorker` + best-effort unregister) |
| Save-nothing OFF | Normal context; **no** auto-reload |
| DevEx | Console + network + HAR / session export; stamp **`noCacheEnabled`** |
| Downloads | No manager UI; downloads continue after tab close while NCB runs; quit stops them |
| Post-MVP | Mid-session storage wipe, deep bfcache, element inspector, Win/mac, download manager |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ENGINE-SESSION.md](docs/ENGINE-SESSION.md).

## Host language

Thin **TypeScript / Node.js 20+** CDP shell (not Electron). The engine is spawned as a separate process; CDP stays inside `src/engine/runtime/`. Host/shell never import CDP types.

## Run locally (Linux)

```bash
npm install
npm run fetch-engine-binary   # pinned binary → third_party/engine-binary/ (gitignored)
npm run build
npm start -- https://example.com
```

Interactive start opens:

1. **NCB shell** window — top pane at `http://127.0.0.1:<port>/` (URL, Go/Back/Forward, **Duplicate**, **No-cache / Save nothing** toggle).
2. **Content** window — the page surface (prefer reduced browser UI when practical; see [docs/LINUX.md](docs/LINUX.md)).

Toggle **ON** swaps to an ephemeral BrowserContext and applies cache/SW. Toggle **OFF** returns to a normal context (no auto-reload). DevEx CLI still accepts `nocache on|off` (wired through the same save-nothing path).

Bring-your-own binary:

```bash
export NCB_ENGINE_PATH=/path/to/engine-binary
npm run build && npm start -- https://example.com
```

Opt-in system engine binary (off by default):

```bash
export NCB_ALLOW_SYSTEM_ENGINE=1
```

Headless (skips NCB shell GUI; setNoCache / export still work):

```bash
NCB_HEADLESS=1 npm start -- https://example.com
npm test
```

Skip shell windows but keep interactive CLI: `NCB_SHELL=0`.

Containers/CI if sandbox fails: `NCB_ENGINE_NO_SANDBOX=1`. Persistent profile: `NCB_USER_DATA_DIR=...`.

See [docs/LINUX.md](docs/LINUX.md), [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), and [`config/engine-linux.json`](config/engine-linux.json).

## Docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product freezes, engine choice, ownership |
| [ENGINE-SESSION.md](docs/ENGINE-SESSION.md) | Engine / Session / Tab + save-nothing + CDP map |
| [LINUX.md](docs/LINUX.md) | Engine pin, fetch, resolve order, shell launch notes |
| [DEPENDENCIES.md](docs/DEPENDENCIES.md) | Pinned engine binary vs MIT scope |
| [MODULE-LAYOUT.md](docs/MODULE-LAYOUT.md) | Module folders + ownership |
| [EXPORT-SCHEMA.md](docs/EXPORT-SCHEMA.md) | `ncb-session.json` / HAR (`noCacheEnabled`) |

## License

[MIT](LICENSE) — covers No Cache Browser source only; the pinned engine binary is a separate dependency.
