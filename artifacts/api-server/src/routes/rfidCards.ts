import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, rfidCardsTable } from "@workspace/db";
import {
  CreateRfidCardBody,
  UpdateRfidCardParams,
  UpdateRfidCardBody,
  DeleteRfidCardParams,
} from "@workspace/api-zod";
import { broadcast } from "../lib/ws";

const router: IRouter = Router();

router.get("/rfid-cards", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(rfidCardsTable)
    .orderBy(desc(rfidCardsTable.issuedAt));
  res.json(rows);
});

router.post("/rfid-cards", async (req, res): Promise<void> => {
  const parsed = CreateRfidCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [card] = await db
    .insert(rfidCardsTable)
    .values(parsed.data)
    .returning();

  broadcast("rfid_card_created", card);
  res.status(201).json(card);
});

router.patch("/rfid-cards/:id", async (req, res): Promise<void> => {
  const params = UpdateRfidCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRfidCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [card] = await db
    .update(rfidCardsTable)
    .set(parsed.data)
    .where(eq(rfidCardsTable.id, params.data.id))
    .returning();

  if (!card) {
    res.status(404).json({ error: "RFID card not found" });
    return;
  }

  broadcast("rfid_card_updated", card);
  res.json(card);
});

router.delete("/rfid-cards/:id", async (req, res): Promise<void> => {
  const params = DeleteRfidCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [card] = await db
    .delete(rfidCardsTable)
    .where(eq(rfidCardsTable.id, params.data.id))
    .returning();

  if (!card) {
    res.status(404).json({ error: "RFID card not found" });
    return;
  }

  broadcast("rfid_card_deleted", { id: params.data.id });
  res.sendStatus(204);
});

export default router;
