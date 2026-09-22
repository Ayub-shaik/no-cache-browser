import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createEngine } from "../engine/index.js";
import type { ConsoleEvent, NetworkEvent } from "../engine/index.js";

function decodeB64(s: string): string {
  return Buffer.from(s, "base64").toString("utf8");
}

function resolveEngineForTest(): string | null {
  const fromEnv = process.env.NCB_ENGINE_PATH?.trim();
  if (fromEnv) {
    try {
      accessSync(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      return null;
    }
  }
  const bundled = join(process.cwd(), "third_party", "engine-binary", "engine");
  try {
    accessSync(bundled, constants.X_OK);
    return bundled;
  } catch {
    /* continue */
  }
  const pinPath = join(process.cwd(), "config", "engine-linux.json");
  if (!existsSync(pinPath)) return null;
  try {
    const pin = JSON.parse(readFileSync(pinPath, "utf8")) as {
      searchPathsB64?: string[];
      whichNamesB64?: string[];
    };
    for (const enc of pin.searchPathsB64 ?? []) {
      const c = decodeB64(enc);
      try {
        accessSync(c, constants.X_OK);
        return c;
      } catch {
        /* next */
      }
    }
    for (const enc of pin.whichNamesB64 ?? []) {
      const name = decodeB64(enc);
      const r = spawnSync("which", [name], { encoding: "utf8" });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  } catch {
    return null;
  }
  return null;
}

const enginePath = resolveEngineForTest();

test(
  "Engine start → Session → Tab.navigate (Linux smoke)",
  { skip: enginePath ? false : "Engine binary not found; set NCB_ENGINE_PATH" },
  async () => {
    const engine = createEngine();
    await engine.start({
      enginePath: enginePath!,
      headless: true,
      extraArgs: ["--no-sandbox", "--disable-gpu"],
    });
    try {
      const info = engine.engineBinaryInfo();
      assert.ok(info.version.length > 0);
      assert.equal(info.executablePath, enginePath);

      const session = await engine.createBrowserContext();
      const tab = await session.createTab();
      const consoleEvents: ConsoleEvent[] = [];
      const networkEvents: NetworkEvent[] = [];
      tab.subscribe({
        onConsole: (e) => consoleEvents.push(e),
        onNetwork: (e) => networkEvents.push(e),
      });

      await tab.navigate("https://example.com");
      assert.equal(tab.noCacheEnabled, false);
      await tab.setNoCache(true);
      assert.equal(tab.noCacheEnabled, true);
      await tab.setNoCache(true); // idempotent
      assert.equal(tab.noCacheEnabled, true);
      await tab.setNoCache(false);
      assert.equal(tab.noCacheEnabled, false);

      assert.ok(networkEvents.some((e) => e.kind === "request"));
      await tab.close();
      await session.close();
    } finally {
      await engine.stop();
    }
  },
);
