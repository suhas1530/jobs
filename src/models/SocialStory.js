import mongoose from "mongoose";

const socialStoryReportSchema = new mongoose.Schema(
  {
    reporterUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reporterRole: {
      type: String,
      enum: ["student", "company"],
      required: true,
    },
    reason: {
      type: String,
      enum: [
        "Abusive Language",
        "Hate Speech",
        "Sexual Content",
        "Violence or Threat",
        "Illegal Activity",
        "Spam or Misleading",
        "Other",
      ],
      required: true,
    },
    details: { type: String, default: "", trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const socialStorySchema = new mongoose.Schema(
  {
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorRole: {
      type: String,
      enum: ["student", "company"],
      required: true,
      index: true,
    },
    authorName: { type: String, default: "", trim: true },
    authorHeadline: { type: String, default: "", trim: true },
    authorAvatarUrl: { type: String, default: "", trim: true },

    caption: { type: String, default: "", trim: true, maxlength: 300 },

    mediaUrl: { type: String, required: true, trim: true },
    mediaPublicId: { type: String, default: "", trim: true },
    mediaResourceType: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },

    music: {
      provider: { type: String, default: "jamendo", trim: true },
      trackId: { type: String, default: "", trim: true },
      title: { type: String, default: "", trim: true },
      artist: { type: String, default: "", trim: true },
      album: { type: String, default: "", trim: true },
      coverUrl: { type: String, default: "", trim: true },
      audioUrl: { type: String, default: "", trim: true },
      durationSeconds: { type: Number, default: 0, min: 0 },
      startSeconds: { type: Number, default: 0, min: 0 },
      clipDurationSeconds: { type: Number, default: 0, min: 0 },
    },

    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    hiddenForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reports: { type: [socialStoryReportSchema], default: [] },
    moderationStatus: {
      type: String,
      enum: ["visible", "hidden"],
      default: "visible",
      index: true,
    },
    moderationReasons: { type: [String], default: [] },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

socialStorySchema.index({ authorUser: 1, createdAt: -1 });
socialStorySchema.index({ createdAt: -1 });

export default mongoose.model("SocialStory", socialStorySchema);
