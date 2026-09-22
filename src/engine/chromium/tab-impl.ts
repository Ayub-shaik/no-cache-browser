import type {
  ConsoleEvent,
  NetworkEvent,
  Tab,
  TabId,
  TabSubscribeHandlers,
  Unsubscribe,
} from "../types.js";
import type { CdpConnection } from "./cdp.js";
import { attachCaptureListeners } from "./tab-sinks.js";

interface NavigationHistoryResult {
  currentIndex: number;
  entries: Array<{ id: number; url: string; userTypedURL?: string; title?: string }>;
}

export class ChromiumTab implements Tab {
  readonly id: TabId;
  private closed = false;
  private _noCacheEnabled = false;
  private hasCommittedDocument = false;
  private consoleHandlers = new Set<(event: ConsoleEvent) => void>();
  private networkHandlers = new Set<(event: NetworkEvent) => void>();
  private unsubscribers: Unsubscribe[] = [];

  constructor(
    id: TabId,
    private readonly cdpSessionId: string,
    private readonly cdp: CdpConnection,
    private readonly onClosed: () => void,
  ) {
    this.id = id;
  }

  get noCacheEnabled(): boolean {
    return this._noCacheEnabled;
  }

  async attachDomains(): Promise<void> {
    await this.cdp.send("Page.enable", {}, this.cdpSessionId);
    await this.cdp.send("Runtime.enable", {}, this.cdpSessionId);
    await this.cdp.send("Network.enable", {}, this.cdpSessionId);

    this.unsubscribers.push(
      ...attachCaptureListeners({
        cdp: this.cdp,
        cdpSessionId: this.cdpSessionId,
        onCommitted: () => {
          this.hasCommittedDocument = true;
        },
        consoleHandlers: this.consoleHandlers,
        networkHandlers: this.networkHandlers,
      }),
    );
  }

  async navigate(url: string): Promise<void> {
    this.assertOpen();
    await this.cdp.send("Page.navigate", { url }, this.cdpSessionId);
  }

  async reload(ignoreCache = false): Promise<void> {
    this.assertOpen();
    await this.cdp.send("Page.reload", { ignoreCache }, this.cdpSessionId);
  }

  async back(): Promise<boolean> {
    this.assertOpen();
    return this.navigateHistory(-1);
  }

  async forward(): Promise<boolean> {
    this.assertOpen();
    return this.navigateHistory(1);
  }

  async setNoCache(enabled: boolean): Promise<void> {
    this.assertOpen();
    if (enabled) {
      if (this._noCacheEnabled) return;
      await this.cdp.send("Network.enable", {}, this.cdpSessionId);
      await this.cdp.send(
        "Network.setCacheDisabled",
        { cacheDisabled: true },
        this.cdpSessionId,
      );
      await this.cdp.send(
        "Network.setBypassServiceWorker",
        { bypass: true },
        this.cdpSessionId,
      );
      await this.unregisterServiceWorkersBestEffort();
      this._noCacheEnabled = true;
      if (this.hasCommittedDocument) {
        await this.reload(true);
      }
      return;
    }

    if (!this._noCacheEnabled) return;
    await this.cdp.send(
      "Network.setCacheDisabled",
      { cacheDisabled: false },
      this.cdpSessionId,
    );
    await this.cdp.send(
      "Network.setBypassServiceWorker",
      { bypass: false },
      this.cdpSessionId,
    );
    this._noCacheEnabled = false;
  }

  subscribe(handlers: TabSubscribeHandlers): Unsubscribe {
    this.assertOpen();
    if (handlers.onConsole) this.consoleHandlers.add(handlers.onConsole);
    if (handlers.onNetwork) this.networkHandlers.add(handlers.onNetwork);
    return () => {
      if (handlers.onConsole) this.consoleHandlers.delete(handlers.onConsole);
      if (handlers.onNetwork) this.networkHandlers.delete(handlers.onNetwork);
    };
  }

  async getNetworkResponseBody(
    requestId: string,
  ): Promise<{ body: string; base64Encoded: boolean }> {
    this.assertOpen();
    const result = await this.cdp.send<{ body: string; base64Encoded: boolean }>(
      "Network.getResponseBody",
      { requestId },
      this.cdpSessionId,
    );
    return {
      body: result.body ?? "",
      base64Encoded: Boolean(result.base64Encoded),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.consoleHandlers.clear();
    this.networkHandlers.clear();
    await this.cdp.send("Target.closeTarget", { targetId: this.id });
    this.onClosed();
  }

  private async navigateHistory(delta: number): Promise<boolean> {
    try {
      const history = await this.cdp.send<NavigationHistoryResult>(
        "Page.getNavigationHistory",
        {},
        this.cdpSessionId,
      );
      const next = history.currentIndex + delta;
      if (next < 0 || next >= history.entries.length) return false;
      const entry = history.entries[next];
      await this.cdp.send(
        "Page.navigateToHistoryEntry",
        { entryId: entry.id },
        this.cdpSessionId,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async unregisterServiceWorkersBestEffort(): Promise<void> {
    try {
      await this.cdp.send("ServiceWorker.enable", {}, this.cdpSessionId);
    } catch {
      /* ignore */
    }
    try {
      await this.cdp.send(
        "Runtime.evaluate",
        {
          expression:
            "navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => true)",
          awaitPromise: true,
          returnByValue: true,
        },
        this.cdpSessionId,
      );
    } catch {
      /* ignore */
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`Tab ${this.id} is closed`);
  }
}
