import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminDeleteAdPlan,
  adminGetAdsCenter,
  adminRunAdPlanRequestAction,
  adminSaveAdPlan,
  adminUpdateAdPlanRequest,
  adminUpdateAdStatus,
} from "../../controllers/admin/admin.ads.controller.js";

const router = Router();

router.use(requireAdminClerk);

router.get("/ads-center", adminGetAdsCenter);
router.post("/ads/plans", adminSaveAdPlan);
router.delete("/ads/plans/:id", adminDeleteAdPlan);
router.patch("/ads/plan-requests/:id", adminUpdateAdPlanRequest);
router.patch("/ads/plan-requests/:id/action", adminRunAdPlanRequestAction);
router.patch("/ads/:id/status", adminUpdateAdStatus);

export default router;
