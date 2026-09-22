import { strict as assert } from "node:assert";
import { accessSync, constants, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createEngine } from "../engine/index.js";
import { SessionBuffer, attachDevExPanel } from "../devex/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveEngineBinaryForTest(): string | undefined {
  const fromEnv = process.env.NCB_ENGINE_PATH?.trim();
  if (fromEnv) {
    try {
      accessSync(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      return undefined;
    }
  }
  const bundled = path.join(repoRoot, "third_party/engine-binary/engine");
  try {
    accessSync(bundled, constants.X_OK);
    return bundled;
  } catch {
    return undefined;
  }
}

const enginePath = resolveEngineBinaryForTest();
const allowSystem = process.env.NCB_ALLOW_SYSTEM_ENGINE === "1" || process.env.NCB_ALLOW_SYSTEM_ENGINE === "true";
const canRun = Boolean(enginePath) || allowSystem;

test(
  "headless one-shot writes ncb-session.json with schema + network",
  {
    skip: canRun
      ? false
      : "engine binary not found; set NCB_ENGINE_PATH, run npm run fetch-engine-binary, or NCB_ALLOW_SYSTEM_ENGINE=1",
  },
  async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), "ncb-export-"));
    const engine = createEngine();
    await engine.start({
      enginePath,
      headless: true,
      linuxNoSandbox: true,
      extraArgs: ["--disable-gpu", "--disable-dev-shm-usage"],
    });
    try {
      const info = engine.engineBinaryInfo();
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
      await new Promise((r) => setTimeout(r, 500));
      const file = await panel.exportSession();
      panel.stop();
      await tab.close();
      await session.close();

      assert.ok(file.endsWith(".ncb-session.json"));
      const json = JSON.parse(readFileSync(file, "utf8")) as {
        schemaVersion: number;
        tab: { noCacheEnabled: boolean };
        engine: { version: string };
        console: unknown[];
        har: { entries?: unknown[] };
      };
      assert.equal(json.schemaVersion, 1);
      assert.equal(typeof json.tab.noCacheEnabled, "boolean");
      assert.ok(json.engine.version.length > 0);
      assert.ok(Array.isArray(json.console));
      assert.ok(Array.isArray(json.har.entries));
      assert.ok((json.har.entries?.length ?? 0) >= 1);
      assert.ok(readdirSync(exportDir).some((n) => n.endsWith(".ncb-session.json")));
    } finally {
      await engine.stop();
    }
  },
);
