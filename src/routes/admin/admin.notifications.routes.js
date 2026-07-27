import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminListSpamReports,
  adminReviewSpamReport,
  adminDeleteNotification,
  adminDeleteTemplate,
  adminGetNotificationsCenter,
  adminSaveTemplate,
  adminSendBroadcast,
  adminToggleTemplateStatus,
  adminUpdateNotificationSetting,
  adminUpdateNotificationStatus,
} from "../../controllers/admin/admin.notifications.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/notifications-center", adminGetNotificationsCenter);

router.patch("/notifications/:id/status", adminUpdateNotificationStatus);
router.delete("/notifications/:id", adminDeleteNotification);

router.post("/notification-templates", adminSaveTemplate);
router.patch("/notification-templates/:id/status", adminToggleTemplateStatus);
router.delete("/notification-templates/:id", adminDeleteTemplate);

router.patch("/notification-settings/:key", adminUpdateNotificationSetting);

router.post("/notifications/broadcast", adminSendBroadcast);
router.get("/spam-reports", adminListSpamReports);
router.patch("/spam-reports/:id/review", adminReviewSpamReport);

export default router;
