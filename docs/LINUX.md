# Linux launch (MVP packaging slice)

Owner: Browser Engineer

## Engine binary dependency (not a system browser)

No Cache Browser is a host over CDP. It does **not** ship a vendor browser as the product, and it does **not** default to whatever browser binary is installed on the system.

The default engine binary is a **pinned Linux build** declared in [`config/engine-linux.json`](../config/engine-linux.json) and fetched into gitignored `third_party/engine-binary/` via:

```bash
npm run fetch-engine-binary
```

MIT covers **our** source only. The pinned engine binary carries its own license terms — see [DEPENDENCIES.md](./DEPENDENCIES.md).

## Engine path (pinned resolution order)

1. `EngineStartConfig.enginePath`
2. `NCB_ENGINE_PATH` (bring-your-own binary)
3. Bundled binary at `third_party/engine-binary/engine` (from `npm run fetch-engine-binary`)
4. **System engine binary — only if** `NCB_ALLOW_SYSTEM_ENGINE=1` (or `true`):
   - Opt-in allowlist from [`config/engine-linux.json`](../config/engine-linux.json) `searchPathsB64`
   - `PATH` via allowlisted names in `whichNamesB64`

If none of the above resolve, the host throws a clear error pointing at `npm run fetch-engine-binary` or `NCB_ENGINE_PATH`.

### Fetch pinned engine binary

```bash
npm run fetch-engine-binary
# → third_party/engine-binary/engine  (gitignored)
```

Idempotent when the version marker matches the pin (`153.0.8010.52` Stable linux64).

### Bring-your-own

```bash
export NCB_ENGINE_PATH=/path/to/engine-binary
```

### Opt-in system engine

```bash
export NCB_ALLOW_SYSTEM_ENGINE=1
```

Use only when you intentionally want a host OS browser binary. This is **off by default**.

## NCB product window + content

Interactive `npm start` launches one engine process and two targets:

| Target | Role |
|--------|------|
| NCB window | Navigates to `http://127.0.0.1:<port>/` — **our** product UI (title NCB): tabs, address, nav, save-nothing. |
| Content | Page surface in a normal or ephemeral `BrowserContext`. **Duplicate** adds another tab in that same context. |

Prefer **app-style / reduced browser UI** for the content surface when practical (e.g. host may pass `--new-window` / future `--app=` style flags via `extraArgs`). Do **not** present a system browser as the product brand.

Headless (`NCB_HEADLESS=1`) skips the NCB window entirely. `NCB_UI=0` (legacy `NCB_SHELL=0`) skips the window but keeps the content target + DevEx CLI.

## Sandbox flags

Applied automatically on Linux:

| Flag | When |
|------|------|
| `--disable-dev-shm-usage` | Always (avoids tiny `/dev/shm` crashes) |
| `--no-sandbox` | `NCB_ENGINE_NO_SANDBOX=1`, `config.linuxNoSandbox`, running as root, or container markers (`/.dockerenv`, cgroup docker/kubepods/containerd) |

Prefer a real sandbox on a normal desktop user session. Extra flags still go through `extraArgs` / `NCB_ENGINE_EXTRA_ARGS` (space-separated).

## Minimal OS glue

- Ephemeral profile: temp dir under `os.tmpdir()` (default)
- Persistent profile: `NCB_USER_DATA_DIR` or `config.userDataDir` (XDG-friendly if you set e.g. `$XDG_CACHE_HOME/no-cache-browser/engine`)
- Debugging port: ephemeral free port unless `debuggingPort` is set
- Save-nothing mode: separate CDP BrowserContext (disposed on toggle OFF / close) — not the same as the process user-data-dir

## Downloads

No download manager UI. Engine-handled downloads continue after a content tab closes while the NCB process remains open; quitting NCB stops them.

## Out of scope (this slice)

Full Windows fetch/install (see [WINDOWS.md](./WINDOWS.md) stub), Mac (out), installer packaging polish, mid-session storage wipe, deep bfcache, element inspector, download manager.
