// // backend/src/controllers/student/student.notifications.controller.js
// import StudentNotification from "../../models/StudentNotification.js";
// import User from "../../models/User.js";
// import Interview from "../../models/Interview.js";

// /**
//  * small helper to group as Today / Yesterday / Earlier
//  */
// function groupByDate(createdAt) {
//   const d = new Date(createdAt);
//   const now = new Date();

//   // local midnight
//   const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//   const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

//   if (d >= startToday) return "Today";
//   if (d >= startYesterday) return "Yesterday";
//   return "Earlier";
// }

// function timeAgo(createdAt) {
//   const diffMs = Date.now() - new Date(createdAt).getTime();
//   const mins = Math.floor(diffMs / 60000);
//   if (mins < 1) return "Now";
//   if (mins < 60) return `${mins}m ago`;
//   const hrs = Math.floor(mins / 60);
//   if (hrs < 24) return `${hrs}h ago`;
//   const days = Math.floor(hrs / 24);
//   return `${days}d ago`;
// }

// function formatDateTime(dt) {
//   const d = new Date(dt);
//   const dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
//   const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
//   return `${dateStr} at ${timeStr}`;
// }

// async function ensureInterviewReminderNotifications(studentId) {
//   const now = Date.now();
//   const upcoming = await Interview.find({
//     student: studentId,
//     status: { $in: ["Scheduled", "Rescheduled", "Pending Confirmation"] },
//     scheduledAt: { $gte: new Date(now - 5 * 60 * 1000), $lte: new Date(now + 30 * 60 * 1000) },
//   })
//     .select("application job jobTitle scheduledAt meetingLink mode")
//     .lean();

//   for (const it of upcoming) {
//     const when = new Date(it.scheduledAt).getTime();
//     const minsLeft = Math.round((when - now) / 60000);
//     const inWindowThirty = minsLeft <= 30 && minsLeft > 0;
//     const inWindowNow = minsLeft <= 0 && minsLeft >= -5;

//     const reminderKey = inWindowThirty
//       ? `interview_30_${String(it._id)}`
//       : inWindowNow
//       ? `interview_now_${String(it._id)}`
//       : "";
//     if (!reminderKey) continue;

//     const existing = await StudentNotification.findOne({
//       studentId,
//       "meta.reminderKey": reminderKey,
//     })
//       .select("_id")
//       .lean();
//     if (existing) continue;

//     const joinUrl = String(it.meetingLink || "").trim();
//     const title = inWindowThirty ? "Interview reminder (30 min left)" : "Interview is starting now";
//     const description = `Your interview for ${it.jobTitle || "your application"} is at ${formatDateTime(it.scheduledAt)}.`;

//     await StudentNotification.create({
//       studentId,
//       type: "System",
//       title,
//       description,
//       icon: "system",
//       actions: [
//         ...(joinUrl ? ["Join Meeting"] : []),
//         "View Application",
//       ],
//       meta: {
//         reminderKey,
//         interviewId: String(it._id),
//         scheduledAt: new Date(it.scheduledAt).toISOString(),
//         applicationId: it.application ? String(it.application) : "",
//         jobId: it.job ? String(it.job) : "",
//         url: joinUrl,
//       },
//       read: false,
//     });
//   }
// }

// /**
//  * GET /api/student/notifications
//  * Supports query:
//  *  - type=Applications|Jobs|Messages|System|All
//  *  - status=Read|Unread|All
//  *  - q=search
//  */
// export const listStudentNotifications = async (req, res, next) => {
//   try {
//     const studentId = req.user._id;
//     await ensureInterviewReminderNotifications(studentId);

//     const { type = "All", status = "All", q = "" } = req.query;

//     const query = { studentId };

//     if (type && type !== "All") query.type = type;
//     if (status && status !== "All") query.read = status === "Read";

//     if (q && String(q).trim()) {
//       const s = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//       const rx = new RegExp(s, "i");
//       query.$or = [{ title: rx }, { description: rx }];
//     }

//     const docs = await StudentNotification.find(query)
//       .sort({ createdAt: -1 })
//       .limit(200)
//       .lean();

