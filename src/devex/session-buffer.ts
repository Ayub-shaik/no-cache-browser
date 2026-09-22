import type {
  ConsoleEvent,
  NetworkEvent,
  Tab,
} from "../engine/types.js";

export const DEFAULT_CONSOLE_CAP = 2000;
export const DEFAULT_BODY_CAP = 256 * 1024;

export interface ConsoleEntry {
  timestamp: string;
  level: string;
  text: string;
  url?: string;
  line?: number;
  column?: number;
}

export interface SessionTabMeta {
  id: string;
  url: string;
  title: string;
  noCacheEnabled: boolean;
}

export interface EngineVersionMeta {
  version: string;
}

export interface SessionBufferMeta {
  /** Pinned engine binary version string for export metadata. */
  engine?: EngineVersionMeta;
  tab: SessionTabMeta;
  appVersion?: string;
}

interface PendingHarEntry {
  requestId: string;
  startedDateTime: string;
  startMs: number;
  endMs?: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  mimeType?: string;
  encodedDataLength?: number;
  errorText?: string;
  bodyText?: string;
  bodyEncoding?: string;
  bodyOmitted?: string;
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

function headersToHar(headers: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/**
 * In-memory console + network capture for one tab.
 * Must not clear across setNoCache's single forced reload.
 */
export class SessionBuffer {
  readonly startedAt: string;
  private readonly consoleCap: number;
  private readonly bodyCap: number;
  private consoleEntries: ConsoleEntry[] = [];
  private readonly networkById = new Map<string, PendingHarEntry>();
  private readonly networkOrder: string[] = [];
  private meta: SessionBufferMeta | null = null;

  constructor(opts?: { consoleCap?: number; bodyCap?: number }) {
    this.consoleCap = opts?.consoleCap ?? DEFAULT_CONSOLE_CAP;
    this.bodyCap = opts?.bodyCap ?? DEFAULT_BODY_CAP;
    this.startedAt = new Date().toISOString();
  }

  setMeta(meta: SessionBufferMeta): void {
    this.meta = meta;
  }

  getMeta(): SessionBufferMeta | null {
    return this.meta;
  }

  /** Explicit clear only — never call on navigation/reload. */
  clear(): void {
    this.consoleEntries = [];
    this.networkById.clear();
    this.networkOrder.length = 0;
  }

  getConsoleEntries(): readonly ConsoleEntry[] {
    return this.consoleEntries;
  }

  getNetworkRequestIds(): readonly string[] {
    return this.networkOrder;
  }

  appendConsole(event: ConsoleEvent): ConsoleEntry {
    const entry: ConsoleEntry = {
      timestamp: msToIso(event.timestamp),
      level: event.level,
      text: event.text,
      url: event.url,
      line: event.lineNumber,
      column: event.columnNumber,
    };
    this.consoleEntries.push(entry);
    if (this.consoleEntries.length > this.consoleCap) {
      this.consoleEntries.splice(0, this.consoleEntries.length - this.consoleCap);
    }
    return entry;
  }

  appendNetwork(event: NetworkEvent): void {
    if (event.kind === "request") {
      if (!this.networkById.has(event.requestId)) {
        this.networkOrder.push(event.requestId);
      }
      this.networkById.set(event.requestId, {
        requestId: event.requestId,
        startedDateTime: msToIso(event.timestamp),
        startMs: event.timestamp,
        method: event.method,
        url: event.url,
        requestHeaders: { ...event.headers },
      });
      return;
    }

    let pending = this.networkById.get(event.requestId);
    if (!pending) {
      pending = {
        requestId: event.requestId,
        startedDateTime: msToIso(event.timestamp),
        startMs: event.timestamp,
        method: "GET",
        url: "",
        requestHeaders: {},
      };
      this.networkOrder.push(event.requestId);
      this.networkById.set(event.requestId, pending);
    }

    if (event.kind === "response") {
      pending.status = event.status;
      pending.statusText = event.statusText;
      pending.responseHeaders = { ...event.headers };
      pending.mimeType = event.mimeType;
      return;
    }

    if (event.kind === "finished") {
      pending.endMs = event.timestamp;
      pending.encodedDataLength = event.encodedDataLength;
      return;
    }

    if (event.kind === "failed") {
      pending.endMs = event.timestamp;
      pending.errorText = event.errorText;
      if (pending.status === undefined) pending.status = 0;
      pending.statusText = pending.statusText ?? "";
    }
  }

  /**
   * Attach sink handlers to a tab. Subscription must outlive setNoCache reload.
   * Does not clear the buffer.
   */
  attach(tab: Tab): () => void {
    return tab.subscribe({
      onConsole: (e) => {
        this.appendConsole(e);
      },
      onNetwork: (e) => {
        this.appendNetwork(e);
      },
    });
  }

  toHar(opts?: { pageTitle?: string }): Record<string, unknown> {
    const title = opts?.pageTitle ?? this.meta?.tab.title ?? this.meta?.tab.url ?? "page_1";
    const entries = this.networkOrder.map((id) => this.toHarEntry(this.networkById.get(id)!));
    return {
      version: "1.2",
      creator: {
        name: "no-cache-browser",
        version: this.meta?.appVersion ?? "0.1.0",
      },
      pages: [
        {
          startedDateTime: this.startedAt,
          id: "page_1",
          title,
          pageTimings: { onContentLoad: -1, onLoad: -1 },
        },
      ],
      entries,
    };
  }

  private toHarEntry(pending: PendingHarEntry): Record<string, unknown> {
    const endMs = pending.endMs ?? pending.startMs;
    const time = Math.max(0, endMs - pending.startMs);
    const status = pending.status ?? 0;
    const content: Record<string, unknown> = {
      size: pending.encodedDataLength ?? -1,
      mimeType: pending.mimeType ?? "",
    };
    if (pending.bodyText !== undefined) {
      content.text = pending.bodyText;
      if (pending.bodyEncoding) content.encoding = pending.bodyEncoding;
    }
    const entry: Record<string, unknown> = {
      startedDateTime: pending.startedDateTime,
      time,
      request: {
        method: pending.method,
        url: pending.url,
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: headersToHar(pending.requestHeaders),
        queryString: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status,
        statusText: pending.statusText ?? "",
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: headersToHar(pending.responseHeaders ?? {}),
        content,
        redirectURL: "",
        headersSize: -1,
        bodySize: pending.encodedDataLength ?? -1,
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        send: 0,
        wait: time,
        receive: 0,
        ssl: -1,
      },
      pageref: "page_1",
      _ncb: { requestId: pending.requestId },
    };
    if (pending.errorText) {
      entry.comment = pending.errorText;
      (entry._ncb as Record<string, unknown>).error = pending.errorText;
    }
    if (pending.bodyOmitted) {
      entry.comment = [entry.comment, pending.bodyOmitted].filter(Boolean).join("; ");
    }
    return entry;
  }

  async fillBodies(tab: Tab): Promise<void> {
    for (const id of this.networkOrder) {
      const pending = this.networkById.get(id);
      if (!pending || pending.status === undefined || pending.status === 0) continue;
      if (pending.bodyText !== undefined || pending.bodyOmitted) continue;
      try {
        const { body, base64Encoded } = await tab.getNetworkResponseBody(id);
        const byteLength = base64Encoded
          ? Buffer.from(body, "base64").byteLength
          : Buffer.byteLength(body, "utf8");
        if (byteLength > this.bodyCap) {
          pending.bodyOmitted = `body omitted: ${byteLength} bytes > ${this.bodyCap} cap`;
          continue;
        }
        pending.bodyText = body;
        if (base64Encoded) pending.bodyEncoding = "base64";
      } catch {
        pending.bodyOmitted = "body unavailable";
      }
    }
  }

  async toSessionJson(
    tab: Tab,
    opts?: { includeBodies?: boolean; pageUrl?: string; pageTitle?: string },
  ): Promise<Record<string, unknown>> {
    if (opts?.includeBodies !== false) {
      await this.fillBodies(tab);
    }
    const noCacheEnabled = tab.noCacheEnabled;
    const tabMeta: SessionTabMeta = {
      id: this.meta?.tab.id ?? tab.id,
      url: opts?.pageUrl ?? this.meta?.tab.url ?? "",
      title: opts?.pageTitle ?? this.meta?.tab.title ?? opts?.pageUrl ?? this.meta?.tab.url ?? "",
      noCacheEnabled,
    };
    const endedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      exportedAt: endedAt,
      app: {
        name: "no-cache-browser",
        version: this.meta?.appVersion ?? "0.1.0",
      },
      engine: {
        version: this.meta?.engine?.version ?? "",
      },
      tab: tabMeta,
      capture: {
        startedAt: this.startedAt,
        endedAt,
      },
      console: this.consoleEntries,
      har: this.toHar({ pageTitle: tabMeta.title || tabMeta.url }),
    };
  }
}
