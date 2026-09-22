import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../engine/types.js";
import type { SessionBuffer } from "./session-buffer.js";

export async function writeSessionExport(
  buffer: SessionBuffer,
  tab: Tab,
  opts: {
    exportDir?: string;
    pageUrl: string;
    pageTitle?: string;
    noCacheEnabled?: boolean;
  },
): Promise<string> {
  const exportDir = opts.exportDir ?? path.resolve("exports");
  await mkdir(exportDir, { recursive: true });
  const json = await buffer.toSessionJson(tab, {
    pageUrl: opts.pageUrl,
    pageTitle: opts.pageTitle ?? opts.pageUrl,
    includeBodies: true,
    noCacheEnabled: opts.noCacheEnabled,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(exportDir, `session-${stamp}.ncb-session.json`);
  await writeFile(file, JSON.stringify(json, null, 2), "utf8");
  return file;
}

export async function writeHarExport(
  buffer: SessionBuffer,
  tab: Tab,
  opts: {
    exportDir?: string;
    pageTitle?: string;
    pageUrl: string;
  },
): Promise<string> {
  const exportDir = opts.exportDir ?? path.resolve("exports");
  await mkdir(exportDir, { recursive: true });
  await buffer.fillBodies(tab);
  const har = {
    log: buffer.toHar({ pageTitle: opts.pageTitle ?? opts.pageUrl }),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(exportDir, `network-${stamp}.har`);
  await writeFile(file, JSON.stringify(har, null, 2), "utf8");
  return file;
}
