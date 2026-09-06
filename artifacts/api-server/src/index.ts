import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/ws";
import { initESP32ConnectionService, getLocalIpAddress } from "./lib/gateLogger";

const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const lanIP = getLocalIpAddress();
  logger.info({ port, lanIP }, "Server listening on LAN");
});

initWebSocketServer(server);
initESP32ConnectionService();
