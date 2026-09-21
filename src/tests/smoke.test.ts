import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { accessSync, constants } from "node:fs";
import { createEngine } from "../engine/index.js";

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
      await tab.navigate("https://example.com");
      await tab.reload(true);
      await tab.close();
      await session.close();
    } finally {
      await engine.stop();
    }
  },
);
