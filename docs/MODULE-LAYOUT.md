# Linux module layout (step 2 sketch)

Status: **sketch only** — no app code until cloud-agent usage is available. Aligns with [ENGINE-SESSION.md](./ENGINE-SESSION.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

Owner: Browser Engineer

## Proposed tree (Linux host)

Language TBD at implement time (thin CDP shell, not Electron). Paths are logical:

```text
src/
  engine/
    mod                // Engine trait/interface: start, stop, createBrowserContext, chromiumInfo
    chromium/          // ONLY place that speaks CDP / owns the WebSocket client
      adapter          // ChromiumEngine implements Engine
      process          // locate binary (NCB_CHROMIUM_PATH), spawn with --remote-debugging-port
      cdp              // low-level CDP IO (internal)
  session/
    mod                // Session: createTab, close; holds browserContextId
  tab/
    mod                // Tab: navigate, reload, setNoCache (stub/later), subscribe (later)
  host/
    main               // Linux CLI/entry: wire Engine → one window Session → tabs
```

Future (not step 2): `devex/` consumes Tab sinks only — never imports `engine/chromium/`.

## Ownership

| Module | Owns | Must not |
|--------|------|----------|
| `engine/` (interface) | Lifecycle API | CDP types |
| `engine/chromium/` | Process spawn, CDP, Target/Page calls | UI, export schema |
| `session/` | BrowserContext mapping, tab list | Raw CDP client |
| `tab/` | Navigation + later no-cache / sinks | Import CDP protocol crates/types into public API |
| `host/` | Process entry, minimal window/tab UX | Protocol details |

## Step 2 fill-in

- Implement `engine/` + `chromium/process` + `chromium/adapter` + `session/` + `tab/navigate` + `host/main`.
- Leave `setNoCache` and `subscribe` as documented stubs or omit until steps 3–4.
- Tests: smoke under `tests/` or `host` smoke that skips if Chromium path missing.
