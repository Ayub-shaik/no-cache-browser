/**
 * Tiny WebSocket wrapper using Node 22+ global WebSocket when available,
 * otherwise the `ws` package is not required — we use undici/global.
 * Node 20+ provides experimental WebSocket behind flag; Node 22 has it stable.
 * Fallback: use node:http upgrade via a minimal implementation with `ws` optional.
 *
 * For engines >=20 we rely on globalThis.WebSocket (available in Node 21.7+/22).
 * If missing, throw a clear install hint.
 */

type WsListener = (...args: unknown[]) => void;

export default class WebSocket {
  private impl: globalThis.WebSocket;
  private eventMap = new Map<string, Set<WsListener>>();

  constructor(url: string) {
    const WS = globalThis.WebSocket;
    if (!WS) {
      throw new Error(
        "Global WebSocket is required (Node.js 22+ recommended). Upgrade Node or open an issue to add a ws fallback.",
      );
    }
    this.impl = new WS(url);
    this.impl.addEventListener("open", () => this.emit("open"));
    this.impl.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : String(ev.data);
      this.emit("message", data);
    });
    this.impl.addEventListener("error", () =>
      this.emit("error", new Error("WebSocket error")),
    );
    this.impl.addEventListener("close", () => this.emit("close"));
  }

  once(event: string, handler: WsListener): void {
    const wrap: WsListener = (...args) => {
      this.off(event, wrap);
      handler(...args);
    };
    this.on(event, wrap);
  }

  on(event: string, handler: WsListener): void {
    let set = this.eventMap.get(event);
    if (!set) {
      set = new Set();
      this.eventMap.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: WsListener): void {
    this.eventMap.get(event)?.delete(handler);
  }

  send(data: string): void {
    this.impl.send(data);
  }

  close(): void {
    this.impl.close();
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.eventMap.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(...args);
  }
}
