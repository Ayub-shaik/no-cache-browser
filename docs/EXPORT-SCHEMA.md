# DevEx export schema (MVP)

Status: **approved** — aligns with [ARCHITECTURE.md](./ARCHITECTURE.md) and [ENGINE-SESSION.md](./ENGINE-SESSION.md). No app code yet.

Owner: DevEx Engineer

## Goals

- One-click export of a tab’s captured console + network for debugging.
- Prefer a standards-shaped **HAR 1.2** file for network; wrap with a thin **session** envelope for console + no-cache metadata.
- Consume only Engine **sinks** + optional `getResponseBody(requestId)` — never raw CDP.
- Keep payloads small: bodies capped; no element inspector / DOM / screenshots in v1.

## Artifacts

| Artifact | Format | When |
|----------|--------|------|
| Session export (default) | `ncb-session.json` | One-click export |
| HAR-only (optional) | `*.har` (HAR 1.2) | Same data’s `log` object, if user wants a HAR-only drop |

External upload integrations are **out of MVP** — export is local file only.

## Session envelope (`ncb-session.json`)

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-21T14:30:00.000Z",
  "app": { "name": "no-cache-browser", "version": "0.0.0" },
  "engine": { "version": "<from Engine.engineBinaryInfo()>" },
  "tab": {
    "id": "<TabId>",
    "url": "https://example.com/",
    "title": "Example",
    "noCacheEnabled": true
  },
  "capture": {
    "startedAt": "2026-09-21T14:28:00.000Z",
    "endedAt": "2026-09-21T14:30:00.000Z"
  },
  "console": [ /* ConsoleEntry */ ],
  "har": { /* HAR 1.2 `log` object */ }
}
```

`tab.noCacheEnabled` is the toggle state at export time (required metadata per architecture note).

## ConsoleEntry

Maps 1:1 from Browser Engineer’s console sink:

```json
{
  "timestamp": "2026-09-21T14:29:01.234Z",
  "level": "log|info|warn|error|debug",
  "text": "stringified message",
  "url": "https://example.com/app.js",
  "line": 10,
  "column": 4
}
```

- Preserve sink order.
- Cap: keep last **N** entries in `SessionBuffer` (suggested default **2000**; configurable later in DevEx settings).
- Do not embed structured CDP `args` objects in v1 — stringify like a console panel.

## HAR (`har` / `*.har`)

Use **HAR 1.2** `log` shape so tools (DevTools-compatible viewers, Charles, etc.) can open network data:

```json
{
  "version": "1.2",
  "creator": { "name": "no-cache-browser", "version": "0.0.0" },
  "pages": [
    {
      "startedDateTime": "2026-09-21T14:28:00.000Z",
      "id": "page_1",
      "title": "<tab title or url>",
      "pageTimings": { "onContentLoad": -1, "onLoad": -1 }
    }
  ],
  "entries": [ /* HarEntry */ ]
}
```

### HarEntry (from Network sink)

| Field | Source |
|-------|--------|
| `startedDateTime`, `time` | sink timing |
| `request.method`, `request.url`, `request.headers` | `requestWillBeSent` |
| `response.status`, `response.statusText`, `response.headers`, `response.content.mimeType` | `responseReceived` |
| `response.content.size` / `text` | `loadingFinished` + optional `getResponseBody` |
| `timings` | best-effort from CDP timing; use `-1` when unknown |
| `pageref` | `page_1` |
| `_ncb.requestId` | internal id for correlation (custom underscore field OK in HAR) |

**Bodies:** include only when export requests them and size ≤ **cap** (suggested **256 KiB** per response; over cap → omit `text`, set `encoding`/`comment` noting truncated). Binary → base64 per HAR rules or omit.

**Failed requests:** still emit an entry; use `response.status = 0` and put failure text in `comment` / `_ncb.error`.

## SessionBuffer (runtime contract)

```text
SessionBuffer          // one per Tab subscription
  appendConsole(ConsoleEntry)
  appendNetwork(NetworkEvent)   // merges into HarEntry by requestId
  setMeta({ tab, capture, noCacheEnabled, engine })
  toSessionJson() -> ncb-session.json bytes
  toHar() -> HAR 1.2 log object
  clear()
```

- Buffer is **in-memory only** for MVP (no disk ring log).
- Panel reads the same buffer; export is a snapshot, not a live file.
- Engine may call `getResponseBody` only during `toSessionJson` / `toHar` for selected entries (or all under cap) — DevEx initiates that via a Tab helper, not CDP.
- The single forced reload from `Tab.setNoCache(true)` must **not** clear this buffer or drop sink subscriptions (see ENGINE-SESSION).

## Non-goals (v1)

- External log shippers / webhooks
- Cookies, storage dumps, screenshots, DOM snapshots
- Full CDP protocol dump
- Multi-tab bundled export (export is per-tab)

## Acceptance

- Export produces valid `ncb-session.json` with `schemaVersion`, `tab.noCacheEnabled`, `console[]`, and HAR 1.2 `har`.
- Optional `.har` opens in a standard HAR viewer for the network slice.
- No CDP types appear in DevEx module public API.
