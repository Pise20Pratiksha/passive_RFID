import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";
import { espDevicesTable } from "./espDevices";

export const accessLogsTable = pgTable("access_logs", {
  id: serial("id").primaryKey(),
  cardUid: text("card_uid").notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, {
    onDelete: "set null",
  }),
  direction: text("direction").notNull(),
  authorized: boolean("authorized").notNull().default(false),
  deviceId: integer("device_id").references(() => espDevicesTable.id, {
    onDelete: "set null",
  }),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAccessLogSchema = createInsertSchema(accessLogsTable).omit(
  { id: true, timestamp: true },
);
export type InsertAccessLog = z.infer<typeof insertAccessLogSchema>;
export type AccessLogRow = typeof accessLogsTable.$inferSelect;
