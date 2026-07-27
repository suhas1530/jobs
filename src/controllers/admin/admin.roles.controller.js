import mongoose from "mongoose";
import AdminRole from "../../models/AdminRole.js";
import AdminUserRole from "../../models/AdminUserRole.js";
import User from "../../models/User.js";

const PERMISSION_SECTIONS = [
  "Dashboard Access",
  "Companies Management",
  "Jobs Management",
  "Applicants Management",
  "Students Management",
  "Pricing Plans",
  "Content Management",
  "Government Updates",
  "Settings",
];

const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve", "export"];

function buildDefaultPermissions() {
  const out = {};
  for (const section of PERMISSION_SECTIONS) {
    out[section] = {};
    for (const action of PERMISSION_ACTIONS) {
      out[section][action] = action === "view";
    }
  }
  return out;
}

function buildAllPermissions() {
  const out = {};
  for (const section of PERMISSION_SECTIONS) {
    out[section] = {};
    for (const action of PERMISSION_ACTIONS) out[section][action] = true;
  }
  return out;
}

function toId(x) {
  return String(x?._id || x?.id || x || "");
}

function formatLastLogin(d) {
  if (!d) return "Never";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "Never";
  return dt.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function ensureBaseRoles() {
  const count = await AdminRole.countDocuments({});
  if (count > 0) return;

  const defaults = [
    {
      name: "Super Admin",
      description: "Full platform access",
      permissions: buildAllPermissions(),
      isSystem: true,
    },
    {
      name: "Operations Admin",
      description: "User and plan operations",
      permissions: buildDefaultPermissions(),
      isSystem: true,
    },
    {
      name: "Content Admin",
      description: "Content and announcements",
      permissions: buildDefaultPermissions(),
      isSystem: true,
    },
  ];

  await AdminRole.insertMany(defaults);
}

async function ensureCurrentAdminAssignment(me) {
  if (!me?._id) return;
  await ensureBaseRoles();

  let assignment = await AdminUserRole.findOne({ user: me._id }).lean();
  if (assignment) return;

  const superRole = await AdminRole.findOne({ name: "Super Admin" }).lean();
  if (!superRole) return;

  await AdminUserRole.create({
    user: me._id,
    role: superRole._id,
    status: me.isActive === false ? "inactive" : "active",
    lastLoginAt: new Date(),
    createdBy: me._id,
  });
}

function normalizeRole(roleDoc, usersCount) {
  return {
    id: toId(roleDoc),
    name: roleDoc.name || "",
    description: roleDoc.description || "",
    usersCount: Number(usersCount || 0),
    permissions: roleDoc.permissions && typeof roleDoc.permissions === "object"
      ? roleDoc.permissions
      : buildDefaultPermissions(),
  };
}

function normalizeAdminUser(assignDoc) {
  const user = assignDoc.user || {};
  const role = assignDoc.role || {};
  return {
    id: toId(user),
    name: user.name || "Admin",
    email: user.email || "",
    role: role.name || "Role",
    status: assignDoc.status || (user.isActive === false ? "inactive" : "active"),
    lastLogin: formatLastLogin(assignDoc.lastLoginAt || user.updatedAt || user.createdAt),
  };
}

export async function adminGetRolesPermissions(req, res, next) {
  try {
    await ensureCurrentAdminAssignment(req.user);

    const [roles, assignments] = await Promise.all([
      AdminRole.find({}).sort({ isSystem: -1, createdAt: 1 }).lean(),
      AdminUserRole.find({})
        .populate("user", "name email role isActive updatedAt createdAt")
        .populate("role", "name")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const counts = new Map();
    for (const a of assignments) {
      const rid = toId(a.role);
      counts.set(rid, (counts.get(rid) || 0) + 1);
    }

    const rows = roles.map((r) => normalizeRole(r, counts.get(toId(r)) || 0));
    const users = assignments
      .filter((a) => a.user)
      .map(normalizeAdminUser);

    return res.json({
      roles: rows,
      users,
      selectedRoleId: rows[0]?.id || "",
      permissionSections: PERMISSION_SECTIONS,
      permissionActions: PERMISSION_ACTIONS,
    });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveRole(req, res, next) {
  try {
    const body = req.body || {};
    const id = body.id;
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();

    if (!name) return res.status(400).json({ message: "Role name is required" });

    let role;
    if (id) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid role id" });
      role = await AdminRole.findByIdAndUpdate(
        id,
        { $set: { name, description } },
        { returnDocument: "after" },
      ).lean();
      if (!role) return res.status(404).json({ message: "Role not found" });
    } else {
      role = await AdminRole.create({
        name,
        description,
        permissions: buildDefaultPermissions(),
      });
      role = role.toObject();
    }

    const usersCount = await AdminUserRole.countDocuments({ role: role._id });
    return res.json({ ok: true, role: normalizeRole(role, usersCount) });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "Role name already exists" });
    next(e);
  }
}

export async function adminDeleteRole(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid role id" });

    const inUse = await AdminUserRole.countDocuments({ role: id });
    if (inUse > 0) {
      return res.status(400).json({ message: "Role is assigned to admin users" });
    }

    const role = await AdminRole.findByIdAndDelete(id).lean();
    if (!role) return res.status(404).json({ message: "Role not found" });

    return res.json({ ok: true, id: toId(role) });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveRolePermissions(req, res, next) {
  try {
    const { id } = req.params;
    const permissions = req.body?.permissions;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid role id" });
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ message: "Permissions object is required" });
    }

    const role = await AdminRole.findByIdAndUpdate(
      id,
      { $set: { permissions } },
      { returnDocument: "after" },
    ).lean();

    if (!role) return res.status(404).json({ message: "Role not found" });

    const usersCount = await AdminUserRole.countDocuments({ role: id });
    return res.json({ ok: true, role: normalizeRole(role, usersCount) });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveAdminUser(req, res, next) {
  try {
    const body = req.body || {};
    const id = body.id;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const roleName = String(body.role || "").trim();

    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!roleName) return res.status(400).json({ message: "Role is required" });

    const role = await AdminRole.findOne({ name: roleName }).lean();
    if (!role) return res.status(404).json({ message: "Role not found" });

    let user;
    if (id) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid user id" });
      user = await User.findById(id);
      if (!user) return res.status(404).json({ message: "User not found" });
    } else {
      user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: "User not found. Create user in Clerk first, then assign admin role." });
      }
    }

    user.role = "admin";
    user.isActive = body.status === "inactive" ? false : true;
    if (name) user.name = name;
    if (email) user.email = email;
    await user.save();

    let assignment = await AdminUserRole.findOne({ user: user._id });
    if (!assignment) {
      assignment = await AdminUserRole.create({
        user: user._id,
        role: role._id,
        status: user.isActive ? "active" : "inactive",
        lastLoginAt: new Date(),
        createdBy: req.user?._id || null,
      });
    } else {
      assignment = await AdminUserRole.findByIdAndUpdate(
        assignment._id,
        {
          $set: {
            role: role._id,
            status: user.isActive ? "active" : "inactive",
            lastLoginAt: assignment.lastLoginAt || new Date(),
          },
        },
        { returnDocument: "after" },
      );
    }

    const row = await AdminUserRole.findById(assignment._id)
      .populate("user", "name email role isActive updatedAt createdAt")
      .populate("role", "name")
      .lean();

    return res.json({ ok: true, user: normalizeAdminUser(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminToggleAdminUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "").toLowerCase();

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid user id" });
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: status === "active" } },
      { returnDocument: "after" },
    ).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const assignment = await AdminUserRole.findOneAndUpdate(
      { user: id },
      { $set: { status } },
      { returnDocument: "after" },
    )
      .populate("user", "name email role isActive updatedAt createdAt")
      .populate("role", "name")
      .lean();

    if (!assignment) return res.status(404).json({ message: "Admin assignment not found" });

    return res.json({ ok: true, user: normalizeAdminUser(assignment) });
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteAdminUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid user id" });

    if (toId(req.user) === String(id)) {
      return res.status(400).json({ message: "Cannot remove current logged-in admin" });
    }

    await AdminUserRole.deleteOne({ user: id });

    await User.findByIdAndUpdate(
      id,
      {
        $set: {
          role: "student",
          isActive: true,
        },
      },
      { returnDocument: "after" },
    );

    return res.json({ ok: true, id: String(id) });
  } catch (e) {
    next(e);
  }
}
