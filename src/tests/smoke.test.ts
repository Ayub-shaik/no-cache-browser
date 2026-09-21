import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { accessSync, constants } from "node:fs";
import { createEngine } from "../engine/index.js";
import type { ConsoleEvent, NetworkEvent } from "../engine/index.js";

function resolveChromiumForTest(): string | null {
  const fromEnv = process.env.NCB_CHROMIUM_PATH?.trim();
  if (fromEnv) {
    try {
      accessSync(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      return null;
    }
  }
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const c of candidates) {
    try {
      accessSync(c, constants.X_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    const r = spawnSync("which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

const chromiumPath = resolveChromiumForTest();

test(
  "Engine start → Session → Tab.navigate (Linux smoke)",
  { skip: chromiumPath ? false : "Chromium not found; set NCB_CHROMIUM_PATH" },
  async () => {
    const engine = createEngine();
    await engine.start({
      chromiumPath: chromiumPath!,
      headless: true,
      extraArgs: ["--no-sandbox", "--disable-gpu"],
    });
    try {
      const info = engine.chromiumInfo();
      assert.ok(info.version.length > 0);
      assert.equal(info.executablePath, chromiumPath);

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
