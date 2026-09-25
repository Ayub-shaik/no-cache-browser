import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import test from "node:test";
import {
  bundledWindowsEnginePath,
  resolveWindowsEnginePath,
  systemEngineAllowedWindows,
  windowsLaunchFlags,
} from "../engine/runtime/windows.js";
import { sharedLaunchFlags } from "../engine/runtime/process.js";

function isPresent(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("resolveWindowsEnginePath honors EngineStartConfig.enginePath", () => {
  // Use this test file itself as a readable path stand-in (F_OK check).
  const self = new URL(import.meta.url).pathname;
  const path = resolveWindowsEnginePath({ enginePath: self });
  assert.equal(path, self);
});

test("systemEngineAllowedWindows is false by default", () => {
  const prev = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  try {
    assert.equal(systemEngineAllowedWindows(), false);
  } finally {
    if (prev === undefined) delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
    else process.env.NCB_ALLOW_SYSTEM_ENGINE = prev;
  }
});


test("sharedLaunchFlags includes disable-infobars for vendor testing infobar", () => {
  assert.ok(sharedLaunchFlags().includes("--disable-infobars"));
});

test("windowsLaunchFlags omits Linux sandbox flags and honors EXTRA_ARGS", () => {
  const prev = process.env.NCB_ENGINE_EXTRA_ARGS;
  try {
    delete process.env.NCB_ENGINE_EXTRA_ARGS;
    const bare = windowsLaunchFlags();
    assert.ok(!bare.includes("--no-sandbox"));
    assert.ok(!bare.includes("--disable-dev-shm-usage"));
    process.env.NCB_ENGINE_EXTRA_ARGS = "--foo --bar";
    const withExtra = windowsLaunchFlags();
    assert.deepEqual(withExtra, ["--foo", "--bar"]);
  } finally {
    if (prev === undefined) delete process.env.NCB_ENGINE_EXTRA_ARGS;
    else process.env.NCB_ENGINE_EXTRA_ARGS = prev;
  }
});

test("resolveWindowsEnginePath fails clearly without pin/binary when system off", () => {
  const prevPath = process.env.NCB_ENGINE_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  delete process.env.NCB_ENGINE_PATH;
  delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  try {
    if (isPresent(bundledWindowsEnginePath())) {
      assert.ok(true, "skip: bundled Windows engine present");
      return;
    }
    assert.throws(
      () => resolveWindowsEnginePath(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /fetch-engine-binary:windows/);
        assert.match(err.message, /NCB_ENGINE_PATH/);
        assert.match(err.message, /does not use a system browser binary/i);
        return true;
      },
    );
  } finally {
    if (prevPath !== undefined) process.env.NCB_ENGINE_PATH = prevPath;
    else delete process.env.NCB_ENGINE_PATH;
    if (prevAllow !== undefined) process.env.NCB_ALLOW_SYSTEM_ENGINE = prevAllow;
    else delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  }
});
