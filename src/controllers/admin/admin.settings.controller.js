import AdminSettings from "../../models/AdminSettings.js";

function defaults() {
  return {
    profile: { name: "", email: "", role: "Super Admin", phone: "", address: "", logoUrl: "" },
    social: { linkedin: "", twitter: "", instagram: "", facebook: "" },
    security: { twoFactor: false },
    sessions: { active: 0, lastPasswordChange: "" },
    email: { host: "", port: "", senderEmail: "", senderName: "" },
    notifications: {
      companyRegistration: true,
      studentRegistration: true,
      planPurchase: true,
      planExpiry: true,
      jobPosted: true,
      applicationSubmitted: true,
      applicationShortlisted: true,
      systemError: true,
    },
    platform: {
      governmentJobs: true,
      internship: true,
      resumeBuilder: true,
      chatSystem: false,
      videoInterview: false,
      aiResumeMatching: true,
      maintenanceMode: false,
      enableStudentModule: true,
      enableCompanyModule: true,
      enableGovernmentUpdates: true,
    },
    theme: { mode: "light", accent: "blue" },
  };
}

function mergeSettings(base, payload) {
  return {
    ...base,
    profile: { ...base.profile, ...(payload?.profile || {}) },
    social: { ...base.social, ...(payload?.social || {}) },
    security: { ...base.security, ...(payload?.security || {}) },
    sessions: { ...base.sessions, ...(payload?.sessions || {}) },
    email: { ...base.email, ...(payload?.email || {}) },
    notifications: { ...base.notifications, ...(payload?.notifications || {}) },
    platform: { ...base.platform, ...(payload?.platform || {}) },
    theme: { ...base.theme, ...(payload?.theme || {}) },
  };
}

export async function adminGetSettings(req, res, next) {
  try {
    let doc = await AdminSettings.findOne({}).lean();
    if (!doc) {
      const created = await AdminSettings.create(defaults());
      doc = created.toObject();
    }

    const merged = mergeSettings(defaults(), doc);
    return res.json(merged);
  } catch (e) {
    next(e);
  }
}

export async function adminSaveSettings(req, res, next) {
  try {
    const payload = req.body || {};
    let doc = await AdminSettings.findOne({}).lean();
    const current = doc ? mergeSettings(defaults(), doc) : defaults();
    const nextSettings = mergeSettings(current, payload);

    doc = await AdminSettings.findOneAndUpdate(
      {},
      {
        $set: {
          ...nextSettings,
          updatedBy: req.user?._id || null,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    ).lean();

    return res.json({ ok: true, settings: mergeSettings(defaults(), doc) });
  } catch (e) {
    next(e);
  }
}
