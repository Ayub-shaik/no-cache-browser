import { createEngine } from "../engine/index.js";
import { SessionBuffer, attachDevExPanel } from "../devex/index.js";
import { ContentController, startShellServer } from "./shell/index.js";

function usage(): never {
  console.error(`Usage:
  npm start -- [url]

Env:
  NCB_CHROMIUM_PATH            Absolute path to pinned engine binary (or npm run fetch-chromium)
  NCB_HEADLESS=1               Headless: skip NCB shell GUI; still supports setNoCache
  NCB_EXPORT_DIR               Export directory (default: ./exports)
  NCB_ALLOW_SYSTEM_CHROMIUM=1  Opt-in system engine binary (off by default)
  NCB_SHELL=0                  Interactive but skip shell window (content + CLI only)
`);
  process.exit(2);
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  if (process.argv.includes("-h") || process.argv.includes("--help")) usage();

  const engine = createEngine();
  const headless = process.env.NCB_HEADLESS === "1" || process.env.NCB_HEADLESS === "true";
  const shellDisabled =
    headless || process.env.NCB_SHELL === "0" || process.env.NCB_SHELL === "false";

  let shell: Awaited<ReturnType<typeof startShellServer>> | null = null;
  let shellSession: Awaited<ReturnType<typeof engine.createBrowserContext>> | null = null;
  let controller: ContentController | null = null;
  let panel: ReturnType<typeof attachDevExPanel> | null = null;

  try {
    // Prefer a reduced content window frame when interactive.
    const extraArgs = shellDisabled
      ? undefined
      : ["--new-window"];

    await engine.start({ headless, extraArgs });
    const info = engine.chromiumInfo();
    console.log(`Engine: ${info.version}`);
    console.log(`Executable: ${info.executablePath}`);

    const buffer = new SessionBuffer();
    controller = new ContentController({
      engine,
      buffer,
      initialUrl: url,
      engineVersion: info.version,
      appVersion: "0.1.0",
      onTabChanged: (tab) => {
        panel?.retarget(tab);
        shell?.broadcastState();
      },
    });

    const tab = await controller.start(false);

    panel = attachDevExPanel({
      tab,
      buffer,
      exportDir: process.env.NCB_EXPORT_DIR,
      getPageUrl: () => controller!.getPageUrl(),
      getPageTitle: () => controller!.getPageTitle(),
      liveLog: true,
      interactive: !headless,
      setSaveNothing: (enabled) => controller!.setSaveNothing(enabled),
      getNoCacheEnabled: () => controller!.noCacheEnabled(),
    });

    await controller.navigate(url);
    console.log(`Content tab ${tab.id} → ${url}`);

    if (!shellDisabled) {
      shell = await startShellServer({
        getState: () => ({
          url: controller!.getPageUrl(),
          noCacheEnabled: controller!.noCacheEnabled(),
          status: controller!.isSaveNothing()
            ? "Save nothing ON (ephemeral + cache/SW)"
            : "Normal browsing",
        }),
        onNavigate: async (next) => {
          await controller!.navigate(next);
        },
        onToggle: async (enabled) => {
          await controller!.setSaveNothing(enabled);
        },
        onBack: async () => {
          await controller!.back();
        },
        onForward: async () => {
          await controller!.forward();
        },
        onDuplicate: async () => {
          const dup = await controller!.duplicateTab();
          console.log(`Duplicated tab → ${dup.id} (same BrowserContext)`);
        },
      });

      shellSession = await engine.createBrowserContext();
      const shellTab = await shellSession.createTab(shell.url);
      console.log(`NCB shell: ${shell.url} (target ${shellTab.id})`);
      console.log("NCB shell: URL / Go / Back / Forward / Duplicate / No-cache·Save nothing toggle");
    }

    if (headless) {
      const file = await panel.exportSession();
      console.log(`Headless export: ${file}`);
      panel.stop();
      await controller.close();
      await engine.stop();
      return;
    }

    console.log("Running (NCB shell + DevEx stdin; Ctrl+C to quit)…");
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off("SIGINT", onSig);
        process.off("SIGTERM", onSig);
        panel?.stop();
        await shell?.close().catch(() => undefined);
        await shellSession?.close().catch(() => undefined);
        await controller?.close().catch(() => undefined);
        await engine.stop().catch(() => undefined);
        resolve();
      };
      const onSig = () => void shutdown();
      process.on("SIGINT", onSig);
      process.on("SIGTERM", onSig);
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    panel?.stop();
    await shell?.close().catch(() => undefined);
    await shellSession?.close().catch(() => undefined);
    await controller?.close().catch(() => undefined);
    await engine.stop().catch(() => undefined);
    process.exit(1);
  }
}

void main();
