import mongoose from "mongoose";

const spamReportSchema = new mongoose.Schema(
  {
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageThread",
      required: true,
      index: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reporterRole: {
      type: String,
      enum: ["student", "company"],
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedRole: {
      type: String,
      enum: ["student", "company"],
      required: true,
    },
    reason: {
      type: String,
      enum: ["Abusive Language", "Scam/Fraud", "Harassment", "Irrelevant Messages", "Fake Profile", "Other"],
      required: true,
    },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "in_review", "resolved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    blocked: { type: Boolean, default: false },
    blockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

spamReportSchema.index({ reporter: 1, thread: 1, status: 1 });

export default mongoose.model("SpamReport", spamReportSchema);

