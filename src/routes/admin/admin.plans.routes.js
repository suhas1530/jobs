import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminDeletePlan,
  adminListPlanRequests,
  adminListPlans,
  adminRunPlanRequestAction,
  adminSavePlan,
  adminUpdatePlanRequest,
} from "../../controllers/admin/admin.plans.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/plans", adminListPlans);
router.post("/plans", adminSavePlan);
router.delete("/plans/:id", adminDeletePlan);

router.get("/plan-requests", adminListPlanRequests);
router.patch("/plan-requests/:id", adminUpdatePlanRequest);
router.patch("/plan-requests/:id/action", adminRunPlanRequestAction);

export default router;
