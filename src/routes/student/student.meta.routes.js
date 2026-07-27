import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import { getStudentMe } from "../../controllers/student/student.meta.controller.js";

const router = Router();

// GET /api/student/meta/me
router.get("/meta/me", studentOnly, getStudentMe);

export default router;
