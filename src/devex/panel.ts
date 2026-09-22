import { createInterface } from "node:readline";
import path from "node:path";
import type { Tab, Unsubscribe } from "../engine/types.js";
import { SessionBuffer } from "./session-buffer.js";
import { writeHarExport, writeSessionExport } from "./export-files.js";

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
  /**
   * Host product toggle (ephemeral + cache/SW). When set, CLI `nocache on|off`
   * uses this instead of Tab.setNoCache alone.
   */
  setSaveNothing?: (enabled: boolean) => Promise<void>;
  /** Live noCacheEnabled for status (defaults to tab.noCacheEnabled). */
  getNoCacheEnabled?: () => boolean;
}

/**
 * CLI DevEx panel (headless / NCB_UI=0). Product path is the in-app NCB DevEx dock.
 */
export function attachDevExPanel(opts: DevExPanelOptions): {
  stop: () => void;
  exportSession: () => Promise<string>;
  exportHar: () => Promise<string>;
  /** Rebind sinks after content BrowserContext swap. Buffer is not cleared. */
  retarget: (tab: Tab) => void;
} {
  const exportDir = opts.exportDir ?? path.resolve("exports");
  const liveLog = opts.liveLog !== false;
  const interactive = opts.interactive !== false;
  let tab = opts.tab;
  let unsubscribe: Unsubscribe = () => undefined;

  function bindTab(next: Tab): void {
    unsubscribe();
    tab = next;
    unsubscribe = tab.subscribe({
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
  }

  bindTab(tab);

  function noCacheFlag(): boolean {
    return opts.getNoCacheEnabled?.() ?? tab.noCacheEnabled;
  }

  async function applyNoCache(enabled: boolean): Promise<void> {
    if (opts.setSaveNothing) {
      await opts.setSaveNothing(enabled);
    } else {
      await tab.setNoCache(enabled);
    }
    const meta = opts.buffer.getMeta();
    if (meta) {
      opts.buffer.setMeta({
        ...meta,
        tab: {
          ...meta.tab,
          noCacheEnabled: noCacheFlag(),
          url: opts.getPageUrl(),
          title: opts.getPageTitle?.() ?? opts.getPageUrl(),
        },
      });
    }
  }

  async function exportSession(): Promise<string> {
    const file = await writeSessionExport(opts.buffer, tab, {
      exportDir,
      pageUrl: opts.getPageUrl(),
      pageTitle: opts.getPageTitle?.() ?? opts.getPageUrl(),
      noCacheEnabled: noCacheFlag(),
    });
    console.log(`[devex] wrote ${file}`);
    return file;
  }

  async function exportHar(): Promise<string> {
    const file = await writeHarExport(opts.buffer, tab, {
      exportDir,
      pageUrl: opts.getPageUrl(),
      pageTitle: opts.getPageTitle?.() ?? opts.getPageUrl(),
    });
    console.log(`[devex] wrote ${file}`);
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
            await applyNoCache(true);
            console.log(`noCacheEnabled=${noCacheFlag()}`);
            return;
          }
          if (cmd === "nocache off") {
            await applyNoCache(false);
            console.log(`noCacheEnabled=${noCacheFlag()}`);
            return;
          }
          if (cmd === "status") {
            console.log(
              JSON.stringify(
                {
                  noCacheEnabled: noCacheFlag(),
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
    retarget: (next: Tab) => {
      bindTab(next);
    },
  };
}
