import { createEngine } from "../engine/index.js";
import { SessionBuffer, attachDevExPanel } from "../devex/index.js";
import { ContentController, startHostUiServer } from "./ui/index.js";

function usage(): never {
  console.error(`Usage:
  npm start -- [url]

Env:
  NCB_ENGINE_PATH            Absolute path to engine (or use npm run fetch-engine-binary)
  NCB_HEADLESS=1               Headless: skip NCB product window; still supports setNoCache
  NCB_EXPORT_DIR               Export directory (default: ./exports)
  NCB_ALLOW_SYSTEM_ENGINE=1  Opt-in system engine (off by default)
  NCB_UI=0                     Interactive but skip NCB window (content + DevEx CLI only)
`);
  process.exit(2);
}

function uiDisabled(headless: boolean): boolean {
  if (headless) return true;
  const v = process.env.NCB_UI?.trim() ?? process.env.NCB_SHELL?.trim();
  return v === "0" || v?.toLowerCase() === "false";
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  if (process.argv.includes("-h") || process.argv.includes("--help")) usage();

  const engine = createEngine();
  const headless = process.env.NCB_HEADLESS === "1" || process.env.NCB_HEADLESS === "true";
  const skipUi = uiDisabled(headless);

  let hostUi: Awaited<ReturnType<typeof startHostUiServer>> | null = null;
  let uiSession: Awaited<ReturnType<typeof engine.createBrowserContext>> | null = null;
  let controller: ContentController | null = null;
  let panel: ReturnType<typeof attachDevExPanel> | null = null;

  try {
    // Prefer reduced browser UI for the content surface when interactive.
    const extraArgs = skipUi ? undefined : ["--new-window"];

    await engine.start({ headless, extraArgs });
    const info = engine.engineBinaryInfo();
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
        hostUi?.broadcastState();
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

    if (!skipUi) {
      hostUi = await startHostUiServer({
        getState: () => ({
          url: controller!.getPageUrl(),
          noCacheEnabled: controller!.noCacheEnabled(),
          status: controller!.isSaveNothing()
            ? "Save nothing ON (ephemeral + cache/SW)"
            : "Normal browsing",
          tabs: controller!.listTabs(),
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
        onActivateTab: async (tabId) => {
          const active = await controller!.activateTab(tabId);
          console.log(`Active tab → ${active.id}`);
        },
        onCloseTab: async (tabId) => {
          await controller!.closeTab(tabId);
          console.log(`Closed tab ${tabId} (downloads continue while process runs)`);
        },
      });

      uiSession = await engine.createBrowserContext();
      const uiTab = await uiSession.createTab(hostUi.url);
      console.log(`NCB window: ${hostUi.url} (target ${uiTab.id})`);
      console.log("NCB window: tabs / URL / Go / Back / Forward / Duplicate / Save nothing");
    }

    if (headless) {
      const file = await panel.exportSession();
      console.log(`Headless export: ${file}`);
      panel.stop();
      await controller.close();
      await engine.stop();
      return;
    }

    console.log("Running (NCB window + DevEx stdin; Ctrl+C to quit)…");
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off("SIGINT", onSig);
        process.off("SIGTERM", onSig);
        panel?.stop();
        await hostUi?.close().catch(() => undefined);
        await uiSession?.close().catch(() => undefined);
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
    await hostUi?.close().catch(() => undefined);
    await uiSession?.close().catch(() => undefined);
    await controller?.close().catch(() => undefined);
    await engine.stop().catch(() => undefined);
    process.exit(1);
  }
}

void main();
