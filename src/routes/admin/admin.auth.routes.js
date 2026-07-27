import express from "express";
import { adminLocalLogin } from "../../controllers/admin/admin.auth.controller.js";

const router = express.Router();

router.post("/auth/login", adminLocalLogin);

export default router;
