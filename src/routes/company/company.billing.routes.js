// backend/src/routes/company/company.billing.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listPlans,
  getMyBilling,
  subscribePlan,
  cancelSubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
} from "../../controllers/company/company.billing.controller.js";

const router = express.Router();

// company only
router.use(requireAuth, requireUser, requireRole("company"));

// plans + current subscription
router.get("/plans", listPlans);
router.get("/me", getMyBilling);

// subscribe / cancel
router.post("/create-order", createSubscriptionOrder);
router.post("/verify-payment", verifySubscriptionPayment);
router.post("/subscribe", subscribePlan);
router.post("/cancel", cancelSubscription);

export default router;
