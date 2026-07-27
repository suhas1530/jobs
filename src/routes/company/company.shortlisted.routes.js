// backend/src/routes/company/company.shortlisted.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listCompanyShortlisted,
  updateShortlistedStatus,
  updateShortlistedStage,
  sendOfferToCandidate,
  scheduleInterviewFromShortlisted,
} from "../../controllers/company/company.shortlisted.controller.js";

const router = express.Router();

/**
 * BASE: /api/company
 *
 * GET   /shortlisted
 * PATCH /shortlisted/:id/status
 * PATCH /shortlisted/:id/stage
 * POST  /shortlisted/:id/offer
 * POST  /shortlisted/:id/schedule-interview
 */

router.get(
  "/shortlisted",
  requireAuth,
  requireUser,
  requireRole("company"),
  listCompanyShortlisted
);

router.patch(
  "/shortlisted/:id/status",
  requireAuth,
  requireUser,
  requireRole("company"),
  updateShortlistedStatus
);

router.patch(
  "/shortlisted/:id/stage",
  requireAuth,
  requireUser,
  requireRole("company"),
  updateShortlistedStage
);

router.post(
  "/shortlisted/:id/offer",
  requireAuth,
  requireUser,
  requireRole("company"),
  sendOfferToCandidate
);

router.post(
  "/shortlisted/:id/schedule-interview",
  requireAuth,
  requireUser,
  requireRole("company"),
  scheduleInterviewFromShortlisted
);

export default router;
