import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import test from "node:test";
import {
  bundledEnginePath,
  linuxLaunchFlags,
  resolveLinuxEnginePath,
  shouldDisableLinuxSandbox,
  systemEngineAllowed,
} from "../engine/runtime/linux.js";

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

test("systemEngineAllowed is false by default", () => {
  const prev = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  try {
    assert.equal(systemEngineAllowed(), false);
  } finally {
    if (prev === undefined) delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
    else process.env.NCB_ALLOW_SYSTEM_ENGINE = prev;
  }
});

test("systemEngineAllowed accepts 1 and true", () => {
  const prev = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  try {
    process.env.NCB_ALLOW_SYSTEM_ENGINE = "1";
    assert.equal(systemEngineAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_ENGINE = "true";
    assert.equal(systemEngineAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_ENGINE = "TRUE";
    assert.equal(systemEngineAllowed(), true);
    process.env.NCB_ALLOW_SYSTEM_ENGINE = "0";
    assert.equal(systemEngineAllowed(), false);
  } finally {
    if (prev === undefined) delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
    else process.env.NCB_ALLOW_SYSTEM_ENGINE = prev;
  }
});

test("resolve prefers config.enginePath over env", () => {
  const prevPath = process.env.NCB_ENGINE_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  const nodeBin = process.execPath;
  try {
    process.env.NCB_ENGINE_PATH = "/nonexistent/should-not-win";
    process.env.NCB_ALLOW_SYSTEM_ENGINE = "1";
    const resolved = resolveLinuxEnginePath({ enginePath: nodeBin });
    assert.equal(resolved, nodeBin);
  } finally {
    if (prevPath === undefined) delete process.env.NCB_ENGINE_PATH;
    else process.env.NCB_ENGINE_PATH = prevPath;
    if (prevAllow === undefined) delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
    else process.env.NCB_ALLOW_SYSTEM_ENGINE = prevAllow;
  }
});

test("resolve fails without pin/bundled when system disallowed", () => {
  const prevPath = process.env.NCB_ENGINE_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  delete process.env.NCB_ENGINE_PATH;
  delete process.env.NCB_ALLOW_SYSTEM_ENGINE;

  try {
    if (isExecutable(bundledEnginePath())) {
      // Local checkout already ran fetch-engine-binary; path would succeed.
      assert.ok(true, "skip: bundled engine present");
      return;
    }

    assert.throws(
      () => resolveLinuxEnginePath(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /fetch-engine-binary/);
        assert.match(err.message, /NCB_ENGINE_PATH/);
        assert.match(err.message, /does not use a system browser binary/i);
        return true;
      },
    );
  } finally {
    if (prevPath === undefined) delete process.env.NCB_ENGINE_PATH;
    else process.env.NCB_ENGINE_PATH = prevPath;
    if (prevAllow === undefined) delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
    else process.env.NCB_ALLOW_SYSTEM_ENGINE = prevAllow;
  }
});
