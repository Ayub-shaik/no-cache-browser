import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import test from "node:test";
import {
  bundledChromiumPath,
  linuxLaunchFlags,
  resolveLinuxChromiumPath,
  shouldDisableLinuxSandbox,
  systemChromiumAllowed,
} from "../engine/chromium/linux.js";

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

test("linuxLaunchFlags always includes disable-dev-shm-usage", () => {
  const flags = linuxLaunchFlags({ linuxNoSandbox: false });
  assert.ok(flags.includes("--disable-dev-shm-usage"));
});

test("linuxNoSandbox config forces --no-sandbox", () => {
  assert.equal(shouldDisableLinuxSandbox({ linuxNoSandbox: true }), true);
  assert.ok(linuxLaunchFlags({ linuxNoSandbox: true }).includes("--no-sandbox"));
});

test("systemChromiumAllowed is false by default", () => {
  const prev = process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
  delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
  try {
    assert.equal(systemChromiumAllowed(), false);
  } finally {
    if (prev === undefined) delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
    else process.env.NCB_ALLOW_SYSTEM_CHROMIUM = prev;
  }
});

test("systemChromiumAllowed accepts 1 and true", () => {
  const prev = process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
  try {
    process.env.NCB_ALLOW_SYSTEM_CHROMIUM = "1";
    assert.equal(systemChromiumAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_CHROMIUM = "true";
    assert.equal(systemChromiumAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_CHROMIUM = "TRUE";
    assert.equal(systemChromiumAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_CHROMIUM = "0";
    assert.equal(systemChromiumAllowed(), false);
  } finally {
    if (prev === undefined) delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
    else process.env.NCB_ALLOW_SYSTEM_CHROMIUM = prev;
  }
});

test("resolve prefers config.chromiumPath over env", () => {
  const prevPath = process.env.NCB_CHROMIUM_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
  const nodeBin = process.execPath;
  try {
    process.env.NCB_CHROMIUM_PATH = "/nonexistent/should-not-win";
    process.env.NCB_ALLOW_SYSTEM_CHROMIUM = "1";
    const resolved = resolveLinuxChromiumPath({ chromiumPath: nodeBin });
    assert.equal(resolved, nodeBin);
  } finally {
    if (prevPath === undefined) delete process.env.NCB_CHROMIUM_PATH;
    else process.env.NCB_CHROMIUM_PATH = prevPath;
    if (prevAllow === undefined) delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
    else process.env.NCB_ALLOW_SYSTEM_CHROMIUM = prevAllow;
  }
});

test("resolve fails without pin/bundled when system disallowed", () => {
  const prevPath = process.env.NCB_CHROMIUM_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
  delete process.env.NCB_CHROMIUM_PATH;
  delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;

  try {
    if (isExecutable(bundledChromiumPath())) {
      // Local checkout already ran fetch-chromium; path would succeed.
      assert.ok(true, "skip: bundled chromium present");
      return;
    }

    assert.throws(
      () => resolveLinuxChromiumPath(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /fetch-chromium/);
        assert.match(err.message, /NCB_CHROMIUM_PATH/);
        assert.match(err.message, /does not use system/i);
        return true;
      },
    );
  } finally {
    if (prevPath === undefined) delete process.env.NCB_CHROMIUM_PATH;
    else process.env.NCB_CHROMIUM_PATH = prevPath;
    if (prevAllow === undefined) delete process.env.NCB_ALLOW_SYSTEM_CHROMIUM;
    else process.env.NCB_ALLOW_SYSTEM_CHROMIUM = prevAllow;
  }
});
