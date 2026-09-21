import WebSocket from "./ws-shim.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface CdpResponse {
  id?: number;
  method?: string;
  params?: Json;
  result?: Json;
  error?: { message: string; code?: number };
  sessionId?: string;
}

type Pending = {
  resolve: (value: Json | undefined) => void;
  reject: (err: Error) => void;
};

/**
 * Minimal CDP client. Internal to engine/chromium only.
 */
export class CdpConnection {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Map<string, Set<(params: Json | undefined, sessionId?: string) => void>>();
  private openPromise: Promise<void>;

  constructor(webSocketDebuggerUrl: string) {
    this.ws = new WebSocket(webSocketDebuggerUrl);
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", (err) => reject(err));
    });
    this.ws.on("message", (data) => this.onMessage(String(data)));
  }

  async connect(): Promise<void> {
    await this.openPromise;
  }

  on(
    method: string,
    handler: (params: Json | undefined, sessionId?: string) => void,
  ): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  async send<
    T extends Json | undefined = Json | undefined,
  >(method: string, params?: Json, sessionId?: string): Promise<T> {
    await this.openPromise;
    const id = this.nextId++;
    const message: Record<string, unknown> = { id, method };
    if (params !== undefined) message.params = params;
    if (sessionId) message.sessionId = sessionId;

    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
    this.ws.send(JSON.stringify(message));
    return result;
  }

  close(): void {
    for (const [, p] of this.pending) {
      p.reject(new Error("CDP connection closed"));
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  private onMessage(raw: string): void {
    let msg: CdpResponse;
    try {
      msg = JSON.parse(raw) as CdpResponse;
    } catch {
      return;
    }
    if (msg.id != null) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      const set = this.listeners.get(msg.method);
      if (!set) return;
      for (const handler of set) {
        handler(msg.params, msg.sessionId);
      }
    }
  }
}
