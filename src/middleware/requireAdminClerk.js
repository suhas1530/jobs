import { clerkClient } from "@clerk/express";
import User from "../models/User.js";
import { LOCAL_ADMIN_AUTH, verifyLocalAdminToken } from "../config/adminLocalAuth.js";

function pickRole(clerkUser) {
  const raw = clerkUser?.publicMetadata?.role ?? clerkUser?.unsafeMetadata?.role;
  return typeof raw === "string" ? raw.toLowerCase() : null;
}

export default async function requireAdminClerk(req, res, next) {
  try {
    const explicitAdminToken = String(req.headers["x-admin-token"] || "").trim();
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const localAdmin = verifyLocalAdminToken(explicitAdminToken || token);
    if (localAdmin) {
      const clerkId = `local_admin_${LOCAL_ADMIN_AUTH.username}`;
      let user = await User.findOne({ clerkId });
      if (!user) {
        user = await User.create({
          clerkId,
          role: "admin",
          email: LOCAL_ADMIN_AUTH.email,
          name: LOCAL_ADMIN_AUTH.name,
          isActive: true,
        });
      }
      if (user.isActive === false) return res.status(403).json({ message: "Account suspended" });
      req.user = user;
      req.dbUser = user;
      req.localAdmin = localAdmin;
      return next();
    }

    const clerkId = req.auth()?.userId;
    if (!clerkId) return res.status(401).json({ message: "Unauthorized" });

    let user = await User.findOne({ clerkId });
    if (user && String(user.role || "").toLowerCase() === "admin" && user.isActive !== false) {
      req.user = user;
      req.dbUser = user;
      return next();
    }

    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(clerkId);
    } catch {
      if (user && String(user.role || "").toLowerCase() === "admin" && user.isActive !== false) {
        req.user = user;
        req.dbUser = user;
        return next();
      }
      return res.status(503).json({ message: "Auth profile unavailable. Please retry." });
    }

    const role = pickRole(clerkUser);
    if (role !== "admin") {
      return res.status(403).json({ message: "Admin role required" });
    }

    const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || "Admin";

    if (!user) {
      user = await User.create({
        clerkId,
        role: "admin",
        email,
        name,
        isActive: true,
      });
    } else {
      const patch = {};
      if (user.role !== "admin") patch.role = "admin";
      if (email && user.email !== email) patch.email = email;
      if (name && user.name !== name) patch.name = name;

      if (Object.keys(patch).length) {
        user = await User.findByIdAndUpdate(user._id, patch, { returnDocument: "after" });
      }
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account suspended" });
    }

    req.user = user;
    req.dbUser = user;
    next();
  } catch (e) {
    next(e);
  }
}
