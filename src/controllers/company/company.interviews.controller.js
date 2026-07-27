import mongoose from "mongoose";
import Interview from "../../models/Interview.js";
import Application from "../../models/Application.js";
import StudentNotification from "../../models/StudentNotification.js";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";
import { emitInterviewSignal } from "../../realtime/interviewSignaling.js";
import {
  createInterviewWebrtcState,
  ensureInterviewWebrtcState,
  normalizeIceCandidate,
  normalizeWebRtcSdp,
} from "../../utils/interviewWebrtc.js";
import {
  buildPreviewUnsupportedHtml,
  emptyInterviewCodeResult,
  executeInterviewCode,
  normalizeInterviewCodeLanguage,
} from "../../utils/interviewCodeRunner.js";

const MODE_ALLOWED = ["Online", "Onsite"];
const STAGE_ALLOWED = ["HR", "Technical", "Managerial", "Final"];
const VERIFICATION_STATUS_ALLOWED = ["Pending", "Submitted", "Verified", "Rejected"];
const WORKFLOW_STATUS_ALLOWED = [
  "Scheduled",
  "Waiting Room",
  "Live",
  "Completed",
  "Review Ready",
  "Rescheduled",
  "Cancelled",
  "No Show",
  "Pending Confirmation",
];
const SCHEDULED_BUCKET_STATUSES = ["Scheduled", "Rescheduled", "Waiting Room"];
const UPCOMING_BUCKET_STATUSES = ["Scheduled", "Rescheduled"];
const ONGOING_BUCKET_STATUSES = ["Live"];
const COMPLETED_BUCKET_STATUSES = ["Completed", "Review Ready"];
const CANCELLED_BUCKET_STATUSES = ["Cancelled", "No Show"];
const ACTIVE_TODAY_STATUSES = [...SCHEDULED_BUCKET_STATUSES, ...ONGOING_BUCKET_STATUSES];

function normalizeDurationMins(input, fallback = 0) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  return Math.floor(n);
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

function toDateOnly(d) {
  const safe = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const yyyy = safe.getFullYear();
  const mm = String(safe.getMonth() + 1).padStart(2, "0");
  const dd = String(safe.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toTime12h(d) {
  const safe = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  let h = safe.getHours();
  const m = String(safe.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRoomId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, "-").slice(0, 80);
}

function computeStartWindow(scheduledAt) {
  const t = new Date(scheduledAt).getTime();
  return {
    startAllowedAt: new Date(t - 15 * 60 * 1000),
  };
}

function safeStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const next = safeStr(value);
    if (next) return next;
  }
  return "";
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return item.split(/[\n,;/|]+/g);
        if (item && typeof item === "object") {
          return String(item.name || item.skill || item.title || "").split(/[\n,;/|]+/g);
        }
        return [];
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;/|]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatEducationHighlight(item) {
  if (typeof item === "string") return item.trim();

  const row = safeObj(item);
  const degree = firstNonEmpty(row.degree, row.qualification, row.course, row.title, row.fieldOfStudy, row.branch);
  const college = firstNonEmpty(row.college, row.institution, row.school, row.university);
  const duration = firstNonEmpty(
    row.duration,
    row.year,
    [safeStr(row.startYear), safeStr(row.endYear)].filter(Boolean).join(" - "),
  );

  return [degree, college, duration].filter(Boolean).join(" | ");
}

function formatExperienceHighlight(item) {
  if (typeof item === "string") return item.trim();

  const row = safeObj(item);
  const role = firstNonEmpty(row.role, row.title, row.position, row.designation);
  const company = firstNonEmpty(row.company, row.organization, row.employer);
  const duration = firstNonEmpty(
    row.duration,
    [safeStr(row.startDate), safeStr(row.endDate)].filter(Boolean).join(" - "),
  );

  return [role, company, duration].filter(Boolean).join(" | ");
}

