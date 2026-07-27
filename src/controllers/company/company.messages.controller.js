import mongoose from "mongoose";
import Application from "../../models/Application.js";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";
import StudentNotification from "../../models/StudentNotification.js";
import AdminNotification from "../../models/AdminNotification.js";
import SpamReport from "../../models/SpamReport.js";

/* =========================
   Helpers
========================= */
function mapThreadToUI(t) {
  const personal = t.student?.studentProfile?.personal || {};
  const avatar =
    t.student?.avatarUrl ||
    t.student?.avatar ||
    t.student?.profilePhoto ||
    t.student?.profileImageUrl ||
    t.student?.imageUrl ||
    personal?.avatarUrl ||
    personal?.profileImageUrl ||
    "";

  return {
    id: t._id,
    applicationId: t.application || "",
    studentId: t.student?._id || "",
    email: t.student?.email || "",
    candidateEmail: t.student?.email || "",
    candidate: t.student?.name || "Candidate",
    avatar,
    avatarUrl: avatar,
    job: t.job?.title || t.subject || "-",
    status: t.status || "Applied",
    unread: t.companyUnread || 0,
    time: t.lastMessageAt,
    last: t.lastMessageText || "",
    lastMessageAt: t.lastMessageAt,
  };
}

function mapMessageToUI(m) {
  const sender =
    m.senderRole === "company" ? "company" : m.senderRole === "student" ? "candidate" : "system";

  return {
    id: m._id,
    sender,
    type: m.type,
    text: m.text,
    fileName: m.fileName,
    fileSize: m.fileSize,
    fileUrl: m.fileUrl || "",
    mimeType: m.mimeType || "",
    at: m.createdAt,
  };
}

