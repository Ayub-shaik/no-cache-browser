import type { ConsoleEvent, NetworkEvent, Unsubscribe } from "../types.js";
import type { CdpConnection } from "./cdp.js";

export function headersArrayToMap(
  headers?: Array<{ name: string; value: string }> | Record<string, string>,
): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const h of headers) out[h.name] = h.value;
    return out;
  }
  return { ...headers };
}

export function attachCaptureListeners(opts: {
  cdp: CdpConnection;
  cdpSessionId: string;
  onCommitted: () => void;
  consoleHandlers: Set<(event: ConsoleEvent) => void>;
  networkHandlers: Set<(event: NetworkEvent) => void>;
}): Unsubscribe[] {
  const { cdp, cdpSessionId, onCommitted, consoleHandlers, networkHandlers } = opts;
  const unsubscribers: Unsubscribe[] = [];

  unsubscribers.push(
    cdp.on("Page.frameNavigated", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      const frame = (params as { frame?: { parentId?: string } }).frame;
      if (!frame || frame.parentId) return;
      onCommitted();
    }),
  );

  unsubscribers.push(
    cdp.on("Runtime.consoleAPICalled", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      if (consoleHandlers.size === 0) return;
      const p = params as {
        type?: string;
        args?: Array<{ type?: string; value?: unknown; description?: string }>;
        timestamp?: number;
        stackTrace?: {
          callFrames?: Array<{ url?: string; lineNumber?: number; columnNumber?: number }>;
        };
      };
      const text = (p.args ?? [])
        .map((a) => {
          if (a.value !== undefined) return String(a.value);
          if (a.description) return a.description;
          return a.type ?? "";
        })
        .join(" ");
      const top = p.stackTrace?.callFrames?.[0];
      const event: ConsoleEvent = {
        timestamp: p.timestamp ?? Date.now(),
        level: p.type ?? "log",
        text,
        url: top?.url,
        lineNumber: top?.lineNumber,
        columnNumber: top?.columnNumber,
      };
      for (const h of consoleHandlers) h(event);
    }),
  );

  unsubscribers.push(
    cdp.on("Network.requestWillBeSent", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      if (networkHandlers.size === 0) return;
      const p = params as {
        requestId: string;
        request?: { url?: string; method?: string; headers?: Record<string, string> };
        timestamp?: number;
        wallTime?: number;
      };
      const event: NetworkEvent = {
        kind: "request",
        requestId: p.requestId,
        url: p.request?.url ?? "",
        method: p.request?.method ?? "GET",
        timestamp: p.wallTime ? p.wallTime * 1000 : (p.timestamp ?? Date.now()),
        headers: headersArrayToMap(p.request?.headers),
      };
      for (const h of networkHandlers) h(event);
    }),
  );

  unsubscribers.push(
    cdp.on("Network.responseReceived", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      if (networkHandlers.size === 0) return;
      const p = params as {
        requestId: string;
        timestamp?: number;
        response?: {
          status?: number;
          statusText?: string;
          mimeType?: string;
          headers?: Record<string, string>;
        };
      };
      const event: NetworkEvent = {
        kind: "response",
        requestId: p.requestId,
        status: p.response?.status ?? 0,
        statusText: p.response?.statusText ?? "",
        timestamp: p.timestamp ?? Date.now(),
        mimeType: p.response?.mimeType,
        headers: headersArrayToMap(p.response?.headers),
      };
      for (const h of networkHandlers) h(event);
    }),
  );

  unsubscribers.push(
    cdp.on("Network.loadingFinished", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      if (networkHandlers.size === 0) return;
      const p = params as {
        requestId: string;
        timestamp?: number;
        encodedDataLength?: number;
      };
      const event: NetworkEvent = {
        kind: "finished",
        requestId: p.requestId,
        timestamp: p.timestamp ?? Date.now(),
        encodedDataLength: p.encodedDataLength,
      };
      for (const h of networkHandlers) h(event);
    }),
  );

  unsubscribers.push(
    cdp.on("Network.loadingFailed", (params, sessionId) => {
      if (sessionId !== cdpSessionId || !params || typeof params !== "object") return;
      if (networkHandlers.size === 0) return;
      const p = params as {
        requestId: string;
        timestamp?: number;
        errorText?: string;
        canceled?: boolean;
      };
      const event: NetworkEvent = {
        kind: "failed",
        requestId: p.requestId,
        timestamp: p.encodedDataLength as unknown as number,
        errorText: p.errorText ?? "failed",
        canceled: p.canceled,
      };
      for (const h of networkHandlers) h(event);
    }),
  );

  return unsubscribers;
}
