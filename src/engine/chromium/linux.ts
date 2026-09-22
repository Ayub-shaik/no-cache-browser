import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { EngineStartConfig } from "../types.js";

/** Opt-in system Chromium/Chrome allowlist (used only when allowed). */
const DEFAULT_SEARCH_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

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
 * System Chromium/Chrome is used only when opted in.
 * Default is pinned/bundled CfT — not the host's Google Chrome install.
 */
export function systemChromiumAllowed(): boolean {
  return envTruthy("NCB_ALLOW_SYSTEM_CHROMIUM");
}

function loadPinSearchPaths(): string[] {
  const candidates = [
    join(process.cwd(), "config", "chromium-linux.json"),
    join(process.cwd(), "..", "config", "chromium-linux.json"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { searchPaths?: string[] };
      if (Array.isArray(raw.searchPaths) && raw.searchPaths.length > 0) {
        return raw.searchPaths;
      }
    } catch {
      /* ignore bad pin file */
    }
  }
  return DEFAULT_SEARCH_PATHS;
}

/** Bundled Chromium path hook (gitignored third_party; populate via npm run fetch-chromium). */
export function bundledChromiumPath(): string {
  return join(process.cwd(), "third_party", "chromium", "chrome");
}

function chromiumNotFoundError(): Error {
  return new Error(
    [
      "Chromium not found for No Cache Browser.",
      "Default resolve does not use system Google Chrome/Chromium.",
      "Fix one of:",
      "  1) npm run fetch-chromium   # installs pinned CfT into third_party/chromium/",
      "  2) export NCB_CHROMIUM_PATH=/path/to/chrome  # bring-your-own binary",
      "  3) pass EngineStartConfig.chromiumPath",
      "Opt-in only: NCB_ALLOW_SYSTEM_CHROMIUM=1 to search system Chromium paths.",
      "See docs/LINUX.md.",
    ].join("\n"),
  );
}

/**
 * Resolve Chromium binary for Linux.
 *
 * Order (default — system NOT used):
 * 1. EngineStartConfig.chromiumPath
 * 2. NCB_CHROMIUM_PATH
 * 3. Bundled third_party/chromium/chrome
 * 4. System paths / PATH — only if NCB_ALLOW_SYSTEM_CHROMIUM=1|true
 *
 * See docs/LINUX.md.
 */
export function resolveLinuxChromiumPath(config?: EngineStartConfig): string {
  const fromConfig = config?.chromiumPath?.trim();
  if (fromConfig) {
    if (!isExecutable(fromConfig)) {
      throw new Error(`Chromium not executable at ${fromConfig}`);
    }
    return fromConfig;
  }

  const fromEnv = process.env.NCB_CHROMIUM_PATH?.trim();
  if (fromEnv) {
    if (!isExecutable(fromEnv)) {
      throw new Error(`Chromium not executable at ${fromEnv}`);
    }
    return fromEnv;
  }

  const bundled = bundledChromiumPath();
  if (isExecutable(bundled)) return bundled;

  if (!systemChromiumAllowed()) {
    throw chromiumNotFoundError();
  }

  for (const candidate of loadPinSearchPaths()) {
    if (isExecutable(candidate)) return candidate;
  }

  for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    const found = which(name);
    if (found && isExecutable(found)) return found;
  }

  throw chromiumNotFoundError();
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
  const env = process.env.NCB_CHROMIUM_NO_SANDBOX?.trim();
  if (env === "1" || env?.toLowerCase() === "true") return true;
  if (typeof process.getuid === "function" && process.getuid() === 0) return true;
  if (looksLikeContainer()) return true;
  return false;
}

/** Default Linux Chromium flags for reliable launch (not packaging polish). */
export function linuxLaunchFlags(config?: EngineStartConfig): string[] {
  const flags = ["--disable-dev-shm-usage"];
  if (shouldDisableLinuxSandbox(config)) {
    flags.push("--no-sandbox");
  }
  const fromEnv = process.env.NCB_CHROMIUM_EXTRA_ARGS?.trim();
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
