import { Router, type IRouter } from "express";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db, vehiclesTable } from "@workspace/db";
import {
  ListVehiclesQueryParams,
  CreateVehicleBody,
  UpdateVehicleParams,
  UpdateVehicleBody,
  DeleteVehicleParams,
  GetVehicleParams,
} from "@workspace/api-zod";
import { broadcast } from "../lib/ws";

const router: IRouter = Router();

router.get("/vehicles", async (req, res): Promise<void> => {
  const query = ListVehiclesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search } = query.data;

  const rows = await db
    .select()
    .from(vehiclesTable)
    .where(
      search
        ? or(
            ilike(vehiclesTable.plateNumber, `%${search}%`),
            ilike(vehiclesTable.ownerName, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(vehiclesTable.createdAt));

  res.json(rows);
});

router.post("/vehicles", async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vehicle] = await db
    .insert(vehiclesTable)
    .values(parsed.data)
    .returning();

  broadcast("vehicle_created", vehicle);
  res.status(201).json(vehicle);
});

router.get("/vehicles/:id", async (req, res): Promise<void> => {
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id));

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(vehicle);
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set(parsed.data)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  broadcast("vehicle_updated", vehicle);
  res.json(vehicle);
});

router.delete("/vehicles/:id", async (req, res): Promise<void> => {
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .delete(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  broadcast("vehicle_deleted", { id: params.data.id });
  res.sendStatus(204);
});

export default router;
