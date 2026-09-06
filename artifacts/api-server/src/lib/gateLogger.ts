import net from "net";
import os from "os";
import { eq, and } from "drizzle-orm";
import {
  db,
  accessLogsTable,
  vehiclesTable,
  espDevicesTable,
  rfidCardsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { broadcast } from "./ws";

const TCP_PORT = Number(process.env.ESP32_TCP_PORT ?? 5000);
const DEVICE_NAME = "ESP32 Gate Logger";

let esp32Socket: net.Socket | null = null;

// Interface name patterns that indicate virtual adapters (VPN, Hyper-V,
// VMware/VirtualBox, WSL, Docker) rather than a real WiFi/Ethernet NIC.
const VIRTUAL_IFACE_PATTERNS = [
  /vEthernet/i, /Virtual/i, /VMware/i, /VirtualBox/i,
  /Hyper-V/i, /WSL/i, /Docker/i, /Loopback/i, /Tailscale/i,
  /ZeroTier/i, /TAP/i, /TUN/i,
];

// Private-LAN ranges typical home/office routers hand out.
// Prefer these over anything else (e.g. 172.16-31.x.x used by
// virtual switches is deliberately NOT prioritized here).
function isLikelyRealLan(address: string): boolean {
  return address.startsWith("192.168.") || address.startsWith("10.");
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];

  for (const name of Object.keys(interfaces)) {
    const interfaceList = interfaces[name];
    if (!interfaceList) continue;
    for (const netInterface of interfaceList) {
      if (netInterface.family === "IPv4" && !netInterface.internal) {
        candidates.push({ name, address: netInterface.address });
      }
    }
  }

  // 1. Prefer a real-looking LAN IP on a non-virtual adapter
  const best = candidates.find(
    (c) => isLikelyRealLan(c.address) && !VIRTUAL_IFACE_PATTERNS.some((p) => p.test(c.name))
  );
  if (best) return best.address;

  // 2. Fall back to any non-virtual adapter
  const fallback = candidates.find(
    (c) => !VIRTUAL_IFACE_PATTERNS.some((p) => p.test(c.name))
  );
  if (fallback) return fallback.address;

  // 3. Last resort: whatever was found first
  if (candidates.length > 0) return candidates[0].address;

  return "127.0.0.1";
}

