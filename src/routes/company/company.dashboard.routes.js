import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";
import { getCompanyDashboard } from "../../controllers/company/company.dashboard.controller.js";

const router = express.Router();

router.get("/dashboard", requireAuth, requireUser, requireRole("company"), getCompanyDashboard);

export default router;
