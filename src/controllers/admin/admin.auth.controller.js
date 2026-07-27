import User from "../../models/User.js";
import {
  LOCAL_ADMIN_AUTH,
  signLocalAdminToken,
  verifyLocalAdminCredentials,
} from "../../config/adminLocalAuth.js";

export async function adminLocalLogin(req, res, next) {
  try {
    const ok = verifyLocalAdminCredentials(req.body || {});
    if (!ok) {
      return res.status(401).json({ message: "You are not authorized" });
    }

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
    } else if (
      user.role !== "admin" ||
      user.email !== LOCAL_ADMIN_AUTH.email ||
      user.name !== LOCAL_ADMIN_AUTH.name ||
      user.isActive === false
    ) {
      user = await User.findByIdAndUpdate(
        user._id,
        {
          role: "admin",
          email: LOCAL_ADMIN_AUTH.email,
          name: LOCAL_ADMIN_AUTH.name,
          isActive: true,
        },
        { returnDocument: "after" },
      );
    }

    return res.json({
      token: signLocalAdminToken(),
      user: {
        id: String(user._id),
        name: LOCAL_ADMIN_AUTH.name,
        username: LOCAL_ADMIN_AUTH.username,
        email: LOCAL_ADMIN_AUTH.email,
        role: "admin",
      },
    });
  } catch (error) {
    next(error);
  }
}
