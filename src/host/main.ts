import { createEngine } from "../engine/index.js";
import { SessionBuffer, attachDevExPanel } from "../devex/index.js";

function usage(): never {
  console.error(`Usage:
  NCB_CHROMIUM_PATH=/usr/bin/chromium npm start -- [url]

Env:
  NCB_CHROMIUM_PATH   Absolute path to Chromium/Chrome (required)
  NCB_HEADLESS=1      Run headless (optional; auto-exports session then exits)
  NCB_EXPORT_DIR      Export directory (default: ./exports)
`);
  process.exit(2);
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  if (process.argv.includes("-h") || process.argv.includes("--help")) usage();

  const engine = createEngine();
  const headless = process.env.NCB_HEADLESS === "1" || process.env.NCB_HEADLESS === "true";
  let pageUrl = url;

  try {
    await engine.start({ headless });
    const info = engine.chromiumInfo();
    console.log(`Chromium: ${info.version}`);
    console.log(`Executable: ${info.executablePath}`);

    const session = await engine.createBrowserContext();
    const tab = await session.createTab("about:blank");

    const buffer = new SessionBuffer();
    buffer.setMeta({
      chromium: { version: info.version },
      tab: {
        id: tab.id,
        url: pageUrl,
        title: pageUrl,
        noCacheEnabled: tab.noCacheEnabled,
      },
      appVersion: "0.1.0",
    });

    const panel = attachDevExPanel({
      tab,
      buffer,
      exportDir: process.env.NCB_EXPORT_DIR,
      getPageUrl: () => pageUrl,
      getPageTitle: () => pageUrl,
      liveLog: true,
      interactive: !headless,
    });

    await tab.navigate(url);
    pageUrl = url;
    console.log(`Navigated tab ${tab.id} → ${url}`);

    if (headless) {
      const file = await panel.exportSession();
      console.log(`Headless export: ${file}`);
      panel.stop();
      await tab.close();
      await session.close();
      await engine.stop();
      return;
    }

    console.log("Running (DevEx panel on stdin; Ctrl+C to quit)…");
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off("SIGINT", onSig);
        process.off("SIGTERM", onSig);
        panel.stop();
        await tab.close().catch(() => undefined);
        await session.close().catch(() => undefined);
        await engine.stop().catch(() => undefined);
        resolve();
      };
      const onSig = () => void shutdown();
      process.on("SIGINT", onSig);
      process.on("SIGTERM", onSig);
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    await engine.stop().catch(() => undefined);
    process.exit(1);
  }
}

void main();