function parseESP32DateTime(dateStr: string, timeStr: string): Date | null {
  try {
    const [day, month, year] = dateStr.split("/").map(Number);
    const [hour, minute, second] = timeStr.split(":").map(Number);
    if ([day, month, year, hour, minute, second].some((n) => isNaN(n))) return null;
    const d = new Date(year, month - 1, day, hour, minute, second);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

async function getOrCreateESP32Device(ipAddress: string): Promise<number> {
  const [device] = await db
    .select()
    .from(espDevicesTable)
    .where(eq(espDevicesTable.name, DEVICE_NAME))
    .limit(1);

  const now = new Date();
  if (device) {
    const [updated] = await db
      .update(espDevicesTable)
      .set({ status: "online", lastSeenAt: now, ipAddress })
      .where(eq(espDevicesTable.id, device.id))
      .returning();
    broadcast("esp_device_heartbeat", updated);
    return device.id;
  } else {
    const [created] = await db
      .insert(espDevicesTable)
      .values({
        name: DEVICE_NAME,
        location: "Main Gate",
        ipAddress,
        status: "online",
        lastSeenAt: now,
      })
      .returning();
    broadcast("esp_device_created", created);
    return created.id;
  }
}

async function updateDeviceStatus(status: "online" | "offline") {
  try {
    const [device] = await db
      .select()
      .from(espDevicesTable)
      .where(eq(espDevicesTable.name, DEVICE_NAME))
      .limit(1);

    if (device) {
      const [updated] = await db
        .update(espDevicesTable)
        .set({ status, lastSeenAt: new Date() })
        .where(eq(espDevicesTable.id, device.id))
        .returning();
      broadcast("esp_device_heartbeat", updated);
    }
  } catch (err) {
    logger.error({ err }, "Failed to update ESP32 device status in database");
  }
}

async function processRecord(
  record: { epc: string; date: string; time: string; dir: string },
  deviceId: number
): Promise<boolean> {
  const { epc, date, time, dir } = record;
  const timestamp = parseESP32DateTime(date, time);
  if (!timestamp) {
    logger.warn({ record }, "Skipping record due to invalid date/time values");
    return false;
  }

  const [existing] = await db
    .select()
    .from(accessLogsTable)
    .where(
      and(
        eq(accessLogsTable.cardUid, epc),
        eq(accessLogsTable.direction, dir),
        eq(accessLogsTable.timestamp, timestamp)
      )
    )
    .limit(1);

  if (existing) return false;

  const [card] = await db
    .select()
    .from(rfidCardsTable)
    .where(eq(rfidCardsTable.cardUid, epc))
    .limit(1);

  const authorized = Boolean(card?.active);

  const [inserted] = await db
    .insert(accessLogsTable)
    .values({
      cardUid: epc,
      direction: dir,
      deviceId,
      vehicleId: card?.vehicleId ?? null,
      authorized,
      timestamp,
    })
    .returning();

  const [enriched] = await db
    .select({
      id: accessLogsTable.id,
      cardUid: accessLogsTable.cardUid,
      vehicleId: accessLogsTable.vehicleId,
      plateNumber: vehiclesTable.plateNumber,
      ownerName: vehiclesTable.ownerName,
      direction: accessLogsTable.direction,
      authorized: accessLogsTable.authorized,
      deviceId: accessLogsTable.deviceId,
      deviceName: espDevicesTable.name,
      timestamp: accessLogsTable.timestamp,
    })
    .from(accessLogsTable)
    .leftJoin(vehiclesTable, eq(accessLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(espDevicesTable, eq(accessLogsTable.deviceId, espDevicesTable.id))
    .where(eq(accessLogsTable.id, inserted.id))
    .limit(1);

  if (enriched) broadcast("access_log_created", enriched);
  return true;
}

function sendToESP32(obj: Record<string, unknown>) {
  if (esp32Socket && !esp32Socket.destroyed) {
    esp32Socket.write(JSON.stringify(obj) + "\n");
  }
}

export function initESP32ConnectionService() {
  const server = net.createServer((socket) => {
    const remoteIp = socket.remoteAddress?.replace("::ffff:", "") ?? "unknown";
    logger.info(`ESP32 Gate Logger connected from ${remoteIp}`);
    esp32Socket = socket;

    let buffer = "";

    socket.on("data", async (data) => {
      buffer += data.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const payload = JSON.parse(trimmed);

          if (payload.type === "status" && payload.status === "online") {
            const ip = payload.ip || remoteIp;
            logger.info(`ESP32 Gate Logger reports online at IP: ${ip}`);
            await getOrCreateESP32Device(ip);
            logger.info("Requesting historical log dump...");
            sendToESP32({ type: "cmd", cmd: "dump" });
          } else if (payload.type === "detection") {
            const deviceId = await getOrCreateESP32Device(remoteIp);
            await processRecord(payload, deviceId);
          } else if (payload.type === "sync_response" && Array.isArray(payload.records)) {
            const deviceId = await getOrCreateESP32Device(remoteIp);
            logger.info(`Fetched ${payload.records.length} historical logs. Processing...`);
            let newLogsInserted = 0;
            for (const record of payload.records) {
              const isNew = await processRecord(record, deviceId);
              if (isNew) newLogsInserted++;
            }
            logger.info(`Logs synchronization finished. Added ${newLogsInserted} new logs.`);
            if (payload.records.length > 0) {
              logger.info("Requesting ESP32 to clear its local records...");
              sendToESP32({ type: "cmd", cmd: "clear" });
            }
          }
        } catch (err: any) {
          logger.error({ err: err.message, line: trimmed }, "Error processing ESP32 TCP message");
        }
      }
    });

    socket.on("error", (err) => {
      logger.warn(`ESP32 TCP socket error: ${err.message}`);
    });

    socket.on("close", async () => {
      logger.warn("ESP32 Gate Logger disconnected");
      if (esp32Socket === socket) esp32Socket = null;
      await updateDeviceStatus("offline");
    });
  });

  server.listen(TCP_PORT, "0.0.0.0", () => {
    const lanIP = getLocalIpAddress();
    logger.info(`ESP32 TCP server listening on port ${TCP_PORT}. LAN IP: ${lanIP}`);
    logger.info(`Point the firmware's DESKTOP_HOST at: ${lanIP}`);
  });

  server.on("error", (err) => {
    logger.error({ err }, "ESP32 TCP server error");
  });
}