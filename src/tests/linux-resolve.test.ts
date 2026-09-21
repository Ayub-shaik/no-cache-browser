import assert from "node:assert/strict";
import test from "node:test";
import {
  linuxLaunchFlags,
  shouldDisableLinuxSandbox,
} from "../engine/chromium/linux.js";

test("linuxLaunchFlags always includes disable-dev-shm-usage", () => {
  const flags = linuxLaunchFlags({ linuxNoSandbox: false });
  assert.ok(flags.includes("--disable-dev-shm-usage"));
});

test("linuxNoSandbox config forces --no-sandbox", () => {
  assert.equal(shouldDisableLinuxSandbox({ linuxNoSandbox: true }), true);
  assert.ok(linuxLaunchFlags({ linuxNoSandbox: true }).includes("--no-sandbox"));
});
