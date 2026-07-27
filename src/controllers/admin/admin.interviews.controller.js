import mongoose from "mongoose";
import Interview from "../../models/Interview.js";
import { emitInterviewSignal } from "../../realtime/interviewSignaling.js";
import {
  createInterviewWebrtcState,
  ensureInterviewWebrtcState,
  getMonitorCandidateKey,
  getMonitorRoleBucket,
  normalizeIceCandidate,
  normalizeWebRtcSdp,
} from "../../utils/interviewWebrtc.js";

const STATUS_ALLOWED = [
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

function toDateOnly(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toTime12h(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapInterview(x) {
  const d = new Date(x.scheduledAt);
  return {
    id: String(x._id),
    companyId: x.company?._id ? String(x.company._id) : "",
    companyName: x.company?.name || "Company",
    studentId: x.student?._id ? String(x.student._id) : "",
    studentName: x.student?.name || x.candidateName || "Candidate",
    studentEmail: x.student?.email || "",
    jobTitle: x.jobTitle || "",
    stage: x.stage || "HR",
    status: x.status || "Scheduled",
    date: toDateOnly(d),
    time: toTime12h(d),
    scheduledAt: d.toISOString(),
    roomId: x.roomId || "",
    sessionId: x.sessionId || "",
    currentRound: x.currentRound || x.stage || "HR",
    candidateReadiness: x.candidateReadiness || {},
    proctoring: x.proctoring || { riskLevel: "Low", alerts: [] },
    scorecard: x.scorecard || {},
    finalDecision: x.finalDecision || "",
    collaboration: {
      chat: Array.isArray(x?.collaboration?.chat) ? x.collaboration.chat : [],
      questions: Array.isArray(x?.collaboration?.questions) ? x.collaboration.questions : [],
      code: x?.collaboration?.code || { language: "javascript", content: "", note: "", output: "", error: "" },
      screenShare: x?.collaboration?.screenShare || { active: false, by: "" },
      liveQuestionDraft: x?.collaboration?.liveQuestionDraft || { text: "", by: "", updatedAt: null },
      webrtc: ensureInterviewWebrtcState(x?.collaboration?.webrtc, x?.sessionId),
    },
    createdAt: x.createdAt,
  };
}

export async function adminListInterviews(req, res, next) {
  try {
    const { q = "", status = "", from = "", to = "" } = req.query;
    const filter = {};

    if (status && STATUS_ALLOWED.includes(String(status))) {
      filter.status = status;
    }
    if (from || to) {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) filter.scheduledAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const rows = await Interview.find(filter)
      .sort({ scheduledAt: -1 })
      .populate("company", "name email")
      .populate("student", "name email")
      .lean();

    let items = rows.map(mapInterview);
    const query = String(q || "").trim().toLowerCase();
    if (query) {
      items = items.filter((x) =>
        `${x.companyName} ${x.studentName} ${x.studentEmail} ${x.jobTitle}`.toLowerCase().includes(query)
      );
    }

    const summary = {
      scheduled: rows.filter((x) => ["Scheduled", "Rescheduled"].includes(x.status)).length,
      waitingRoom: rows.filter((x) => x.status === "Waiting Room").length,
      live: rows.filter((x) => x.status === "Live").length,
      reviewReady: rows.filter((x) => x.status === "Review Ready").length,
      flagged: rows.filter((x) => Array.isArray(x?.proctoring?.alerts) && x.proctoring.alerts.length).length,
    };

    return res.json({ items, total: items.length, summary });
  } catch (err) {
    next(err);
  }
}

export async function adminInterviewWorkspace(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid interview id" });

    const interview = await Interview.findById(id)
      .populate("company", "name email")
      .populate("student", "name email")
      .lean();
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    return res.json({ interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

export async function adminStartInterview(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid interview id" });
    const interview = await Interview.findById(id);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (!interview.roomId) interview.roomId = `room_${Math.random().toString(36).slice(2, 10)}`;
    if (!interview.sessionId) interview.sessionId = `session_${Math.random().toString(36).slice(2, 10)}`;
    interview.collaboration = interview.collaboration || {};
    interview.collaboration.webrtc = createInterviewWebrtcState(String(interview.sessionId || ""));
    interview.status = interview.status === "Live" ? "Live" : "Waiting Room";
    interview.startedAt = interview.startedAt || new Date();
    await interview.save();

    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

export async function adminEndInterview(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid interview id" });
    const { decision = "" } = req.body || {};
    const interview = await Interview.findById(id);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    interview.status = "Review Ready";
    interview.endedAt = new Date();
    if (["Strong Hire", "Hire", "Hold", "Reject"].includes(String(decision))) {
      interview.finalDecision = decision;
    }
    await interview.save();
    return res.json({ ok: true, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

export async function adminInterviewMonitorOffer(req, res, next) {
  try {
    const { id, targetRole } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid interview id" });

    const roleBucket = getMonitorRoleBucket(targetRole);
    const candidateKey = getMonitorCandidateKey(targetRole);
    const { type = "offer", sdp = "" } = req.body || {};
    const safeSdp = normalizeWebRtcSdp(sdp);
    if (!safeSdp) return res.status(400).json({ message: "Offer SDP is required" });

    const existing = await Interview.findById(id).select("_id sessionId collaboration.webrtc").lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });

    const rtc = ensureInterviewWebrtcState(existing?.collaboration?.webrtc, existing?.sessionId);
    const sessionId = String(
      rtc?.adminMonitor?.[roleBucket]?.sessionId
      || rtc?.sessionId
      || randomId("monitor")
    );
    const createdAt = new Date();

    const interview = await Interview.findByIdAndUpdate(
      id,
      {
        $set: {
          "collaboration.webrtc.active": true,
          [`collaboration.webrtc.adminMonitor.${roleBucket}.sessionId`]: sessionId,
          [`collaboration.webrtc.adminMonitor.${roleBucket}.offer`]: {
            type: String(type || "offer"),
            sdp: safeSdp,
            by: "admin",
            createdAt,
          },
          [`collaboration.webrtc.adminMonitor.${roleBucket}.answer`]: {
            type: "",
            sdp: "",
            by: "",
            createdAt: null,
          },
          [`collaboration.webrtc.adminMonitor.${roleBucket}.adminCandidates`]: [],
          [`collaboration.webrtc.adminMonitor.${roleBucket}.${candidateKey}`]: [],
        },
      },
      { returnDocument: "after" }
    );

    emitInterviewSignal(
      id,
      "admin_monitor_offer",
      {
        target: roleBucket,
        sessionId,
        offer: {
          type: String(type || "offer"),
          sdp: safeSdp,
          by: "admin",
          createdAt: createdAt.toISOString(),
        },
      },
      { excludeRole: "admin" }
    );

    return res.json({ ok: true, sessionId, interview: mapInterview(interview) });
  } catch (err) {
    next(err);
  }
}

export async function adminInterviewMonitorCandidate(req, res, next) {
  try {
    const { id, targetRole } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid interview id" });

    const roleBucket = getMonitorRoleBucket(targetRole);
    const candidate = normalizeIceCandidate(req.body || {});
    if (!candidate.candidate) return res.status(400).json({ message: "ICE candidate is required" });

    const existing = await Interview.findById(id).select("_id sessionId collaboration.webrtc").lean();
    if (!existing) return res.status(404).json({ message: "Interview not found" });

    const rtc = ensureInterviewWebrtcState(existing?.collaboration?.webrtc, existing?.sessionId);
    const sessionId = String(
      rtc?.adminMonitor?.[roleBucket]?.sessionId
      || rtc?.sessionId
      || randomId("monitor")
    );

    await Interview.updateOne(
      { _id: id },
      {
        $set: {
          "collaboration.webrtc.active": true,
          [`collaboration.webrtc.adminMonitor.${roleBucket}.sessionId`]: sessionId,
        },
        $push: {
          [`collaboration.webrtc.adminMonitor.${roleBucket}.adminCandidates`]: {
            $each: [candidate],
            $slice: -150,
          },
        },
      }
    );

    emitInterviewSignal(
      id,
      "admin_monitor_candidate",
      { from: "admin", target: roleBucket, candidate },
      { excludeRole: "admin" }
    );

    return res.json({ ok: true, sessionId });
  } catch (err) {
    next(err);
  }
}
