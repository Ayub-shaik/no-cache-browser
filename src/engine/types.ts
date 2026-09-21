/** Public Engine / Session / Tab boundary — no CDP types. */

export type SessionId = string;
export type TabId = string;
export type Unsubscribe = () => void;

export interface ChromiumInfo {
  version: string;
  executablePath: string;
  webSocketDebuggerUrl: string;
}

export interface EngineStartConfig {
  /** Absolute path to Chromium/Chrome. See Linux resolve order in docs/LINUX.md. */
  chromiumPath?: string;
  /** Extra Chromium flags (appended after Linux defaults). */
  extraArgs?: string[];
  /** Prefer headless for CI/smoke; default false for interactive host. */
  headless?: boolean;
  /** Fixed debugging port; 0 = ephemeral (recommended). */
  debuggingPort?: number;
  /** User-data-dir; defaults to NCB_USER_DATA_DIR or an ephemeral temp dir. */
  userDataDir?: string;
  /**
   * Force `--no-sandbox` on Linux. Also honor env `NCB_CHROMIUM_NO_SANDBOX=1`.
   * Auto-enabled when root or in a detected container.
   */
  linuxNoSandbox?: boolean;
}

export interface Engine {
  start(config?: EngineStartConfig): Promise<void>;
  stop(): Promise<void>;
  createBrowserContext(): Promise<Session>;
  chromiumInfo(): ChromiumInfo;
}

export interface Session {
  readonly id: SessionId;
  createTab(url?: string): Promise<Tab>;
  close(): Promise<void>;
}

/** Console sink event (DevEx SessionBuffer). */
export interface ConsoleEvent {
  timestamp: number;
  level: string;
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** Network sink events (DevEx SessionBuffer → HAR). */
export type NetworkEvent =
  | {
      kind: "request";
      requestId: string;
      url: string;
      method: string;
      timestamp: number;
      headers: Record<string, string>;
    }
  | {
      kind: "response";
      requestId: string;
      status: number;
      statusText: string;
      timestamp: number;
      mimeType?: string;
      headers: Record<string, string>;
    }
  | {
      kind: "finished";
      requestId: string;
      timestamp: number;
      encodedDataLength?: number;
    }
  | {
      kind: "failed";
      requestId: string;
      timestamp: number;
      errorText: string;
      canceled?: boolean;
    };

export interface TabSubscribeHandlers {
  onConsole?: (event: ConsoleEvent) => void;
  onNetwork?: (event: NetworkEvent) => void;
}

export interface Tab {
  readonly id: TabId;
  /** Export-time / live flag for no-cache mode on this tab. */
  readonly noCacheEnabled: boolean;
  navigate(url: string): Promise<void>;
  reload(ignoreCache?: boolean): Promise<void>;
  /**
   * MVP no-cache toggle. See docs/ENGINE-SESSION.md for reload semantics.
   * Sinks stay attached across the single forced reload.
   */
  setNoCache(enabled: boolean): Promise<void>;
  /** Typed console + Network streams for DevEx. Does not clear across forced reload. */
  subscribe(handlers: TabSubscribeHandlers): Unsubscribe;
  /** Optional body fetch for HAR export (capped by DevEx). */
  getNetworkResponseBody(
    requestId: string,
  ): Promise<{ body: string; base64Encoded: boolean }>;
  close(): Promise<void>;
}
