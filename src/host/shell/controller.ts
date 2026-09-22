import type { Engine, Session, Tab } from "../../engine/types.js";
import { planSaveNothingTransition } from "../../engine/save-nothing.js";
import type { SessionBuffer } from "../../devex/session-buffer.js";

export interface ContentControllerOptions {
  engine: Engine;
  buffer: SessionBuffer;
  initialUrl: string;
  chromiumVersion: string;
  appVersion?: string;
  /** Called when the active content Tab instance changes (context swap or duplicate). */
  onTabChanged?: (tab: Tab) => void;
}

/**
 * Host-owned content session: normal vs ephemeral BrowserContext +
 * Tab.setNoCache for cache/SW. Product toggle = setSaveNothing.
 * Duplicate opens another tab in the *same* Session/BrowserContext.
 */
export class ContentController {
  private session: Session | null = null;
  private tab: Tab | null = null;
  /** Extra tabs from Duplicate (same context). Active tab is `tab`. */
  private extraTabs = new Set<Tab>();
  private saveNothing = false;
  private pageUrl: string;
  private pageTitle: string;
  private readonly engine: Engine;
  private readonly buffer: SessionBuffer;
  private readonly chromiumVersion: string;
  private readonly appVersion: string;
  private readonly onTabChanged?: (tab: Tab) => void;

  constructor(opts: ContentControllerOptions) {
    this.engine = opts.engine;
    this.buffer = opts.buffer;
    this.pageUrl = opts.initialUrl;
    this.pageTitle = opts.initialUrl;
    this.chromiumVersion = opts.chromiumVersion;
    this.appVersion = opts.appVersion ?? "0.1.0";
    this.onTabChanged = opts.onTabChanged;
  }

  getTab(): Tab {
    if (!this.tab) throw new Error("Content tab not ready");
    return this.tab;
  }

  getSession(): Session {
    if (!this.session) throw new Error("Content session not ready");
    return this.session;
  }

  getPageUrl(): string {
    return this.pageUrl;
  }

  getPageTitle(): string {
    return this.pageTitle;
  }

  isSaveNothing(): boolean {
    return this.saveNothing;
  }

  /** Mirror of tab.noCacheEnabled after last successful toggle/apply. */
  noCacheEnabled(): boolean {
    return this.tab?.noCacheEnabled ?? this.saveNothing;
  }

  async start(ephemeral = false): Promise<Tab> {
    await this.openContent({ ephemeral, url: this.pageUrl, applyCacheSw: ephemeral });
    this.saveNothing = ephemeral;
    return this.getTab();
  }

  async navigate(url: string): Promise<void> {
    const tab = this.getTab();
    this.pageUrl = url;
    this.pageTitle = url;
    await tab.navigate(url);
    this.syncMeta();
  }

  async back(): Promise<void> {
    await this.getTab().back();
  }

  async forward(): Promise<void> {
    await this.getTab().forward();
  }

  /**
   * Duplicate active content tab in the *same* BrowserContext/Session
   * (cookies/login carry over). Does NOT create a new BrowserContext.
   * Copies current URL; title mirrors URL when page title is unknown.
   */
  async duplicateTab(): Promise<Tab> {
    const session = this.getSession();
    const url = this.pageUrl || "about:blank";
    const title = this.pageTitle || url;
    const newTab = await session.createTab("about:blank");

    if (this.saveNothing) {
      await newTab.setNoCache(true);
    }
    if (url && url !== "about:blank") {
      await newTab.navigate(url);
    }

    if (this.tab) this.extraTabs.add(this.tab);
    this.tab = newTab;
    this.pageUrl = url;
    this.pageTitle = title;
    this.syncMeta();
    this.onTabChanged?.(newTab);
    return newTab;
  }

  /**
   * Product toggle: ON = ephemeral context + cache/SW; OFF = normal context.
   * OFF does not auto-reload.
   */
  async setSaveNothing(enabled: boolean): Promise<void> {
    const plan = planSaveNothingTransition(this.saveNothing, enabled);
    if (plan.kind === "noop") return;

    const url = this.pageUrl;
    if (plan.kind === "enter-ephemeral") {
      await this.openContent({
        ephemeral: true,
        url,
        applyCacheSw: true,
      });
      this.saveNothing = true;
      this.syncMeta("Save nothing ON (ephemeral + cache/SW)");
      return;
    }

    await this.openContent({
      ephemeral: false,
      url,
      applyCacheSw: false,
    });
    this.saveNothing = false;
    this.syncMeta("Save nothing OFF (normal browsing)");
  }

  async close(): Promise<void> {
    for (const t of this.extraTabs) {
      await t.close().catch(() => undefined);
    }
    this.extraTabs.clear();
    if (this.tab) {
      await this.tab.close().catch(() => undefined);
      this.tab = null;
    }
    if (this.session) {
      await this.session.close().catch(() => undefined);
      this.session = null;
    }
  }

  private async openContent(opts: {
    ephemeral: boolean;
    url: string;
    applyCacheSw: boolean;
  }): Promise<void> {
    const prevTab = this.tab;
    const prevExtras = [...this.extraTabs];
    const prevSession = this.session;
    this.extraTabs.clear();

    const session = await this.engine.createBrowserContext({
      ephemeral: opts.ephemeral,
    });
    const tab = await session.createTab("about:blank");

    this.session = session;
    this.tab = tab;
    this.pageUrl = opts.url;
    this.pageTitle = opts.url;
    this.syncMeta();
    this.onTabChanged?.(tab);

    if (opts.applyCacheSw) {
      await tab.setNoCache(true);
    }

    if (opts.url && opts.url !== "about:blank") {
      await tab.navigate(opts.url);
    }

    for (const t of prevExtras) await t.close().catch(() => undefined);
    if (prevTab) await prevTab.close().catch(() => undefined);
    if (prevSession) await prevSession.close().catch(() => undefined);
  }

  private syncMeta(status?: string): void {
    const tab = this.tab;
    if (!tab) return;
    this.buffer.setMeta({
      chromium: { version: this.chromiumVersion },
      tab: {
        id: tab.id,
        url: this.pageUrl,
        title: this.pageTitle || this.pageUrl,
        noCacheEnabled: tab.noCacheEnabled || this.saveNothing,
      },
      appVersion: this.appVersion,
    });
    void status;
  }
}