function calculateStudentProfileCompletion(student = {}, application = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const preferred = safeObj(profile.preferred);
  const resume = safeObj(student.resume);
  const resumePersonal = safeObj(resume.personal);
  const skills = Array.from(
    new Set([
      ...toStringList(application.topSkills),
      ...toStringList(profile.skills),
      ...toStringList(resume.skills),
    ]),
  );
  const education = safeArr(profile.education).length ? profile.education : safeArr(resume.education);
  const experience = safeArr(profile.experience).length ? profile.experience : safeArr(resume.experience);
  const preferredLocations = safeArr(preferred.locations).map((item) => safeStr(item)).filter(Boolean);

  const checks = [
    Boolean(
      firstNonEmpty(student.name, personal.fullName, resumePersonal.name) &&
        firstNonEmpty(student.email, personal.email, resumePersonal.email) &&
        firstNonEmpty(student.phone, personal.phone, resumePersonal.phone),
    ),
    education.some((item) => Boolean(formatEducationHighlight(item))),
    skills.length >= 2,
    profile.fresher === true || experience.some((item) => Boolean(formatExperienceHighlight(item))),
    Boolean(safeStr(student.resumeUrl) || safeStr(resume.summary)),
    Boolean(firstNonEmpty(preferred.subCategory, preferred.subcategory, preferred.category, preferred.stream) && preferredLocations.length),
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function buildStudentWorkspaceProfile(interview = {}) {
  const student = safeObj(interview.student);
  const application = safeObj(interview.application);
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const preferred = safeObj(profile.preferred);
  const resume = safeObj(student.resume);
  const resumePersonal = safeObj(resume.personal);
  const topSkills = Array.from(
    new Set([
      ...toStringList(application.topSkills),
      ...toStringList(profile.skills),
      ...toStringList(resume.skills),
    ]),
  ).slice(0, 10);
  const educationHighlights = [
    ...safeArr(profile.education).map(formatEducationHighlight),
    ...safeArr(resume.education).map(formatEducationHighlight),
  ]
    .map((item) => safeStr(item))
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 3);
  const experienceHighlights = [
    ...safeArr(profile.experience).map(formatExperienceHighlight),
    ...safeArr(resume.experience).map(formatExperienceHighlight),
  ]
    .map((item) => safeStr(item))
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 3);
  const preferredLocations = safeArr(preferred.locations).map((item) => safeStr(item)).filter(Boolean).slice(0, 4);
  const summary = firstNonEmpty(
    resume.summary,
    application.experienceText,
    profile.fresher === true ? "Fresher profile" : "",
  );

  return {
    name: firstNonEmpty(student.name, personal.fullName, resumePersonal.name, interview.candidateName),
    avatarUrl: firstNonEmpty(
      student.avatarUrl,
      student.avatar,
      student.profilePhoto,
      student.profileImageUrl,
      student.imageUrl,
      personal.avatarUrl,
      personal.profileImageUrl,
    ),
    email: firstNonEmpty(student.email, personal.email, resumePersonal.email),
    phone: firstNonEmpty(student.phone, personal.phone, resumePersonal.phone),
    location: firstNonEmpty(
      student.location,
      personal.location,
      resumePersonal.location,
      [safeStr(personal.city), safeStr(personal.state)].filter(Boolean).join(", "),
    ),
    linkedin: firstNonEmpty(student.linkedin, personal.linkedin, resumePersonal.linkedin),
    portfolio: firstNonEmpty(student.portfolio, personal.portfolio, resumePersonal.portfolio),
    github: firstNonEmpty(personal.github, resumePersonal.github),
    resumeUrl: safeStr(student.resumeUrl),
    summary,
    topSkills,
    educationHighlights,
    experienceHighlights,
    preferredRole: firstNonEmpty(preferred.subCategory, preferred.subcategory, preferred.category, preferred.stream),
    preferredLocations,
    workMode: firstNonEmpty(preferred.workMode),
    profileCompletion: calculateStudentProfileCompletion(student, application),
  };
}

function mapInterview(x) {
  const d = new Date(x?.scheduledAt || Date.now());
  const safeScheduledAt = Number.isNaN(d.getTime()) ? new Date() : d;
  const { startAllowedAt } = computeStartWindow(safeScheduledAt);
  const openJoinWindow = true;
  const durationMins = normalizeDurationMins(x.durationMins, 0);
  return {
    id: x._id,
    applicationId: x.application?._id ? String(x.application._id) : x.application ? String(x.application) : "",
    jobId: x.job?._id ? String(x.job._id) : x.job ? String(x.job) : "",
    candidate: x.candidateName,
    email: x.student?.email || "",
    job: x.jobTitle,
    stage: x.stage,
    date: toDateOnly(safeScheduledAt),
    time: toTime12h(safeScheduledAt),
    durationMins,
    duration: durationMins === 0 ? "Unlimited" : `${durationMins} mins`,
    mode: x.mode,
    interviewer: x.interviewer || "Assigned Interviewer",
    status: x.status,
    meetingLink: x.meetingLink || "",
    interviewLinks: Array.isArray(x.interviewLinks)
      ? x.interviewLinks
      : x.meetingLink
      ? [x.meetingLink]
      : [],
    location: x.location || "",
    notes: Array.isArray(x.notes) ? x.notes : [],
    messageToCandidate: x.messageToCandidate || "",
    interviewQuestions: Array.isArray(x.interviewQuestions) ? x.interviewQuestions : [],
    documentsRequired: Array.isArray(x.documentsRequired) ? x.documentsRequired : [],
    verificationDetails: x.verificationDetails || "",
    additionalDetails: x.additionalDetails || "",
    verificationStatus: x.verificationStatus || "Pending",
    roomId: x.roomId || "",
    sessionId: x.sessionId || "",
    startedAt: x.startedAt || null,
    admittedAt: x.admittedAt || null,
    endedAt: x.endedAt || null,
    currentRound: x.currentRound || x.stage || "HR",
    rounds: Array.isArray(x.rounds) ? x.rounds : [],
    candidateReadiness: x.candidateReadiness || {
      online: false,
      cameraReady: false,
      microphoneReady: false,
      networkQuality: "Unknown",
      consentAccepted: false,
      rulesAccepted: false,
    },
    proctoring: x.proctoring || { baselineCaptured: false, riskLevel: "Low", alerts: [] },
    scorecard: x.scorecard || {},
    finalDecision: x.finalDecision || "",
    collaboration: {
      chat: Array.isArray(x?.collaboration?.chat) ? x.collaboration.chat : [],
      questions: Array.isArray(x?.collaboration?.questions) ? x.collaboration.questions : [],
      code: x?.collaboration?.code || {
        language: "javascript",
        content: "",
        note: "",
        outputMode: "console",
        output: "",
        error: "",
        serverOutput: "",
        serverError: "",
        previewHtml: "",
      },
      screenShare: x?.collaboration?.screenShare || { active: false, by: "" },
      liveQuestionDraft: x?.collaboration?.liveQuestionDraft || { text: "", by: "", updatedAt: null },
      webrtc: ensureInterviewWebrtcState(x?.collaboration?.webrtc, x?.sessionId),
    },
    openJoinWindow,
    startAvailableAt: Number.isNaN(startAllowedAt.getTime()) ? new Date().toISOString() : startAllowedAt.toISOString(),
    createdAt: x.createdAt,
  };
}

