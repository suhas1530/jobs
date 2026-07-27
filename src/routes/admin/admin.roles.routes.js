import { Router } from "express";
import requireAdminClerk from "../../middleware/requireAdminClerk.js";
import {
  adminDeleteAdminUser,
  adminDeleteRole,
  adminGetRolesPermissions,
  adminSaveAdminUser,
  adminSaveRole,
  adminSaveRolePermissions,
  adminToggleAdminUserStatus,
} from "../../controllers/admin/admin.roles.controller.js";

const router = Router();
router.use(requireAdminClerk);

router.get("/roles-permissions", adminGetRolesPermissions);

router.post("/roles", adminSaveRole);
router.delete("/roles/:id", adminDeleteRole);
router.patch("/roles/:id/permissions", adminSaveRolePermissions);

router.post("/admin-users", adminSaveAdminUser);
router.patch("/admin-users/:id/status", adminToggleAdminUserStatus);
router.delete("/admin-users/:id", adminDeleteAdminUser);

export default router;
