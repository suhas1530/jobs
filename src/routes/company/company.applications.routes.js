import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listCompanyApplications,
  updateCompanyApplicationStatus,
  bulkUpdateCompanyApplicationStatus,
  deleteCompanyApplication,
  scheduleCompanyInterview,
} from "../../controllers/company/company.applications.controller.js";

const router = express.Router();

router.get("/applications", requireAuth, requireUser, requireRole("company"), listCompanyApplications);

router.patch("/applications/:id/status", requireAuth, requireUser, requireRole("company"), updateCompanyApplicationStatus);

router.patch("/applications/bulk/status", requireAuth, requireUser, requireRole("company"), bulkUpdateCompanyApplicationStatus);

router.delete("/applications/:id", requireAuth, requireUser, requireRole("company"), deleteCompanyApplication);

router.post("/applications/:id/schedule-interview", requireAuth, requireUser, requireRole("company"), scheduleCompanyInterview);

export default router;
