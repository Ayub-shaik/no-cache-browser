import type {
  ChromiumInfo,
  Engine,
  EngineStartConfig,
  Session,
  SessionId,
  Tab,
  TabId,
} from "../types.js";
import { CdpConnection } from "./cdp.js";
import {
  launchChromium,
  stopChromium,
  type LaunchedChromium,
} from "./process.js";

interface CreateBrowserContextResult {
  browserContextId: string;
}

interface CreateTargetResult {
  targetId: string;
}

interface AttachToTargetResult {
  sessionId: string;
}

export class ChromiumEngine implements Engine {
  private launched: (LaunchedChromium & { version: string; webSocketDebuggerUrl: string }) | null =
    null;
  private cdp: CdpConnection | null = null;
  private sessions = new Map<SessionId, ChromiumSession>();

  async start(config?: EngineStartConfig): Promise<void> {
    if (this.launched) {
      throw new Error("Engine already started");
    }
    this.launched = await launchChromium(config);
    this.cdp = new CdpConnection(this.launched.webSocketDebuggerUrl);
    await this.cdp.connect();
  }

  async stop(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      await session.close().catch(() => undefined);
    }
    this.sessions.clear();
    this.cdp?.close();
    this.cdp = null;
    if (this.launched) {
      await stopChromium(this.launched);
      this.launched = null;
    }
  }

  async createBrowserContext(): Promise<Session> {
    const cdp = this.requireCdp();
    const result = await cdp.send<CreateBrowserContextResult>("Target.createBrowserContext");
    const id = result.browserContextId;
    const session = new ChromiumSession(id, cdp, () => this.sessions.delete(id));
    this.sessions.set(id, session);
    return session;
  }

  chromiumInfo(): ChromiumInfo {
    if (!this.launched || !this.cdp) {
      throw new Error("Engine not started");
    }
    return {
      version: this.launched.version,
      executablePath: this.launched.executablePath,
      webSocketDebuggerUrl: this.launched.webSocketDebuggerUrl,
    };
  }

  private requireCdp(): CdpConnection {
    if (!this.cdp) throw new Error("Engine not started");
    return this.cdp;
  }
}

class ChromiumSession implements Session {
  readonly id: SessionId;
  private tabs = new Map<TabId, ChromiumTab>();
  private closed = false;

  constructor(
    id: SessionId,
    private readonly cdp: CdpConnection,
    private readonly onClosed: () => void,
  ) {
    this.id = id;
  }

  async createTab(url = "about:blank"): Promise<Tab> {
    this.assertOpen();
    const created = await this.cdp.send<CreateTargetResult>("Target.createTarget", {
      url,
      browserContextId: this.id,
    });
    const attached = await this.cdp.send<AttachToTargetResult>("Target.attachToTarget", {
      targetId: created.targetId,
      flatten: true,
    });
    const tab = new ChromiumTab(created.targetId, attached.sessionId, this.cdp, () =>
      this.tabs.delete(created.targetId),
    );
    this.tabs.set(created.targetId, tab);
    await this.cdp.send("Page.enable", {}, attached.sessionId);
    return tab;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const tab of [...this.tabs.values()]) {
      await tab.close().catch(() => undefined);
    }
    this.tabs.clear();
    await this.cdp.send("Target.disposeBrowserContext", {
      browserContextId: this.id,
    });
    this.onClosed();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`Session ${this.id} is closed`);
  }
}

class ChromiumTab implements Tab {
  readonly id: TabId;
  private closed = false;

  constructor(
    id: TabId,
    private readonly cdpSessionId: string,
    private readonly cdp: CdpConnection,
    private readonly onClosed: () => void,
  ) {
    this.id = id;
  }

  async navigate(url: string): Promise<void> {
    this.assertOpen();
    await this.cdp.send("Page.navigate", { url }, this.cdpSessionId);
  }

  async reload(ignoreCache = false): Promise<void> {
    this.assertOpen();
    await this.cdp.send("Page.reload", { ignoreCache }, this.cdpSessionId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.cdp.send("Target.closeTarget", { targetId: this.id });
    this.onClosed();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`Tab ${this.id} is closed`);
  }
}

/** Factory used by the host — keeps CDP types out of public imports. */
export function createEngine(): Engine {
  return new ChromiumEngine();
}
