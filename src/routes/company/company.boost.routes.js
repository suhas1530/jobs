// backend/src/routes/company/company.boost.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  companyListBoostPlans,
  companyListBoosts,
  companyBoostJob,
  companyCancelBoost,
  companyExtendBoost,
} from "../../controllers/company/company.boost.controller.js";

const router = express.Router();

// company only
router.use(requireAuth, requireUser, requireRole("company"));

// plans
router.get("/boost/plans", companyListBoostPlans);

// list boosts
router.get("/boosts", companyListBoosts);

// boost job
router.post("/jobs/:id/boost", companyBoostJob);

// cancel / extend
router.patch("/boosts/:id/cancel", companyCancelBoost);
router.patch("/boosts/:id/extend", companyExtendBoost);

export default router;
