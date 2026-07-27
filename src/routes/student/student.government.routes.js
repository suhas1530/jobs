import { Router } from "express";
import {
  listGovernmentJobs,
  getGovernmentJobById,
} from "../../controllers/student/student.government.controller.js";

const router = Router();

router.get("/government", listGovernmentJobs);
router.get("/government/:id", getGovernmentJobById);

export default router;
