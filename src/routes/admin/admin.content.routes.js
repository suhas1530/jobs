import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminBulkContentAction,
  adminDeleteContentItem,
  adminGetContent,
  adminSaveContentItem,
  adminUpdateContentStatus,
} from "../../controllers/admin/admin.content.controller.js";

const router = Router();

router.use(requireAdminClerk);

router.get("/content", adminGetContent);
router.post("/content/item", adminSaveContentItem);
router.patch("/content/item/:id/status", adminUpdateContentStatus);
router.delete("/content/item/:id", adminDeleteContentItem);
router.post("/content/bulk", adminBulkContentAction);

export default router;
