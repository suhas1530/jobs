import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  listStudentConversations,
  listStudentMessages,
  reportStudentConversationSpam,
  sendStudentMessage,
} from "../../controllers/student/student.messages.controller.js";

const router = Router();

/**
 * GET /api/student/conversations
 */
router.get("/conversations", studentOnly, listStudentConversations);

/**
 * GET /api/student/conversations/:id/messages
 */
router.get("/conversations/:id/messages", studentOnly, listStudentMessages);

/**
 * POST /api/student/conversations/:id/messages
 */
router.post("/conversations/:id/messages", studentOnly, sendStudentMessage);
router.post("/conversations/:id/spam-report", studentOnly, reportStudentConversationSpam);

export default router;
