import assert from "node:assert/strict";
import test from "node:test";
import {
  planSaveNothingTransition,
  resolveBrowserContextParams,
} from "../engine/save-nothing.js";
import { normalizeUrl } from "../host/shell/server.js";

test("resolveBrowserContextParams: default is non-ephemeral", () => {
  assert.deepEqual(resolveBrowserContextParams(), {
    ephemeral: false,
    disposeOnDetach: false,
  });
  assert.deepEqual(resolveBrowserContextParams({}), {
    ephemeral: false,
    disposeOnDetach: false,
  });
});

test("resolveBrowserContextParams: ephemeral sets disposeOnDetach", () => {
  assert.deepEqual(resolveBrowserContextParams({ ephemeral: true }), {
    ephemeral: true,
    disposeOnDetach: true,
  });
  assert.deepEqual(resolveBrowserContextParams({ ephemeral: false }), {
    ephemeral: false,
    disposeOnDetach: false,
  });
});

test("planSaveNothingTransition: idempotent noop", () => {
  assert.equal(planSaveNothingTransition(false, false).kind, "noop");
  assert.equal(planSaveNothingTransition(true, true).kind, "noop");
});

test("planSaveNothingTransition: enter ephemeral applies cache/SW", () => {
  const plan = planSaveNothingTransition(false, true);
  assert.equal(plan.kind, "enter-ephemeral");
  if (plan.kind === "enter-ephemeral") {
    assert.equal(plan.swapContext, true);
    assert.equal(plan.restoreUrl, true);
    assert.equal(plan.applyCacheSw, true);
    assert.equal(plan.saveNothing, true);
  }
});

test("planSaveNothingTransition: leave ephemeral does not auto-reload", () => {
  const plan = planSaveNothingTransition(true, false);
  assert.equal(plan.kind, "leave-ephemeral");
  if (plan.kind === "leave-ephemeral") {
    assert.equal(plan.swapContext, true);
    assert.equal(plan.restoreUrl, true);
    assert.equal(plan.applyCacheSw, false);
    assert.equal(plan.autoReload, false);
    assert.equal(plan.saveNothing, false);
  }
});

test("normalizeUrl adds https when scheme missing", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeUrl("about:blank"), "about:blank");
  assert.equal(normalizeUrl("  "), "about:blank");
});
