# Linux module layout

Status: **MVP implementation in progress** — TypeScript/Node 20+ host. Aligns with [ENGINE-SESSION.md](./ENGINE-SESSION.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [EXPORT-SCHEMA.md](./EXPORT-SCHEMA.md).

## Tree

```text
src/
  engine/
    types.ts              // Engine / Session / Tab interfaces (no CDP)
    index.ts              // public exports + createEngine()
    chromium/             // ONLY place that speaks CDP
      process.ts
      cdp.ts
      adapter.ts
  host/
    main.ts               // Linux CLI entry + DevEx panel wiring
  devex/                  // DevEx Engineer — sinks only, never imports chromium/
    index.ts
    session-buffer.ts     // in-memory console + network; survives no-cache reload
    panel.ts              // thin CLI panel + local export
  tests/
    smoke.test.ts
    session-buffer.test.ts
```

## Ownership

| Module | Owns | Must not |
|--------|------|----------|
| `engine/types` | Lifecycle API + sink event shapes | CDP types |
| `engine/chromium/` | Process spawn, CDP, Target/Page/Network/SW | UI, export schema |
| `devex/` | SessionBuffer, panel, HAR/session export | CDP, Chromium process |
| `host/` | Process entry, wiring | Protocol details |

## Fill-in

- [x] Step 2: Engine/Session/Tab launch + navigate
- [x] Step 3–4: setNoCache + Tab.subscribe sinks
- [x] DevEx: SessionBuffer + CLI panel + export
