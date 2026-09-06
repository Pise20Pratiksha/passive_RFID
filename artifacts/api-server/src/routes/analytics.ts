import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  vehiclesTable,
  rfidCardsTable,
  espDevicesTable,
  accessLogsTable,
} from "@workspace/db";
import {
  GetDailyAnalyticsQueryParams,
  GetVehicleUsageAnalyticsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const today = startOfDay(new Date());

  const [
    totalVehiclesRow,
    activeVehiclesRow,
    totalCardsRow,
    devicesRows,
    entriesTodayRow,
    exitsTodayRow,
    unauthorizedTodayRow,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(vehiclesTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehiclesTable)
      .where(eq(vehiclesTable.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(rfidCardsTable),
    db.select().from(espDevicesTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accessLogsTable)
      .where(
        and(
          eq(accessLogsTable.direction, "IN"),
          gte(accessLogsTable.timestamp, today),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accessLogsTable)
      .where(
        and(
          eq(accessLogsTable.direction, "OUT"),
          gte(accessLogsTable.timestamp, today),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accessLogsTable)
      .where(
        and(
          eq(accessLogsTable.authorized, false),
          gte(accessLogsTable.timestamp, today),
        ),
      ),
  ]);

  const entriesToday = entriesTodayRow[0]?.count ?? 0;
  const exitsToday = exitsTodayRow[0]?.count ?? 0;

  res.json({
    totalVehicles: totalVehiclesRow[0]?.count ?? 0,
    activeVehicles: activeVehiclesRow[0]?.count ?? 0,
    totalCards: totalCardsRow[0]?.count ?? 0,
    onlineDevices: devicesRows.filter((d) => d.status === "online").length,
    totalDevices: devicesRows.length,
    entriesToday,
    exitsToday,
    unauthorizedToday: unauthorizedTodayRow[0]?.count ?? 0,
    vehiclesInside: Math.max(entriesToday - exitsToday, 0),
  });
});

router.get("/analytics/daily", async (req, res): Promise<void> => {
  const query = GetDailyAnalyticsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { days } = query.data;
  const since = startOfDay(new Date());
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await db
    .select({
      date: sql<string>`to_char(${accessLogsTable.timestamp}, 'YYYY-MM-DD')`,
      direction: accessLogsTable.direction,
      authorized: accessLogsTable.authorized,
      count: sql<number>`count(*)::int`,
    })
    .from(accessLogsTable)
    .where(gte(accessLogsTable.timestamp, since))
    .groupBy(
      sql`to_char(${accessLogsTable.timestamp}, 'YYYY-MM-DD')`,
      accessLogsTable.direction,
      accessLogsTable.authorized,
    );

  const byDate = new Map<
    string,
    { date: string; entries: number; exits: number; unauthorized: number }
  >();

  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { date: key, entries: 0, exits: 0, unauthorized: 0 });
  }

  for (const row of rows) {
    const entry = byDate.get(row.date);
    if (!entry) continue;
    if (!row.authorized) {
      entry.unauthorized += row.count;
    }
    if (row.direction === "IN") {
      entry.entries += row.count;
    } else if (row.direction === "OUT") {
      entry.exits += row.count;
    }
  }

  res.json(Array.from(byDate.values()));
});

router.get("/analytics/vehicle-usage", async (req, res): Promise<void> => {
  const query = GetVehicleUsageAnalyticsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { limit } = query.data;

  const rows = await db
    .select({
      vehicleId: vehiclesTable.id,
      plateNumber: vehiclesTable.plateNumber,
      ownerName: vehiclesTable.ownerName,
      accessCount: sql<number>`count(${accessLogsTable.id})::int`,
    })
    .from(accessLogsTable)
    .innerJoin(vehiclesTable, eq(accessLogsTable.vehicleId, vehiclesTable.id))
    .groupBy(vehiclesTable.id, vehiclesTable.plateNumber, vehiclesTable.ownerName)
    .orderBy(desc(sql`count(${accessLogsTable.id})`))
    .limit(limit);

  res.json(rows);
});

export default router;
