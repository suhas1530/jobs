import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminBulkGovUpdates,
  adminDeleteGovUpdate,
  adminListGovUpdates,
  adminSaveGovUpdate,
  adminUpdateGovStatus,
} from "../../controllers/admin/admin.government.controller.js";

const router = Router();

router.use(requireAdminClerk);

router.get("/government-updates", adminListGovUpdates);
router.post("/government-updates", adminSaveGovUpdate);
router.patch("/government-updates/:id/status", adminUpdateGovStatus);
router.delete("/government-updates/:id", adminDeleteGovUpdate);
router.post("/government-updates/bulk", adminBulkGovUpdates);

export default router;
