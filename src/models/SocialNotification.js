import mongoose from "mongoose";

const socialNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: { type: String, default: "", trim: true },
    actorAvatarUrl: { type: String, default: "", trim: true },
    kind: {
      type: String,
      enum: ["moderation_warning", "report_update", "social"],
      default: "social",
      index: true,
    },
    title: { type: String, default: "", trim: true, maxlength: 140 },
    message: { type: String, default: "", trim: true, maxlength: 500 },
    severity: {
      type: String,
      enum: ["info", "warning", "danger"],
      default: "info",
    },
    relatedPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialPost",
      default: null,
    },
    relatedStory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialStory",
      default: null,
    },
    relatedThread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageThread",
      default: null,
    },
    eventType: { type: String, default: "social", trim: true, maxlength: 80, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

socialNotificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("SocialNotification", socialNotificationSchema);