//     const items = docs.map((n) => ({
//       id: String(n._id),
//       type: n.type || "System",
//       status: n.read ? "Read" : "Unread",
//       group: groupByDate(n.createdAt),
//       title: n.title,
//       description: n.description,
//       time: timeAgo(n.createdAt),
//       icon: n.icon || "system",
//       actions: Array.isArray(n.actions) ? n.actions : [],
//       meta: n.meta || {},
//       createdAt: n.createdAt,
//     }));

//     const unreadCount = items.filter((x) => x.status === "Unread").length;

//     return res.json({ items, unreadCount });
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * POST /api/student/notifications/mark-all-read
//  */
// export const markAllRead = async (req, res, next) => {
//   try {
//     const studentId = req.user._id;
//     await StudentNotification.updateMany({ studentId, read: false }, { $set: { read: true } });
//     return res.json({ ok: true });
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * PATCH /api/student/notifications/:id/toggle
//  */
// export const toggleRead = async (req, res, next) => {
//   try {
//     const studentId = req.user._id;
//     const { id } = req.params;

//     const doc = await StudentNotification.findOne({ _id: id, studentId });
//     if (!doc) return res.status(404).json({ message: "Notification not found" });

//     doc.read = !doc.read;
//     await doc.save();

//     return res.json({ ok: true, status: doc.read ? "Read" : "Unread" });
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * GET /api/student/notifications/preferences
//  * Stored inside User doc as "notificationPrefs"
//  */
// export const getNotificationPrefs = async (req, res, next) => {
//   try {
//     const me = await User.findById(req.user._id).lean();
//     const prefs = me?.notificationPrefs || {
//       appStatus: true,
//       employerMessages: true,
//       jobRecs: true,
//       govUpdates: true,
//       internshipAlerts: true,
//       announcements: true,
//       emailStatus: true,
//       emailJobs: true,
//       emailMessages: true,
//       weeklyDigest: false,
//       whatsapp: false,
//       sms: false,
//       frequency: "Instant",
//     };
//     return res.json(prefs);
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * PUT /api/student/notifications/preferences
//  */
// export const saveNotificationPrefs = async (req, res, next) => {
//   try {
//     const payload = req.body || {};
//     const updated = await User.findByIdAndUpdate(
//       req.user._id,
//       { $set: { notificationPrefs: payload } },
//       { returnDocument: "after" }
//     ).lean();

//     return res.json(updated?.notificationPrefs || payload);
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * ✅ OPTIONAL SEED (for testing)
//  * POST /api/student/notifications/seed
//  */
// export const seedNotifications = async (req, res, next) => {
//   try {
//     const studentId = req.user._id;

//     const demo = [
//       {
//         studentId,
//         type: "Applications",
//         title: "Application submitted successfully",
//         description: "Your application for Software Developer at Tech Solutions Inc. was submitted.",
//         icon: "application",
//         actions: ["View Application"],
//         read: false,
//       },
//       {
//         studentId,
//         type: "Messages",
//         title: "Employer replied to your message",
//         description: "Tech Solutions requested your updated resume and portfolio.",
//         icon: "message",
//         actions: ["Reply"],
//         read: false,
//       },
//       {
//         studentId,
//         type: "Jobs",
//         title: "New job alert matching your skills",
//         description: "3 new React Developer jobs were posted in Bangalore.",
//         icon: "job",
//         actions: ["View Job", "Save Job"],
//         read: true,
//       },
//     ];

//     await StudentNotification.insertMany(demo);
//     return res.json({ ok: true });
//   } catch (err) {
//     next(err);
//   }
// };



//////////////////////////////////////////////////////////////////////////////////


// backend/src/controllers/student/student.notifications.controller.js
import mongoose from "mongoose";
import { StudentNotification, NotificationPrefs } from "../../models/StudentNotification.js";

/* ─── helpers ───────────────────────────────────────────────────────────────── */

function groupByDate(createdAt) {
  const d              = new Date(createdAt);
  const now            = new Date();
  const startToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d >= startToday)     return "Today";
  if (d >= startYesterday) return "Yesterday";
  return "Earlier";
}

