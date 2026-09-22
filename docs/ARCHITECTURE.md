# No Cache Browser — Architecture (MVP)

Status: **frozen** (Lead architect product freeze). Companions: [ENGINE-SESSION.md](./ENGINE-SESSION.md), [EXPORT-SCHEMA.md](./EXPORT-SCHEMA.md), [MODULE-LAYOUT.md](./MODULE-LAYOUT.md).

## Product

Developer-focused browser with **our own NCB shell** (top-pane toggle), normal browsing plus optional **save-nothing** mode, thin inspection/logging, and easy export of debug sessions.

Repo: `Ayub-shaik/no-cache-browser`

**Not** a vendor-browser lookalike. **No** separate Incognito UI — the top **No-cache / Save nothing** toggle *is* that mode.

## Engine decision

**MVP engine:** bundled/pinned engine binary driven by a thin host shell over **CDP**.

| Option | Verdict |
|--------|---------|
| System WebView | Out — insufficient session control |
| Electron | Out — Node + multi-process tax |
| CEF | Fallback if packaging cost blows up |
| **Pinned engine binary + CDP shell** | **Chosen** |

Trade-offs accepted: large download; we own engine version bumps.

## MVP product freezes

1. **Our shell:** NCB-branded top pane (URL, nav, **Duplicate**, save-nothing toggle, status). Content + shell engine targets OK. Duplicate = same BrowserContext (`Session.createTab`).
2. **Save-nothing (v1):** ephemeral BrowserContext (cookies/storage/disk don’t persist across that mode) + HTTP cache off + SW bypass (`Network.setCacheDisabled` + **`Network.setBypassServiceWorker`** + best-effort unregister). Toggle OFF = normal (non-ephemeral) browsing.
3. **Default launch** = normal browsing.
4. **Post-MVP:** mid-session wipe of already-written storage, deep bfcache, element inspector, Win/mac.
5. **DevEx v1:** console stream, network list/details, HAR/session export. Do **not** expand DevEx panel beyond wiring toggle state into buffer meta if trivial. DevEx owns export stamp — expose **`noCacheEnabled`** clearly. No element inspector / full custom DevTools GUI.
6. **Platforms:** Linux first; Windows and macOS after Linux is stable.
7. **Downloads:** no download manager this slice — in-flight downloads continue after tab close while NCB runs; quit stops them (documented only).
8. **Out of MVP unless required:** external integrations, telemetry backends, advanced DevTools, download manager UI.

## Architecture principles

- Thin host; the engine does rendering/networking.
- `Engine` / `Session` / `Tab` — **do not leak raw CDP** (CDP only under `src/engine/runtime/`).
- Ephemeral vs normal BrowserContext for save-nothing isolation.
- DevEx consumes console + Network streams into an in-memory session buffer; export reads that buffer.
- Prefer reuse (pinned engine + CDP) over custom engines or DevTools frontends.

## Logical components

```
Host (Linux)
  ├─ NCB shell (HTTP + WS top pane)
  ├─ ContentController (normal ↔ ephemeral swap + navigate + Duplicate)
  ├─ Engine (interface)
  │     └─ RuntimeSession (CDP): launch, contexts, tabs, cache, SW, events
  └─ DevEx panel (CLI)
        ├─ SessionBuffer (console + network)
        └─ HAR / session export (+ noCacheEnabled metadata)
```

## CDP mapping (MVP)

| Concern | Approach |
|---------|----------|
| Disable HTTP cache | `Network.setCacheDisabled` |
| Service workers | **`Network.setBypassServiceWorker`** + best-effort unregister |
| Ephemeral session | `Target.createBrowserContext` (+ dispose on close / detach) |
| Console | CDP Runtime events → SessionBuffer |
| Network | CDP Network events → SessionBuffer → HAR |
| Export metadata | `tab.noCacheEnabled` / save-nothing state at export time |

Exact method names and toggle semantics: [ENGINE-SESSION.md](./ENGINE-SESSION.md). Export shapes: [EXPORT-SCHEMA.md](./EXPORT-SCHEMA.md).

## Implementation sequence

1. Scaffolding — done.
2. Host + engine lifecycle — done.
3. No-cache / save-nothing (ephemeral + cache/SW) — this freeze.
4. DevEx capture + export — done (retarget on context swap).
5. NCB shell — this freeze.
6. Linux hardening — ongoing.
7. Later — Windows/macOS; post-MVP storage/bfcache/inspector.

## Ownership

| Area | Owner |
|------|-------|
| Engine, sessions, tabs, no-cache/SW, engine packaging | Browser Engineer |
| NCB shell HTML / control plane wiring | Browser Engineer (host shell) |
| Console/network buffer, panel, HAR/session export | DevEx Engineer |
| Requirements, freezes, scope control, review | Lead architect |
