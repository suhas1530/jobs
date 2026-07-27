import mongoose from "mongoose";
import { createInterviewWebrtcState } from "../utils/interviewWebrtc.js";

const interviewSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // optional linkage (future)
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    candidateName: { type: String, required: true },
    jobTitle: { type: String, required: true },

    stage: { type: String, enum: ["HR", "Technical", "Managerial", "Final"], default: "HR" },

    scheduledAt: { type: Date, required: true },
    durationMins: { type: Number, default: 30 },

    mode: { type: String, enum: ["Online", "Onsite"], default: "Online" },
    meetingLink: { type: String, default: "" },
    interviewLinks: [{ type: String }],
    location: { type: String, default: "" },

    interviewer: { type: String, default: "" },

    status: {
      type: String,
      enum: [
        "Scheduled",
        "Waiting Room",
        "Live",
        "Completed",
        "Review Ready",
        "Rescheduled",
        "Cancelled",
        "No Show",
        "Pending Confirmation",
      ],
      default: "Scheduled",
    },

    roomId: { type: String, default: "" },
    sessionId: { type: String, default: "" },
    startedAt: { type: Date },
    admittedAt: { type: Date },
    endedAt: { type: Date },
    currentRound: { type: String, default: "" },
    rounds: [
      {
        roundType: { type: String, default: "" },
        status: { type: String, default: "Pending" },
        startedAt: { type: Date },
        endedAt: { type: Date },
        score: { type: Number, default: 0 },
        summary: { type: String, default: "" },
      },
    ],
    candidateReadiness: {
      online: { type: Boolean, default: false },
      cameraReady: { type: Boolean, default: false },
      microphoneReady: { type: Boolean, default: false },
      networkQuality: { type: String, default: "Unknown" },
      consentAccepted: { type: Boolean, default: false },
      rulesAccepted: { type: Boolean, default: false },
      preJoinCompletedAt: { type: Date },
      enteredWaitingRoomAt: { type: Date },
    },
    proctoring: {
      baselineCaptured: { type: Boolean, default: false },
      riskLevel: { type: String, enum: ["Low", "Medium", "High"], default: "Low" },
      alerts: [
        {
          type: { type: String, default: "" },
          severity: { type: String, default: "low" },
          note: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
          dismissed: { type: Boolean, default: false },
        },
      ],
    },
    scorecard: {
      technicalKnowledge: { type: Number, default: 0 },
      problemSolving: { type: Number, default: 0 },
      communication: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
      cultureFit: { type: Number, default: 0 },
      overall: { type: Number, default: 0 },
      notes: { type: String, default: "" },
    },
    finalDecision: {
      type: String,
      enum: ["", "Strong Hire", "Hire", "Hold", "Reject"],
      default: "",
    },
    collaboration: {
      chat: [
        {
          senderRole: { type: String, enum: ["company", "student"], default: "company" },
          text: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      questions: [
        {
          senderRole: { type: String, enum: ["company", "student"], default: "company" },
          text: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      code: {
        language: { type: String, default: "javascript" },
        content: { type: String, default: "" },
        note: { type: String, default: "" },
        lastUpdatedBy: { type: String, enum: ["company", "student", ""], default: "" },
        outputMode: { type: String, enum: ["console", "server"], default: "console" },
        output: { type: String, default: "" },
        error: { type: String, default: "" },
        serverOutput: { type: String, default: "" },
        serverError: { type: String, default: "" },
        previewHtml: { type: String, default: "" },
        updatedAt: { type: Date },
      },
      screenShare: {
        active: { type: Boolean, default: false },
        by: { type: String, enum: ["company", "student", ""], default: "" },
        startedAt: { type: Date },
      },
      liveQuestionDraft: {
        text: { type: String, default: "" },
        by: { type: String, enum: ["company", "student", ""], default: "" },
        updatedAt: { type: Date },
      },
      webrtc: {
        type: mongoose.Schema.Types.Mixed,
        default: () => createInterviewWebrtcState(),
      },
    },

    notes: [{ type: String }],
    messageToCandidate: { type: String, default: "" },
    interviewQuestions: [{ type: String }],
    documentsRequired: [{ type: String }],
    verificationDetails: { type: String, default: "" },
    additionalDetails: { type: String, default: "" },
    verificationStatus: {
      type: String,
      enum: ["Pending", "Submitted", "Verified", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

interviewSchema.index({ company: 1, scheduledAt: -1, status: 1 });

export default mongoose.model("Interview", interviewSchema);
