import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../engine/types.js";
import { SessionBuffer } from "./session-buffer.js";

export interface DevExPanelOptions {
  tab: Tab;
  buffer: SessionBuffer;
  /** Directory for exports (default: ./exports). */
  exportDir?: string;
  /** Live URL for export metadata (host tracks navigate). */
  getPageUrl: () => string;
  getPageTitle?: () => string;
  /** Print live sink lines to stdout (default true). */
  liveLog?: boolean;
  /** Interactive stdin commands (default true). Set false for headless. */
  interactive?: boolean;
}

/**
 * Thin CLI DevEx panel: live console/network lines + export / nocache commands.
 * Not a full DevTools UI.
 */
export function attachDevExPanel(opts: DevExPanelOptions): {
  stop: () => void;
  exportSession: () => Promise<string>;
  exportHar: () => Promise<string>;
} {
  const exportDir = opts.exportDir ?? path.resolve("exports");
  const liveLog = opts.liveLog !== false;
  const interactive = opts.interactive !== false;

  const unsubscribe = opts.tab.subscribe({
    onConsole: (e) => {
      const entry = opts.buffer.appendConsole(e);
      if (liveLog) {
        console.log(`[console:${entry.level}] ${entry.text}`);
      }
    },
    onNetwork: (e) => {
      opts.buffer.appendNetwork(e);
      if (!liveLog) return;
      if (e.kind === "request") {
        console.log(`[network] → ${e.method} ${e.url}`);
      } else if (e.kind === "response") {
        console.log(`[network] ← ${e.status} ${e.requestId}`);
      } else if (e.kind === "failed") {
        console.log(`[network] ✖ ${e.requestId} ${e.errorText}`);
      }
    },
  });

  async function exportSession(): Promise<string> {
    await mkdir(exportDir, { recursive: true });
    const json = await opts.buffer.toSessionJson(opts.tab, {
      pageUrl: opts.getPageUrl(),
      pageTitle: opts.getPageTitle?.() ?? opts.getPageUrl(),
      includeBodies: true,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(exportDir, `session-${stamp}.ncb-session.json`);
    await writeFile(file, JSON.stringify(json, null, 2), "utf8");
    return file;
  }

  async function exportHar(): Promise<string> {
    await mkdir(exportDir, { recursive: true });
    await opts.buffer.fillBodies(opts.tab);
    const har = {
      log: opts.buffer.toHar({
        pageTitle: opts.getPageTitle?.() ?? opts.getPageUrl(),
      }),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(exportDir, `network-${stamp}.har`);
    await writeFile(file, JSON.stringify(har, null, 2), "utf8");
    return file;
  }

  let rl: ReturnType<typeof createInterface> | null = null;
  if (interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(
      "DevEx commands: export | export-har | nocache on|off | status | clear | quit",
    );
    rl.on("line", (line) => {
      void (async () => {
        const cmd = line.trim().toLowerCase();
        if (!cmd) return;
        try {
          if (cmd === "export") {
            const file = await exportSession();
            console.log(`Wrote ${file}`);
            return;
          }
          if (cmd === "export-har") {
            const file = await exportHar();
            console.log(`Wrote ${file}`);
            return;
          }
          if (cmd === "nocache on") {
            await opts.tab.setNoCache(true);
            console.log(`noCacheEnabled=${opts.tab.noCacheEnabled}`);
            return;
          }
          if (cmd === "nocache off") {
            await opts.tab.setNoCache(false);
            console.log(`noCacheEnabled=${opts.tab.noCacheEnabled}`);
            return;
          }
          if (cmd === "status") {
            console.log(
              JSON.stringify(
                {
                  noCacheEnabled: opts.tab.noCacheEnabled,
                  console: opts.buffer.getConsoleEntries().length,
                  network: opts.buffer.getNetworkRequestIds().length,
                  url: opts.getPageUrl(),
                },
                null,
                2,
              ),
            );
            return;
          }
          if (cmd === "clear") {
            opts.buffer.clear();
            console.log("SessionBuffer cleared (explicit)");
            return;
          }
          if (cmd === "quit" || cmd === "exit") {
            rl?.close();
            return;
          }
          console.log("Unknown command");
        } catch (err) {
          console.error(err instanceof Error ? err.message : err);
        }
      })();
    });
  }

  return {
    stop: () => {
      rl?.close();
      unsubscribe();
    },
    exportSession,
    exportHar,
  };
}
