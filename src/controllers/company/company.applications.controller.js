import Application from "../../models/Application.js";
import Interview from "../../models/Interview.js";
import StudentNotification from "../../models/StudentNotification.js";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";

const ALLOWED = ["Applied", "Shortlisted", "Hold", "Rejected", "Interview Scheduled"];
const EXTRA_PIPELINE_STATUS = ["Interview Completed", "Offer Sent", "Hired"];
const SHORTLIST_STAGES = {
  HR: "HR Round",
  Technical: "Technical Round",
  Final: "Final Round",
};

function buildApplicationMeta(existingMeta, status, patch = {}) {
  const meta = { ...(existingMeta || {}), ...patch, pipelineStatus: status };
  if (status === "Shortlisted" || status === "Interview Scheduled") {
    if (!meta.shortlistedDate) meta.shortlistedDate = new Date().toISOString();
    if (!meta.stage) meta.stage = "HR Round";
  }
  return meta;
}

async function notifyStudent({ studentId, type, title, description, icon, actions = [], meta = {} }) {
  if (!studentId) return;
  await StudentNotification.create({
    studentId,
    type,
    title,
    description,
    icon,
    actions,
    meta,
    read: false,
  });
}

async function ensureThreadForApplication(app) {
  const thread = await MessageThread.findOneAndUpdate(
    { application: app._id },
    {
      $setOnInsert: {
        company: app.company,
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

  return thread;
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

export const listCompanyApplications = async (req, res, next) => {
  try {
    const companyId = req.user._id;

    const {
      q = "",
      status = "All",
      job = "",
      jobId = "",
      skills = "",
      location = "",
    } = req.query;

    const match = { company: companyId };
    if (status && status !== "All" && ALLOWED.includes(status)) match.status = status;
    if (jobId) match.job = jobId;

    let apps = await Application.find(match)
      .sort({ createdAt: -1 })
      .populate("student", "name email phone resumeUrl location studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
      .populate("job", "title location")
      .lean();

    const qLower = String(q || "").toLowerCase().trim();
    const jobLower = String(job || "").toLowerCase().trim();
    const skillsLower = String(skills || "").toLowerCase().trim();
    const locLower = String(location || "").toLowerCase().trim();

    apps = apps.filter((a) => {
      const pipelineStatus = a?.meta?.pipelineStatus || a.status || "Applied";
      const studentName = (a.student?.name || "").toLowerCase();
      const studentEmail = (a.student?.email || "").toLowerCase();
      const studentLoc = (a.student?.location || "").toLowerCase();
      const jobTitle = (a.job?.title || "").toLowerCase();
      const jobLoc = (a.job?.location || "").toLowerCase();
      const topSkills = (a.topSkills || []).join(" ").toLowerCase();

      if (status && status !== "All" && !ALLOWED.includes(status) && !EXTRA_PIPELINE_STATUS.includes(status)) {
        return false;
      }
      if (status && status !== "All" && pipelineStatus !== status) return false;

      if (qLower) {
        const hay = `${studentName} ${studentEmail} ${jobTitle} ${jobLoc} ${studentLoc} ${topSkills}`;
        if (!hay.includes(qLower)) return false;
      }

      if (jobLower && !jobTitle.includes(jobLower)) return false;
      if (skillsLower && !topSkills.includes(skillsLower)) return false;
      if (locLower && !`${jobLoc} ${studentLoc}`.includes(locLower)) return false;

      return true;
    });

    res.json({
      items: apps.map((a) => ({
        id: a._id,
        jobId: a.job?._id ? String(a.job._id) : "",
        name: a.student?.name || "Candidate",
        candidateName: a.student?.name || "Candidate",
        jobTitle: a.job?.title || "-",
        job: a.job?.title || "-",
        experience: a.experienceText || "",
        exp: a.experienceText || "",
        location: a.job?.location || a.student?.location || "-",
        skills: a.topSkills || [],
        topSkills: a.topSkills || [],
        appliedDate: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "-",
        date: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "-",
        status: a?.meta?.pipelineStatus || a.status || "Applied",
        stage: a?.meta?.stage || "HR Round",
        shortlistedDate: a?.meta?.shortlistedDate ? String(a.meta.shortlistedDate).slice(0, 10) : "",
        interview: a?.meta?.interview || null,
        offer: a?.meta?.offer || null,
        notes: Array.isArray(a?.meta?.notes) ? a.meta.notes : [],
        aiMatch: a?.meta?.aiMatch || "Moderate",
        phone: a.student?.phone || "",
        email: a.student?.email || "",
        resumeUrl: a.student?.resumeUrl || "",
        avatar: studentAvatar(a.student),
        avatarUrl: studentAvatar(a.student),
      })),
      total: apps.length,
    });
  } catch (err) {
    next(err);
  }
};

export const updateCompanyApplicationStatus = async (req, res, next) => {
  try {
    const companyId = req.user._id;
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const existing = await Application.findOne({ _id: id, company: companyId }).lean();
    if (!existing) {
      return res.status(404).json({ message: "Application not found" });
    }

    const meta = buildApplicationMeta(existing.meta, status);
    const app = await Application.findOneAndUpdate(
      { _id: id, company: companyId },
      { $set: { status, meta } },
      { returnDocument: "after" }
    )
      .populate("job", "title")
      .lean();

    await notifyStudent({
      studentId: app.student,
      type: "Applications",
      title: `Application status updated: ${status}`,
      description: `Your application for ${app.job?.title || "the role"} is now ${status}.`,
      icon:
        status === "Shortlisted"
          ? "shortlisted"
          : status === "Hold"
          ? "hold"
          : status === "Rejected"
          ? "rejected"
          : "application",
      actions: ["View Application"],
      meta: { applicationId: String(app._id), jobId: app.job?._id ? String(app.job._id) : "" },
    });

    res.json({ ok: true, id: app._id, status: app.status });
  } catch (err) {
    next(err);
  }
};

export const bulkUpdateCompanyApplicationStatus = async (req, res, next) => {
  try {
    const companyId = req.user._id;
    const { ids = [], status } = req.body;

    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids required" });
    }

    const apps = await Application.find({ _id: { $in: ids }, company: companyId }).select("_id meta").lean();
    await Promise.all(
      apps.map((app) =>
        Application.updateOne(
          { _id: app._id, company: companyId },
          { $set: { status, meta: buildApplicationMeta(app.meta, status) } }
        )
      )
    );

    res.json({
      ok: true,
      matched: apps.length,
      modified: apps.length,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteCompanyApplication = async (req, res, next) => {
  try {
    const companyId = req.user._id;
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, company: companyId }).select("_id").lean();
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    const threadIds = await MessageThread.find({ application: app._id }).distinct("_id");

    const [messagesResult, threadsResult, interviewsResult, applicationResult] = await Promise.all([
      threadIds.length ? Message.deleteMany({ thread: { $in: threadIds } }) : Promise.resolve({ deletedCount: 0 }),
      threadIds.length ? MessageThread.deleteMany({ _id: { $in: threadIds } }) : Promise.resolve({ deletedCount: 0 }),
      Interview.deleteMany({ application: app._id, company: companyId }),
      Application.deleteOne({ _id: app._id, company: companyId }),
    ]);

    if (!applicationResult?.deletedCount) {
      return res.status(404).json({ message: "Application not found" });
    }

    return res.json({
      ok: true,
      id,
      deleted: {
        interviews: Number(interviewsResult?.deletedCount || 0),
        threads: Number(threadsResult?.deletedCount || 0),
        messages: Number(messagesResult?.deletedCount || 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const scheduleCompanyInterview = async (req, res, next) => {
  try {
    const companyId = req.user._id;
    const { id } = req.params;

    const {
      date,
      time,
      type = "Online",
      link = "",
      round = "HR",
      message = "",
      interviewLinks = [],
      interviewQuestions = [],
      documentsRequired = [],
      verificationDetails = "",
      additionalDetails = "",
    } = req.body;

    if (!date || !time) {
      return res.status(400).json({ message: "Date and time required" });
    }

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
    const effectiveMeetingLink = type === "Online" ? ensureMeetingLink(effectiveMeetingLinkRaw, createdRoomId) : "";

    const interview = await Interview.create({
      company: companyId,
      application: app._id,
      job: app.job?._id,
      student: app.student?._id,
      candidateName: app.student?.name || "Candidate",
      jobTitle: app.job?.title || "-",
      stage: ["HR", "Technical", "Final"].includes(round) ? round : "HR",
      scheduledAt: dt,
      durationMins: 0,
      mode: type === "Onsite" ? "Onsite" : "Online",
      meetingLink: type === "Online" ? effectiveMeetingLink : "",
      interviewLinks:
        type === "Online"
          ? normalizedLinks.length
            ? normalizedLinks
            : effectiveMeetingLink
            ? [effectiveMeetingLink]
            : []
          : [],
      location: type === "Onsite" ? String(link || "") : "",
      messageToCandidate: String(message || ""),
      interviewQuestions: normalizeStringList(interviewQuestions),
      documentsRequired: normalizeStringList(documentsRequired),
      verificationDetails: String(verificationDetails || "").trim(),
      additionalDetails: String(additionalDetails || "").trim(),
      roomId: createdRoomId,
      status: "Scheduled",
    });

    const stage = SHORTLIST_STAGES[round] || "HR Round";
    const meta = buildApplicationMeta(app.meta, "Interview Scheduled", {
      stage,
      interview: {
        date,
        time,
        mode: type,
        link: effectiveMeetingLink,
        message,
        interviewId: interview._id,
        roomId: createdRoomId,
      },
    });

    await Application.updateOne(
      { _id: id, company: companyId },
      { $set: { status: "Interview Scheduled", meta } }
    );

    const whenText = toDateTimeText(dt);
    const roomLine = ` Room ID: ${createdRoomId}.`;
    const joinLine = type === "Online" && effectiveMeetingLink ? ` Join link: ${effectiveMeetingLink}` : "";
    const noteLine = String(message || "").trim() ? ` Note: ${String(message).trim()}` : "";
    const preview = `Interview scheduled for ${whenText}.${roomLine}${joinLine}${noteLine}`;

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
      type: "Applications",
      title: "Interview scheduled",
      description: `Interview for ${app.job?.title || "your application"} is scheduled on ${whenText}.`,
      icon: "shortlisted",
      actions: [
        ...(type === "Online" && effectiveMeetingLink ? ["Join Meeting"] : []),
        "View Application",
      ],
      meta: {
        applicationId: String(app._id),
        jobId: app.job?._id ? String(app.job._id) : "",
        conversationId: thread ? String(thread._id) : "",
        interviewId: String(interview._id),
        scheduledAt: dt.toISOString(),
        roomId: createdRoomId,
        interviewDate: date,
        interviewTime: time,
        url: type === "Online" ? effectiveMeetingLink : "",
      },
    });

    res.json({
      ok: true,
      interviewId: interview._id,
      status: "Interview Scheduled",
    });
  } catch (err) {
    next(err);
  }
};
