import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminGetSettings,
  adminSaveSettings,
} from "../../controllers/admin/admin.settings.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/settings", adminGetSettings);
router.put("/settings", adminSaveSettings);

export default router;
