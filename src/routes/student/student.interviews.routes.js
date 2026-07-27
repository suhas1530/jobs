import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  listStudentInterviews,
  studentCompletePreJoin,
  studentEnterWaitingRoom,
  studentLeaveInterview,
  studentInterviewWorkspace,
  studentCancelInterview,
  studentInterviewChat,
  studentInterviewQuestion,
  studentInterviewQuestionDraft,
  studentInterviewCode,
  studentRunInterviewCode,
  studentInterviewScreenShare,
  studentInterviewWebrtcAnswer,
  studentInterviewWebrtcCandidate,
  studentInterviewAdminMonitorAnswer,
  studentInterviewAdminMonitorCandidate,
} from "../../controllers/student/student.interviews.controller.js";

const router = Router();

router.get("/interviews", studentOnly, listStudentInterviews);
router.post("/interviews/:id/prejoin", studentOnly, studentCompletePreJoin);
router.post("/interviews/:id/waiting-room", studentOnly, studentEnterWaitingRoom);
router.post("/interviews/:id/leave", studentOnly, studentLeaveInterview);
router.get("/interviews/:id/workspace", studentOnly, studentInterviewWorkspace);
router.post("/interviews/:id/cancel", studentOnly, studentCancelInterview);
router.post("/interviews/:id/chat", studentOnly, studentInterviewChat);
router.post("/interviews/:id/questions", studentOnly, studentInterviewQuestion);
router.patch("/interviews/:id/questions/draft", studentOnly, studentInterviewQuestionDraft);
router.patch("/interviews/:id/code", studentOnly, studentInterviewCode);
router.post("/interviews/:id/code/run", studentOnly, studentRunInterviewCode);
router.patch("/interviews/:id/screen-share", studentOnly, studentInterviewScreenShare);
router.post("/interviews/:id/webrtc/answer", studentOnly, studentInterviewWebrtcAnswer);
router.post("/interviews/:id/webrtc/candidate", studentOnly, studentInterviewWebrtcCandidate);
router.post("/interviews/:id/admin-monitor/answer", studentOnly, studentInterviewAdminMonitorAnswer);
router.post("/interviews/:id/admin-monitor/candidate", studentOnly, studentInterviewAdminMonitorCandidate);

export default router;
