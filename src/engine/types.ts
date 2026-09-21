/** Public Engine / Session / Tab boundary — no CDP types. */

export type SessionId = string;
export type TabId = string;

export interface ChromiumInfo {
  version: string;
  executablePath: string;
  webSocketDebuggerUrl: string;
}

export interface EngineStartConfig {
  /** Absolute path to Chromium/Chrome. Defaults to env `NCB_CHROMIUM_PATH`. */
  chromiumPath?: string;
  /** Extra Chromium flags (Linux sandbox flags, etc.). */
  extraArgs?: string[];
  /** Prefer headless for CI/smoke; default false for interactive host. */
  headless?: boolean;
  /** Fixed debugging port; 0 = ephemeral (recommended). */
  debuggingPort?: number;
  /** User-data-dir; created if missing. */
  userDataDir?: string;
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

export interface Tab {
  readonly id: TabId;
  navigate(url: string): Promise<void>;
  reload(ignoreCache?: boolean): Promise<void>;
  close(): Promise<void>;
}
