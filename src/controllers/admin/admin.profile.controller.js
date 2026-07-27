import User from "../../models/User.js";

function normalize(doc) {
  const adminProfile = doc?.adminProfile || {};
  const adminPreferences = doc?.adminPreferences || {};

  return {
    profile: {
      fullName: doc?.name || "",
      email: doc?.email || "",
      phone: doc?.phone || "",
      designation: adminProfile.designation || "Super Admin",
      bio: adminProfile.bio || "",
    },
    preferences: {
      emailNotifications: adminPreferences.emailNotifications !== false,
      planApprovalAlerts: adminPreferences.planApprovalAlerts !== false,
      registrationAlerts: adminPreferences.registrationAlerts !== false,
    },
    activity: {
      lastLogin: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : "",
      lastPasswordChange: adminProfile.lastPasswordChange || "",
      activeSessions: Number(adminProfile.activeSessions || 1),
    },
  };
}

export async function adminGetProfile(req, res, next) {
  try {
    const me = await User.findById(req.user._id).lean();
    if (!me) return res.status(404).json({ message: "Admin not found" });
    return res.json(normalize(me));
  } catch (e) {
    next(e);
  }
}

export async function adminSaveProfile(req, res, next) {
  try {
    const body = req.body || {};
    const profile = body.profile || {};
    const preferences = body.preferences || {};

    const update = {
      name: typeof profile.fullName === "string" ? profile.fullName.trim() : undefined,
      email: typeof profile.email === "string" ? profile.email.trim() : undefined,
      phone: typeof profile.phone === "string" ? profile.phone.trim() : undefined,
      adminProfile: {
        designation: typeof profile.designation === "string" ? profile.designation.trim() : "",
        bio: typeof profile.bio === "string" ? profile.bio : "",
      },
      adminPreferences: {
        emailNotifications: !!preferences.emailNotifications,
        planApprovalAlerts: !!preferences.planApprovalAlerts,
        registrationAlerts: !!preferences.registrationAlerts,
      },
    };

    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    const updated = await User.findByIdAndUpdate(req.user._id, update, {
      returnDocument: "after",
    }).lean();

    return res.json({ ok: true, ...normalize(updated) });
  } catch (e) {
    next(e);
  }
}
