import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminGetProfile,
  adminSaveProfile,
} from "../../controllers/admin/admin.profile.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/profile", adminGetProfile);
router.put("/profile", adminSaveProfile);

export default router;
