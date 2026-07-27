// backend/src/routes/student/student.internships.routes.js
import { Router } from "express";
import {
  listStudentInternships,
  getStudentInternshipById,
  getStudentInternshipContent,
} from "../../controllers/student/student.internships.controller.js";

const router = Router();

/**
 * GET /api/student/internships
 * List internships (filters + pagination)
 */
router.get("/internships", listStudentInternships);

/**
 * GET /api/student/internships/:id
 * Internship details
 */
router.get("/internships/:id", getStudentInternshipById);

/**
 * GET /api/student/internship/content
 * Tips / Q&A / Mock tests (from ContentItem)
 */
router.get("/internship/content", getStudentInternshipContent);

export default router;
