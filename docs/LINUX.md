# Linux launch (MVP packaging slice)

Owner: Browser Engineer

## Chromium path (pinned resolution order)

1. `EngineStartConfig.chromiumPath`
2. `NCB_CHROMIUM_PATH`
3. Bundled binary at `third_party/chromium/chrome` (gitignored; not shipped in-repo yet)
4. Well-known Linux paths in [`config/chromium-linux.json`](../config/chromium-linux.json)
5. `PATH` via `which chromium` / `chromium-browser` / `google-chrome`

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

## Out of scope (this slice)

Windows/macOS launch, installer packaging polish, downloading Chromium into `third_party/` automatically.
