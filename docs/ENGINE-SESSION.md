# Engine / Session boundary + CDP mapping (MVP)

Status: **approved** — aligns with [ARCHITECTURE.md](./ARCHITECTURE.md). No app code yet.

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
  setNoCache(enabled: bool) -> void  // MVP toggle — see semantics below
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

## No-cache toggle (MVP) — deterministic semantics

### `setNoCache(true)`

1. If `noCacheEnabled` is already `true` → **no-op** (idempotent; **do not** reload).
2. Otherwise apply configuration on this tab’s CDP session:
   - `Network.enable` (if not already; also required for DevEx capture).
   - `Network.setCacheDisabled({ cacheDisabled: true })`.
   - `Page.setBypassServiceWorker({ bypass: true })`.
   - Best-effort: `ServiceWorker.enable`, list registrations for the tab’s origin(s), `ServiceWorker.unregister({ scopeURL })` for each.
3. If the tab already has a committed document (already-loaded page) → perform **exactly one** `reload(ignoreCache: true)` so bypass/unregister take effect. **Never** auto-reload in a loop.
4. If there is no committed document yet (empty / new tab) → skip reload; the next `navigate` runs under no-cache.
5. Set `noCacheEnabled = true`.

### `setNoCache(false)`

1. If `noCacheEnabled` is already `false` → **no-op**.
2. Otherwise: `Network.setCacheDisabled({ cacheDisabled: false })`, `Page.setBypassServiceWorker({ bypass: false })`. Do **not** re-register service workers.
3. **Do not** automatically reload. Normal caching applies on the **next** navigation or user/engine `reload`.
4. Set `noCacheEnabled = false`.

### Capture across the forced reload

The single forced reload from `setNoCache(true)` must **not** reset DevEx subscriptions or imply a buffer clear. Engine keeps the same tab sinks attached; DevEx keeps the same `SessionBuffer` so pre-toggle console/network traffic remains available for export. `noCacheEnabled` in export metadata is export-time state (see EXPORT-SCHEMA).

### Chromium / service-worker limitations (document honestly)

- An already-controlling SW may keep answering until the document is reloaded — hence the single forced reload on enable.
- `ServiceWorker.unregister` is asynchronous; other tabs/clients under the same scope may still be controlled until they navigate/reload.
- `Page.setBypassServiceWorker` applies to that page’s network stack; it is not a process-wide “SW never exists” guarantee.
- HTTP cache disable is per attached target/session; we do not clear disk cache in MVP.
- Turning no-cache **off** without reload means the current document may still reflect the no-cache load until the user navigates/reloads — by design for MVP.

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
| Reload | `Page.reload` `{ ignoreCache: true|false }` |
| Close tab | `Target.closeTarget` |

### No-cache

| Concern | CDP |
|---------|-----|
| HTTP cache off | `Network.setCacheDisabled` |
| Bypass SW | `Page.setBypassServiceWorker` |
| Unregister SW | `ServiceWorker.enable` + `ServiceWorker.unregister` |
| Forced reload on enable | `Page.reload` `{ ignoreCache: true }` — once, only when enabling from off on a loaded page |

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
- Toggle no-cache on a loaded tab → config applied + exactly one ignoreCache reload; second `setNoCache(true)` does not reload.
- `setNoCache(false)` does not auto-reload.
- Console + Network events continue across that reload without CDP types leaking outside the Chromium adapter.
