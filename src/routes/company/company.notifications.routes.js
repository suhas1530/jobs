// backend/src/routes/company/company.notifications.routes.js
import express from "express";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  listCompanyNotifications,
  markCompanyNotificationRead,
  markAllCompanyNotificationsRead,
  seedCompanyNotifications,
} from "../../controllers/company/company.notifications.controller.js";

const router = express.Router();

// company only
router.use(requireUser, requireRole("company"));

router.get("/", listCompanyNotifications);
router.patch("/:id/read", markCompanyNotificationRead);
router.patch("/read-all", markAllCompanyNotificationsRead);

// dev helper (optional)
router.post("/seed", seedCompanyNotifications);

export default router;
