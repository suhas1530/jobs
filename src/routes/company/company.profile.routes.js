import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  getCompanyProfileMe,
  updateCompanyProfileMe,
} from "../../controllers/company/company.profile.controller.js";

const router = express.Router();

// company only
router.use(requireAuth, requireUser, requireRole("company"));

// GET /api/company/profile/me
router.get("/me", getCompanyProfileMe);

// PATCH /api/company/profile/me
router.patch("/me", updateCompanyProfileMe);

export default router;
