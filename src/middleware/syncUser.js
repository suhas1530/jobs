import { clerkClient } from "@clerk/express";
import User from "../models/User.js";

function safeStr(x) {
  return typeof x === "string" ? x.trim() : "";
}

function getAuth(req) {
  // Supports both Clerk styles:
  // - req.auth (object)
  // - req.auth() (function)
  if (!req) return null;
  if (typeof req.auth === "function") return req.auth();
  return req.auth || null;
}

/**
 * Sync Clerk user into MongoDB.
 * - Uses Clerk publicMetadata.role if present
 * - Otherwise uses defaultRole passed by route (company/student/admin)
 * - Never hard-fails existing users if Clerk profile fetch is unavailable
 * - NEVER overwrites studentProfile/resume/studentSettings
 */
export default function syncUser(defaultRole = "student") {
  const fallbackRole = String(defaultRole || "student").toLowerCase();

  return async function syncUserMiddleware(req, res, next) {
    try {
      const auth = getAuth(req);
      const clerkId = auth?.userId;
      if (!clerkId) return res.status(401).json({ message: "Unauthorized" });

      let user = await User.findOne({ clerkId });

      let cu = null;
      try {
        cu = await clerkClient.users.getUser(clerkId);
      } catch (e) {
        // Keep requests functional when Clerk user-read is transiently unavailable.
        if (!user) {
          return res
            .status(503)
            .json({ message: "Auth profile unavailable. Please retry." });
        }
      }

      const email =
        safeStr(cu?.emailAddresses?.[0]?.emailAddress) || safeStr(user?.email) || "";

      const nameFromClerk = [safeStr(cu?.firstName), safeStr(cu?.lastName)]
        .filter(Boolean)
        .join(" ")
        .trim();
      const name = nameFromClerk || safeStr(user?.name) || "User";

      const clerkRoleRaw = cu?.publicMetadata?.role ?? cu?.unsafeMetadata?.role ?? null;
      const clerkRole = typeof clerkRoleRaw === "string" ? clerkRoleRaw.toLowerCase() : null;

      const finalRole = clerkRole || user?.role || fallbackRole;

      if (!user) {
        user = await User.findOneAndUpdate(
          { clerkId },
          {
            $setOnInsert: {
              clerkId,
              role: finalRole,
              email,
              name,
              isActive: true,
            },
          },
          { upsert: true, returnDocument: "after" }
        );
      } else {
        // Only update safe fields. Never touch studentProfile/resume/settings here.
        const $set = {};
        if (email && user.email !== email) $set.email = email;
        if (name && user.name !== name) $set.name = name;

        // Only update role if Clerk explicitly provides role
        if (clerkRole && user.role !== clerkRole) $set.role = clerkRole;

        if (Object.keys($set).length) {
          user = await User.findOneAndUpdate(
            { _id: user._id },
            { $set },
            { returnDocument: "after" } // mongoose v8+
          );
        }
      }

      if (user?.isActive === false) {
        return res.status(403).json({ message: "Account suspended" });
      }

      req.user = user;
      req.dbUser = user;
      next();
    } catch (e) {
      console.error("syncUser error:", e);
      res.status(500).json({ message: "User sync failed" });
    }
  };
}