function timeAgo(createdAt) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)  return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(dt) {
  const d = new Date(dt);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

const toOid = (s) => {
  try { return new mongoose.Types.ObjectId(String(s)); } catch { return null; }
};

// lazy model loader — won't crash if a model doesn't exist yet
const getModel = (name) => {
  try { return mongoose.model(name); } catch { return null; }
};

/* ─── auto-create interview reminder notifications ──────────────────────────── */
async function ensureInterviewReminderNotifications(studentId) {
  const Interview = getModel("Interview");
  if (!Interview) return;

  const now      = Date.now();
  const upcoming = await Interview.find({
    student:     studentId,
    status:      { $in: ["Scheduled", "Rescheduled", "Pending Confirmation"] },
    scheduledAt: {
      $gte: new Date(now - 5  * 60 * 1000),
      $lte: new Date(now + 30 * 60 * 1000),
    },
  }).select("application job jobTitle scheduledAt meetingLink mode").lean();

  for (const it of upcoming) {
    const when     = new Date(it.scheduledAt).getTime();
    const minsLeft = Math.round((when - now) / 60000);
    const inThirty = minsLeft <= 30 && minsLeft > 0;
    const inNow    = minsLeft <= 0  && minsLeft >= -5;

    const reminderKey = inThirty
      ? `interview_30_${String(it._id)}`
      : inNow
      ? `interview_now_${String(it._id)}`
      : "";
    if (!reminderKey) continue;

    const existing = await StudentNotification.findOne({
      studentId,
      "meta.reminderKey": reminderKey,
    }).select("_id").lean();
    if (existing) continue;

    const joinUrl = String(it.meetingLink || "").trim();
    await StudentNotification.create({
      studentId,
      type:        "System",
      title:       inThirty ? "Interview reminder (30 min left)" : "Interview is starting now",
      description: `Your interview for ${it.jobTitle || "your application"} is at ${formatDateTime(it.scheduledAt)}.`,
      icon:        "system",
      actions:     [...(joinUrl ? ["Join Meeting"] : []), "View Application"],
      meta: {
        reminderKey,
        interviewId:   String(it._id),
        scheduledAt:   new Date(it.scheduledAt).toISOString(),
        applicationId: it.application ? String(it.application) : "",
        jobId:         it.job         ? String(it.job)         : "",
        url:           joinUrl,
      },
      read: false,
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/student/notifications
   query: type, status, q, range
═══════════════════════════════════════════════════════════════════════════ */
export const listStudentNotifications = async (req, res, next) => {
  try {
    const studentId = req.user._id || req.user.id;
    await ensureInterviewReminderNotifications(studentId);

    const { type = "All", status = "All", q = "", range = "Last 30 days" } = req.query;

    const filter = { studentId };
    if (type   && type   !== "All") filter.type = type;
    if (status && status !== "All") filter.read = status === "Read";

    if (range && range !== "Last 30 days") {
      const days  = range === "Today" ? 1 : 7;
      filter.createdAt = { $gte: new Date(Date.now() - days * 86_400_000) };
    }

    if (q && String(q).trim()) {
      const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ title: new RegExp(safe, "i") }, { description: new RegExp(safe, "i") }];
    }

    const docs = await StudentNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const items = docs.map((n) => ({
      id:          String(n._id),
      type:        n.type || "System",
      status:      n.read ? "Read" : "Unread",
      group:       groupByDate(n.createdAt),
      title:       n.title,
      description: n.description,
      time:        timeAgo(n.createdAt),
      icon:        n.icon || "system",
      avatar:      n.avatar || null,
      senderName:  n.senderName || "",
      actions:     Array.isArray(n.actions) ? n.actions : [],
      meta:        n.meta || {},
      createdAt:   n.createdAt,
    }));

    return res.json({ success: true, data: { items, unreadCount: items.filter((x) => x.status === "Unread").length } });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/student/notifications/mark-all-read
═══════════════════════════════════════════════════════════════════════════ */
export const markAllRead = async (req, res, next) => {
  try {
    const studentId = req.user._id || req.user.id;
    await StudentNotification.updateMany({ studentId, read: false }, { $set: { read: true } });
    return res.json({ success: true, ok: true });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/student/notifications/:id/toggle
═══════════════════════════════════════════════════════════════════════════ */
export const toggleRead = async (req, res, next) => {
  try {
    const studentId = req.user._id || req.user.id;
    const doc       = await StudentNotification.findOne({ _id: req.params.id, studentId });
    if (!doc) return res.status(404).json({ success: false, message: "Notification not found" });
    doc.read = !doc.read;
    await doc.save();
    return res.json({ success: true, ok: true, status: doc.read ? "Read" : "Unread" });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/student/notifications/preferences
═══════════════════════════════════════════════════════════════════════════ */
export const getNotificationPrefs = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;

    const prefs = await NotificationPrefs.findOne({ userId }).lean();
    if (prefs) return res.json({ success: true, data: prefs });

    // fallback: read from User doc
    const User = getModel("User");
    if (User) {
      const me = await User.findById(userId).lean();
      if (me?.notificationPrefs) return res.json({ success: true, data: me.notificationPrefs });
    }

    return res.json({
      success: true,
      data: {
        appStatus: true, employerMessages: true, jobRecs: true,
        govUpdates: true, internshipAlerts: true, announcements: true,
        emailStatus: true, emailJobs: true, emailMessages: true,
        weeklyDigest: false, whatsapp: false, sms: false, frequency: "Instant",
      },
    });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/student/notifications/preferences
═══════════════════════════════════════════════════════════════════════════ */
export const saveNotificationPrefs = async (req, res, next) => {
  try {
    const userId  = req.user._id || req.user.id;
    const payload = req.body || {};

    const ALLOWED = [
      "appStatus","employerMessages","jobRecs","govUpdates","internshipAlerts",
      "announcements","emailStatus","emailJobs","emailMessages","weeklyDigest",
      "whatsapp","sms","frequency",
    ];
    const update = { userId };
    ALLOWED.forEach((k) => { if (k in payload) update[k] = payload[k]; });

    const saved = await NotificationPrefs.findOneAndUpdate(
      { userId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, data: saved });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/student/notifications/profile-stats
═══════════════════════════════════════════════════════════════════════════ */
export const getProfileStats = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    let profileViews = 0, postImpressions = 0;

    const ProfileView = getModel("ProfileView");
    if (ProfileView) {
      const since = new Date(Date.now() - 90 * 86_400_000);
      profileViews = await ProfileView.countDocuments({ profileId: userId, createdAt: { $gte: since } });
    } else {
      const User = getModel("User");
      if (User) {
        const u = await User.findById(userId).select("profileViews").lean();
        profileViews = u?.profileViews || 0;
      }
    }

    const Post = getModel("Post");
    if (Post) {
      const since = new Date(Date.now() - 90 * 86_400_000);
      const posts = await Post.find({ authorId: userId, createdAt: { $gte: since } }).select("impressions").lean();
      postImpressions = posts.reduce((s, p) => s + (p.impressions || 0), 0);
    } else {
      const User = getModel("User");
      if (User) {
        const u = await User.findById(userId).select("postImpressions").lean();
        postImpressions = u?.postImpressions || 0;
      }
    }

    return res.json({ success: true, data: { profileViews, postImpressions } });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/student/notifications/suggestions/people
═══════════════════════════════════════════════════════════════════════════ */
export const peopleSuggestions = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const User   = getModel("User");
    if (!User) return res.json({ success: true, data: [] });

    const me        = await User.findById(userId).select("following").lean();
    const following = (me?.following || []).map(String);
    const exclude   = [String(userId), ...following].map(toOid).filter(Boolean);

    const students = await User.find({ _id: { $nin: exclude }, role: "student" })
      .select("_id name profile.avatar profile.headline profile.location following")
      .limit(20)
      .lean();

    const data = students.map((s) => {
      const theirFollowing = (s.following || []).map(String);
      const mutual = following.filter((id) => theirFollowing.includes(id)).length;
      return {
        id:          String(s._id),
        name:        s.name || "Student",
        role:        s.profile?.headline || "Student",
        location:    s.profile?.location || "",
        avatar:      s.profile?.avatar   || null,
        mutual:      mutual > 0 ? `${mutual} mutual connection${mutual !== 1 ? "s" : ""}` : "No mutual connections",
        isFollowing: false,
      };
    });

    return res.json({ success: true, data });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/student/notifications/suggestions/companies
═══════════════════════════════════════════════════════════════════════════ */
export const companySuggestions = async (req, res, next) => {
  try {
    const userId  = req.user._id || req.user.id;
    const User    = getModel("User");
    const Company = getModel("Company");
    if (!Company) return res.json({ success: true, data: [] });

    let following = [];
    if (User) {
      const me = await User.findById(userId).select("following").lean();
      following = (me?.following || []).map(String);
    }

    const companies = await Company.find({ _id: { $nin: following.map(toOid).filter(Boolean) } })
      .select("_id name industry logo followers")
      .limit(10)
      .lean();

    const data = companies.map((c) => ({
      id:            String(c._id),
      name:          c.name,
      industry:      c.industry || "Company",
      logo:          c.logo     || null,
      followerCount: (c.followers || []).length,
      isFollowing:   following.includes(String(c._id)),
    }));

    return res.json({ success: true, data });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/student/notifications/follow/:targetId
═══════════════════════════════════════════════════════════════════════════ */
export const follow = async (req, res, next) => {
  try {
    const userId   = req.user._id || req.user.id;
    const targetId = toOid(req.params.targetId);
    if (!targetId) return res.status(400).json({ success: false, message: "Invalid id" });

    const User    = getModel("User");
    const Company = getModel("Company");

    if (User) await User.findByIdAndUpdate(userId, { $addToSet: { following: targetId } });

    const isCompany = Company ? await Company.exists({ _id: targetId }) : false;
    if (isCompany) {
      await Company.findByIdAndUpdate(targetId, { $addToSet: { followers: toOid(userId) } });
    } else if (User) {
      await User.findByIdAndUpdate(targetId, { $addToSet: { followers: toOid(userId) } });
    }

    return res.json({ success: true });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/student/notifications/follow/:targetId
═══════════════════════════════════════════════════════════════════════════ */
export const unfollow = async (req, res, next) => {
  try {
    const userId   = req.user._id || req.user.id;
    const targetId = toOid(req.params.targetId);
    if (!targetId) return res.status(400).json({ success: false, message: "Invalid id" });

    const User    = getModel("User");
    const Company = getModel("Company");

    if (User) await User.findByIdAndUpdate(userId, { $pull: { following: targetId } });

    const isCompany = Company ? await Company.exists({ _id: targetId }) : false;
    if (isCompany) {
      await Company.findByIdAndUpdate(targetId, { $pull: { followers: toOid(userId) } });
    } else if (User) {
      await User.findByIdAndUpdate(targetId, { $pull: { followers: toOid(userId) } });
    }

    return res.json({ success: true });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/student/notifications/seed  (testing only)
═══════════════════════════════════════════════════════════════════════════ */
export const seedNotifications = async (req, res, next) => {
  try {
    const studentId = req.user._id || req.user.id;
    await StudentNotification.insertMany([
      {
        studentId, type: "Applications",
        title: "Application submitted successfully",
        description: "Your application for Software Developer at Tech Solutions Inc. was submitted.",
        icon: "application", actions: ["View Application"], read: false,
      },
      {
        studentId, type: "Messages",
        title: "Employer replied to your message",
        description: "Tech Solutions requested your updated resume and portfolio.",
        icon: "message", actions: ["Reply"], read: false,
      },
      {
        studentId, type: "Jobs",
        title: "New job alert matching your skills",
        description: "3 new React Developer jobs were posted in Bangalore.",
        icon: "job", actions: ["View Job", "Save Job"], read: true,
      },
    ]);
    return res.json({ success: true, ok: true });
  } catch (err) { next(err); }
};