/* =========================
   GET /threads
========================= */
export async function listCompanyThreads(req, res) {
  const companyId = req.user._id;

  const { q = "", filter = "All", page = 1, limit = 50 } = req.query;

  const query = { company: companyId, source: "application" };

  if (filter === "Unread") query.companyUnread = { $gt: 0 };
  if (filter === "Shortlisted") query.status = "Shortlisted";
  if (filter === "Interview Scheduled") query.status = "Interview Scheduled";

  // we'll do q filtering after populate by checking candidate/job/lastMessage (simple phase-1)
  const skip = (Number(page) - 1) * Number(limit);

  const [itemsRaw, total] = await Promise.all([
    MessageThread.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("student", "name email studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
      .populate("job", "title"),
    MessageThread.countDocuments(query),
  ]);

  let items = itemsRaw.map(mapThreadToUI);

  if (q && q.trim()) {
    const qq = q.trim().toLowerCase();
    items = items.filter((t) =>
      `${t.candidate} ${t.job} ${t.last}`.toLowerCase().includes(qq)
    );
  }

  return res.json({ items, total });
}

/* =========================
   GET /threads/:id
========================= */
export async function getCompanyThread(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid thread id" });
  }

  const thread = await MessageThread.findOne({ _id: id, company: companyId, source: "application" })
    .populate("student", "name email studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
    .populate("job", "title");

  if (!thread) return res.status(404).json({ message: "Thread not found" });

  const messages = await Message.find({ thread: thread._id })
    .sort({ createdAt: 1 });

  return res.json({
    thread: mapThreadToUI(thread),
    messages: messages.map(mapMessageToUI),
  });
}

/* =========================
   POST /threads
   payload: { applicationId }
========================= */
export async function createCompanyThread(req, res) {
  const companyId = req.user._id;
  const { applicationId } = req.body;

  if (!mongoose.isValidObjectId(applicationId)) {
    return res.status(400).json({ message: "Invalid applicationId" });
  }

  const app = await Application.findOne({ _id: applicationId, company: companyId })
    .populate("job", "title")
    .populate("student", "name email studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl");

  if (!app) return res.status(404).json({ message: "Application not found" });

  // find existing
  let thread = await MessageThread.findOne({ application: app._id, source: "application" })
    .populate("student", "name email studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
    .populate("job", "title");

  if (!thread) {
    thread = await MessageThread.create({
      company: companyId,
      student: app.student._id,
      job: app.job._id,
      application: app._id,
      source: "application",
      status: app.status || "Applied",
      lastMessageText: "Conversation started",
      lastMessageAt: new Date(),
      companyUnread: 0,
      studentUnread: 1,
    });

    // create a system message
    await Message.create({
      thread: thread._id,
      senderRole: "system",
      type: "system",
      text: "Conversation started",
    });

    thread = await MessageThread.findById(thread._id)
      .populate("student", "name email studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
      .populate("job", "title");
  }

  return res.json({ message: "ok", thread: mapThreadToUI(thread) });
}

/* =========================
   POST /threads/:id/send
   payload: { type, text, fileName, fileSize, fileUrl, mimeType }
========================= */
export async function sendCompanyMessage(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;

  const {
    type = "text",
    text = "",
    fileName = "",
    fileSize = "",
    fileUrl = "",
    mimeType = "",
  } = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid thread id" });
  }

  const thread = await MessageThread.findOne({ _id: id, company: companyId, source: "application" });
  if (!thread) return res.status(404).json({ message: "Thread not found" });

  if (type === "text" && !text.trim()) {
    return res.status(400).json({ message: "Message text required" });
  }

  const msg = await Message.create({
    thread: thread._id,
    senderRole: "company",
    type,
    text: type === "text" ? text : (text || ""),
    fileName: type === "file" ? fileName : "",
    fileSize: type === "file" ? fileSize : "",
    fileUrl: type === "file" ? fileUrl : "",
    mimeType: type === "file" ? mimeType : "",
  });

  // update thread meta
    const preview =
    type === "file"
      ? `${fileName || "File"} shared`
      : type === "system"
      ? text
      : text;

  thread.lastMessageText = preview;
  thread.lastMessageAt = new Date();
  thread.studentUnread = (thread.studentUnread || 0) + 1;
  await thread.save();

  await StudentNotification.create({
    studentId: thread.student,
    type: "Messages",
    title: "New message from employer",
    description: preview,
    icon: "message",
    actions: ["Reply"],
    meta: {
      conversationId: String(thread._id),
      applicationId: thread.application ? String(thread.application) : "",
      jobId: thread.job ? String(thread.job) : "",
    },
    read: false,
  });

  return res.json({ ok: true, message: mapMessageToUI(msg) });
}

/* =========================
   PATCH /threads/:id/read
========================= */
export async function markCompanyThreadRead(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid thread id" });
  }

  const thread = await MessageThread.findOneAndUpdate(
    { _id: id, company: companyId, source: "application" },
    { $set: { companyUnread: 0 } },
    { returnDocument: "after" }
  );

  if (!thread) return res.status(404).json({ message: "Thread not found" });

  return res.json({ ok: true });
}

/* =========================
   PATCH /threads/:id/meta
   payload: { status }
========================= */
export async function updateCompanyThreadMeta(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid thread id" });
  }

  const thread = await MessageThread.findOne({ _id: id, company: companyId, source: "application" });
  if (!thread) return res.status(404).json({ message: "Thread not found" });

  if (status) {
    thread.status = status;

    if (thread.application) {
      const app = await Application.findOne({ _id: thread.application, company: companyId }).lean();
      if (app) {
        const existingMeta = app.meta || {};
        const nextMeta = { ...existingMeta, pipelineStatus: status };
        const update = { meta: nextMeta };

        if (status === "Shortlisted") update.status = "Shortlisted";
        if (status === "Interview Scheduled") update.status = "Interview Scheduled";
        if (status === "Rejected") update.status = "Rejected";
        if (status === "Applied") update.status = "Applied";
        if (status === "Hold") update.status = "Hold";

        await Application.updateOne(
          { _id: thread.application, company: companyId },
          { $set: update }
        );
      }
    }
  }

  await thread.save();

  if (status && thread.student) {
    await StudentNotification.create({
      studentId: thread.student,
      type: "Applications",
      title: `Application status updated: ${status}`,
      description: `Your application status is now ${status}.`,
      icon:
        status === "Shortlisted"
          ? "shortlisted"
          : status === "Hold"
          ? "hold"
          : status === "Rejected"
          ? "rejected"
          : "application",
      actions: ["View Application"],
      meta: {
        conversationId: String(thread._id),
        applicationId: thread.application ? String(thread.application) : "",
        jobId: thread.job ? String(thread.job) : "",
      },
      read: false,
    });
  }

  return res.json({ ok: true });
}

/* =========================
   POST /threads/:id/spam-report
   payload: { reason, details }
========================= */
export async function reportCompanyThreadSpam(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;
  const { reason = "Other", details = "" } = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid thread id" });
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

  const thread = await MessageThread.findOne({ _id: id, company: companyId, source: "application" })
    .populate("student", "name studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
    .populate("job", "title")
    .lean();
  if (!thread) return res.status(404).json({ message: "Thread not found" });

  const existing = await SpamReport.findOne({
    thread: thread._id,
    reporter: companyId,
    status: { $in: ["pending", "in_review"] },
  }).lean();
  if (existing) {
    return res.status(409).json({ message: "You already reported this conversation. Admin review is pending." });
  }

  const report = await SpamReport.create({
    thread: thread._id,
    reporter: companyId,
    reporterRole: "company",
    reportedUser: thread.student?._id || thread.student,
    reportedRole: "student",
    reason: String(reason),
    details: String(details || "").trim(),
    status: "pending",
  });

  await AdminNotification.create({
    title: `Spam report from company`,
    type: "Spam Report",
    target: "Admin",
    triggeredBy: req.user?.name || "Company",
    date: new Date().toISOString().slice(0, 16).replace("T", " "),
    status: "sent",
    message: `${thread.student?.name || "Student"} reported for "${reason}" in ${thread.job?.title || "conversation"}.`,
    audience: "Admin",
    mode: "immediate",
  });

  return res.status(201).json({ ok: true, reportId: String(report._id) });
}
