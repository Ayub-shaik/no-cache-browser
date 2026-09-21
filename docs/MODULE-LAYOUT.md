# Linux module layout (step 2 sketch)

Status: **step 2 implementation** — TypeScript/Node host. Aligns with [ENGINE-SESSION.md](./ENGINE-SESSION.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

Owner: Browser Engineer

## Tree

```text
src/
  engine/
    types.ts              // Engine / Session / Tab interfaces (no CDP)
    index.ts              // public exports + createEngine()
    chromium/             // ONLY place that speaks CDP
      process.ts          // locate binary (NCB_CHROMIUM_PATH), spawn
      cdp.ts              // minimal CDP WebSocket client
      ws-shim.ts          // Node WebSocket adapter
      adapter.ts          // ChromiumEngine + Session/Tab impls
  host/
    main.ts               // Linux CLI entry
  tests/
    smoke.test.ts         // skip if Chromium missing
```

`session/` and `tab/` live inside `chromium/adapter.ts` for step 2 (same ownership rules). Split to top-level modules when setNoCache/sinks land if the file grows.

Future: `devex/` consumes Tab sinks only — never imports `engine/chromium/`.

## Ownership

| Module | Owns | Must not |
|--------|------|----------|
| `engine/types` | Lifecycle API | CDP types |
| `engine/chromium/` | Process spawn, CDP, Target/Page calls | UI, export schema |
| `host/` | Process entry | Protocol details |

## Step 2 fill-in

- [x] `engine/` + `chromium/process` + `chromium/adapter` + navigate/reload + `host/main`
- [ ] `setNoCache` / `subscribe` — steps 3–4
