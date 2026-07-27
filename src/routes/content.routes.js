import { Router } from "express";
import { getPublicContent, getStudentHomeContent } from "../controllers/content.controller.js";

const router = Router();

router.get("/student-home", getStudentHomeContent);
router.get("/public", getPublicContent);

export default router;
