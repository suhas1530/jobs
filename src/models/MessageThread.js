// backend/src/models/MessageThread.js
import mongoose from "mongoose";

const messageThreadSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: undefined },
    source: {
      type: String,
      enum: ["application", "social"],
      default: "application",
    },
    socialState: {
      type: String,
      enum: ["accepted", "pending"],
      default: "accepted",
    },
    socialRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    socialAcceptedAt: { type: Date, default: null },
    subject: { type: String, default: "" },

    status: {
      type: String,
      enum: ["Applied", "Shortlisted", "Hold", "Rejected", "Interview Scheduled", "Connected"],
      default: "Applied",
    },

    lastMessageText: { type: String, default: "" },
    lastMessageAt: { type: Date },

    // unread per user
    studentUnread: { type: Number, default: 0 },
    companyUnread: { type: Number, default: 0 },
  },
  { timestamps: true }
);

messageThreadSchema.index({ student: 1, updatedAt: -1 });
messageThreadSchema.index({ company: 1, updatedAt: -1 });
messageThreadSchema.index(
  { application: 1 },
  {
    unique: true,
    partialFilterExpression: { application: { $type: "objectId" } },
  }
);
messageThreadSchema.index(
  { student: 1, company: 1, source: 1 },
  {
    unique: true,
    partialFilterExpression: { source: "social" },
  }
);

export default mongoose.model("MessageThread", messageThreadSchema);
