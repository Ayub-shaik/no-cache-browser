import { createEngine } from "../engine/index.js";

function usage(): never {
  console.error(`Usage:
  NCB_CHROMIUM_PATH=/usr/bin/chromium npm start -- [url]

Env:
  NCB_CHROMIUM_PATH   Absolute path to Chromium/Chrome (required)
  NCB_HEADLESS=1      Run headless (optional)
`);
  process.exit(2);
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  if (process.argv.includes("-h") || process.argv.includes("--help")) usage();

  const engine = createEngine();
  const headless = process.env.NCB_HEADLESS === "1" || process.env.NCB_HEADLESS === "true";

  try {
    await engine.start({ headless });
    const info = engine.chromiumInfo();
    console.log(`Chromium: ${info.version}`);
    console.log(`Executable: ${info.executablePath}`);

    const session = await engine.createBrowserContext();
    const tab = await session.createTab("about:blank");
    await tab.navigate(url);
    console.log(`Navigated tab ${tab.id} → ${url}`);

    if (headless) {
      await tab.close();
      await session.close();
      await engine.stop();
      return;
    }

    console.log("Running (Ctrl+C to quit)…");
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await tab.close().catch(() => undefined);
        await session.close().catch(() => undefined);
        await engine.stop().catch(() => undefined);
        resolve();
      };
      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    await engine.stop().catch(() => undefined);
    process.exit(1);
  }
}

void main();
