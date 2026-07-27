// backend/src/routes/student/student.settings.routes.js
import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  getStudentSettings,
  updateStudentSettings,
  deleteStudentAccount,
} from "../../controllers/student/student.settings.controller.js";

const router = Router();

// GET /api/student/settings
router.get("/settings", studentOnly, getStudentSettings);

// PUT /api/student/settings
router.put("/settings", studentOnly, updateStudentSettings);

// DELETE /api/student/settings
router.delete("/settings", studentOnly, deleteStudentAccount);

export default router;
