import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lifesciRouter from "./lifesci";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lifesciRouter);

export default router;
