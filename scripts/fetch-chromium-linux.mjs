#!/usr/bin/env node
/**
 * Fetch pinned Chrome-for-Testing Linux Chromium into third_party/chromium/.
 * Idempotent when .ncb-chromium-version matches the pin.
 * Node 20+ ESM; uses curl + unzip via child_process.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  statSync,
  cpSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_PATH = join(ROOT, "config", "chromium-linux.json");
const DEST_DIR = join(ROOT, "third_party", "chromium");
const VERSION_MARKER = join(DEST_DIR, ".ncb-chromium-version");
const BINARY = join(DEST_DIR, "chrome");

function fail(msg) {
  console.error(`fetch-chromium: ${msg}`);
  process.exit(1);
}

function loadPin() {
  if (!existsSync(CONFIG_PATH)) fail(`missing pin config at ${CONFIG_PATH}`);
  const pin = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!pin.version || !pin.downloadUrl) {
    fail("config must include version and downloadUrl");
  }
  return pin;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    fail(`${cmd} ${args.join(" ")} failed (exit ${r.status}): ${err}`);
  }
  return r;
}

function markerMatches(version) {
  if (!existsSync(VERSION_MARKER) || !existsSync(BINARY)) return false;
  try {
    return readFileSync(VERSION_MARKER, "utf8").trim() === version;
  } catch {
    return false;
  }
}

function extractZip(zipPath, extractTo) {
  mkdirSync(extractTo, { recursive: true });
  run("unzip", ["-q", "-o", zipPath, "-d", extractTo]);
}

function findChromeLinux64Dir(extractRoot) {
  const direct = join(extractRoot, "chrome-linux64");
  if (existsSync(join(direct, "chrome"))) return direct;
  for (const name of readdirSync(extractRoot)) {
    const p = join(extractRoot, name);
    if (statSync(p).isDirectory() && existsSync(join(p, "chrome"))) return p;
  }
  return null;
}

function main() {
  const pin = loadPin();
  const { version, downloadUrl } = pin;

  if (markerMatches(version)) {
    console.log(`fetch-chromium: already present (${version}) at ${BINARY}`);
    return;
  }

  mkdirSync(join(ROOT, "third_party"), { recursive: true });
  const work = join(tmpdir(), `ncb-cft-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, "chrome-linux64.zip");
  const extractRoot = join(work, "extract");

  try {
    console.log(`fetch-chromium: downloading ${version}`);
    console.log(`  ${downloadUrl}`);
    run("curl", ["-fsSL", "-o", zipPath, downloadUrl]);

    extractZip(zipPath, extractRoot);
    const srcDir = findChromeLinux64Dir(extractRoot);
    if (!srcDir) fail("zip did not contain chrome-linux64/chrome");

    // Replace dest atomically-ish: stage then rename
    const staging = `${DEST_DIR}.staging`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    cpSync(srcDir, staging, { recursive: true });

    const stagedBinary = join(staging, "chrome");
    if (!existsSync(stagedBinary)) fail("extracted tree missing chrome binary");
    chmodSync(stagedBinary, 0o755);

    writeFileSync(join(staging, ".ncb-chromium-version"), `${version}\n`, "utf8");

    rmSync(DEST_DIR, { recursive: true, force: true });
    renameSync(staging, DEST_DIR);

    console.log(`fetch-chromium: installed ${version} → ${BINARY}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
