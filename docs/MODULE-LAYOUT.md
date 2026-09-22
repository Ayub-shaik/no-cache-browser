# Linux module layout

Status: **MVP** — TypeScript/Node 20+ host. Aligns with [ENGINE-SESSION.md](./ENGINE-SESSION.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [EXPORT-SCHEMA.md](./EXPORT-SCHEMA.md).

## Tree

```text
src/
  engine/
    types.ts              // Engine / Session / Tab (no CDP)
    save-nothing.ts       // pure ephemeral / toggle planning helpers
    index.ts              // public exports + createEngine()
    runtime/            // ONLY place that speaks CDP
      process.ts
      cdp.ts
      adapter.ts          // createBrowserContext({ ephemeral })
      tab-impl.ts         // setNoCache, Network.setBypassServiceWorker, back/forward
      tab-sinks.ts
      linux.ts
      windows.ts          // Windows resolve stub (same order as Linux)
  host/
    main.ts               // engine → NCB window server → content + DevEx
    ui/
      server.ts           // local HTTP + WS control plane (NCB window)
      controller.ts       // ContentController.setSaveNothing + duplicate/activate/close tab
      static/index.html   // NCB product window (tabs + address + toggle)
      index.ts
  devex/                  // never imports engine/
    index.ts
    session-buffer.ts
    panel.ts              // CLI + retarget + noCacheEnabled stamp
  tests/
    smoke.test.ts
    session-buffer.test.ts
    export-headless.test.ts
    linux-resolve.test.ts
    save-nothing.test.ts
    duplicate-tab.test.ts
    windows-resolve.test.ts
```

## Ownership

| Module | Owns | Must not |
|--------|------|----------|
| `engine/types` | Lifecycle API + sink shapes | CDP types |
| `engine/save-nothing` | Pure ephemeral / transition helpers | CDP, UI |
| `engine/runtime/` | Process spawn, CDP, Target/Page/Network/SW | UI, export schema |
| `host/ui/` | NCB window HTML, WS control, tab strip, context swap | CDP imports |
| `devex/` | SessionBuffer, panel, HAR/session export | CDP, engine process |
| `host/main` | Process entry, wiring | Protocol details |

## Fill-in

- [x] Engine/Session/Tab launch + navigate
- [x] setNoCache + Tab.subscribe sinks
- [x] DevEx SessionBuffer + CLI panel + export
- [x] Ephemeral BrowserContext + save-nothing toggle
- [x] NCB product window (tabs / URL / Duplicate / toggle / status)
- [ ] Windows pin fetch + process lifecycle (stub: `runtime/windows.ts`, `config/engine-windows.json`)
