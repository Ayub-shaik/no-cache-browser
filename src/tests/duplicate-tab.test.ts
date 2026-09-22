import assert from "node:assert/strict";
import test from "node:test";
import { SessionBuffer } from "../devex/session-buffer.js";
import type {
  CreateBrowserContextOptions,
  Engine,
  Session,
  Tab,
  TabSubscribeHandlers,
  Unsubscribe,
} from "../engine/types.js";
import { ContentController } from "../host/shell/controller.js";

function fakeTab(id: string, url = "about:blank"): Tab & { navigated: string[] } {
  let noCache = false;
  const navigated: string[] = [];
  return {
    id,
    navigated,
    get noCacheEnabled() {
      return noCache;
    },
    navigate: async (u: string) => {
      navigated.push(u);
    },
    reload: async () => undefined,
    setNoCache: async (enabled: boolean) => {
      noCache = enabled;
    },
    back: async () => false,
    forward: async () => false,
    subscribe: (_h: TabSubscribeHandlers): Unsubscribe => () => undefined,
    getNetworkResponseBody: async () => ({ body: "", base64Encoded: false }),
    close: async () => undefined,
  };
}

test("duplicateTab uses Session.createTab — not a new BrowserContext", async () => {
  let contextCreates = 0;
  let tabCreates = 0;
  const tabs: Tab[] = [];

  const session: Session = {
    id: "ctx-1",
    ephemeral: false,
    createTab: async (url = "about:blank") => {
      tabCreates += 1;
      const t = fakeTab(`tab-${tabCreates}`, url);
      tabs.push(t);
      return t;
    },
    close: async () => undefined,
  };

  const engine: Engine = {
    start: async () => undefined,
    stop: async () => undefined,
    createBrowserContext: async (_opts?: CreateBrowserContextOptions) => {
      contextCreates += 1;
      return session;
    },
    chromiumInfo: () => ({
      version: "test",
      executablePath: "/bin/false",
      webSocketDebuggerUrl: "ws://127.0.0.1:0",
    }),
  };

  const buffer = new SessionBuffer();
  const controller = new ContentController({
    engine,
    buffer,
    initialUrl: "https://example.com",
    chromiumVersion: "test",
  });

  await controller.start(false);
  assert.equal(contextCreates, 1);
  assert.equal(tabCreates, 1);

  await controller.navigate("https://example.com/app");
  const dup = await controller.duplicateTab();

  assert.equal(contextCreates, 1, "duplicate must not createBrowserContext");
  assert.equal(tabCreates, 2, "duplicate must Session.createTab");
  assert.equal(dup.id, "tab-2");
  assert.ok(
    (tabs[1] as ReturnType<typeof fakeTab>).navigated.includes("https://example.com/app"),
  );
  assert.equal(controller.getPageUrl(), "https://example.com/app");

  await controller.close();
});
