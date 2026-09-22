import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ShellClientMessage =
  | { type: "navigate"; url: string }
  | { type: "toggle"; enabled: boolean }
  | { type: "back" }
  | { type: "forward" }
  | { type: "duplicate" }
  | { type: "go"; url?: string };

export interface ShellState {
  url: string;
  noCacheEnabled: boolean;
  status: string;
}

export interface ShellServerHandlers {
  onNavigate: (url: string) => Promise<void> | void;
  onToggle: (enabled: boolean) => Promise<void> | void;
  onBack: () => Promise<void> | void;
  onForward: () => Promise<void> | void;
  onDuplicate: () => Promise<void> | void;
  getState: () => ShellState;
}

export interface ShellServer {
  port: number;
  url: string;
  close: () => Promise<void>;
  broadcastState: () => void;
}

function loadShellHtml(): string {
  const candidates = [
    join(__dirname, "static", "index.html"),
    join(process.cwd(), "src", "host", "shell", "static", "index.html"),
    join(process.cwd(), "dist", "host", "shell", "static", "index.html"),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error("NCB shell HTML not found (src/host/shell/static/index.html)");
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Tiny local HTTP + WebSocket control plane for NCB-branded top chrome.
 * Serves only our shell — no Google/Chrome branding.
 */
export async function startShellServer(handlers: ShellServerHandlers): Promise<ShellServer> {
  const html = loadShellHtml();
  const clients = new Set<WebSocket>();

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = req.url?.split("?")[0] ?? "/";
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }
    res.writeHead(404).end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  if (!addr || typeof addr === "string") {
    httpServer.close();
    throw new Error("Failed to bind NCB shell server");
  }
  const port = addr.port;

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const broadcastState = (): void => {
    const state = handlers.getState();
    const payload = JSON.stringify({ type: "state", ...state });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "state", ...handlers.getState() }));
    ws.on("message", (data) => {
      void (async () => {
        let msg: ShellClientMessage;
        try {
          msg = JSON.parse(String(data)) as ShellClientMessage;
        } catch {
          return;
        }
        try {
          if (msg.type === "navigate" || msg.type === "go") {
            const url = normalizeUrl(msg.url ?? handlers.getState().url);
            await handlers.onNavigate(url);
          } else if (msg.type === "toggle") {
            await handlers.onToggle(Boolean(msg.enabled));
          } else if (msg.type === "back") {
            await handlers.onBack();
          } else if (msg.type === "forward") {
            await handlers.onForward();
          } else if (msg.type === "duplicate") {
            await handlers.onDuplicate();
          }
          broadcastState();
        } catch (err) {
          const status = err instanceof Error ? err.message : String(err);
          ws.send(
            JSON.stringify({
              type: "state",
              ...handlers.getState(),
              status: `Error: ${status}`,
            }),
          );
        }
      })();
    });
    ws.on("close", () => clients.delete(ws));
  });

  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    broadcastState,
    close: async () => {
      for (const ws of clients) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}

export { normalizeUrl };
