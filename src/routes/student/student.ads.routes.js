import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  createAdPlanOrder,
  createAdPlanRequest,
  createStudentAd,
  getStudentAdsStatus,
  trackStudentAdEvent,
  verifyAdPlanPayment,
} from "../../controllers/student/student.ads.controller.js";

const router = Router();

router.get("/ads/status", studentOnly, getStudentAdsStatus);
router.post("/ads/plans/create-order", studentOnly, createAdPlanOrder);
router.post("/ads/plans/verify-payment", studentOnly, verifyAdPlanPayment);

// Backward-compatible aliases for deployed clients using older endpoint paths
router.post("/ads/plan/order", studentOnly, createAdPlanOrder);
router.post("/ads/plan/verify-payment", studentOnly, verifyAdPlanPayment);

router.post("/ads/plan-request", studentOnly, createAdPlanRequest);
router.post("/ads", studentOnly, createStudentAd);
router.post("/ads/:adId/event", studentOnly, trackStudentAdEvent);

export default router;
