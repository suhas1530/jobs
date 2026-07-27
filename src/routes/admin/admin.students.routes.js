// backend/src/routes/admin/admin.students.routes.js
import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";

import {
  adminListStudents,
  adminGetStudent,
  adminToggleStudentStatus,
  adminDeleteStudent,
} from "../../controllers/admin/admin.students.controller.js";

const router = Router();

router.use(requireAdminClerk);

router.get("/students", adminListStudents);
router.get("/students/:id", adminGetStudent);
router.patch("/students/:id/status", adminToggleStudentStatus);
router.delete("/students/:id", adminDeleteStudent);

export default router;
