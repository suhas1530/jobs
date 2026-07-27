import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminListInterviews,
  adminInterviewWorkspace,
  adminStartInterview,
  adminEndInterview,
  adminInterviewMonitorOffer,
  adminInterviewMonitorCandidate,
} from "../../controllers/admin/admin.interviews.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/interviews", adminListInterviews);
router.get("/interviews/:id/workspace", adminInterviewWorkspace);
router.post("/interviews/:id/start", adminStartInterview);
router.post("/interviews/:id/end", adminEndInterview);
router.post("/interviews/:id/admin-monitor/:targetRole/offer", adminInterviewMonitorOffer);
router.post("/interviews/:id/admin-monitor/:targetRole/candidate", adminInterviewMonitorCandidate);

export default router;
