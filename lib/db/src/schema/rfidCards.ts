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

export const rfidCardsTable = pgTable("rfid_cards", {
  id: serial("id").primaryKey(),
  cardUid: text("card_uid").notNull().unique(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, {
    onDelete: "set null",
  }),
  active: boolean("active").notNull().default(true),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertRfidCardSchema = createInsertSchema(rfidCardsTable).omit({
  id: true,
  issuedAt: true,
});
export type InsertRfidCard = z.infer<typeof insertRfidCardSchema>;
export type RfidCardRow = typeof rfidCardsTable.$inferSelect;