async function ensureThreadForApplication(app) {
  if (!app?._id) return null;
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

async function notifyInterview(studentId, interview, title, description) {
  if (!studentId) return;
  const joinUrl = String(interview?.meetingLink || "").trim();
  await StudentNotification.create({
    studentId,
    type: "Applications",
    title,
    description,
    icon: "shortlisted",
    actions: [
      ...(joinUrl ? ["Join Meeting"] : []),
      "View Application",
    ],
    meta: {
      applicationId: interview.application ? String(interview.application) : "",
      jobId: interview.job ? String(interview.job) : "",
      interviewId: String(interview._id),
      roomId: String(interview.roomId || ""),
      sessionId: String(interview.sessionId || ""),
      scheduledAt: interview.scheduledAt ? new Date(interview.scheduledAt).toISOString() : "",
      url: joinUrl,
    },
    read: false,
  });
}

async function syncApplicationFromInterview(interviewDoc, interviewStatus, stage) {
  if (!interviewDoc?.application) return;

  const appId = interviewDoc.application;
  const existingApp = await Application.findOne({ _id: appId, company: interviewDoc.company }).lean();
  if (!existingApp) return;
  const existingMeta = existingApp.meta || {};
  const stageLabelMap = {
    HR: "HR Round",
    Technical: "Technical Round",
    Managerial: "Manager Round",
    Final: "Final Round",
  };
  const normalizedStage = stageLabelMap[stage || interviewDoc.stage] || "HR Round";
  const baseMeta = {
    ...existingMeta,
    stage: normalizedStage,
    interview: {
      interviewId: interviewDoc._id,
      mode: interviewDoc.mode,
      link: interviewDoc.meetingLink || "",
      location: interviewDoc.location || "",
      scheduledAt: interviewDoc.scheduledAt,
      status: interviewStatus,
    },
  };

  if (interviewStatus === "Completed") {
    await Application.updateOne(
      { _id: appId, company: interviewDoc.company },
      { $set: { meta: { ...baseMeta, pipelineStatus: "Interview Completed" } } }
    );
    return;
  }

  if (interviewStatus === "Cancelled") {
    await Application.updateOne(
      { _id: appId, company: interviewDoc.company },
      { $set: { status: "Shortlisted", meta: { ...baseMeta, pipelineStatus: "Shortlisted" } } }
    );
    return;
  }

  await Application.updateOne(
    { _id: appId, company: interviewDoc.company },
    { $set: { status: "Interview Scheduled", meta: { ...baseMeta, pipelineStatus: "Interview Scheduled" } } }
  );
}

// GET /api/company/interviews
export async function listCompanyInterviews(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const {
      q = "",
      job,
      jobId,
      stage,
      mode,
      status,
      tab = "all",
      from,
      to,
      flaggedOnly = "",
      risk = "",
    } = req.query;

    const filter = { company: companyId };

    if (job) filter.jobTitle = { $regex: String(job), $options: "i" };
    if (jobId && mongoose.isValidObjectId(jobId)) filter.job = jobId;
    if (stage && STAGE_ALLOWED.includes(stage)) filter.stage = stage;
    if (mode && MODE_ALLOWED.includes(mode)) filter.mode = mode;
    if (status && WORKFLOW_STATUS_ALLOWED.includes(status)) filter.status = status;

    if (from || to) {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) filter.scheduledAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const itemsRaw = await Interview.find(filter)
      .sort({ scheduledAt: -1 })
      .populate("student", "name email")
      .lean();

    let items = itemsRaw.map(mapInterview);
    const qText = String(q || "").trim().toLowerCase();
    if (qText) {
      items = items.filter((x) =>
        `${x.candidate} ${x.email} ${x.job} ${x.interviewer}`.toLowerCase().includes(qText)
      );
    }

    if (tab === "scheduled") {
      items = items.filter((x) => SCHEDULED_BUCKET_STATUSES.includes(x.status));
    } else if (tab === "ongoing") {
      items = items.filter((x) => ONGOING_BUCKET_STATUSES.includes(x.status));
    } else if (tab === "completed") {
      items = items.filter((x) => COMPLETED_BUCKET_STATUSES.includes(x.status));
    } else if (tab === "cancelled") {
      items = items.filter((x) => CANCELLED_BUCKET_STATUSES.includes(x.status));
    }

    if (String(flaggedOnly) === "1") {
      items = items.filter((x) => Array.isArray(x.proctoring?.alerts) && x.proctoring.alerts.length);
    }
    if (risk && ["Low", "Medium", "High"].includes(String(risk))) {
      items = items.filter((x) => (x.proctoring?.riskLevel || "Low") === risk);
    }

    const today = new Date();
    const todayYMD = toDateOnly(today);
    const pendingCount = await Application.countDocuments({
      company: companyId,
      status: "Shortlisted",
    });

    const summary = {
      shortlistedCandidates: pendingCount,
      interviewPending: pendingCount,
      scheduledToday: itemsRaw.filter(
        (x) => toDateOnly(new Date(x.scheduledAt)) === todayYMD && ACTIVE_TODAY_STATUSES.includes(x.status)
      ).length,
      upcomingInterviews: itemsRaw.filter((x) => UPCOMING_BUCKET_STATUSES.includes(x.status)).length,
      ongoingNow: itemsRaw.filter((x) => ONGOING_BUCKET_STATUSES.includes(x.status)).length,
      completedInterviews: itemsRaw.filter((x) => COMPLETED_BUCKET_STATUSES.includes(x.status)).length,
      flaggedInterviews: itemsRaw.filter(
        (x) => Array.isArray(x?.proctoring?.alerts) && x.proctoring.alerts.length
      ).length,
    };

    res.json({ items, total: items.length, summary });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews
export async function createCompanyInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const {
      candidateName,
      jobTitle,
      stage = "HR",
      date,
      time, // "HH:mm"
      durationMins = 0,
      mode = "Online",
      roomId = "",
      meetingLink = "",
      interviewLinks = [],
      location = "",
      messageToCandidate = "",
      interviewQuestions = [],
      documentsRequired = [],
      verificationDetails = "",
      additionalDetails = "",
      verificationStatus = "Pending",
      interviewer = "",
      status = "Scheduled",
      applicationId = "",
    } = req.body || {};

    let resolvedCandidateName = String(candidateName || "").trim();
    let resolvedJobTitle = String(jobTitle || "").trim();
    let linkedApplication = null;

    if (applicationId) {
      if (!mongoose.isValidObjectId(applicationId)) {
        return res.status(400).json({ message: "Invalid applicationId" });
      }
      linkedApplication = await Application.findOne({ _id: applicationId, company: companyId })
        .populate("student", "name email")
        .populate("job", "title")
        .lean();
      if (!linkedApplication) return res.status(404).json({ message: "Application not found" });
      if (!resolvedCandidateName) resolvedCandidateName = linkedApplication.student?.name || "Candidate";
      if (!resolvedJobTitle) resolvedJobTitle = linkedApplication.job?.title || "-";
    }

    if (!resolvedCandidateName) return res.status(400).json({ message: "candidateName is required" });
    if (!resolvedJobTitle) return res.status(400).json({ message: "jobTitle is required" });
    if (!date) return res.status(400).json({ message: "date is required" });
    if (!time) return res.status(400).json({ message: "time is required" });

    if (!STAGE_ALLOWED.includes(stage)) return res.status(400).json({ message: "Invalid stage" });
    if (!MODE_ALLOWED.includes(mode)) return res.status(400).json({ message: "Invalid mode" });
    if (!WORKFLOW_STATUS_ALLOWED.includes(status)) return res.status(400).json({ message: "Invalid status" });
    if (!VERIFICATION_STATUS_ALLOWED.includes(verificationStatus)) {
      return res.status(400).json({ message: "Invalid verificationStatus" });
    }

    const normalizedLinks = normalizeStringList(interviewLinks);
    const normalizedMeetingLink = String(meetingLink || "").trim();
    const effectiveMeetingLink = normalizedMeetingLink || normalizedLinks[0] || "";

    const [hh, mm] = String(time).split(":").map((v) => parseInt(v, 10));
    const dt = new Date(date);
    dt.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);

    const createdRoomId = normalizeRoomId(roomId) || randomId("room");
    const safeMeetingLink = mode === "Online" ? effectiveMeetingLink : "";

    const interview = await Interview.create({
      company: companyId,
      application: linkedApplication?._id,
      job: linkedApplication?.job?._id,
      student: linkedApplication?.student?._id,
      candidateName: resolvedCandidateName,
      jobTitle: resolvedJobTitle,
      stage,
      scheduledAt: dt,
      durationMins: normalizeDurationMins(durationMins, 0),
      mode,
      meetingLink: safeMeetingLink,
      interviewLinks:
        mode === "Online"
          ? safeMeetingLink
            ? [safeMeetingLink]
            : []
          : [],
      location: String(location || "").trim(),
      messageToCandidate: String(messageToCandidate || "").trim(),
      interviewQuestions: normalizeStringList(interviewQuestions),
      documentsRequired: normalizeStringList(documentsRequired),
      verificationDetails: String(verificationDetails || "").trim(),
      additionalDetails: String(additionalDetails || "").trim(),
      verificationStatus,
      interviewer: String(interviewer || "").trim(),
      status,
      roomId: createdRoomId,
      sessionId: "",
      currentRound: stage,
      rounds: [{ roundType: stage, status: "Pending" }],
      candidateReadiness: {
        online: false,
        cameraReady: false,
        microphoneReady: false,
        networkQuality: "Unknown",
        consentAccepted: false,
        rulesAccepted: false,
      },
      proctoring: { baselineCaptured: false, riskLevel: "Low", alerts: [] },
      collaboration: {
        chat: [],
        questions: [],
        code: { language: "javascript", content: "", note: "", output: "", error: "" },
        screenShare: { active: false, by: "" },
        liveQuestionDraft: { text: "", by: "", updatedAt: null },
        webrtc: createInterviewWebrtcState(),
      },
      notes: [],
    });

    await syncApplicationFromInterview(interview, status, stage);

    if (linkedApplication) {
      const thread = await ensureThreadForApplication(linkedApplication);
      if (thread) {
        const whenText = `${toDateOnly(dt)} at ${toTime12h(dt)}`;
        const roomLine = ` Room ID: ${createdRoomId}.`;
        const joinLine = safeMeetingLink ? ` Join link: ${safeMeetingLink}` : "";
        const preview = `Interview scheduled for ${whenText}.${roomLine}${joinLine}`;

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
    }

    if (interview.student) {
      await notifyInterview(
        interview.student,
        interview,
        "Interview scheduled",
        `Your ${stage} interview is scheduled on ${toDateOnly(dt)} at ${toTime12h(dt)}.`,
      );
    }

    res.status(201).json({ message: "Interview scheduled", interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/company/interviews/:id
export async function updateCompanyInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const payload = req.body || {};
    const update = {};

    if (payload.stage && STAGE_ALLOWED.includes(payload.stage)) update.stage = payload.stage;
    if (payload.mode && MODE_ALLOWED.includes(payload.mode)) update.mode = payload.mode;
    if (payload.status && WORKFLOW_STATUS_ALLOWED.includes(payload.status)) update.status = payload.status;

    if (typeof payload.meetingLink === "string") update.meetingLink = payload.meetingLink.trim();
    if (typeof payload.location === "string") update.location = payload.location.trim();
    if (typeof payload.interviewer === "string") update.interviewer = payload.interviewer.trim();
    if (typeof payload.messageToCandidate === "string") {
      update.messageToCandidate = payload.messageToCandidate.trim();
    }
    if (payload.interviewLinks !== undefined) {
      update.interviewLinks = normalizeStringList(payload.interviewLinks);
      if (!update.meetingLink && update.interviewLinks.length) {
        update.meetingLink = update.interviewLinks[0];
      }
    }
    if (payload.roomId !== undefined) {
      update.roomId = normalizeRoomId(payload.roomId) || randomId("room");
    }
    if (payload.mode === "Onsite") {
      update.meetingLink = "";
      update.interviewLinks = [];
    }
    if (payload.meetingLink !== undefined && (payload.mode || update.mode || "Online") === "Online") {
      update.interviewLinks = update.meetingLink ? [update.meetingLink] : [];
    }
    if (payload.interviewQuestions !== undefined) {
      update.interviewQuestions = normalizeStringList(payload.interviewQuestions);
    }
    if (payload.documentsRequired !== undefined) {
      update.documentsRequired = normalizeStringList(payload.documentsRequired);
    }
    if (typeof payload.verificationDetails === "string") {
      update.verificationDetails = payload.verificationDetails.trim();
    }
    if (typeof payload.additionalDetails === "string") {
      update.additionalDetails = payload.additionalDetails.trim();
    }
    if (
      payload.verificationStatus &&
      VERIFICATION_STATUS_ALLOWED.includes(String(payload.verificationStatus))
    ) {
      update.verificationStatus = payload.verificationStatus;
    }

    if (payload.durationMins != null) update.durationMins = normalizeDurationMins(payload.durationMins, 0);

    if (payload.date || payload.time) {
      const existing = await Interview.findOne({ _id: id, company: companyId }).lean();
      if (!existing) return res.status(404).json({ message: "Interview not found" });

      const d = new Date(existing.scheduledAt);
      const dateStr = payload.date || toDateOnly(d);
      const timeStr =
        payload.time ||
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

      const [hh, mm] = String(timeStr).split(":").map((v) => parseInt(v, 10));
      const dt = new Date(dateStr);
      dt.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);

      update.scheduledAt = dt;
      if (!update.status) update.status = "Rescheduled";
    }

    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!updated) return res.status(404).json({ message: "Interview not found" });

    await syncApplicationFromInterview(updated, updated.status, updated.stage);

    if (updated.student) {
      const d = new Date(updated.scheduledAt);
      await notifyInterview(
        updated.student,
        updated,
        `Interview ${String(updated.status || "").toLowerCase() === "rescheduled" ? "rescheduled" : "updated"}`,
        `Interview is now ${updated.status} on ${toDateOnly(d)} at ${toTime12h(d)}.`,
      );
    }

    res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/notes
export async function addInterviewNote(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { text } = req.body || {};

    if (!text?.trim()) return res.status(400).json({ message: "text is required" });

    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      { $push: { notes: text.trim() } },
      { returnDocument: "after" }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Interview not found" });

    res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/company/interviews/:id/status
export async function updateCompanyInterviewStatus(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { status } = req.body || {};
    if (!WORKFLOW_STATUS_ALLOWED.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      { $set: { status } },
      { returnDocument: "after" }
    );

    if (!updated) return res.status(404).json({ message: "Interview not found" });

    await syncApplicationFromInterview(updated, status, updated.stage);

    if (updated.student) {
      await notifyInterview(
        updated.student,
        updated,
        `Interview status: ${status}`,
        `Your interview status has been updated to ${status}.`,
      );
    }

    res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// GET /api/company/interviews/:id/workspace
export async function getCompanyInterviewWorkspace(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const interview = await Interview.findOne({ _id: id, company: companyId })
      .populate("student", "name email phone location linkedin portfolio resumeUrl resume studentProfile avatarUrl avatar profilePhoto profileImageUrl imageUrl")
      .populate("application", "topSkills experienceText")
      .lean();
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    return res.json({
      interview: {
        ...mapInterview(interview),
        studentProfileCard: buildStudentWorkspaceProfile(interview),
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/start
export async function startCompanyInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });
    if (!["Scheduled", "Rescheduled", "Waiting Room", "Live"].includes(interview.status)) {
      return res.status(400).json({ message: "Interview cannot be started in current status" });
    }

    if (!interview.roomId) interview.roomId = randomId("room");
    if (!interview.sessionId) interview.sessionId = randomId("session");
    if (interview.mode === "Online") interview.interviewLinks = interview.meetingLink ? [interview.meetingLink] : [];
    interview.collaboration = interview.collaboration || {};
    interview.collaboration.webrtc = createInterviewWebrtcState(String(interview.sessionId || ""));
    interview.status = interview.status === "Live" ? "Live" : "Waiting Room";
    if (!interview.startedAt) interview.startedAt = new Date();
    if (!interview.currentRound) interview.currentRound = interview.stage || "HR";
    await interview.save();

    if (interview.student) {
      await notifyInterview(
        interview.student,
        interview,
        "Interview is ready to join",
        `Your interview room is active now. Room ID: ${interview.roomId}. Click Join Meeting.`,
      );
    }

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/leave
export async function companyLeaveInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (!["Completed", "Review Ready", "Cancelled", "No Show"].includes(interview.status)) {
      if (interview.status === "Live") {
        interview.status = "Waiting Room";
      }

      if (interview?.collaboration?.screenShare?.by === "company") {
        interview.collaboration = interview.collaboration || {};
        interview.collaboration.screenShare = {
          ...(interview.collaboration.screenShare || {}),
          active: false,
          by: "",
        };
      }

      await interview.save();
    }

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/admit
export async function admitCompanyCandidate(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (interview.status === "Live") {
      return res.json({ ok: true, interview: mapInterview(interview) });
    }
    if (!["Waiting Room", "Scheduled", "Rescheduled"].includes(interview.status)) {
      return res.status(400).json({ message: "Candidate can only be admitted from waiting room flow" });
    }

    interview.status = "Live";
    interview.admittedAt = new Date();
    interview.startedAt = interview.startedAt || new Date();
    interview.proctoring = {
      ...(interview.proctoring || {}),
      baselineCaptured: true,
    };
    await interview.save();

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/end-round
export async function endCompanyInterviewRound(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { nextRound = "", scorecard = {}, summary = "", moveToNextRound = false } = req.body || {};
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const roundType = interview.currentRound || interview.stage || "HR";
    const rounds = Array.isArray(interview.rounds) ? interview.rounds : [];
    const idx = rounds.findIndex((x) => String(x?.roundType || "") === String(roundType));
    const roundPatch = {
      roundType,
      status: "Completed",
      endedAt: new Date(),
      summary: String(summary || "").trim(),
      score: Number(scorecard?.overall || 0),
    };
    if (idx >= 0) rounds[idx] = { ...rounds[idx].toObject?.(), ...roundPatch };
    else rounds.push({ ...roundPatch, startedAt: interview.startedAt || new Date() });

    interview.rounds = rounds;
    interview.scorecard = {
      ...(interview.scorecard || {}),
      ...scorecard,
      overall: Number(scorecard?.overall || interview.scorecard?.overall || 0),
    };

    if (moveToNextRound && STAGE_ALLOWED.includes(nextRound)) {
      interview.currentRound = nextRound;
      interview.status = "Waiting Room";
      interview.rounds.push({ roundType: nextRound, status: "Pending", startedAt: new Date() });
    } else {
      interview.status = "Live";
    }
    await interview.save();

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/end
export async function endCompanyInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { decision = "", scorecard = {}, notes = "" } = req.body || {};
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    interview.endedAt = new Date();
    interview.status = "Review Ready";
    if (["Strong Hire", "Hire", "Hold", "Reject"].includes(String(decision))) {
      interview.finalDecision = decision;
    }
    interview.scorecard = {
      ...(interview.scorecard || {}),
      ...scorecard,
      notes: String(notes || scorecard?.notes || interview.scorecard?.notes || ""),
      overall: Number(scorecard?.overall || interview.scorecard?.overall || 0),
    };
    await interview.save();
    try {
      await syncApplicationFromInterview(interview, "Completed", interview.stage);
    } catch (syncErr) {
      console.error("endCompanyInterview syncApplicationFromInterview failed:", syncErr?.message || syncErr);
    }

    let mapped = null;
    try {
      mapped = mapInterview(interview);
    } catch (mapErr) {
      console.error("endCompanyInterview mapInterview failed:", mapErr?.message || mapErr);
      mapped = { id: String(interview._id), status: interview.status, finalDecision: interview.finalDecision || "" };
    }
    return res.json({ ok: true, interview: mapped });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/chat
export async function companyInterviewChat(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { text = "" } = req.body || {};
    const chatText = String(text).trim();
    if (!chatText) return res.status(400).json({ message: "Chat text is required" });
    const createdAt = new Date();
    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $push: {
          "collaboration.chat": {
            senderRole: "company",
            text: chatText,
            createdAt,
          },
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Interview not found" });
    emitInterviewSignal(
      id,
      "collab_chat",
      { senderRole: "company", text: chatText, createdAt: createdAt.toISOString() },
      { excludeRole: "company" }
    );
    return res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/questions
export async function companyInterviewQuestion(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { text = "" } = req.body || {};
    const questionText = String(text).trim();
    if (!questionText) return res.status(400).json({ message: "Question text is required" });
    const createdAt = new Date();
    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $push: {
          "collaboration.questions": {
            senderRole: "company",
            text: questionText,
            createdAt,
          },
        },
        $set: {
          "collaboration.liveQuestionDraft.text": "",
          "collaboration.liveQuestionDraft.by": "company",
          "collaboration.liveQuestionDraft.updatedAt": createdAt,
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Interview not found" });
    emitInterviewSignal(
      id,
      "collab_question",
      { senderRole: "company", text: questionText, createdAt: createdAt.toISOString() },
      { excludeRole: "company" }
    );
    return res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/company/interviews/:id/questions/draft
export async function companyInterviewQuestionDraft(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { text = "" } = req.body || {};
    const draftText = String(text || "").slice(0, 2000);
    const updatedAt = new Date();
    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $set: {
          "collaboration.liveQuestionDraft.text": draftText,
          "collaboration.liveQuestionDraft.by": "company",
          "collaboration.liveQuestionDraft.updatedAt": updatedAt,
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Interview not found" });
    emitInterviewSignal(
      id,
      "collab_question_draft",
      { text: draftText, by: "company", updatedAt: updatedAt.toISOString() },
      { excludeRole: "company" }
    );
    return res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/company/interviews/:id/code
export async function companyInterviewCode(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { language = "javascript", content = "", note = "" } = req.body || {};
    const updatedAt = new Date();
    const normalizedLanguage = normalizeInterviewCodeLanguage(language);
    const clearedResult = emptyInterviewCodeResult("console");
    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $set: {
          "collaboration.code.language": normalizedLanguage,
          "collaboration.code.content": String(content || ""),
          "collaboration.code.note": String(note || ""),
          "collaboration.code.lastUpdatedBy": "company",
          "collaboration.code.outputMode": clearedResult.outputMode,
          "collaboration.code.output": "",
          "collaboration.code.error": "",
          "collaboration.code.serverOutput": "",
          "collaboration.code.serverError": "",
          "collaboration.code.previewHtml": "",
          "collaboration.code.updatedAt": updatedAt,
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Interview not found" });
    emitInterviewSignal(
      id,
      "collab_code",
      {
        language: normalizedLanguage,
        content: String(content || ""),
        note: String(note || ""),
        lastUpdatedBy: "company",
        outputMode: clearedResult.outputMode,
        output: "",
        error: "",
        serverOutput: "",
        serverError: "",
        previewHtml: "",
        updatedAt: updatedAt.toISOString(),
      },
      { excludeRole: "company" }
    );
    return res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/code/run
export async function companyRunInterviewCode(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { mode = "console" } = req.body || {};
    const interview = await Interview.findOne({ _id: id, company: companyId });
    if (!interview) return res.status(404).json({ message: "Interview not found" });
    const code = interview?.collaboration?.code?.content || "";
    const language = String(interview?.collaboration?.code?.language || "javascript");
    const execution = executeInterviewCode({ language, content: code, mode });
    interview.collaboration = interview.collaboration || {};
    interview.collaboration.code = {
      ...(interview.collaboration.code || {}),
      ...execution,
      previewHtml: execution.previewHtml || buildPreviewUnsupportedHtml(execution.serverError || execution.serverOutput || "Preview not available."),
      updatedAt: new Date(),
    };
    await interview.save();
    emitInterviewSignal(
      id,
      "collab_code_result",
      {
        ...execution,
        previewHtml: execution.previewHtml || buildPreviewUnsupportedHtml(execution.serverError || execution.serverOutput || "Preview not available."),
        updatedAt: interview.collaboration.code.updatedAt?.toISOString?.() || new Date().toISOString(),
      },
      {}
    );
    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/company/interviews/:id/screen-share
export async function companyInterviewScreenShare(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { active = false } = req.body || {};
    const updated = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $set: {
          "collaboration.screenShare.active": Boolean(active),
          "collaboration.screenShare.by": Boolean(active) ? "company" : "",
          "collaboration.screenShare.startedAt": Boolean(active) ? new Date() : null,
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Interview not found" });
    return res.json({ ok: true, interview: mapInterview(updated) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/webrtc/offer
export async function companyInterviewWebrtcOffer(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { type = "offer", sdp = "" } = req.body || {};
    const safeSdp = normalizeWebRtcSdp(sdp);
    if (!safeSdp) return res.status(400).json({ message: "Offer SDP is required" });

    const existing = await Interview.findOne({ _id: id, company: companyId }).select("_id sessionId").lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });

    const sessionId = String(existing.sessionId || randomId("session"));
    const interview = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $set: {
          sessionId,
          "collaboration.webrtc.active": true,
          "collaboration.webrtc.sessionId": sessionId,
          "collaboration.webrtc.offer": {
            type: String(type || "offer"),
            sdp: safeSdp,
            by: "company",
            createdAt: new Date(),
          },
          "collaboration.webrtc.answer": { type: "", sdp: "", by: "", createdAt: null },
          "collaboration.webrtc.companyCandidates": [],
          "collaboration.webrtc.studentCandidates": [],
        },
      },
      { returnDocument: "after" }
    );

    emitInterviewSignal(
      id,
      "webrtc_offer",
      {
        sessionId,
        offer: {
          type: String(type || "offer"),
          sdp: safeSdp,
          by: "company",
          createdAt: new Date().toISOString(),
        },
      },
      { excludeRole: "company" }
    );

    return res.json({ ok: true, sessionId, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/webrtc/candidate
export async function companyInterviewWebrtcCandidate(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const candidate = normalizeIceCandidate(req.body || {});
    if (!candidate.candidate) return res.status(400).json({ message: "ICE candidate is required" });

    const existing = await Interview.findOne({ _id: id, company: companyId }).select("_id sessionId").lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });
    const sessionId = String(existing.sessionId || randomId("session"));

    await Interview.updateOne(
      { _id: id, company: companyId },
      {
        $set: {
          sessionId,
          "collaboration.webrtc.active": true,
          "collaboration.webrtc.sessionId": sessionId,
        },
        $push: {
          "collaboration.webrtc.companyCandidates": {
            $each: [candidate],
            $slice: -150,
          },
        },
      }
    );

    emitInterviewSignal(
      id,
      "webrtc_candidate",
      { from: "company", candidate },
      { excludeRole: "company" }
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/admin-monitor/answer
export async function companyInterviewAdminMonitorAnswer(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const { type = "answer", sdp = "" } = req.body || {};
    const safeSdp = normalizeWebRtcSdp(sdp);
    if (!safeSdp) return res.status(400).json({ message: "Answer SDP is required" });

    const existing = await Interview.findOne({ _id: id, company: companyId })
      .select("_id sessionId collaboration.webrtc")
      .lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });

    const rtc = ensureInterviewWebrtcState(existing?.collaboration?.webrtc, existing?.sessionId);
    const sessionId = String(
      rtc?.adminMonitor?.company?.sessionId
      || rtc?.sessionId
      || randomId("monitor")
    );
    const createdAt = new Date();

    const interview = await Interview.findOneAndUpdate(
      { _id: id, company: companyId },
      {
        $set: {
          "collaboration.webrtc.active": true,
          "collaboration.webrtc.adminMonitor.company.sessionId": sessionId,
          "collaboration.webrtc.adminMonitor.company.answer": {
            type: String(type || "answer"),
            sdp: safeSdp,
            by: "company",
            createdAt,
          },
        },
      },
      { returnDocument: "after" }
    );

    emitInterviewSignal(
      id,
      "admin_monitor_answer",
      {
        from: "company",
        sessionId,
        answer: {
          type: String(type || "answer"),
          sdp: safeSdp,
          by: "company",
          createdAt: createdAt.toISOString(),
        },
      },
      { excludeRole: "company" }
    );

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

// POST /api/company/interviews/:id/admin-monitor/candidate
export async function companyInterviewAdminMonitorCandidate(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const candidate = normalizeIceCandidate(req.body || {});
    if (!candidate.candidate) return res.status(400).json({ message: "ICE candidate is required" });

    const existing = await Interview.findOne({ _id: id, company: companyId })
      .select("_id sessionId collaboration.webrtc")
      .lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });

    const rtc = ensureInterviewWebrtcState(existing?.collaboration?.webrtc, existing?.sessionId);
    const sessionId = String(
      rtc?.adminMonitor?.company?.sessionId
      || rtc?.sessionId
      || randomId("monitor")
    );

    await Interview.updateOne(
      { _id: id, company: companyId },
      {
        $set: {
          "collaboration.webrtc.active": true,
          "collaboration.webrtc.adminMonitor.company.sessionId": sessionId,
        },
        $push: {
          "collaboration.webrtc.adminMonitor.company.companyCandidates": {
            $each: [candidate],
            $slice: -150,
          },
        },
      }
    );

    emitInterviewSignal(
      id,
      "admin_monitor_candidate",
      { from: "company", target: "company", candidate },
      { excludeRole: "company" }
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/company/interviews/:id
export async function deleteCompanyInterview(req, res, next) {
  try {
    const companyId = req.user?._id;
    if (!companyId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const deleted = await Interview.findOneAndDelete({ _id: id, company: companyId }).lean();
    if (!deleted) return res.status(404).json({ message: "Interview not found" });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
