# No Cache Browser — Architecture (MVP)

Status: **frozen for MVP** (2026-09-21). No app implementation until this note is the agreed baseline.

## Product

Cross-platform, developer-focused browser with normal browsing plus an optional **no-cache** mode, thin inspection/logging, and easy export of debug sessions.

Repo: `Ayub-shaik/no-cache-browser`

## Engine decision

**MVP engine:** bundled Chromium driven by a thin host shell over **CDP**.

| Option | Verdict |
|--------|---------|
| System WebView (WKWebView / WebView2 / etc.) | Out — insufficient session control for no-cache |
| Electron | Out for MVP — Node + multi-process tax fights lightweight goal |
| CEF | Fallback if thin-shell packaging cost blows up |
| **Bundled Chromium + CDP shell** | **Chosen** — same cache/SW/CDP levers, small app surface |

Trade-offs accepted: ~100MB+ download; we own Chromium version bumps.

## MVP product freezes

1. **No-cache (session):** HTTP cache disabled + unregister/disable service workers. Per-browser / per-tab toggle. **Default launch = normal browsing.**
2. **Post-MVP:** disk cache wipe, bfcache control, cookies / localStorage / IndexedDB / storage clearing.
3. **DevEx v1:** console stream, network request list/details, one-click HAR/session export. No element inspector / full custom DevTools.
4. **Platforms:** Linux first; keep abstractions cross-platform; Windows and macOS after Linux is stable.
5. **Out of MVP unless required to validate core flow:** external integrations, telemetry backends, advanced DevTools, storage-clearing UX.

## Architecture principles

- Thin host; Chromium does rendering/networking.
- `Engine` / `Session` (and tab) interfaces — **do not leak raw CDP** across the app.
- Per-tab session isolation so no-cache and capture stay scoped.
- DevEx consumes console + Network streams into an in-memory session buffer; export reads that buffer.
- Prefer reuse (Chromium + CDP) over custom engines or DevTools frontends.
- Optimize for maintainability and low complexity; challenge new surfaces that are not required for the core no-cache + debug workflow.

## Logical components

```
Host UI (Linux first)
  ├─ Tabs / navigation / no-cache toggle
  ├─ Engine (interface)
  │     └─ ChromiumSession (CDP): launch, navigate, cache, SW, events
  └─ DevEx panel
        ├─ SessionBuffer (console + network)
        └─ HAR / session export (+ no-cache toggle metadata)
```

## CDP mapping (MVP)

| Concern | Approach |
|---------|----------|
| Disable HTTP cache | `Network.setCacheDisabled` (and related session cache controls as needed) |
| Service workers | Unregister / disable for the tab session |
| Console | CDP console / Runtime events → SessionBuffer |
| Network | CDP Network events → SessionBuffer → HAR |
| Export metadata | Include no-cache toggle state |

Exact method names live with Browser Engineer’s Engine/Session boundary draft; this table is the contract.

## Implementation sequence (no app code until this doc lands)

1. **Scaffolding** — README, `.gitignore`, MIT license (repo currently empty).
2. **Host + Chromium lifecycle** — launch, tabs, navigate behind `Engine` / `Session`.
3. **No-cache toggle** — per-tab → cache off + SW unregister/disable.
4. **DevEx capture** — CDP console + Network → in-memory SessionBuffer + simple panel.
5. **Export** — one-click HAR/session export; stamp no-cache state in metadata.
6. **Linux hardening** — minimal profiles/permissions/OS paths only.
7. **Later** — Windows/macOS; CEF only if packaging forces it; post-MVP cache/storage controls; external integrations.

## Ownership

| Area | Owner |
|------|--------|
| Engine, sessions, tabs, no-cache, Chromium packaging | Browser Engineer |
| Console/network buffer, panel, HAR/session export, DevEx settings | DevEx Engineer |
| Requirements, engine/arch decisions, scope control, review | Lead architect |

## Open follow-ups (docs only, then code)

- Browser Engineer: Engine/Session boundary + CDP method mapping.
- DevEx Engineer: minimal export schema (HAR + session metadata).
- Lead: review those drafts; then unblock scaffolding and implementation in order above.
