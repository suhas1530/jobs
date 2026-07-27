// backend/src/routes/company/company.settings.routes.js
import express from "express";
import requireAuth from "../../middleware/requireAuth.js";
import requireUser from "../../middleware/requireUser.js";
import requireRole from "../../middleware/requireRole.js";

import {
  companyGetSettingsMe,
  companyUpdateProfile,
  companyUpdatePreferences,
  companyUpdateNotifications,
  companyUpdateBilling,
  companyUpdatePrivacy,
  companyInviteTeamMember,
  companyRemoveTeamMember,
  companyUpdateTeamMemberRole,
  companySendSecurityOtp,
  companyVerifySecurityOtp,
  companyUpdateSecurity,
  companyExportData,
  companyDeleteAccount,
} from "../../controllers/company/company.settings.controller.js";

const router = express.Router();

// company only
router.use(requireAuth, requireUser, requireRole("company"));

router.get("/me", companyGetSettingsMe);

router.patch("/profile", companyUpdateProfile);
router.patch("/preferences", companyUpdatePreferences);
router.patch("/notifications", companyUpdateNotifications);
router.patch("/billing", companyUpdateBilling);
router.patch("/privacy", companyUpdatePrivacy);

// Team
router.post("/team/invite", companyInviteTeamMember);
router.delete("/team/:memberId", companyRemoveTeamMember);
router.patch("/team/:memberId", companyUpdateTeamMemberRole);

// Security OTP
router.post("/security/send-otp", companySendSecurityOtp);
router.post("/security/verify-otp", companyVerifySecurityOtp);
router.patch("/security", companyUpdateSecurity);

// Export + Delete
router.get("/export", companyExportData);
router.post("/account/delete", companyDeleteAccount);

export default router;
