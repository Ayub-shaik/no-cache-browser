# Windows launch (packaging stub)

Owner: Browser Engineer

Status: **stub** — pin shape + resolve order match Linux. Fetch script, install/launch glue, and process lifecycle land in later Step-1 (B) commits. Do not treat this as a full Windows ship.

## Platforms

Product targets: **Linux + Windows**. Mac is out.

## Engine binary dependency (not a system browser)

Same product rule as Linux: No Cache Browser does **not** default to whatever browser binary is installed on the system. Default is a **pinned** engine binary.

Pin file: [`config/engine-windows.json`](../config/engine-windows.json)  
Resolve helper: `src/engine/runtime/windows.ts` → `resolveWindowsEnginePath`

## Engine path (pinned resolution order)

1. `EngineStartConfig.enginePath`
2. `NCB_ENGINE_PATH` (bring-your-own binary)
3. Bundled binary at `third_party/engine-binary/engine.exe` (fetch script TBD)
4. **System engine binary — only if** `NCB_ALLOW_SYSTEM_ENGINE=1` (or `true`):
   - Opt-in allowlist from `config/engine-windows.json` `searchPathsB64` (populated when fetch lands)

If none resolve, the host throws a clear error pointing at `NCB_ENGINE_PATH` or the future fetch script. See Linux twin: [LINUX.md](./LINUX.md).

### Bring-your-own

```bash
set NCB_ENGINE_PATH=C:\path\to\engine.exe
```

### Opt-in system engine

```bash
set NCB_ALLOW_SYSTEM_ENGINE=1
```

Off by default.

## Process lifecycle (planned — not implemented in this stub)

| Concern | Intent |
|---------|--------|
| Install / pin fetch | Script parallel to `npm run fetch-engine-binary` (Linux) |
| Launch | Spawn pinned `engine.exe` with debugging port; host owns child lifecycle |
| Quit | Host stop closes content sessions then engine process |
| Downloads | Continue after tab close while process runs; quit stops them |

## NCB product window

Interactive path uses the same host UI module as Linux (`src/host/ui/`): tab strip, address bar, nav, Duplicate, save-nothing toggle. Windows OS window glue (shortcuts, installer) is later.

## Out of scope (this stub)

Full binary fetch, MSI/installer polish, Mac, mid-session storage wipe, element inspector, external log shippers.
