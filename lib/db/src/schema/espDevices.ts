import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const espDevicesTable = pgTable("esp_devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEspDeviceSchema = createInsertSchema(espDevicesTable).omit(
  { id: true, createdAt: true, lastSeenAt: true },
);
export type InsertEspDevice = z.infer<typeof insertEspDeviceSchema>;
export type EspDeviceRow = typeof espDevicesTable.$inferSelect;
