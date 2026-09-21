import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineStartConfig } from "../types.js";

export interface LaunchedChromium {
  process: ChildProcessWithoutNullStreams;
  executablePath: string;
  userDataDir: string;
  debuggingPort: number;
  /** True if we created a temp user-data-dir and should delete on stop. */
  ephemeralUserData: boolean;
}

function resolveChromiumPath(config?: EngineStartConfig): string {
  const path =
    config?.chromiumPath?.trim() ||
    process.env.NCB_CHROMIUM_PATH?.trim() ||
    "";
  if (!path) {
    throw new Error(
      "Chromium path not set. Pass chromiumPath or set NCB_CHROMIUM_PATH to a Linux Chromium/Chrome binary.",
    );
  }
  return path;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to allocate debugging port"));
        return;
      }
      const { port } = addr;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitForDebuggerUrl(
  port: number,
  timeoutMs = 20_000,
): Promise<{ webSocketDebuggerUrl: string; browser: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const body = (await res.json()) as {
          webSocketDebuggerUrl?: string;
          Browser?: string;
        };
        if (body.webSocketDebuggerUrl) {
          return {
            webSocketDebuggerUrl: body.webSocketDebuggerUrl,
            browser: body.Browser ?? "unknown",
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Timed out waiting for Chromium DevTools on port ${port}: ${String(lastError)}`,
  );
}

export async function launchChromium(
  config?: EngineStartConfig,
): Promise<LaunchedChromium & { version: string; webSocketDebuggerUrl: string }> {
  const executablePath = resolveChromiumPath(config);
  const debuggingPort =
    config?.debuggingPort && config.debuggingPort > 0
      ? config.debuggingPort
      : await findFreePort();

  let userDataDir = config?.userDataDir;
  let ephemeralUserData = false;
  if (!userDataDir) {
    userDataDir = await mkdtemp(join(tmpdir(), "ncb-chromium-"));
    ephemeralUserData = true;
  }

  const args = [
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--disable-background-networking",
    ...(config?.headless ? ["--headless=new"] : []),
    ...(config?.extraArgs ?? []),
    "about:blank",
  ];

  const child = spawn(executablePath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on("error", (err) => {
    throw new Error(`Failed to spawn Chromium at ${executablePath}: ${err.message}`);
  });

  try {
    const { webSocketDebuggerUrl, browser } = await waitForDebuggerUrl(debuggingPort);
    return {
      process: child,
      executablePath,
      userDataDir,
      debuggingPort,
      ephemeralUserData,
      version: browser,
      webSocketDebuggerUrl,
    };
  } catch (err) {
    child.kill("SIGKILL");
    if (ephemeralUserData) {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
    const detail = stderr.trim() ? ` stderr: ${stderr.trim()}` : "";
    throw new Error(`${String(err)}${detail}`);
  }
}

export async function stopChromium(launched: LaunchedChromium): Promise<void> {
  const { process: child } = launched;
  if (!child.killed) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
        resolve();
      }, 3000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  if (launched.ephemeralUserData) {
    await rm(launched.userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
