# Engine / Session boundary + CDP mapping (MVP)

Status: **approved** — aligns with [ARCHITECTURE.md](./ARCHITECTURE.md). Lead architect freeze (NCB product window + save-nothing).

Owner: Browser Engineer (engine) / host UI

## Goals

- Keep a small host surface; engine owns rendering and networking.
- Hide raw CDP behind `Engine` / `Session` / `Tab` so DevEx and UI never call protocol methods directly.
- Support Linux + Windows packaging of bundled engine (Mac out), with the same Engine/Session/Tab interfaces.
- Implement v1 **save nothing** as: **ephemeral BrowserContext** + HTTP cache off + service workers bypassed/unregistered.
- Product UI is **our own** NCB window (not a vendor-browser lookalike; no separate Incognito — the toggle *is* that mode).

## Types (logical)

```text
Engine
  start(config) -> void
  stop() -> void
  createBrowserContext({ ephemeral?: bool }) -> Session
  engineBinaryInfo() -> { version, executablePath }

Session                              // one BrowserContext (isolation boundary)
  ephemeral: bool                    // true ⇒ isolated + discarded on close
  createTab(url?) -> Tab
  close() -> void
  id: SessionId

Tab
  navigate(url) -> void
  reload(ignoreCache: bool) -> void
  back() / forward() -> bool         // best-effort history
  setNoCache(enabled: bool) -> void  // cache + SW for this tab
  noCacheEnabled: bool
  subscribe(ConsoleSink | NetworkSink) -> Unsubscribe
  close() -> void
  id: TabId
```

**Host product toggle** (`ContentController.setSaveNothing`):

- **ON:** swap to `createBrowserContext({ ephemeral: true })`, restore URL, `Tab.setNoCache(true)` (cache/SW + one ignoreCache reload if document already committed).
- **OFF:** swap back to normal (non-ephemeral) context, restore URL, cache/SW clear on the new tab; **no** auto-reload.

**Rule:** only `RuntimeEngine` (or a future CEF adapter) may hold a CDP client. UI and DevEx depend on these interfaces + event sinks, not on CDP domains. Host UI must not import CDP types.

## Isolation model

| Level | MVP choice | Why |
|-------|------------|-----|
| Process | One engine process per app | Simple packaging |
| Session | `Target.createBrowserContext` — normal vs **ephemeral** | Cookie/storage isolation for save-nothing without mid-session wipe APIs |
| Tab | One target per tab, attached via CDP session | Per-tab cache/SW + capture scope |

Ephemeral contexts are always disposed on close (CDP `disposeBrowserContext`; `disposeOnDetach` when ephemeral). **Ephemeral = isolated + discarded** — no durable cookies/storage for that mode.

## Save-nothing / no-cache toggle (v1) — deterministic semantics

Product name in the NCB window: **No-cache / Save nothing**.

### Toggle ON (`setSaveNothing(true)`)

1. If already ON → **no-op**.
2. Close current content session/tabs; open `createBrowserContext({ ephemeral: true })` + tab; restore URL.
3. Apply tab configuration (same as `setNoCache(true)`):
   - `Network.enable` (if needed).
   - `Network.setCacheDisabled({ cacheDisabled: true })`.
   - **`Network.setBypassServiceWorker({ bypass: true })`** (not `Page.setBypassServiceWorker`).
   - Best-effort unregister via `ServiceWorker.enable` + page `navigator.serviceWorker` unregister.
4. If the tab already has a committed document → **exactly one** `reload(ignoreCache: true)`. Never loop.
5. If no committed document yet → skip reload; next `navigate` runs under no-cache.
6. Set product state ON (`noCacheEnabled` true for export meta).

### Toggle OFF (`setSaveNothing(false)`)

1. If already OFF → **no-op**.
2. Swap to a **normal** (non-ephemeral) BrowserContext; restore URL.
3. New tab starts with cache/SW enabled (`setNoCache` false). Do **not** re-register service workers.
4. **Do not** automatically reload. Normal caching applies on the next navigation or user/engine `reload`.

### `Tab.setNoCache` alone

Still available for tests/headless cache+SW without forcing a context swap. Interactive NCB window and DevEx CLI `nocache on|off` go through **save-nothing** when the host controller is wired.

### Capture across forced reload / context swap

Forced reload and context swap must **not** clear DevEx `SessionBuffer`. Panel may `retarget` the new `Tab`; pre-toggle console/network traffic remains for export. `noCacheEnabled` in export metadata is export-time state (see EXPORT-SCHEMA).

