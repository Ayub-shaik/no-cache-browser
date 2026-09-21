# Engine / Session boundary + CDP mapping (MVP draft)

Status: **draft for Lead review** — aligns with [ARCHITECTURE.md](./ARCHITECTURE.md). No app code yet.

Owner: Browser Engineer

## Goals

- Keep a small host surface; Chromium owns rendering and networking.
- Hide raw CDP behind `Engine` / `Session` / `Tab` so DevEx and UI never call protocol methods directly.
- Support Linux-first packaging of bundled Chromium, with the same interfaces usable later on Windows/macOS.
- Implement MVP no-cache as: HTTP cache off + service workers bypassed/unregistered for that tab’s session.

## Types (logical)

```text
Engine
  start(config) -> void          // locate/launch bundled Chromium, open CDP
  stop() -> void
  createBrowserContext() -> Session
  chromiumInfo() -> { version, executablePath }

Session                              // one BrowserContext (isolation boundary)
  createTab(url?) -> Tab
  close() -> void
  id: SessionId

Tab
  navigate(url) -> void
  reload(ignoreCache: bool) -> void
  setNoCache(enabled: bool) -> void  // MVP toggle
  noCacheEnabled: bool
  subscribe(ConsoleSink | NetworkSink) -> Unsubscribe
  close() -> void
  id: TabId
```

**Rule:** only `ChromiumEngine` (or a future CEF adapter) may hold a CDP client. UI and DevEx depend on these interfaces + event sinks, not on CDP domains.

## Isolation model

| Level | MVP choice | Why |
|-------|------------|-----|
| Process | One Chromium process (or one browser instance) per app | Simple packaging |
| Session | One CDP `Browser.createBrowserContext` per logical profile/window as needed | Cookie/storage isolation without post-MVP wipe APIs |
| Tab | One target (`Target.createTarget`) per tab, attached via CDP session | Per-tab no-cache + capture scope |

For MVP, **per-tab no-cache** is applied on that tab’s CDP session. Prefer **one BrowserContext per window** (not per tab) unless we hit SW/cache bleed; revisit if testing shows cross-tab leakage.

## No-cache toggle (MVP)

When `Tab.setNoCache(true)`:

1. `Network.enable` (if not already, also required for DevEx capture).
2. `Network.setCacheDisabled({ cacheDisabled: true })`.
3. `Page.setBypassServiceWorker({ bypass: true })` — stops SW from answering fetches for this page.
4. Best-effort: `ServiceWorker.enable`, list registrations for the tab’s origin(s), `ServiceWorker.unregister({ scopeURL })` for each.

When `setNoCache(false)`: reverse (1)–(3) (`cacheDisabled: false`, `bypass: false`). Do **not** re-register SWs.

**Out of scope (post-MVP):** `Network.clearBrowserCache`, bfcache flags, `Storage.clearDataForOrigin`, cookie/localStorage/IDB clearing.

## CDP method map

### Lifecycle / tabs

| Concern | CDP |
|---------|-----|
| Launch | Host starts bundled Chromium with `--remote-debugging-port=<port>` (and Linux sandbox flags as needed); connect over WebSocket |
| Browser context | `Target.createBrowserContext` / `Target.disposeBrowserContext` |
| New tab | `Target.createTarget` `{ url, browserContextId }` |
| Attach | `Target.attachToTarget` `{ flatten: true }` → sessionId |
| Navigate | `Page.enable`, `Page.navigate` |
| Close tab | `Target.closeTarget` |

### No-cache

| Concern | CDP |
|---------|-----|
| HTTP cache off | `Network.setCacheDisabled` |
| Bypass SW | `Page.setBypassServiceWorker` |
| Unregister SW | `ServiceWorker.enable` + `ServiceWorker.unregister` |

### Streams for DevEx (sinks only — no UI here)

| Concern | CDP | Sink payload (minimal) |
|---------|-----|------------------------|
| Console | `Runtime.enable` + `Runtime.consoleAPICalled`; optional `Log.enable` + `Log.entryAdded` | timestamp, level, text/args, url, line/col |
| Network | `Network.enable` + `requestWillBeSent` / `responseReceived` / `loadingFinished` / `loadingFailed` (+ `getResponseBody` on demand for export) | requestId, url, method, status, timing, headers; body optional/capped |

DevEx owns `SessionBuffer` and HAR shaping; Engine only forwards typed events and honors “get body for requestId” requests from the export path.

## Chromium packaging (Linux MVP)

- Ship a pinned Chromium revision (stable channel preferred) next to the host binary.
- Document upgrade process: bump pin, smoke-test CDP methods above, release.
- CEF remains the documented fallback if bundling/debugging-port packaging cost blows up — same `Engine` interface, different adapter.

## Non-goals for this draft

- Element inspector / DOM/CSS domains
- Full DevTools frontend
- Profiles UX beyond a single default context
- Windows/macOS launch flags (stub behind `Engine.start` config later)

## Acceptance for sequence step 2–3

- Host can launch Chromium, open a tab, navigate.
- Toggle no-cache on a tab; verify via Network panel/HAR that cache is disabled and SW is bypassed/unregistered for that session.
- Console + Network events appear on sinks for DevEx without any CDP types leaking outside the Chromium adapter.
