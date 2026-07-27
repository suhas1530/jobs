import mongoose from "mongoose";
import AdminNotification from "../../models/AdminNotification.js";
import AdminNotificationTemplate from "../../models/AdminNotificationTemplate.js";
import AdminNotificationSetting from "../../models/AdminNotificationSetting.js";
import SpamReport from "../../models/SpamReport.js";
import User from "../../models/User.js";

const DEFAULT_SETTINGS = [
  ["companyReg", "New Company Registration"],
  ["studentReg", "New Student Registration"],
  ["planPurchase", "Plan Purchase"],
  ["planExpiry", "Plan Expiry"],
  ["jobPosted", "Job Posted"],
  ["applicationSubmitted", "Application Submitted"],
  ["applicationShortlisted", "Application Shortlisted"],
  ["systemError", "System Error"],
];

function toId(x) {
  return String(x?._id || x?.id || x || "");
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function nowDisplay() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function normalizeNotification(x) {
  return {
    id: toId(x),
    title: x.title || "",
    type: x.type || "System",
    target: x.target || "Admin",
    triggeredBy: x.triggeredBy || "System",
    date: x.date || nowDisplay(),
    status: x.status || "sent",
    message: x.message || "",
    audience: x.audience || "All Users",
    mode: x.mode || "immediate",
    scheduleAt: x.scheduleAt || "",
  };
}

function normalizeTemplate(x) {
  return {
    id: toId(x),
    name: x.name || "",
    trigger: x.trigger || "",
    modified: x.modified || todayYmd(),
    status: x.status || "active",
    subject: x.subject || "",
    body: x.body || "",
  };
}

async function ensureDefaultSettings() {
  const count = await AdminNotificationSetting.countDocuments({});
  if (count > 0) return;
  await AdminNotificationSetting.insertMany(
    DEFAULT_SETTINGS.map(([key, label]) => ({
      key,
      label,
      email: true,
      app: true,
      sms: false,
    })),
  );
}

export async function adminGetNotificationsCenter(req, res, next) {
  try {
    await ensureDefaultSettings();

    const [notifications, settingsRows, templates] = await Promise.all([
      AdminNotification.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      AdminNotificationSetting.find({}).sort({ createdAt: 1 }).lean(),
      AdminNotificationTemplate.find({}).sort({ updatedAt: -1 }).lean(),
    ]);

    const settings = {};
    for (const row of settingsRows) {
      settings[row.key] = { email: !!row.email, app: !!row.app, sms: !!row.sms, label: row.label };
    }

    return res.json({
      notifications: notifications.map(normalizeNotification),
      settings,
      templates: templates.map(normalizeTemplate),
    });
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateNotificationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "").toLowerCase();
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid notification id" });
    if (!["sent", "scheduled", "failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const row = await AdminNotification.findByIdAndUpdate(
      id,
      { $set: { status } },
      { returnDocument: "after" },
    ).lean();
    if (!row) return res.status(404).json({ message: "Notification not found" });

    return res.json({ ok: true, notification: normalizeNotification(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid notification id" });
    const row = await AdminNotification.findByIdAndDelete(id).lean();
    if (!row) return res.status(404).json({ message: "Notification not found" });
    return res.json({ ok: true, id: toId(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveTemplate(req, res, next) {
  try {
    const body = req.body || {};
    const id = body.id;
    const payload = {
      name: String(body.name || "").trim(),
      trigger: String(body.trigger || "").trim(),
      subject: String(body.subject || "").trim(),
      body: String(body.body || "").trim(),
      status: String(body.status || "active").toLowerCase() === "disabled" ? "disabled" : "active",
      modified: todayYmd(),
      createdBy: req.user?._id || null,
    };

    if (!payload.name) return res.status(400).json({ message: "Template name required" });

    let row;
    if (id) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid template id" });
      row = await AdminNotificationTemplate.findByIdAndUpdate(
        id,
        { $set: payload },
        { returnDocument: "after" },
      ).lean();
      if (!row) return res.status(404).json({ message: "Template not found" });
    } else {
      row = await AdminNotificationTemplate.create(payload);
      row = row.toObject();
    }

    return res.json({ ok: true, template: normalizeTemplate(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteTemplate(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid template id" });
    const row = await AdminNotificationTemplate.findByIdAndDelete(id).lean();
    if (!row) return res.status(404).json({ message: "Template not found" });
    return res.json({ ok: true, id: toId(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminToggleTemplateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "active").toLowerCase() === "disabled" ? "disabled" : "active";
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid template id" });

    const row = await AdminNotificationTemplate.findByIdAndUpdate(
      id,
      { $set: { status, modified: todayYmd() } },
      { returnDocument: "after" },
    ).lean();
    if (!row) return res.status(404).json({ message: "Template not found" });

    return res.json({ ok: true, template: normalizeTemplate(row) });
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateNotificationSetting(req, res, next) {
  try {
    const { key } = req.params;
    const row = await AdminNotificationSetting.findOneAndUpdate(
      { key },
      {
        $set: {
          email: !!req.body?.email,
          app: !!req.body?.app,
          sms: !!req.body?.sms,
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (!row) return res.status(404).json({ message: "Setting not found" });
    return res.json({ ok: true, setting: { key: row.key, label: row.label, email: row.email, app: row.app, sms: row.sms } });
  } catch (e) {
    next(e);
  }
}

export async function adminSendBroadcast(req, res, next) {
  try {
    const body = req.body || {};
    const mode = String(body.mode || "immediate").toLowerCase() === "scheduled" ? "scheduled" : "immediate";

    const row = await AdminNotification.create({
      title: String(body.title || "Broadcast"),
      type: "Broadcast",
      target: String(body.audience || "All Users"),
      triggeredBy: req.user?.name || "Admin",
      message: String(body.message || ""),
      date: nowDisplay(),
      status: mode === "scheduled" ? "scheduled" : "sent",
      audience: String(body.audience || "All Users"),
      mode,
      scheduleAt: String(body.scheduleAt || ""),
      createdBy: req.user?._id || null,
    });

    return res.json({ ok: true, notification: normalizeNotification(row.toObject()) });
  } catch (e) {
    next(e);
  }
}

function normalizeSpamReport(x) {
  return {
    id: toId(x),
    threadId: x.thread?._id ? toId(x.thread._id) : toId(x.thread),
    reason: x.reason || "Other",
    details: x.details || "",
    status: x.status || "pending",
    reporterRole: x.reporterRole || "",
    reportedRole: x.reportedRole || "",
    reporter: {
      id: toId(x.reporter?._id || x.reporter),
      name: x.reporter?.name || "",
      email: x.reporter?.email || "",
    },
    reportedUser: {
      id: toId(x.reportedUser?._id || x.reportedUser),
      name: x.reportedUser?.name || "",
      email: x.reportedUser?.email || "",
      isActive: x.reportedUser?.isActive !== false,
    },
    thread: {
      applicationId: x.thread?.application ? toId(x.thread.application) : "",
      jobId: x.thread?.job ? toId(x.thread.job) : "",
    },
    adminNote: x.adminNote || "",
    blocked: !!x.blocked,
    reviewedAt: x.reviewedAt || null,
    createdAt: x.createdAt || null,
  };
}

export async function adminListSpamReports(req, res, next) {
  try {
    const { status = "all", page = 1, limit = 20 } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (status !== "all") filter.status = String(status);

    const [rows, total] = await Promise.all([
      SpamReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("reporter", "name email")
        .populate("reportedUser", "name email isActive")
        .populate("thread", "application job")
        .lean(),
      SpamReport.countDocuments(filter),
    ]);

    return res.json({
      rows: rows.map(normalizeSpamReport),
      total,
      page: safePage,
      limit: safeLimit,
    });
  } catch (e) {
    next(e);
  }
}

export async function adminReviewSpamReport(req, res, next) {
  try {
    const { id } = req.params;
    const { status, adminNote = "", action = "none" } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    const allowedStatus = new Set(["pending", "in_review", "resolved", "rejected"]);
    if (status && !allowedStatus.has(String(status))) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const report = await SpamReport.findById(id);
    if (!report) return res.status(404).json({ message: "Spam report not found" });

    if (status) report.status = String(status);
    report.adminNote = String(adminNote || "").trim();
    report.reviewedBy = req.user?._id || null;
    report.reviewedAt = new Date();

    if (String(action) === "block") {
      await User.updateOne({ _id: report.reportedUser }, { $set: { isActive: false } });
      report.blocked = true;
      report.blockedAt = new Date();
      if (!status) report.status = "resolved";
    }

    await report.save();

    const hydrated = await SpamReport.findById(report._id)
      .populate("reporter", "name email")
      .populate("reportedUser", "name email isActive")
      .populate("thread", "application job")
      .lean();

    return res.json({ ok: true, report: normalizeSpamReport(hydrated) });
  } catch (e) {
    next(e);
  }
}
