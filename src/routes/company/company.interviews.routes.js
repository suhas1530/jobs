import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listCompanyInterviews,
  createCompanyInterview,
  updateCompanyInterview,
  addInterviewNote,
  updateCompanyInterviewStatus,
  getCompanyInterviewWorkspace,
  startCompanyInterview,
  companyLeaveInterview,
  admitCompanyCandidate,
  endCompanyInterviewRound,
  endCompanyInterview,
  companyInterviewChat,
  companyInterviewQuestion,
  companyInterviewQuestionDraft,
  companyInterviewCode,
  companyRunInterviewCode,
  companyInterviewScreenShare,
  companyInterviewWebrtcOffer,
  companyInterviewWebrtcCandidate,
  companyInterviewAdminMonitorAnswer,
  companyInterviewAdminMonitorCandidate,
  deleteCompanyInterview,
} from "../../controllers/company/company.interviews.controller.js";

const router = express.Router();

router.get("/interviews", requireAuth, requireUser, requireRole("company"), listCompanyInterviews);
router.post("/interviews", requireAuth, requireUser, requireRole("company"), createCompanyInterview);
router.patch("/interviews/:id", requireAuth, requireUser, requireRole("company"), updateCompanyInterview);
router.post("/interviews/:id/notes", requireAuth, requireUser, requireRole("company"), addInterviewNote);
router.patch("/interviews/:id/status", requireAuth, requireUser, requireRole("company"), updateCompanyInterviewStatus);
router.get("/interviews/:id/workspace", requireAuth, requireUser, requireRole("company"), getCompanyInterviewWorkspace);
router.post("/interviews/:id/start", requireAuth, requireUser, requireRole("company"), startCompanyInterview);
router.post("/interviews/:id/leave", requireAuth, requireUser, requireRole("company"), companyLeaveInterview);
router.post("/interviews/:id/admit", requireAuth, requireUser, requireRole("company"), admitCompanyCandidate);
router.post("/interviews/:id/end-round", requireAuth, requireUser, requireRole("company"), endCompanyInterviewRound);
router.post("/interviews/:id/end", requireAuth, requireUser, requireRole("company"), endCompanyInterview);
router.post("/interviews/:id/chat", requireAuth, requireUser, requireRole("company"), companyInterviewChat);
router.post("/interviews/:id/questions", requireAuth, requireUser, requireRole("company"), companyInterviewQuestion);
router.patch("/interviews/:id/questions/draft", requireAuth, requireUser, requireRole("company"), companyInterviewQuestionDraft);
router.patch("/interviews/:id/code", requireAuth, requireUser, requireRole("company"), companyInterviewCode);
router.post("/interviews/:id/code/run", requireAuth, requireUser, requireRole("company"), companyRunInterviewCode);
router.patch("/interviews/:id/screen-share", requireAuth, requireUser, requireRole("company"), companyInterviewScreenShare);
router.post("/interviews/:id/webrtc/offer", requireAuth, requireUser, requireRole("company"), companyInterviewWebrtcOffer);
router.post("/interviews/:id/webrtc/candidate", requireAuth, requireUser, requireRole("company"), companyInterviewWebrtcCandidate);
router.post("/interviews/:id/admin-monitor/answer", requireAuth, requireUser, requireRole("company"), companyInterviewAdminMonitorAnswer);
router.post("/interviews/:id/admin-monitor/candidate", requireAuth, requireUser, requireRole("company"), companyInterviewAdminMonitorCandidate);
router.delete("/interviews/:id", requireAuth, requireUser, requireRole("company"), deleteCompanyInterview);

export default router;
