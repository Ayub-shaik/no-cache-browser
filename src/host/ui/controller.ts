import type { Engine, Session, Tab } from "../../engine/types.js";
import { planSaveNothingTransition } from "../../engine/save-nothing.js";
import type { SessionBuffer } from "../../devex/session-buffer.js";

export interface TabSummary {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface ContentControllerOptions {
  engine: Engine;
  buffer: SessionBuffer;
  initialUrl: string;
  engineVersion: string;
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
  private extraTabs = new Map<string, Tab>();
  /** Last-known URL/title per tab id (for the NCB window tab strip). */
  private tabMeta = new Map<string, { url: string; title: string }>();
  private saveNothing = false;
  private pageUrl: string;
  private pageTitle: string;
  private readonly engine: Engine;
  private readonly buffer: SessionBuffer;
  private readonly engineVersion: string;
  private readonly appVersion: string;
  private readonly onTabChanged?: (tab: Tab) => void;

  constructor(opts: ContentControllerOptions) {
    this.engine = opts.engine;
    this.buffer = opts.buffer;
    this.pageUrl = opts.initialUrl;
    this.pageTitle = opts.initialUrl;
    this.engineVersion = opts.engineVersion;
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

  /** Tab strip data for the NCB product window (same BrowserContext). */
  listTabs(): TabSummary[] {
    const out: TabSummary[] = [];
    for (const t of this.extraTabs.values()) {
      const meta = this.tabMeta.get(t.id);
      out.push({
        id: t.id,
        url: meta?.url ?? "about:blank",
        title: meta?.title ?? meta?.url ?? t.id.slice(0, 8),
        active: false,
      });
    }
    if (this.tab) {
      out.push({
        id: this.tab.id,
        url: this.pageUrl,
        title: this.pageTitle || this.pageUrl,
        active: true,
      });
    }
    return out;
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
    this.rememberMeta(tab.id, url, url);
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

    if (this.tab) {
      this.rememberMeta(this.tab.id, this.pageUrl, this.pageTitle);
      this.extraTabs.set(this.tab.id, this.tab);
    }
    this.tab = newTab;
    this.pageUrl = url;
    this.pageTitle = title;
    this.rememberMeta(newTab.id, url, title);
    this.syncMeta();
    this.onTabChanged?.(newTab);
    return newTab;
  }

  /** Switch active content tab within the same BrowserContext (tab strip). */
  async activateTab(tabId: string): Promise<Tab> {
    if (this.tab?.id === tabId) return this.getTab();
    const next = this.extraTabs.get(tabId);
    if (!next) throw new Error(`Unknown tab ${tabId}`);

    if (this.tab) {
      this.rememberMeta(this.tab.id, this.pageUrl, this.pageTitle);
      this.extraTabs.set(this.tab.id, this.tab);
    }
    this.extraTabs.delete(tabId);
    this.tab = next;
    const meta = this.tabMeta.get(tabId);
    this.pageUrl = meta?.url ?? "about:blank";
    this.pageTitle = meta?.title ?? this.pageUrl;
    this.syncMeta();
    this.onTabChanged?.(next);
    return next;
  }

  /**
   * Close a content tab. Active tab switches to another open tab if any.
   * Downloads for the closed tab continue while the engine process runs.
   */
  async closeTab(tabId: string): Promise<void> {
    if (this.tab?.id === tabId) {
      await this.tab.close().catch(() => undefined);
      this.tabMeta.delete(tabId);
      this.tab = null;
      const nextId = this.extraTabs.keys().next().value as string | undefined;
      if (nextId) {
        const next = this.extraTabs.get(nextId)!;
        this.extraTabs.delete(nextId);
        this.tab = next;
        const meta = this.tabMeta.get(nextId);
        this.pageUrl = meta?.url ?? "about:blank";
        this.pageTitle = meta?.title ?? this.pageUrl;
        this.syncMeta();
        this.onTabChanged?.(next);
      }
      return;
    }
    const extra = this.extraTabs.get(tabId);
    if (!extra) return;
    this.extraTabs.delete(tabId);
    this.tabMeta.delete(tabId);
    await extra.close().catch(() => undefined);
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
    for (const t of this.extraTabs.values()) {
      await t.close().catch(() => undefined);
    }
    this.extraTabs.clear();
    this.tabMeta.clear();
    if (this.tab) {
      await this.tab.close().catch(() => undefined);
      this.tab = null;
    }
    if (this.session) {
      await this.session.close().catch(() => undefined);
      this.session = null;
    }
  }

  private rememberMeta(id: string, url: string, title: string): void {
    this.tabMeta.set(id, { url, title: title || url });
  }

  private async openContent(opts: {
    ephemeral: boolean;
    url: string;
    applyCacheSw: boolean;
  }): Promise<void> {
    const prevTab = this.tab;
    const prevExtras = [...this.extraTabs.values()];
    const prevSession = this.session;
    this.extraTabs.clear();
    this.tabMeta.clear();

    const session = await this.engine.createBrowserContext({
      ephemeral: opts.ephemeral,
    });
    const tab = await session.createTab("about:blank");

    this.session = session;
    this.tab = tab;
    this.pageUrl = opts.url;
    this.pageTitle = opts.url;
    this.rememberMeta(tab.id, opts.url, opts.url);
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
    this.rememberMeta(tab.id, this.pageUrl, this.pageTitle || this.pageUrl);
    this.buffer.setMeta({
      engine: { version: this.engineVersion },
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
