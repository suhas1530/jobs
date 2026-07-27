// backend/src/controllers/student/student.settings.controller.js
import User from "../../models/User.js";

function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}
function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v ?? "").split(/[\n,;/|]+/g))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;/|]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

const defaultNotifications = {
  appStatus: true,
  employerMessages: true,
  interviewUpdates: true,
  jobRecommendations: true,
  governmentUpdates: true,
  internshipAlerts: true,
  systemAnnouncements: true,
  emailStatus: true,
  emailMessages: true,
  emailJobs: true,
  weeklyDigest: false,
  whatsappAlerts: false,
  smsAlerts: false,
  frequency: "Instant",
};

const defaultPreferences = {
  stream: "",
  category: "",
  subcategory: "",
  locations: [],
  expectedSalary: "",
  workMode: "Hybrid",
  oneClickApply: true,
  autoAttachResume: true,
  autoSaveHistory: true,
  simpleMode: false,
  voiceGuidance: true,
};

const defaultPrivacy = {
  profileVisibility: "Visible to Employers",
  showPhoneAfterShortlist: true,
  allowEmployerMessages: true,
};

function normalizeSettings(doc) {
  const s = doc?.studentSettings || {};
  return {
    account: {
      fullName: doc?.name || "",
      email: doc?.email || "",
      phone: doc?.phone || "",
      location: doc?.location || "",
      linkedin: doc?.linkedin || "",
      portfolio: doc?.portfolio || "",
    },
    security: {
      // password fields are NOT stored because auth is via Clerk
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      twoFactor: !!s?.security?.twoFactor,
    },
    notifications: {
      ...defaultNotifications,
      ...safeObj(s?.notifications),
    },
    preferences: {
      ...defaultPreferences,
      ...safeObj(s?.preferences),
    },
    privacy: {
      ...defaultPrivacy,
      ...safeObj(s?.privacy),
    },
  };
}

/**
 * GET /api/student/settings
 */
