# Linux launch (MVP packaging slice)

Owner: Browser Engineer

## Chromium dependency (not Google Chrome)

No Cache Browser is a thin host over CDP. It does **not** ship Google Chrome as the product, and it does **not** default to whatever Chrome/Chromium is installed on the system.

The default engine binary is a **pinned Chrome-for-Testing (Chromium) Linux build** declared in [`config/chromium-linux.json`](../config/chromium-linux.json) and fetched into gitignored `third_party/chromium/` via:

```bash
npm run fetch-chromium
```

MIT covers **our** source only. Chromium/CfT carries its own license terms — see [DEPENDENCIES.md](./DEPENDENCIES.md).

## Chromium path (pinned resolution order)

1. `EngineStartConfig.chromiumPath`
2. `NCB_CHROMIUM_PATH` (bring-your-own binary)
3. Bundled binary at `third_party/chromium/chrome` (from `npm run fetch-chromium`)
4. **System Chromium/Chrome — only if** `NCB_ALLOW_SYSTEM_CHROMIUM=1` (or `true`):
   - Well-known paths in [`config/chromium-linux.json`](../config/chromium-linux.json) `searchPaths` (Chromium-oriented allowlist)
   - `PATH` via `which chromium` / `chromium-browser` / `google-chrome*`

If none of the above resolve, the host throws a clear error pointing at `npm run fetch-chromium` or `NCB_CHROMIUM_PATH`.

### Fetch pinned Chromium

```bash
npm run fetch-chromium
# → third_party/chromium/chrome  (gitignored)
```

Idempotent when the version marker matches the pin (`153.0.8010.52` Stable CfT linux64).

### Bring-your-own

```bash
export NCB_CHROMIUM_PATH=/path/to/chrome   # or chromium
```

### Opt-in system Chromium

```bash
export NCB_ALLOW_SYSTEM_CHROMIUM=1
```

Use only when you intentionally want the host OS browser. This is **off by default**.

## NCB shell + content windows

Interactive `npm start` launches one Chromium process and two targets:

| Target | Role |
|--------|------|
| Shell | Navigates to `http://127.0.0.1:<port>/` — **our** NCB top chrome (title NCB). Not a Chrome UI clone. |
| Content | Page surface in a normal or ephemeral `BrowserContext`. **Duplicate** adds another tab in that same context. |

Prefer **app-style / reduced browser chrome** for the content surface when practical (e.g. host may pass `--new-window` / future `--app=` style flags via `extraArgs`). Do **not** present system Google Chrome as the product brand.

Headless (`NCB_HEADLESS=1`) skips shell windows entirely. `NCB_SHELL=0` skips shell but keeps the content target + DevEx CLI.

## Sandbox flags

Applied automatically on Linux:

| Flag | When |
|------|------|
| `--disable-dev-shm-usage` | Always (avoids tiny `/dev/shm` crashes) |
| `--no-sandbox` | `NCB_CHROMIUM_NO_SANDBOX=1`, `config.linuxNoSandbox`, running as root, or container markers (`/.dockerenv`, cgroup docker/kubepods/containerd) |

Prefer a real sandbox on a normal desktop user session. Extra flags still go through `extraArgs` / `NCB_CHROMIUM_EXTRA_ARGS` (space-separated).

## Minimal OS glue

- Ephemeral profile: temp dir under `os.tmpdir()` (default)
- Persistent profile: `NCB_USER_DATA_DIR` or `config.userDataDir` (XDG-friendly if you set e.g. `$XDG_CACHE_HOME/no-cache-browser/chromium`)
- Debugging port: ephemeral free port unless `debuggingPort` is set
- Save-nothing mode: separate CDP BrowserContext (disposed on toggle OFF / close) — not the same as the process user-data-dir

## Downloads

No download manager UI. Chromium-handled downloads continue after a content tab closes while the NCB process remains open; quitting NCB stops them.

## Out of scope (this slice)

Windows/macOS launch, installer packaging polish, mid-session storage wipe, deep bfcache, element inspector, download manager.
