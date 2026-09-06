import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import espDevicesRouter from "./espDevices";
import vehiclesRouter from "./vehicles";
import rfidCardsRouter from "./rfidCards";
import accessLogsRouter from "./accessLogs";
import analyticsRouter from "./analytics";
import exportsRouter from "./exports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(espDevicesRouter);
router.use(vehiclesRouter);
router.use(rfidCardsRouter);
router.use(accessLogsRouter);
router.use(analyticsRouter);
router.use(exportsRouter);

export default router;
