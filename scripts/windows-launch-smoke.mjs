#!/usr/bin/env node
/**
 * Windows launch smoke for GitHub Actions (windows-latest).
 * Lead checklist (automated / CDP path):
 *   1) pinned engine present (fetch done by workflow)
 *   2) launch NCB engine (headless)
 *   3) open a page via CDP/host APIs
 *   4) DevEx attach (console / network / export) responds
 *
 * GUI DevEx dock click is NOT exercised on GHA (no interactive desktop session).
 * Verdict lines: PASS / FAIL / PARTIAL
 */
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const line = detail ? `${status}: ${name} — ${detail}` : `${status}: ${name}`;
  console.log(line);
}

function failHard(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function bundledEngine() {
  return join(ROOT, "third_party", "engine-binary", "engine.exe");
}

function portFromWsUrl(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return Number(u.port) || (u.protocol === "wss:" ? 443 : 80);
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== NCB Windows launch smoke ===");
  console.log(`cwd=${process.cwd()}`);
  console.log(`platform=${process.platform} arch=${process.arch} node=${process.version}`);

  if (process.platform !== "win32") {
    record("platform-win32", "PARTIAL", `running on ${process.platform}; intended for windows-latest`);
  } else {
    record("platform-win32", "PASS", process.platform);
  }

  const enginePath = process.env.NCB_ENGINE_PATH?.trim() || bundledEngine();
  try {
    accessSync(enginePath, constants.F_OK);
    record("fetch-engine-binary", "PASS", enginePath);
  } catch {
    record("fetch-engine-binary", "FAIL", `missing ${enginePath}`);
    printSummary();
    process.exit(1);
  }

  const distEngine = join(ROOT, "dist", "engine", "index.js");
  const distDevex = join(ROOT, "dist", "devex", "index.js");
  if (!existsSync(distEngine) || !existsSync(distDevex)) {
    failHard("dist/ missing — run npm run build first");
  }

  const { createEngine } = await import(pathToFileURL(distEngine).href);
  const { SessionBuffer, attachDevExPanel } = await import(pathToFileURL(distDevex).href);

  const exportDir = mkdtempSync(join(tmpdir(), "ncb-win-smoke-"));
  const engine = createEngine();
  let debuggingPort = null;

  try {
    await engine.start({
      enginePath,
      headless: true,
      extraArgs: ["--disable-gpu", "--disable-software-rasterizer"],
    });
    const info = engine.engineBinaryInfo();
    if (!info.webSocketDebuggerUrl || !info.version) {
      record("launch-engine", "FAIL", "missing version or webSocketDebuggerUrl");
      printSummary();
      process.exit(1);
    }
    record(
      "launch-engine",
      "PASS",
      `version=${info.version} exe=${info.executablePath}`,
    );

    debuggingPort = portFromWsUrl(info.webSocketDebuggerUrl);
    if (!debuggingPort) {
      record("cdp-json-version", "FAIL", "could not parse port from webSocketDebuggerUrl");
    } else {
      const res = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
      if (!res.ok) {
        record("cdp-json-version", "FAIL", `HTTP ${res.status}`);
      } else {
        const body = await res.json();
        if (body.webSocketDebuggerUrl && body.Browser) {
          record(
            "cdp-json-version",
            "PASS",
            `port=${debuggingPort} Browser=${body.Browser}`,
          );
        } else {
          record("cdp-json-version", "FAIL", "missing Browser or webSocketDebuggerUrl fields");
        }
      }
    }

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
      getPageTitle: () => "Example Domain",
      liveLog: false,
      interactive: false,
    });

    await tab.navigate("https://example.com");
    // Allow network sinks to settle
    await new Promise((r) => setTimeout(r, 1500));

    const network = buffer.getNetworkSummary();
    const consoleEntries = buffer.getConsoleEntries();
    if (network.length >= 1) {
      record(
        "open-page",
        "PASS",
        `navigated example.com; networkRows=${network.length} consoleRows=${consoleEntries.length}`,
      );
    } else {
      record(
        "open-page",
        "FAIL",
        `no network events after navigate (console=${consoleEntries.length})`,
      );
    }

    // DevEx surface: console buffer + network + export APIs (dock GUI not available on GHA)
    let exportOk = false;
    let harOk = false;
    let sessionFile = "";
    let harFile = "";
    try {
      sessionFile = await panel.exportSession();
      const json = JSON.parse(readFileSync(sessionFile, "utf8"));
      exportOk =
        json.schemaVersion === 1 &&
        typeof json.engine?.version === "string" &&
        Array.isArray(json.console) &&
        Array.isArray(json.har?.entries) &&
        (json.har.entries?.length ?? 0) >= 1;
    } catch (err) {
      record("devex-export-session", "FAIL", String(err));
    }
    if (exportOk) {
      record("devex-export-session", "PASS", sessionFile);
    } else if (!results.some((r) => r.name === "devex-export-session")) {
      record("devex-export-session", "FAIL", "schema/network assertions failed");
    }

    try {
      harFile = await panel.exportHar();
      const har = JSON.parse(readFileSync(harFile, "utf8"));
      harOk = Array.isArray(har.log?.entries) && har.log.entries.length >= 1;
    } catch (err) {
      record("devex-export-har", "FAIL", String(err));
    }
    if (harOk) {
      record("devex-export-har", "PASS", harFile);
    } else if (!results.some((r) => r.name === "devex-export-har")) {
      record("devex-export-har", "FAIL", "HAR entries missing");
    }

    const networkApiOk = network.length >= 1;
    const consoleApiOk = Array.isArray(consoleEntries);
    if (networkApiOk && consoleApiOk && exportOk && harOk) {
      record(
        "devex-attach-apis",
        "PASS",
        "console/network buffers + exportSession + exportHar",
      );
    } else {
      record(
        "devex-attach-apis",
        "FAIL",
        `networkApi=${networkApiOk} consoleApi=${consoleApiOk} export=${exportOk} har=${harOk}`,
      );
    }

    record(
      "devex-gui-dock",
      "PARTIAL",
      "GHA windows-latest has no interactive GUI session; dock click not exercised. Equivalent CDP/DevEx attach APIs verified above.",
    );

    // Optional: also exercise headless host one-shot path briefly via env note
    const files = readdirSync(exportDir);
    console.log(`exportDir files: ${files.join(", ") || "(none)"}`);

    panel.stop();
    await tab.close().catch(() => undefined);
    await session.close().catch(() => undefined);
  } finally {
    await engine.stop().catch(() => undefined);
  }

  const code = printSummary();
  process.exit(code);
}

function printSummary() {
  const fail = results.filter((r) => r.status === "FAIL").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  const partial = results.filter((r) => r.status === "PARTIAL").length;
  console.log("=== SUMMARY ===");
  console.log(`PASS=${pass} FAIL=${fail} PARTIAL=${partial}`);
  for (const r of results) {
    console.log(`  [${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  if (fail > 0) {
    console.log("VERDICT: FAIL");
    return 1;
  }
  if (partial > 0) {
    console.log("VERDICT: PARTIAL (automated Lead checks passed; GUI dock limited on GHA)");
    return 0;
  }
  console.log("VERDICT: PASS");
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
