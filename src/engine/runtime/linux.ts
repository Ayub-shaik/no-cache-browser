import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { EngineStartConfig } from "../types.js";

function decodeB64(s: string): string {
  return Buffer.from(s, "base64").toString("utf8");
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function which(bin: string): string | null {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return null;
}

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

/**
 * System engine binary is used only when opted in.
 * Default is pinned/bundled engine binary — not the host OS browser.
 */
export function systemEngineAllowed(): boolean {
  return envTruthy("NCB_ALLOW_SYSTEM_ENGINE");
}

interface EnginePin {
  searchPathsB64?: string[];
  whichNamesB64?: string[];
}

function loadPin(): EnginePin | null {
  const candidates = [
    join(process.cwd(), "config", "engine-linux.json"),
    join(process.cwd(), "..", "config", "engine-linux.json"),
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

/** Bundled engine binary path (gitignored third_party; populate via npm run fetch-engine-binary). */
export function bundledEnginePath(): string {
  return join(process.cwd(), "third_party", "engine-binary", "engine");
}

function engineNotFoundError(): Error {
  return new Error(
    [
      "Engine binary not found for No Cache Browser.",
      "Default resolve does not use a system browser binary.",
      "Fix one of:",
      "  1) npm run fetch-engine-binary   # installs pinned binary into third_party/engine-binary/",
      "  2) export NCB_ENGINE_PATH=/path/to/engine-binary  # bring-your-own binary",
      "  3) pass EngineStartConfig.enginePath",
      "Opt-in only: NCB_ALLOW_SYSTEM_ENGINE=1 to search system engine paths.",
      "See docs/LINUX.md.",
    ].join("\n"),
  );
}

/**
 * Resolve engine binary for Linux.
 *
 * Order (default — system NOT used):
 * 1. EngineStartConfig.enginePath
 * 2. NCB_ENGINE_PATH
 * 3. Bundled third_party/engine-binary/engine
 * 4. System paths / PATH — only if NCB_ALLOW_SYSTEM_ENGINE=1|true
 *
 * See docs/LINUX.md.
 */
export function resolveLinuxEnginePath(config?: EngineStartConfig): string {
  const fromConfig = config?.enginePath?.trim();
  if (fromConfig) {
    if (!isExecutable(fromConfig)) {
      throw new Error(`Engine binary not executable at ${fromConfig}`);
    }
    return fromConfig;
  }

  const fromEnv = process.env.NCB_ENGINE_PATH?.trim();
  if (fromEnv) {
    if (!isExecutable(fromEnv)) {
      throw new Error(`Engine binary not executable at ${fromEnv}`);
    }
    return fromEnv;
  }

  const bundled = bundledEnginePath();
  if (isExecutable(bundled)) return bundled;

  if (!systemEngineAllowed()) {
    throw engineNotFoundError();
  }

  const pin = loadPin();
  for (const enc of pin?.searchPathsB64 ?? []) {
    const candidate = decodeB64(enc);
    if (isExecutable(candidate)) return candidate;
  }

  for (const enc of pin?.whichNamesB64 ?? []) {
    const name = decodeB64(enc);
    const found = which(name);
    if (found && isExecutable(found)) return found;
  }

  throw engineNotFoundError();
}

function looksLikeContainer(): boolean {
  if (existsSync("/.dockerenv")) return true;
  try {
    const cgroup = readFileSync("/proc/1/cgroup", "utf8");
    return /docker|kubepods|containerd|podman/i.test(cgroup);
  } catch {
    return false;
  }
}

export function shouldDisableLinuxSandbox(config?: EngineStartConfig): boolean {
  if (config?.linuxNoSandbox === true) return true;
  const env = process.env.NCB_ENGINE_NO_SANDBOX?.trim();
  if (env === "1" || env?.toLowerCase() === "true") return true;
  if (typeof process.getuid === "function" && process.getuid() === 0) return true;
  if (looksLikeContainer()) return true;
  return false;
}

/** Default Linux engine launch flags for reliable launch (not packaging polish). */
export function linuxLaunchFlags(config?: EngineStartConfig): string[] {
  const flags = ["--disable-dev-shm-usage"];
  if (shouldDisableLinuxSandbox(config)) {
    flags.push("--no-sandbox");
  }
  const fromEnv = process.env.NCB_ENGINE_EXTRA_ARGS?.trim();
  if (fromEnv) {
    flags.push(...fromEnv.split(/\s+/).filter(Boolean));
  }
  return flags;
}

export function resolveUserDataDir(
  config?: EngineStartConfig,
): { userDataDir: string; ephemeral: boolean } | { fromConfig: true } {
  const fromConfig = config?.userDataDir?.trim() || process.env.NCB_USER_DATA_DIR?.trim();
  if (fromConfig) {
    return { userDataDir: fromConfig, ephemeral: false };
  }
  return { fromConfig: true };
}
