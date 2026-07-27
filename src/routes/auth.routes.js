import { Router } from "express";
import { bootstrapAuthSession } from "../controllers/auth.controller.js";

const router = Router();

router.post("/bootstrap", bootstrapAuthSession);

export default router;
