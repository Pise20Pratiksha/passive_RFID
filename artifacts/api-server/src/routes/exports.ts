import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  db,
  accessLogsTable,
  vehiclesTable,
  espDevicesTable,
} from "@workspace/db";

const router: IRouter = Router();

interface ExportFilters {
  startDate?: string;
  endDate?: string;
  vehicleId?: number;
  direction?: "IN" | "OUT";
  authorized?: boolean;
  search?: string;
}

function parseFilters(query: Record<string, unknown>): ExportFilters {
  const filters: ExportFilters = {};
  if (typeof query.startDate === "string") filters.startDate = query.startDate;
  if (typeof query.endDate === "string") filters.endDate = query.endDate;
  if (typeof query.vehicleId === "string" && query.vehicleId !== "") {
    const parsed = Number(query.vehicleId);
    if (!Number.isNaN(parsed)) filters.vehicleId = parsed;
  }
  if (query.direction === "IN" || query.direction === "OUT") {
    filters.direction = query.direction;
  }
  if (query.authorized === "true") filters.authorized = true;
  if (query.authorized === "false") filters.authorized = false;
  if (typeof query.search === "string" && query.search !== "") {
    filters.search = query.search;
  }
  return filters;
}

async function fetchLogs(filters: ExportFilters) {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(
      gte(accessLogsTable.timestamp, new Date(`${filters.startDate}T00:00:00.000Z`)),
    );
  }
  if (filters.endDate) {
    conditions.push(
      lte(accessLogsTable.timestamp, new Date(`${filters.endDate}T23:59:59.999Z`)),
    );
  }
  if (filters.vehicleId) {
    conditions.push(eq(accessLogsTable.vehicleId, filters.vehicleId));
  }
  if (filters.direction) {
    conditions.push(eq(accessLogsTable.direction, filters.direction));
  }
  if (filters.authorized !== undefined) {
    conditions.push(eq(accessLogsTable.authorized, filters.authorized));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(accessLogsTable.cardUid, `%${filters.search}%`),
        ilike(vehiclesTable.plateNumber, `%${filters.search}%`),
        ilike(vehiclesTable.ownerName, `%${filters.search}%`),
      ),
    );
  }

  return db
    .select({
      id: accessLogsTable.id,
      cardUid: accessLogsTable.cardUid,
      plateNumber: vehiclesTable.plateNumber,
      ownerName: vehiclesTable.ownerName,
      direction: accessLogsTable.direction,
      authorized: accessLogsTable.authorized,
      deviceName: espDevicesTable.name,
      timestamp: accessLogsTable.timestamp,
    })
    .from(accessLogsTable)
    .leftJoin(vehiclesTable, eq(accessLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(espDevicesTable, eq(accessLogsTable.deviceId, espDevicesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(accessLogsTable.timestamp));
}

router.get("/access-logs/export/csv", async (req, res): Promise<void> => {
  const logs = await fetchLogs(parseFilters(req.query as Record<string, unknown>));

  const header = "Timestamp,Card UID,Plate Number,Owner,Direction,Authorized,Device\n";
  const rows = logs
    .map((log) =>
      [
        log.timestamp.toISOString(),
        log.cardUid,
        log.plateNumber ?? "Unknown",
        log.ownerName ?? "Unknown",
        log.direction,
        log.authorized ? "Yes" : "No",
        log.deviceName ?? "Unknown",
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="access-logs-${Date.now()}.csv"`,
  );
  res.send(header + rows);
});

router.get("/access-logs/export/excel", async (req, res): Promise<void> => {
  const logs = await fetchLogs(parseFilters(req.query as Record<string, unknown>));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Access Logs");
  sheet.columns = [
    { header: "Timestamp", key: "timestamp", width: 24 },
    { header: "Card UID", key: "cardUid", width: 18 },
    { header: "Plate Number", key: "plateNumber", width: 16 },
    { header: "Owner", key: "ownerName", width: 20 },
    { header: "Direction", key: "direction", width: 12 },
    { header: "Authorized", key: "authorized", width: 12 },
    { header: "Device", key: "deviceName", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const log of logs) {
    sheet.addRow({
      timestamp: log.timestamp.toISOString(),
      cardUid: log.cardUid,
      plateNumber: log.plateNumber ?? "Unknown",
      ownerName: log.ownerName ?? "Unknown",
      direction: log.direction,
      authorized: log.authorized ? "Yes" : "No",
      deviceName: log.deviceName ?? "Unknown",
    });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="access-logs-${Date.now()}.xlsx"`,
  );

  await workbook.xlsx.write(res);
  res.end();
});

router.get("/access-logs/export/pdf", async (req, res): Promise<void> => {
  const logs = await fetchLogs(parseFilters(req.query as Record<string, unknown>));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="access-logs-${Date.now()}.pdf"`,
  );

  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  doc.pipe(res);

  doc.fontSize(16).text("Vehicle Access Log Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(9);

  const colWidths = [110, 90, 90, 120, 60, 70, 100];
  const headers = [
    "Timestamp",
    "Card UID",
    "Plate",
    "Owner",
    "Dir.",
    "Authorized",
    "Device",
  ];

  let y = doc.y;
  let x = doc.x;
  headers.forEach((label, i) => {
    doc.font("Helvetica-Bold").text(label, x, y, { width: colWidths[i] });
    x += colWidths[i]!;
  });
  doc.moveDown(0.5);
  doc.font("Helvetica");

  for (const log of logs) {
    y = doc.y;
    x = doc.x;
    if (y > 520) {
      doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
      y = doc.y;
      x = doc.x;
    }
    const cells = [
      log.timestamp.toISOString().replace("T", " ").slice(0, 19),
      log.cardUid,
      log.plateNumber ?? "Unknown",
      log.ownerName ?? "Unknown",
      log.direction,
      log.authorized ? "Yes" : "No",
      log.deviceName ?? "Unknown",
    ];
    cells.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: colWidths[i] });
      x += colWidths[i]!;
    });
    doc.moveDown(0.3);
  }

  doc.end();
});

export default router;
