import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineStartConfig } from "../types.js";

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

/**
 * System engine binary is used only when opted in.
 * Default is pinned/bundled engine binary — not the host OS browser.
 */
export function systemEngineAllowedWindows(): boolean {
  return envTruthy("NCB_ALLOW_SYSTEM_ENGINE");
}

interface EnginePin {
  searchPathsB64?: string[];
  whichNamesB64?: string[];
}

function loadPin(): EnginePin | null {
  const candidates = [
    join(process.cwd(), "config", "engine-windows.json"),
    join(process.cwd(), "..", "config", "engine-windows.json"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as EnginePin;
    } catch {
      /* ignore bad pin file */
    }
  }
  return null;
}

/** Bundled Windows engine binary path (gitignored; fetch script TBD). */
export function bundledWindowsEnginePath(): string {
  return join(process.cwd(), "third_party", "engine-binary", "engine.exe");
}

function engineNotFoundError(): Error {
  return new Error(
    [
      "Engine binary not found for No Cache Browser (Windows).",
      "Default resolve does not use a system browser binary.",
      "Fix one of:",
      "  1) Place pinned binary at third_party/engine-binary/engine.exe (fetch script TBD)",
      "  2) export NCB_ENGINE_PATH=/path/to/engine.exe",
      "  3) pass EngineStartConfig.enginePath",
      "Opt-in only: NCB_ALLOW_SYSTEM_ENGINE=1 to search system engine paths.",
      "See docs/WINDOWS.md.",
    ].join("\n"),
  );
}

/**
 * Resolve engine binary for Windows (stub — same order as Linux).
 *
 * Order (default — system NOT used):
 * 1. EngineStartConfig.enginePath
 * 2. NCB_ENGINE_PATH
 * 3. Bundled third_party/engine-binary/engine.exe
 * 4. System paths — only if NCB_ALLOW_SYSTEM_ENGINE=1|true
 *
 * See docs/WINDOWS.md. Full pin fetch / process lifecycle lands in later BE commits.
 */
export function resolveWindowsEnginePath(config?: EngineStartConfig): string {
  const fromConfig = config?.enginePath?.trim();
  if (fromConfig) {
    if (!isExecutable(fromConfig)) {
      throw new Error(`Engine binary not found at ${fromConfig}`);
    }
    return fromConfig;
  }

  const fromEnv = process.env.NCB_ENGINE_PATH?.trim();
  if (fromEnv) {
    if (!isExecutable(fromEnv)) {
      throw new Error(`Engine binary not found at ${fromEnv}`);
    }
    return fromEnv;
  }

  const bundled = bundledWindowsEnginePath();
  if (isExecutable(bundled)) return bundled;

  if (!systemEngineAllowedWindows()) {
    throw engineNotFoundError();
  }

  const pin = loadPin();
  for (const enc of pin?.searchPathsB64 ?? []) {
    const candidate = Buffer.from(enc, "base64").toString("utf8");
    if (isExecutable(candidate)) return candidate;
  }

  throw engineNotFoundError();
}
