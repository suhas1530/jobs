// backend/src/routes/company/company.ai.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  getAiScoringForJob,
  updateAiWeightsForJob,
  rerunAiForJob,
} from "../../controllers/company/company.ai.controller.js";

const router = express.Router();

/**
 * BASE: /api/company
 * GET   /ai/:jobId
 * PATCH /ai/:jobId/weights
 * POST  /ai/:jobId/rerun
 */
router.get("/ai/:jobId", requireAuth, requireUser, requireRole("company"), getAiScoringForJob);
router.patch("/ai/:jobId/weights", requireAuth, requireUser, requireRole("company"), updateAiWeightsForJob);
router.post("/ai/:jobId/rerun", requireAuth, requireUser, requireRole("company"), rerunAiForJob);

export default router;
