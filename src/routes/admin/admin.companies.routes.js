// backend/src/routes/admin/admin.companies.routes.js
import { Router } from "express";
import {
  adminCreateCompany,
  adminDeleteCompany,
  adminGetCompanyDetails,
  adminListCompanies,
  adminUpdateCompanyStatus,
} from "../../controllers/admin/admin.companies.controller.js";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/companies", adminListCompanies);
router.post("/companies", adminCreateCompany);
router.get("/companies/:id", adminGetCompanyDetails);
router.patch("/companies/:id/status", adminUpdateCompanyStatus);
router.delete("/companies/:id", adminDeleteCompany);

export default router;
