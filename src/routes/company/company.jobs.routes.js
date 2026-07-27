import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";
import {
  companyCreateJob,
  companyListJobs,
  companyGetJobById,
  companyUpdateJob,
  companyDeleteJob,
  companyDuplicateJob,
  companyCloseJob,
} from "../../controllers/company/company.jobs.controller.js";

const router = express.Router();

router.use(requireAuth, requireUser, requireRole("company"));

router.post("/jobs", companyCreateJob);
router.get("/jobs", companyListJobs);
router.get("/jobs/:id", companyGetJobById);
router.patch("/jobs/:id", companyUpdateJob);
router.delete("/jobs/:id", companyDeleteJob);
router.post("/jobs/:id/duplicate", companyDuplicateJob);
router.patch("/jobs/:id/close", companyCloseJob);

export default router;
