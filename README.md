# No Cache Browser

Developer-focused browser with an **NCB product window**, normal browsing plus optional **save-nothing** (ephemeral) no-cache mode, inspection/logging hooks, and one-click debug session export.

**Status:** MVP host + NCB window + DevEx capture/export on `main`. Platforms: **Linux + Windows** (Mac out). Linux packaging: pinned engine binary (not a system browser by default). Windows pin/resolve stub lands with Step-1.

## MVP (frozen)

| Area | v1 |
|------|----|
| Product UI | **Our own** NCB window (title **NCB**): tab strip, URL, nav, **Duplicate**, save-nothing toggle. No vendor-browser lookalike. No separate Incognito — the toggle *is* that mode. |
| Engine | Bundled/pinned engine binary + host over CDP |
| Platforms | Linux + Windows (Mac out) |
| Default launch | Normal browsing (non-ephemeral context) |
| Save-nothing ON | Ephemeral BrowserContext + HTTP cache off + SW bypass (`Network.setCacheDisabled` + `Network.setBypassServiceWorker` + best-effort unregister) |
| Save-nothing OFF | Normal context; **no** auto-reload |
| DevEx | Console + network + HAR / session export; stamp **`noCacheEnabled`** (panel surfaces hang off host hooks) |
| Downloads | No manager UI; downloads continue after tab close while NCB runs; quit stops them |
| Post-MVP | Mid-session storage wipe, deep bfcache, element inspector, download manager |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ENGINE-SESSION.md](docs/ENGINE-SESSION.md).

## Host language

**TypeScript / Node.js 20+** host (not Electron). The engine is spawned as a separate process; CDP stays inside `src/engine/runtime/`. Host UI never imports CDP types.

## Run locally (Linux)

```bash
npm install
npm run fetch-engine-binary   # pinned binary → third_party/engine-binary/ (gitignored)
npm run build
npm start -- https://example.com
```

Interactive start opens:

1. **NCB window** — product UI at `http://127.0.0.1:<port>/` (tabs, URL, Go/Back/Forward, **Duplicate**, **No-cache / Save nothing** toggle).
2. **Content** surface — the page (prefer reduced browser UI when practical; see [docs/LINUX.md](docs/LINUX.md)).

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

Headless (skips NCB window; setNoCache / export still work):

```bash
NCB_HEADLESS=1 npm start -- https://example.com
npm test
```

Skip the NCB window but keep interactive DevEx CLI: `NCB_UI=0` (legacy alias `NCB_SHELL=0` still honored).

Containers/CI if sandbox fails: `NCB_ENGINE_NO_SANDBOX=1`. Persistent profile: `NCB_USER_DATA_DIR=...`.

See [docs/LINUX.md](docs/LINUX.md), [docs/WINDOWS.md](docs/WINDOWS.md), [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), [`config/engine-linux.json`](config/engine-linux.json), and [`config/engine-windows.json`](config/engine-windows.json).

## Docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Product freezes, engine choice, ownership |
| [ENGINE-SESSION.md](docs/ENGINE-SESSION.md) | Engine / Session / Tab + save-nothing + CDP map |
| [LINUX.md](docs/LINUX.md) | Engine pin, fetch, resolve order, NCB window launch notes |
| [WINDOWS.md](docs/WINDOWS.md) | Windows pin shape + resolve order stub |
| [DEPENDENCIES.md](docs/DEPENDENCIES.md) | Pinned engine binary vs MIT scope |
| [MODULE-LAYOUT.md](docs/MODULE-LAYOUT.md) | Module folders + ownership |
| [EXPORT-SCHEMA.md](docs/EXPORT-SCHEMA.md) | `ncb-session.json` / HAR (`noCacheEnabled`) |

## License

[MIT](LICENSE) — covers No Cache Browser source only; the pinned engine binary is a separate dependency.
