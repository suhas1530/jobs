import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listCompanyThreads,
  getCompanyThread,
  createCompanyThread,
  reportCompanyThreadSpam,
  sendCompanyMessage,
  markCompanyThreadRead,
  updateCompanyThreadMeta,
} from "../../controllers/company/company.messages.controller.js";

const router = express.Router();

// company only
router.use(requireAuth, requireUser, requireRole("company"));

router.get("/threads", listCompanyThreads);
router.get("/threads/:id", getCompanyThread);
router.post("/threads", createCompanyThread);
router.post("/threads/:id/send", sendCompanyMessage);
router.post("/threads/:id/spam-report", reportCompanyThreadSpam);
router.patch("/threads/:id/read", markCompanyThreadRead);
router.patch("/threads/:id/meta", updateCompanyThreadMeta);

export default router;
