# Windows launch (MVP packaging slice)

Owner: Browser Engineer

## Platforms

Product targets: **Linux + Windows**. Mac is out.

## Engine binary dependency (not a system browser)

No Cache Browser is a host over CDP. It does **not** ship a vendor browser as the product, and it does **not** default to whatever browser binary is installed on the system.

The default engine binary is a **pinned Windows (win64) build** declared in [`config/engine-windows.json`](../config/engine-windows.json) and fetched into gitignored `third_party/engine-binary/` via:

```bash
npm run fetch-engine-binary:windows
```

MIT covers **our** source only. The pinned engine binary carries its own license terms — see [DEPENDENCIES.md](./DEPENDENCIES.md).

Resolve helper: `src/engine/runtime/windows.ts` → `resolveWindowsEnginePath`  
Process lifecycle: `src/engine/runtime/process.ts` selects Windows resolve + launch flags when `process.platform === "win32"`.

## Engine path (pinned resolution order)

1. `EngineStartConfig.enginePath`
2. `NCB_ENGINE_PATH` (bring-your-own binary)
3. Bundled binary at `third_party/engine-binary/engine.exe` (from `npm run fetch-engine-binary:windows`)
4. **System engine binary — only if** `NCB_ALLOW_SYSTEM_ENGINE=1` (or `true`):
   - Opt-in allowlist from [`config/engine-windows.json`](../config/engine-windows.json) `searchPathsB64` (empty by default; populate only when intentionally opting in)

If none of the above resolve, the host throws a clear error pointing at `npm run fetch-engine-binary:windows` or `NCB_ENGINE_PATH`.

### Fetch pinned engine binary

```bash
npm run fetch-engine-binary:windows
# → third_party/engine-binary/engine.exe  (gitignored)
```

Idempotent when the version marker matches the pin (`153.0.8010.52` Stable win64).

On Windows the script uses PowerShell `Expand-Archive`. On Linux (CI packing) it uses `unzip`. Upstream zip metadata stays base64 in the pin file.

### Bring-your-own

```bash
set NCB_ENGINE_PATH=C:\path\to\engine.exe
```

### Opt-in system engine

```bash
set NCB_ALLOW_SYSTEM_ENGINE=1
```

Use only when you intentionally want a host OS browser binary. This is **off by default**.

## NCB product window + content

Interactive `npm start` launches one engine process and two targets (same as Linux):

| Target | Role |
|--------|------|
| NCB window | Navigates to `http://127.0.0.1:<port>/` — **our** product UI (title NCB): tabs, address, nav, save-nothing. |
| Content | Page surface in a normal or ephemeral `BrowserContext`. **Duplicate** adds another tab in that same context. |

Headless (`NCB_HEADLESS=1`) skips the NCB window entirely. `NCB_UI=0` (legacy `NCB_SHELL=0`) skips the window but keeps the content target + DevEx CLI.

## Launch flags (Windows)

Windows does **not** apply Linux sandbox / shm flags (`--no-sandbox`, `--disable-dev-shm-usage`). Shared CDP/debug args still apply (`--remote-debugging-port`, `--user-data-dir`, `--no-first-run`, etc.). Extra flags go through `extraArgs` / `NCB_ENGINE_EXTRA_ARGS` (space-separated) via `windowsLaunchFlags`.

## Process lifecycle

| Concern | Behavior |
|---------|----------|
| Install / pin fetch | `npm run fetch-engine-binary:windows` → `third_party/engine-binary/engine.exe` + `.ncb-engine-version` |
| Launch | `launchEngineBinary` resolves via `resolveWindowsEnginePath`, spawns with Windows flags (`windowsHide`), waits for DevTools `/json/version` |
| Quit | `stopEngineBinary` sends terminate, force-kills after 3s if needed, deletes ephemeral user-data-dir |
| Downloads | Continue after tab close while process runs; quit stops them |

DevEx attach (CDP WebSocket from `/json/version`) is unchanged across platforms.

## Minimal OS glue

- Ephemeral profile: temp dir under `os.tmpdir()` (default)
- Persistent profile: `NCB_USER_DATA_DIR` or `config.userDataDir`
- Debugging port: ephemeral free port unless `debuggingPort` is set
- Save-nothing mode: separate CDP BrowserContext (disposed on toggle OFF / close) — not the same as the process user-data-dir

## Out of scope (this slice)

MSI/installer polish, Mac (out), mid-session storage wipe, deep bfcache, element inspector, download manager UI.
