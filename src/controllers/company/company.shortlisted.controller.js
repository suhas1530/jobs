// backend/src/controllers/company/company.shortlisted.controller.js
import Application from "../../models/Application.js";
import Interview from "../../models/Interview.js";
import StudentNotification from "../../models/StudentNotification.js";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";

/**
 * You currently store Application.status only as:
 * ["Applied","Shortlisted","Hold","Rejected","Interview Scheduled"]
 *
 * But your Shortlisted UI shows more statuses:
 * - Interview Completed, Offer Sent, Hired
 *
 * So: we handle those "extra" statuses using a safe approach:
 * - We still update Application.status for the 5 allowed values
 * - For extra statuses we store in a lightweight "meta" object inside Application (optional)
 *
 * If you don't want meta, you can skip it, but then you can't persist Offer/Hired/Completed.
 */

// --- allowed in Application enum ---
const APP_ALLOWED = ["Applied", "Shortlisted", "Hold", "Rejected", "Interview Scheduled"];

// --- stage values your UI uses ---
const STAGES = ["HR Round", "Technical Round", "Manager Round", "Final Round"];

// --- extra pipeline statuses not in enum (stored in meta) ---
const EXTRA_STATUS = ["Interview Completed", "Offer Sent", "Hired"];

/**
 * Helper: merge shortlist pipeline metadata without dropping existing values.
 */
function buildMetaUpdate(existingMeta, patch) {
  const meta = { ...(existingMeta || {}) };
  return { ...meta, ...patch };
}

function buildPipelineMeta(existingMeta, status, patch = {}) {
  const meta = buildMetaUpdate(existingMeta, { ...patch, pipelineStatus: status });
  if (status === "Shortlisted" || status === "Interview Scheduled") {
    if (!meta.shortlistedDate) meta.shortlistedDate = new Date().toISOString();
    if (!meta.stage) meta.stage = "HR Round";
  }
  return meta;
}

