import assert from "node:assert/strict";
import test from "node:test";
import { SessionBuffer } from "../devex/session-buffer.js";
import type { NetworkEvent, Tab } from "../engine/types.js";

function fakeTab(overrides?: Partial<Tab>): Tab {
  let noCache = false;
  return {
    id: "tab-1",
    get noCacheEnabled() {
      return noCache;
    },
    navigate: async () => undefined,
    reload: async () => undefined,
    setNoCache: async (enabled: boolean) => {
      noCache = enabled;
    },
    subscribe: () => () => undefined,
    getNetworkResponseBody: async () => ({ body: "hello", base64Encoded: false }),
    close: async () => undefined,
    ...overrides,
  };
}

test("SessionBuffer merges network events and keeps console across clear-not-on-reload semantics", () => {
  const buf = new SessionBuffer({ consoleCap: 3 });
  buf.appendConsole({
    timestamp: Date.parse("2026-09-21T10:00:00.000Z"),
    level: "log",
    text: "a",
  });
  buf.appendConsole({
    timestamp: Date.parse("2026-09-21T10:00:01.000Z"),
    level: "warn",
    text: "b",
  });

  const req: NetworkEvent = {
    kind: "request",
    requestId: "r1",
    url: "https://example.com/",
    method: "GET",
    timestamp: Date.parse("2026-09-21T10:00:00.000Z"),
    headers: { accept: "*/*" },
  };
  buf.appendNetwork(req);
  buf.appendNetwork({
    kind: "response",
    requestId: "r1",
    status: 200,
    statusText: "OK",
    timestamp: Date.parse("2026-09-21T10:00:00.050Z"),
    mimeType: "text/html",
    headers: { "content-type": "text/html" },
  });
  buf.appendNetwork({
    kind: "finished",
    requestId: "r1",
    timestamp: Date.parse("2026-09-21T10:00:00.100Z"),
    encodedDataLength: 5,
  });

  // Simulate traffic after forced reload — must still append, not reset.
  buf.appendConsole({
    timestamp: Date.parse("2026-09-21T10:00:02.000Z"),
    level: "log",
    text: "after-reload",
  });

  assert.Equal(buf.getConsoleEntries().length, 3);
  assert.equal(buf.getConsoleEntries()[2]?.text, "after-reload");
  assert.deepEqual(buf.getNetworkRequestIds(), ["r1"]);

  const har = buf.toHar({ pageTitle: "Example" }) as {
    entries: Array<{ response: { status: number }; _ncb: { requestId: string } }>;
  };
  assert.equal(har.entries.length, 1);
  assert.equal(har.entries[0]?.response.status, 200);
  assert.equal(har.entries[0]?._ncb.requestId, "r1");
});

test("console cap keeps last N entries", () => {
  const buf = new SessionBuffer({ consoleCap: 2 });
  buf.appendConsole({ timestamp: 1, level: "log", text: "1" });
  buf.appendConsole({ timestamp: 2, level: "log", text: "2" });
  buf.appendConsole({ timestamp: 3, level: "log", text: "3" });
  assert.deepEqual(
    buf.getConsoleEntries().map((e) => e.text),
    ["2", "3"],
  );
});

test("toSessionJson stamps noCacheEnabled at export time", async () => {
  const tab = fakeTab();
  const buf = new SessionBuffer();
  buf.setMeta({
    chromium: { version: "1.0" },
    tab: { id: tab.id, url: "https://example.com", title: "Example", noCacheEnabled: false },
  });
  await tab.setNoCache(true);
  const json = await buf.toSessionJson(tab, { pageUrl: "https://example.com" });
  assert.equal(json.schemaVersion, 1);
  assert.equal((json.tab as { noCacheEnabled: boolean }).noCacheEnabled, true);
  assert.ok(Array.isArray(json.console));
  assert.ok(json.har);
});

test("clear is explicit only", () => {
  const buf = new SessionBuffer();
  buf.appendConsole({ timestamp: 1, level: "log", text: "x" });
  buf.appendNetwork({
    kind: "request",
    requestId: "r",
    url: "https://x",
    method: "GET",
    timestamp: 1,
    headers: {},
  });
  buf.clear();
  assert.equal(buf.getConsoleEntries().length, 0);
  assert.equal(buf.getNetworkRequestIds().length, 0);
});
