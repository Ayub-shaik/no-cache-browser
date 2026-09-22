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
  host/
    main.ts               // engine → shell server → content + DevEx
    shell/
      server.ts           // local HTTP + WS control plane
      controller.ts       // ContentController.setSaveNothing + duplicateTab (same context)
      static/index.html   // NCB-branded top pane (title NCB)
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
```

## Ownership

| Module | Owns | Must not |
|--------|------|----------|
| `engine/types` | Lifecycle API + sink shapes | CDP types |
| `engine/save-nothing` | Pure ephemeral / transition helpers | CDP, UI |
| `engine/runtime/` | Process spawn, CDP, Target/Page/Network/SW | UI, export schema |
| `host/shell/` | NCB shell HTML, WS control, context swap | CDP imports |
| `devex/` | SessionBuffer, panel, HAR/session export | CDP, engine process |
| `host/main` | Process entry, wiring | Protocol details |

## Fill-in

- [x] Engine/Session/Tab launch + navigate
- [x] setNoCache + Tab.subscribe sinks
- [x] DevEx SessionBuffer + CLI panel + export
- [x] Ephemeral BrowserContext + save-nothing toggle
- [x] NCB shell top pane (URL / Duplicate / toggle / status)
