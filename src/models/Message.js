import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: "MessageThread", required: true },
    senderUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    senderRole: { type: String, enum: ["company", "student", "system"], required: true },

    type: { type: String, enum: ["text", "file", "system"], default: "text" },
    text: { type: String, default: "" },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    seenBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    reactions: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          emoji: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reportCount: { type: Number, default: 0 },
    reports: {
      type: [
        {
          reporterUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          reason: { type: String, default: "Other" },
          details: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    fileName: { type: String, default: "" },
    fileSize: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
  },
  { timestamps: true }
);

messageSchema.index({ thread: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
