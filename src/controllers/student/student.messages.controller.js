import mongoose from "mongoose";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";
import Application from "../../models/Application.js";
import AdminNotification from "../../models/AdminNotification.js";
import SpamReport from "../../models/SpamReport.js";

function safeStr(x) {
  return typeof x === "string" ? x : "";
}

function fmtTime(date) {
  if (!date) return "";
  const d = new Date(date);
  // "2m", "1h", "Yesterday" style used by your UI
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/**
 * Ensure a thread exists for an application:
 * - thread unique by application (sparse unique index in model)
 */
async function ensureThreadForApplication(appId) {
  const app = await Application.findById(appId)
    .populate("job", "title")
    .populate("company", "name")
    .lean();

  if (!app) return null;
  let thread = await MessageThread.findOne({ application: app._id, source: "application" }).lean();
  if (thread) return thread;

  try {
    const upserted = await MessageThread.findOneAndUpdate(
      { application: app._id },
      {
        $setOnInsert: {
          student: app.student,
          company: app.company,
          job: app.job?._id,
          application: app._id,
          source: "application",
          status: app.status || "Applied",
          lastMessageText: "Application received.",
          lastMessageAt: new Date(),
          studentUnread: 0,
          companyUnread: 0,
        },
      },
      { upsert: true, returnDocument: "after" }
    ).lean();

    if (!upserted) return null;

    const msgCount = await Message.countDocuments({ thread: upserted._id });
    if (msgCount === 0) {
      await Message.create({
        thread: upserted._id,
        senderRole: "system",
        type: "system",
        text: "Application submitted successfully.",
      });
    }

    return upserted;
  } catch (err) {
    // Concurrent upsert can still race on unique index; fetch existing thread and continue.
    if (err?.code === 11000) {
      thread = await MessageThread.findOne({ application: app._id, source: "application" }).lean();
      return thread || null;
    }
    throw err;
  }
}

/**
 * GET /api/student/conversations
 * List threads for student
 */
export const listStudentConversations = async (req, res, next) => {
  try {
    const studentId = req.user._id;

    // auto-create threads for student applications (so chat always exists)
    const apps = await Application.find({ student: studentId }).select("_id").lean();
    await Promise.all(apps.map((a) => ensureThreadForApplication(a._id)));

    const threads = await MessageThread.find({ student: studentId, source: "application" })
      .populate("company", "name email phone website location")
      .populate("job", "title")
      .sort({ updatedAt: -1 })
      .lean();

    const mapped = threads.map((t) => ({
      id: String(t._id),
      jobId: t.job?._id ? String(t.job._id) : "",
      applicationId: t.application ? String(t.application) : "",
      company: t.company?.name || "Company",
      companyEmail: t.company?.email || "",
      companyPhone: t.company?.phone || "",
      companyWebsite: t.company?.website || "",
      companyAddress: t.company?.location || "",
      jobTitle: t.job?.title || t.subject || "Connection",
      status: t.status || "Applied",
      unread: Number(t.studentUnread || 0),
      lastTime: fmtTime(t.lastMessageAt || t.updatedAt),
      lastMessage: t.lastMessageText || "",
      typing: false, // realtime later
    }));

    return res.json(mapped);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/student/conversations/:id/messages
 */
export const listStudentMessages = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const thread = await MessageThread.findOne({ _id: id, student: studentId, source: "application" })
      .populate("company", "name email phone website location")
      .populate("job", "title")
      .lean();

    if (!thread) return res.status(404).json({ message: "Conversation not found" });

    const msgs = await Message.find({ thread: id }).sort({ createdAt: 1 }).lean();

    // mark as read
    await MessageThread.updateOne({ _id: id }, { $set: { studentUnread: 0 } });

    const messages = msgs.map((m) => ({
      id: String(m._id),
      sender: m.senderRole === "company" ? "employer" : m.senderRole, // UI expects employer/student/system
      type: m.type,
      text: m.text || "",
      fileName: m.fileName || "",
      fileSize: m.fileSize || "",
      fileUrl: m.fileUrl || "",
      mimeType: m.mimeType || "",
      time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));

    return res.json({
      conversation: {
        id: String(thread._id),
        jobId: thread.job?._id ? String(thread.job._id) : "",
        applicationId: thread.application ? String(thread.application) : "",
        company: thread.company?.name || "Company",
        companyEmail: thread.company?.email || "",
        companyPhone: thread.company?.phone || "",
        companyWebsite: thread.company?.website || "",
        companyAddress: thread.company?.location || "",
        jobTitle: thread.job?.title || thread.subject || "Connection",
        status: thread.status || "Applied",
      },
      messages,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/student/conversations/:id/messages
 * body: { text } OR { type:"file", fileName, fileSize } (no real upload yet)
 */
export const sendStudentMessage = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const thread = await MessageThread.findOne({ _id: id, student: studentId, source: "application" }).lean();
    if (!thread) return res.status(404).json({ message: "Conversation not found" });

    const {
      text,
      type = "text",
      fileName = "",
      fileSize = "",
      fileUrl = "",
      mimeType = "",
    } = req.body || {};

    if (type === "text") {
      if (!safeStr(text).trim()) return res.status(400).json({ message: "Message text required" });
    }

    const msg = await Message.create({
      thread: id,
      senderRole: "student",
      type,
      text: safeStr(text),
      fileName: safeStr(fileName),
      fileSize: safeStr(fileSize),
      fileUrl: safeStr(fileUrl),
      mimeType: safeStr(mimeType),
    });

    // update thread last message and increment company unread
    const lastMessageText =
      type === "file" ? `${fileName || "File"} shared` : safeStr(text).trim();

    await MessageThread.updateOne(
      { _id: id },
      {
        $set: {
          lastMessageText,
          lastMessageAt: new Date(),
        },
        $inc: { companyUnread: 1 },
      }
    );

    return res.json({
      id: String(msg._id),
      sender: "student",
      type: msg.type,
      text: msg.text || "",
      fileName: msg.fileName || "",
      fileSize: msg.fileSize || "",
      fileUrl: msg.fileUrl || "",
      mimeType: msg.mimeType || "",
      time: new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/student/conversations/:id/spam-report
 * body: { reason, details }
 */
export const reportStudentConversationSpam = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { id } = req.params;
    const { reason = "Other", details = "" } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const allowedReasons = new Set([
      "Abusive Language",
      "Scam/Fraud",
      "Harassment",
      "Irrelevant Messages",
      "Fake Profile",
      "Other",
    ]);
    if (!allowedReasons.has(String(reason))) {
      return res.status(400).json({ message: "Invalid reason" });
    }

    const thread = await MessageThread.findOne({ _id: id, student: studentId, source: "application" })
      .populate("company", "name")
      .populate("job", "title")
      .lean();
    if (!thread) return res.status(404).json({ message: "Conversation not found" });

    const existing = await SpamReport.findOne({
      thread: thread._id,
      reporter: studentId,
      status: { $in: ["pending", "in_review"] },
    }).lean();
    if (existing) {
      return res.status(409).json({ message: "You already reported this conversation. Admin review is pending." });
    }

    const report = await SpamReport.create({
      thread: thread._id,
      reporter: studentId,
      reporterRole: "student",
      reportedUser: thread.company?._id || thread.company,
      reportedRole: "company",
      reason: String(reason),
      details: String(details || "").trim(),
      status: "pending",
    });

    await AdminNotification.create({
      title: `Spam report from student`,
      type: "Spam Report",
      target: "Admin",
      triggeredBy: req.user?.name || "Student",
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      status: "sent",
      message: `${thread.company?.name || "Company"} reported for "${reason}" in ${thread.job?.title || "conversation"}.`,
      audience: "Admin",
      mode: "immediate",
      meta: {
        reportId: String(report._id),
        threadId: String(thread._id),
      },
    });

    return res.status(201).json({ ok: true, reportId: String(report._id) });
  } catch (err) {
    next(err);
  }
};
