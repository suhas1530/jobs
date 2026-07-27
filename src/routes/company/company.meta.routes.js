// backend/src/routes/company/company.meta.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import Company from "../../models/Company.js";
import Notification from "../../models/Notification.js";

const router = express.Router();

/**
 * GET /api/company/header-counts
 * Used by CompanyNavbar: notifications + messages counts
 */
router.get(
  "/header-counts",
  requireAuth,
  requireUser,
  requireRole("company"),
  async (req, res, next) => {
    try {
      // Find company linked to logged-in user
      const company = await Company.findOne({
        ownerUserId: req.user._id,
      });

      if (!company) {
        return res.json({
          notifications: 0,
          messages: 0,
        });
      }

      // Count unread notifications
      const notifications = await Notification.countDocuments({
        companyId: company._id,
        read: false,
      });

      // Future: replace with unread message count from MessageThread
      const messages = 0;

      res.json({
        notifications,
        messages,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
