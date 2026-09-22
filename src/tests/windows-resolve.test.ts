import assert from "node:assert/strict";
import test from "node:test";
import { resolveWindowsEnginePath } from "../engine/runtime/windows.js";

test("resolveWindowsEnginePath honors EngineStartConfig.enginePath", () => {
  // Use this test file itself as a readable path stand-in (F_OK check).
  const self = new URL(import.meta.url).pathname;
  const path = resolveWindowsEnginePath({ enginePath: self });
  assert.equal(path, self);
});

test("resolveWindowsEnginePath fails clearly without pin/binary when system off", () => {
  const prevPath = process.env.NCB_ENGINE_PATH;
  const prevAllow = process.env.NCB_ALLOW_SYSTEM_ENGINE;
  delete process.env.NCB_ENGINE_PATH;
  delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  try {
    assert.throws(() => resolveWindowsEnginePath(), /Engine binary not found/);
  } finally {
    if (prevPath !== undefined) process.env.NCB_ENGINE_PATH = prevPath;
    else delete process.env.NCB_ENGINE_PATH;
    if (prevAllow !== undefined) process.env.NCB_ALLOW_SYSTEM_ENGINE = prevAllow;
    else delete process.env.NCB_ALLOW_SYSTEM_ENGINE;
  }
});
