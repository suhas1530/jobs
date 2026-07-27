import express from "express";
import syncUser from "../middleware/syncUser.js";
import requireRole from "../middleware/requireRole.js";
import { getCompanyDashboard } from "../controllers/company.dashboard.controller.js";

const router = express.Router();

router.get("/dashboard", syncUser, requireRole("company"), getCompanyDashboard);

export default router;
