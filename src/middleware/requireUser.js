// backend/src/middleware/requireUser.js
import User from "../models/User.js";

export default async function requireUser(req, res, next) {
  try {
    const clerkId = req.auth()?.userId;
    if (!clerkId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ clerkId });
    if (!user) return res.status(401).json({ message: "User not synced" });
    if (user.isActive === false) return res.status(403).json({ message: "Account suspended" });

    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
