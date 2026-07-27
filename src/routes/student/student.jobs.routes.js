// backend/src/routes/student/student.jobs.routes.js
import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  listStudentJobs,
  getStudentJobById,
  applyStudentJob,
  listSavedJobs,
  toggleSaveJob,
} from "../../controllers/student/student.jobs.controller.js";

const router = Router();

/**
 * GET /api/student/jobs
 * Query params supported:
 * q, stream, category, subCategory, location, jobType, workMode,
 * experience, salaryMin, salaryMax, page, limit
 */
router.get("/jobs", listStudentJobs);
router.get("/jobs/:id", getStudentJobById);
router.post("/jobs/:id/apply", studentOnly, applyStudentJob);

/**
 * ✅ GET Saved Jobs
 * GET /api/student/me/saved-jobs
 */
router.get("/me/saved-jobs", studentOnly, listSavedJobs);

/**
 * ✅ Toggle Save Job
 * POST /api/student/jobs/:id/save
 */
router.post("/jobs/:id/save", studentOnly, toggleSaveJob);

export default router;
