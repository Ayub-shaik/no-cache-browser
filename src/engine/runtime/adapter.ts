import type {
  EngineBinaryInfo,
  CreateBrowserContextOptions,
  Engine,
  EngineStartConfig,
  Session,
  SessionId,
  Tab,
  TabId,
} from "../types.js";
import { resolveBrowserContextParams } from "../save-nothing.js";
import { CdpConnection } from "./cdp.js";
import {
  launchEngineBinary,
  stopEngineBinary,
  type LaunchedEngine,
} from "./process.js";
import { RuntimeTab } from "./tab-impl.js";

interface CreateBrowserContextResult {
  browserContextId: string;
}

interface CreateTargetResult {
  targetId: string;
}

interface AttachToTargetResult {
  sessionId: string;
}

export class RuntimeEngine implements Engine {
  private launched: (LaunchedEngine & { version: string; webSocketDebuggerUrl: string }) | null =
    null;
  private cdp: CdpConnection | null = null;
  private sessions = new Map<SessionId, RuntimeSession>();

  async start(config?: EngineStartConfig): Promise<void> {
    if (this.launched) {
      throw new Error("Engine already started");
    }
    this.launched = await launchEngineBinary(config);
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
      await stopEngineBinary(this.launched);
      this.launched = null;
    }
  }

  async createBrowserContext(options?: CreateBrowserContextOptions): Promise<Session> {
    const cdp = this.requireCdp();
    const resolved = resolveBrowserContextParams(options);
    const params: Record<string, unknown> = {};
    if (resolved.disposeOnDetach) {
      params.disposeOnDetach = true;
    }
    const result = await cdp.send<CreateBrowserContextResult>(
      "Target.createBrowserContext",
      params,
    );
    const id = result.browserContextId;
    const session = new RuntimeSession(
      id,
      resolved.ephemeral,
      cdp,
      () => this.sessions.delete(id),
    );
    this.sessions.set(id, session);
    return session;
  }

  engineBinaryInfo(): EngineBinaryInfo {
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

class RuntimeSession implements Session {
  readonly id: SessionId;
  readonly ephemeral: boolean;
  private tabs = new Map<TabId, RuntimeTab>();
  private closed = false;

  constructor(
    id: SessionId,
    ephemeral: boolean,
    private readonly cdp: CdpConnection,
    private readonly onClosed: () => void,
  ) {
    this.id = id;
    this.ephemeral = ephemeral;
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
    const tab = new RuntimeTab(created.targetId, attached.sessionId, this.cdp, () =>
      this.tabs.delete(created.targetId),
    );
    this.tabs.set(created.targetId, tab);
    await tab.attachDomains();
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

/** Factory used by the host — keeps CDP types out of public imports. */
export function createEngine(): Engine {
  return new RuntimeEngine();
}
