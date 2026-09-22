import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { accessSync, constants, readdirSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEngine } from "../engine/index.js";
import { SessionBuffer, attachDevExPanel } from "../devex/index.js";

function resolveEngineBinaryForTest(): string | null {
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

const enginePath = resolveEngineBinaryForTest();

test(
  "headless one-shot writes ncb-session.json with schema + network",
  { skip: enginePath ? false : "engine binary not found; set pinned-binary env (see docs/LINUX.md)" },
  async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), "ncb-export-"));
    const engine = createEngine();
    await engine.start({
      chromiumPath: enginePath!,
      headless: true,
      extraArgs: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    try {
      const info = engine.chromiumInfo();
      const session = await engine.createBrowserContext();
      const tab = await session.createTab("about:blank");
      const buffer = new SessionBuffer();
      buffer.setMeta({
        engine: { version: info.version },
        tab: {
          id: tab.id,
          url: "https://example.com",
          title: "example",
          noCacheEnabled: false,
        },
        appVersion: "0.1.0",
      });
      const panel = attachDevExPanel({
        tab,
        buffer,
        exportDir,
        getPageUrl: () => "https://example.com",
        getPageTitle: () => "example",
        liveLog: false,
        interactive: false,
      });
      await tab.navigate("https://example.com");
      // brief settle for network events
      await new Promise((r) => setTimeout(r, 500));
      const file = await panel.exportSession();
      panel.stop();
      await tab.close();
      await session.close();

      assert.ok(file.endsWith(".ncb-session.json"));
      const json = JSON.parse(readFileSync(file, "utf8")) as {
        schemaVersion: number;
        tab: { noCacheEnabled: boolean };
        console: unknown[];
        har: { entries?: unknown[] };
      };
      assert.equal(json.schemaVersion, 1);
      assert.equal(typeof json.tab.noCacheEnabled, "boolean");
      assert.ok(Array.isArray(json.console));
      assert.ok(Array.isArray(json.har.entries));
      assert.ok((json.har.entries?.length ?? 0) >= 1);
      assert.ok(readdirSync(exportDir).some((n) => n.endsWith(".ncb-session.json")));
    } finally {
      await engine.stop();
    }
  },
);