export const getStudentSettings = async (req, res, next) => {
  try {
    const me = await User.findById(req.user._id).lean();
    if (!me) return res.status(404).json({ message: "Student not found" });
    return res.json(normalizeSettings(me));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/student/settings
 * body: { account, security, notifications, preferences, privacy }
 */
export const updateStudentSettings = async (req, res, next) => {
  try {
    const body = req.body || {};

    const account = safeObj(body.account);
    const security = safeObj(body.security);
    const notifications = safeObj(body.notifications);
    const preferences = safeObj(body.preferences);
    const privacy = safeObj(body.privacy);

    // ✅ Clerk handles password. If they try to change password here, block it.
    if (security?.currentPassword || security?.newPassword || security?.confirmPassword) {
      return res.status(400).json({
        message: "Password is managed by Clerk. Use Clerk change-password flow.",
      });
    }

    const me = await User.findById(req.user._id).lean();
    if (!me) return res.status(404).json({ message: "Student not found" });

    const existingSettings = safeObj(me.studentSettings);
    const existingProfile = safeObj(me.studentProfile);
    const existingPreferred = safeObj(existingProfile.preferred);

    const normalizedNotifications = {
      ...defaultNotifications,
      ...safeObj(existingSettings.notifications),
      appStatus: !!notifications.appStatus,
      employerMessages: !!notifications.employerMessages,
      interviewUpdates: !!notifications.interviewUpdates,
      jobRecommendations: !!notifications.jobRecommendations,
      governmentUpdates: !!notifications.governmentUpdates,
      internshipAlerts: !!notifications.internshipAlerts,
      systemAnnouncements: !!notifications.systemAnnouncements,
      emailStatus: !!notifications.emailStatus,
      emailMessages: !!notifications.emailMessages,
      emailJobs: !!notifications.emailJobs,
      weeklyDigest: !!notifications.weeklyDigest,
      whatsappAlerts: !!notifications.whatsappAlerts,
      smsAlerts: !!notifications.smsAlerts,
      frequency: typeof notifications.frequency === "string" ? notifications.frequency : "Instant",
    };

    const normalizedPreferences = {
      ...defaultPreferences,
      ...safeObj(existingSettings.preferences),
      stream: typeof preferences.stream === "string" ? preferences.stream : "",
      category: typeof preferences.category === "string" ? preferences.category : "",
      subcategory: typeof preferences.subcategory === "string" ? preferences.subcategory : "",
      locations: toStringArray(preferences.locations),
      expectedSalary: typeof preferences.expectedSalary === "string" ? preferences.expectedSalary : "",
      workMode: typeof preferences.workMode === "string" ? preferences.workMode : "Hybrid",
      oneClickApply: !!preferences.oneClickApply,
      autoAttachResume: !!preferences.autoAttachResume,
      autoSaveHistory: !!preferences.autoSaveHistory,
      simpleMode: !!preferences.simpleMode,
      voiceGuidance:
        preferences.voiceGuidance === undefined
          ? true
          : !!preferences.voiceGuidance,
    };

    const normalizedPrivacy = {
      ...defaultPrivacy,
      ...safeObj(existingSettings.privacy),
      profileVisibility: typeof privacy.profileVisibility === "string" ? privacy.profileVisibility : "Visible to Employers",
      showPhoneAfterShortlist: !!privacy.showPhoneAfterShortlist,
      allowEmployerMessages: !!privacy.allowEmployerMessages,
    };

    const update = {
      name: typeof account.fullName === "string" ? account.fullName : undefined,
      phone: typeof account.phone === "string" ? account.phone : undefined,
      location: typeof account.location === "string" ? account.location : undefined,
      linkedin: typeof account.linkedin === "string" ? account.linkedin : undefined,
      portfolio: typeof account.portfolio === "string" ? account.portfolio : undefined,

      studentSettings: {
        ...existingSettings,
        security: {
          ...safeObj(existingSettings.security),
          twoFactor: !!security.twoFactor,
        },
        notifications: normalizedNotifications,
        preferences: normalizedPreferences,
        privacy: normalizedPrivacy,
      },
      // keep notifications page prefs in sync
      notificationPrefs: {
        ...safeObj(me.notificationPrefs),
        appStatus: normalizedNotifications.appStatus,
        employerMessages: normalizedNotifications.employerMessages,
        jobRecs: normalizedNotifications.jobRecommendations,
        govUpdates: normalizedNotifications.governmentUpdates,
        internshipAlerts: normalizedNotifications.internshipAlerts,
        announcements: normalizedNotifications.systemAnnouncements,
        emailStatus: normalizedNotifications.emailStatus,
        emailMessages: normalizedNotifications.emailMessages,
        emailJobs: normalizedNotifications.emailJobs,
        weeklyDigest: normalizedNotifications.weeklyDigest,
        whatsapp: normalizedNotifications.whatsappAlerts,
        sms: normalizedNotifications.smsAlerts,
        frequency: normalizedNotifications.frequency,
      },
      // keep admin/company-facing preferred profile in sync
      studentProfile: {
        ...existingProfile,
        preferred: {
          ...existingPreferred,
          stream: normalizedPreferences.stream,
          category: normalizedPreferences.category,
          subcategory: normalizedPreferences.subcategory,
          subCategory: normalizedPreferences.subcategory,
          locations: normalizedPreferences.locations,
          workMode: normalizedPreferences.workMode,
          expectedSalary: normalizedPreferences.expectedSalary,
          oneClickApply: normalizedPreferences.oneClickApply,
          autoAttachResume: normalizedPreferences.autoAttachResume,
        },
      },
    };

    // remove undefined keys
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    const updated = await User.findByIdAndUpdate(req.user._id, update, {
      returnDocument: "after",
    }).lean();
    return res.json(normalizeSettings(updated));
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/student/settings
 * soft delete
 */
export const deleteStudentAccount = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { isActive: false, deletedAt: new Date() },
      { returnDocument: "after" }
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