### engine / service-worker limitations (document honestly)

- An already-controlling SW may keep answering until the document is reloaded — hence the single forced reload on enable when a document was committed.
- `ServiceWorker.unregister` is asynchronous; other tabs under the same scope may still be controlled until they navigate/reload.
- `Network.setBypassServiceWorker` applies to that page’s network stack; it is not a process-wide “SW never exists” guarantee.
- HTTP cache disable is per attached target/session; we do not clear disk cache in v1.
- Turning save-nothing **off** without reload means the current document may still reflect the prior load until the user navigates/reloads — by design.

### Post-MVP (explicitly deferred)

- Mid-session wipe of already-written storage
- Deep bfcache control
- Element inspector
- Full Windows fetch/install (stub landed); Mac out
- `Network.clearBrowserCache`, `Storage.clearDataForOrigin`, cookie/localStorage/IDB clearing UX

## CDP method map

### Lifecycle / tabs

| Concern | CDP |
|---------|-----|
| Launch | Host starts bundled engine with `--remote-debugging-port=<port>`; connect over WebSocket |
| Browser context | `Target.createBrowserContext` (`disposeOnDetach` when ephemeral) / `Target.disposeBrowserContext` |
| New tab | `Target.createTarget` `{ url, browserContextId }` |
| Attach | `Target.attachToTarget` `{ flatten: true }` → sessionId |
| Navigate | `Page.enable`, `Page.navigate` |
| History | `Page.getNavigationHistory` + `Page.navigateToHistoryEntry` (best-effort) |
| Reload | `Page.reload` `{ ignoreCache: true\|false }` |
| Close tab | `Target.closeTarget` |

### Save-nothing / no-cache

| Concern | CDP |
|---------|-----|
| HTTP cache off | `Network.setCacheDisabled` |
| Bypass SW | **`Network.setBypassServiceWorker`** |
| Unregister SW | `ServiceWorker.enable` + best-effort page unregister |
| Forced reload on enable | `Page.reload` `{ ignoreCache: true }` — once, only when enabling from off on a loaded page |

### Streams for DevEx (sinks only — no UI here)

| Concern | CDP | Sink payload (minimal) |
|---------|-----|------------------------|
| Console | `Runtime.enable` + `Runtime.consoleAPICalled` | timestamp, level, text/args, url, line/col |
| Network | `Network.enable` + request/response/finished/failed (+ `getResponseBody` on demand) | requestId, url, method, status, headers; body optional/capped |

DevEx owns `SessionBuffer` and HAR shaping; Engine only forwards typed events. Export stamps **`noCacheEnabled`** clearly (DevEx owns the stamp).

## NCB product window (host UI)

- Tiny local HTTP server serves NCB-branded HTML (title **NCB**).
- Top pane: URL, Go/Back/Forward, **Duplicate**, **No-cache / Save nothing** toggle, status.
- **Duplicate:** `Session.createTab` in the *same* BrowserContext (cookies/login carry over). Copies current URL (title when known). Does **not** create a new BrowserContext.
- Control plane: WebSocket NCB window → host controller (navigate + toggle + duplicate + tab strip).
- Launch: content target + NCB window target (`http://127.0.0.1:<port>/`). Prefer reduced browser UI flags for the content surface when practical (see LINUX.md). Do **not** present a system browser as the product.
- Headless: skip NCB window; `setNoCache` / tests still work.

## Downloads (documented only — no manager this slice)

- No separate download manager UI in this freeze.
- In-flight downloads continue after that tab closes if the NCB process is still open.
- Quitting NCB (process stop) stops downloads.

## engine packaging (Linux MVP)

- Ship a pinned engine revision (CfT) next to the host — see [LINUX.md](./LINUX.md).
- CEF remains the documented fallback — same `Engine` interface, different adapter.

## Non-goals for this draft

- Element inspector / DOM/CSS domains
- Full DevTools frontend
- Separate Incognito UI (toggle *is* save-nothing)
- Windows launch flags / process glue (stub behind `Engine.start` later; see WINDOWS.md)

## Acceptance

- Interactive start shows NCB product window with tab strip and working save-nothing toggle.
- Toggle ON uses ephemeral BrowserContext + cache/SW; OFF returns to normal context.
- No vendor-browser lookalike branding in *our* NCB window HTML.
- Docs match freeze; SW method is `Network.setBypassServiceWorker`.
