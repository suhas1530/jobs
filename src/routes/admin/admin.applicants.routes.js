// backend/src/routes/admin/admin.applicants.routes.js
import { Router } from "express";
import {
  adminListApplications,
  adminGetApplicationById,
  adminUpdateApplicationStatus,
  adminDeleteApplication,
} from "../../controllers/admin/admin.applicants.controller.js";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";

const router = Router();
router.use(requireAdminClerk);

// GET /api/admin/applications
router.get("/applications", adminListApplications);

// GET /api/admin/applications/:id
router.get("/applications/:id", adminGetApplicationById);

// PATCH /api/admin/applications/:id/status
router.patch("/applications/:id/status", adminUpdateApplicationStatus);

// DELETE /api/admin/applications/:id
router.delete("/applications/:id", adminDeleteApplication);

export default router;
