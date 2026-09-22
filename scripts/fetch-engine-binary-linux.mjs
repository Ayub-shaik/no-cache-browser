#!/usr/bin/env node
/**
 * Fetch pinned engine binary (Linux) into third_party/engine-binary/.
 * Upstream download metadata is read from config/engine-linux.json (base64 fields).
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, chmodSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PIN_FILE = join(ROOT, "config", "engine-linux.json");
const DEST_DIR = join(ROOT, "third_party", "engine-binary");
const BINARY = join(DEST_DIR, "engine");
const MARKER = join(DEST_DIR, ".ncb-engine-version");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function decodeB64(s) {
  return Buffer.from(s, "base64").toString("utf8");
}

function loadPin() {
  if (!existsSync(PIN_FILE)) fail(`Missing pin file: ${PIN_FILE}`);
  return JSON.parse(readFileSync(PIN_FILE, "utf8"));
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) fail(`Download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function findUpstreamDir(extractRoot, dirName, binName) {
  const direct = join(extractRoot, dirName);
  if (existsSync(join(direct, binName))) return direct;
  for (const name of readdirSync(extractRoot)) {
    const p = join(extractRoot, name);
    if (statSync(p).isDirectory() && existsSync(join(p, binName))) return p;
  }
  return null;
}

async function main() {
  const pin = loadPin();
  const version = pin.version;
  if (!version) fail("Pin missing version");

  if (existsSync(MARKER) && readFileSync(MARKER, "utf8").trim() === version && existsSync(BINARY)) {
    console.log(`Pinned engine binary ${version} already present at ${BINARY}`);
    return;
  }

  const url = decodeB64(pin.downloadUrlB64);
  const zipName = decodeB64(pin.upstreamZipNameB64);
  const dirName = decodeB64(pin.upstreamDirNameB64);
  const binName = decodeB64(pin.upstreamBinaryNameB64);

  const work = join(tmpdir(), `ncb-engine-fetch-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, zipName);
  const extractRoot = join(work, "extract");
  mkdirSync(extractRoot, { recursive: true });

  try {
    console.log(`Fetching pinned engine binary ${version}…`);
    await download(url, zipPath);
    execFileSync("unzip", ["-q", "-o", zipPath, "-d", extractRoot], { stdio: "inherit" });

    const srcDir = findUpstreamDir(extractRoot, dirName, binName);
    if (!srcDir) fail("zip did not contain expected upstream engine binary layout");

    const staging = join(work, "staging");
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    execFileSync("cp", ["-a", `${srcDir}/.`, staging], { stdio: "inherit" });

    const stagedBinary = join(staging, binName);
    if (!existsSync(stagedBinary)) fail("extracted tree missing engine binary");
    // Stage as our canonical name.
    const stagedEngine = join(staging, "engine");
    if (stagedBinary !== stagedEngine) {
      renameSync(stagedBinary, stagedEngine);
    }
    chmodSync(stagedEngine, 0o755);

    mkdirSync(dirname(DEST_DIR), { recursive: true });
    rmSync(DEST_DIR, { recursive: true, force: true });
    renameSync(staging, DEST_DIR);
    writeFileSync(MARKER, `${version}\n`, "utf8");
    console.log(`Installed ${BINARY}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => fail(String(err)));