async function ensureThreadForApplication(app) {
  return MessageThread.findOneAndUpdate(
    { application: app._id },
    {
      $setOnInsert: {
        company: app.company?._id || app.company,
        student: app.student?._id || app.student,
        job: app.job?._id || app.job,
        application: app._id,
        status: app.status || "Applied",
        lastMessageText: "Conversation started",
        lastMessageAt: new Date(),
        companyUnread: 0,
        studentUnread: 0,
      },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
}

async function notifyStudent({ studentId, title, description, actions = [], meta = {} }) {
  if (!studentId) return;
  await StudentNotification.create({
    studentId,
    type: "Applications",
    title,
    description,
    icon: "shortlisted",
    actions,
    meta,
    read: false,
  });
}

function toDateTimeText(dt) {
  const dateStr = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} at ${timeStr}`;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function randomRoomId() {
  return `room_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureMeetingLink(link, roomId) {
  const raw = String(link || "").trim();
  if (raw) return raw;
  return "";
}

function studentAvatar(student = {}) {
  const personal = student?.studentProfile?.personal || {};
  return (
    student?.avatarUrl ||
    student?.avatar ||
    student?.profilePhoto ||
    student?.profileImageUrl ||
    student?.imageUrl ||
    personal?.avatarUrl ||
    personal?.profileImageUrl ||
    ""
  );
}

/**
 * GET /api/company/shortlisted
 * Query params (optional):
 *  - job (job title contains)
 *  - status (Shortlisted|Interview Scheduled|Interview Completed|Offer Sent|Hired|Rejected)
 *  - stage (HR Round|Technical Round|...)
 *  - q (search by candidate name / email)
 *  - location (contains)
 *  - date (YYYY-MM-DD) -> shortlistedDate
 *
 * Returns: { items, total }
 */
export async function listCompanyShortlisted(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { job = "", jobId = "", status = "", stage = "", q = "", location = "", date = "" } = req.query;

    // Base: shortlisted candidates are applications that are either:
    // - status Shortlisted
    // - status Interview Scheduled
    // - (or have meta.pipelineStatus in extra statuses)
    const findFilter = { company: companyId };

    // We cannot directly query meta.pipelineStatus reliably unless we store it.
    // We'll fetch relevant apps and filter in-memory for flexible UI filters.
    const apps = await Application.find(findFilter)
      .sort({ createdAt: -1 })
      .populate("student", "name email phone resumeUrl location studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
      .populate("job", "title location")
      .lean();

    const items = apps
      .map((a) => {
        const pipelineStatus = a?.meta?.pipelineStatus || a.status || "Shortlisted";
        const pipelineStage = a?.meta?.stage || "HR Round";
        const shortlistedDate = a?.meta?.shortlistedDate
          ? String(a.meta.shortlistedDate).slice(0, 10)
          : a.createdAt
          ? new Date(a.createdAt).toISOString().slice(0, 10)
          : "";

        return {
          id: a._id,
          jobId: a.job?._id ? String(a.job._id) : "",

          name: a.student?.name || "Candidate",
          email: a.student?.email || "",
          phone: a.student?.phone || "",
          resumeUrl: a.student?.resumeUrl || "",
          avatar: studentAvatar(a.student),
          avatarUrl: studentAvatar(a.student),

          job: a.job?.title || "-",
          jobTitle: a.job?.title || "-",
          location: a.job?.location || a.student?.location || a.job?.city || "",

          exp: a.experienceText || "",
          experienceText: a.experienceText || "",

          skills: a.topSkills || [],
          topSkills: a.topSkills || [],

          shortlistedDate,
          stage: pipelineStage,
          status: pipelineStatus,

          resume: a?.meta?.resume || "",
          aiMatch: a?.meta?.aiMatch || "Moderate",
          notes: a?.meta?.notes || [],
          interview: a?.meta?.interview || null,
          offer: a?.meta?.offer || null,
        };
      })
      // default shortlist scope:
      .filter((x) => {
        // If record is purely Applied/Hold/Rejected and has no pipeline status => exclude
        const baseOk =
          x.status === "Shortlisted" ||
          x.status === "Interview Scheduled" ||
          EXTRA_STATUS.includes(x.status);
        return baseOk;
      })
      // filters:
      .filter((x) => {
        if (q && !`${x.name} ${x.email}`.toLowerCase().includes(String(q).toLowerCase())) return false;
        if (jobId && String(x.jobId || "") !== String(jobId)) return false;
        if (job && !String(x.job).toLowerCase().includes(String(job).toLowerCase())) return false;
        if (location && !String(x.location).toLowerCase().includes(String(location).toLowerCase())) return false;
        if (date && String(x.shortlistedDate).slice(0, 10) !== String(date).slice(0, 10)) return false;
        if (stage && x.stage !== stage) return false;
        if (status && x.status !== status) return false;
        return true;
      });

    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/company/shortlisted/:id/status
 * Body: { status }
 *
 * status can be:
 * - enum status: Applied|Shortlisted|Hold|Rejected|Interview Scheduled
 * - extra: Interview Completed|Offer Sent|Hired  (stored in meta.pipelineStatus)
 */
export async function updateShortlistedStatus(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { status } = req.body || {};

    if (!status) return res.status(400).json({ message: "status required" });

    // fetch app
    const app = await Application.findOne({ _id: id, company: companyId }).lean();
    if (!app) return res.status(404).json({ message: "Application not found" });

    // If status is within allowed enum, update Application.status and mirror meta.pipelineStatus too
    if (APP_ALLOWED.includes(status)) {
      const meta = buildPipelineMeta(app.meta, status);

      await Application.updateOne(
        { _id: id, company: companyId },
        { $set: { status, meta } }
      );

      return res.json({ ok: true, id, status });
    }

    // If status is extra (Offer/Hired/etc), store in meta
    if (EXTRA_STATUS.includes(status)) {
      const meta = buildPipelineMeta(app.meta, status);

      await Application.updateOne(
        { _id: id, company: companyId },
        { $set: { meta } }
      );

      return res.json({ ok: true, id, status });
    }

    return res.status(400).json({ message: "Invalid status" });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/company/shortlisted/:id/stage
 * Body: { stage }
 */
export async function updateShortlistedStage(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { stage } = req.body || {};

    if (!STAGES.includes(stage)) {
      return res.status(400).json({ message: "Invalid stage" });
    }

    const app = await Application.findOne({ _id: id, company: companyId }).lean();
    if (!app) return res.status(404).json({ message: "Application not found" });

    const meta = buildPipelineMeta(app.meta, app?.meta?.pipelineStatus || app.status || "Shortlisted", { stage });

    await Application.updateOne(
      { _id: id, company: companyId },
      { $set: { meta } }
    );

    res.json({ ok: true, id, stage });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/company/shortlisted/:id/offer
 * Body: { salary, joining, expiry, message, file }
 *
 * We store this in meta.offer and set meta.pipelineStatus="Offer Sent"
 */
export async function sendOfferToCandidate(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { salary = "", joining = "", expiry = "", message = "", file = "" } = req.body || {};

    const app = await Application.findOne({ _id: id, company: companyId })
      .populate("student", "name email")
      .populate("job", "title")
      .lean();

    if (!app) return res.status(404).json({ message: "Application not found" });

    const meta = buildPipelineMeta(app.meta, "Offer Sent", {
      offer: {
        salary,
        joining,
        expiry,
        message,
        file,
        sentAt: new Date().toISOString(),
      },
    });

    await Application.updateOne(
      { _id: id, company: companyId },
      { $set: { meta } }
    );

    // In Phase-2 you can send email/notification here.

    res.json({
      ok: true,
      id,
      status: "Offer Sent",
      candidate: { name: app.student?.name || "Candidate", email: app.student?.email || "" },
      jobTitle: app.job?.title || "-",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/company/shortlisted/:id/schedule-interview
 * Body: { date, time, mode, link, message }
 *
 * - Creates Interview doc
 * - Updates Application.status to "Interview Scheduled" (enum ok)
 * - Stores meta.interview for extra details (link/message)
 */
export async function scheduleInterviewFromShortlisted(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const {
      date,
      time,
      mode = "Online",
      link = "",
      message = "",
      interviewLinks = [],
      interviewQuestions = [],
      documentsRequired = [],
      verificationDetails = "",
      additionalDetails = "",
    } = req.body || {};

    if (!date || !time) return res.status(400).json({ message: "Date and time required" });

    const app = await Application.findOne({ _id: id, company: companyId })
      .populate("student", "name")
      .populate("job", "title")
      .lean();

    if (!app) return res.status(404).json({ message: "Application not found" });

    const [hh, mm] = String(time).split(":").map((v) => parseInt(v, 10));
    const dt = new Date(date);
    dt.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
    const normalizedLinks = normalizeStringList(interviewLinks);
    const createdRoomId = randomRoomId();
    const normalizedMeetingLink = String(link || "").trim();
    const effectiveMeetingLinkRaw = normalizedMeetingLink || normalizedLinks[0] || "";
    const effectiveMeetingLink = mode === "Online" ? ensureMeetingLink(effectiveMeetingLinkRaw, createdRoomId) : "";

    const stageMap = {
      "HR Round": "HR",
      "Technical Round": "Technical",
      "Manager Round": "Technical",
      "Final Round": "Final",
    };
    const stage = stageMap[String(app?.meta?.stage || "HR Round")] || "HR";

    const interview = await Interview.create({
      company: companyId,
      application: app._id,
      job: app.job?._id,
      student: app.student?._id,
      candidateName: app.student?.name || "Candidate",
      jobTitle: app.job?.title || "-",
      stage,
      scheduledAt: dt,
      durationMins: 0,
      mode: mode === "Onsite" ? "Onsite" : "Online",
      meetingLink: mode === "Online" ? effectiveMeetingLink : "",
      interviewLinks:
        mode === "Online"
          ? normalizedLinks.length
            ? normalizedLinks
            : effectiveMeetingLink
            ? [effectiveMeetingLink]
            : []
          : [],
      location: mode === "Onsite" ? String(link || "") : "",
      messageToCandidate: String(message || ""),
      interviewQuestions: normalizeStringList(interviewQuestions),
      documentsRequired: normalizeStringList(documentsRequired),
      verificationDetails: String(verificationDetails || "").trim(),
      additionalDetails: String(additionalDetails || "").trim(),
      roomId: createdRoomId,
      status: "Scheduled",
    });

    const meta = buildPipelineMeta(app.meta, "Interview Scheduled", {
      interview: { date, time, mode, link: effectiveMeetingLink, message, interviewId: interview._id, roomId: createdRoomId },
    });

    await Application.updateOne(
      { _id: id, company: companyId },
      { $set: { status: "Interview Scheduled", meta } }
    );

    const whenText = toDateTimeText(dt);
    const meetUrl = mode === "Online" ? effectiveMeetingLink : "";
    const preview = `Interview scheduled for ${whenText}. Room ID: ${createdRoomId}.${meetUrl ? ` Join link: ${meetUrl}` : ""}${message ? ` Note: ${message}` : ""}`;

    const thread = await ensureThreadForApplication(app);
    if (thread) {
      await Message.create({
        thread: thread._id,
        senderRole: "system",
        type: "system",
        text: preview,
      });
      await MessageThread.updateOne(
        { _id: thread._id },
        {
          $set: {
            status: "Interview Scheduled",
            lastMessageText: `Interview scheduled for ${whenText}. Room ID: ${createdRoomId}`,
            lastMessageAt: new Date(),
          },
          $inc: { studentUnread: 1 },
        }
      );
    }

    await notifyStudent({
      studentId: app.student?._id,
      title: "Interview scheduled",
      description: `Interview for ${app.job?.title || "your application"} is scheduled on ${whenText}.`,
      actions: [
        ...(meetUrl ? ["Join Meeting"] : []),
        "Reply",
        "View Application",
      ],
      meta: {
        conversationId: thread ? String(thread._id) : "",
        applicationId: String(app._id),
        jobId: app.job?._id ? String(app.job._id) : "",
        interviewId: String(interview._id),
        scheduledAt: dt.toISOString(),
        roomId: createdRoomId,
        interviewDate: date,
        interviewTime: time,
        url: meetUrl,
      },
    });

    res.json({
      ok: true,
      id,
      status: "Interview Scheduled",
      interviewId: interview._id,
    });
  } catch (err) {
    next(err);
  }
}
