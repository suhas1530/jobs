import { Router } from "express";
import { getAdminDashboard, approvePlanRequest, rejectPlanRequest } from "../../controllers/admin/admin.dashboard.controller.js";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";

const router = Router();
router.use(requireAdminClerk);

// GET dashboard
router.get("/dashboard", getAdminDashboard);

// Plan requests (approve/reject)
router.post("/plan-requests/:id/approve", approvePlanRequest);
router.post("/plan-requests/:id/reject", rejectPlanRequest);

export default router;
