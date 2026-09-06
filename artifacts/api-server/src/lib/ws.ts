import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (socket) => {
    logger.info("WebSocket client connected");
    socket.send(JSON.stringify({ type: "connected" }));

    socket.on("close", () => {
      logger.info("WebSocket client disconnected");
    });
  });
}

export function broadcast(type: string, payload: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ type, payload });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
