import mongoose from "mongoose";

const socialCommentSchema = new mongoose.Schema(
  {
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorRole: {
      type: String,
      enum: ["student", "company"],
      required: true,
    },
    authorName: { type: String, default: "", trim: true },
    authorHeadline: { type: String, default: "", trim: true },
    authorAvatarUrl: { type: String, default: "", trim: true },
    text: { type: String, required: true, trim: true, maxlength: 800 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const socialPostReportSchema = new mongoose.Schema(
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

const socialPostSchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: ["text", "image", "banner", "video", "reel", "document"],
      default: "text",
      index: true,
    },
    headline: { type: String, default: "", trim: true, maxlength: 140 },
    content: { type: String, default: "", trim: true, maxlength: 2200 },

    mediaUrl: { type: String, default: "", trim: true },
    mediaPublicId: { type: String, default: "", trim: true },
    mediaResourceType: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },

    visibility: {
      type: String,
      enum: ["everyone", "followers"],
      default: "everyone",
    },

    tags: { type: [String], default: [] },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: { type: [socialCommentSchema], default: [] },

    shareCount: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },

    moderationStatus: {
      type: String,
      enum: ["visible", "hidden", "deleted"],
      default: "visible",
      index: true,
    },
    moderationReasons: { type: [String], default: [] },
    moderationBlockedAt: { type: Date, default: null },
    moderationBlockedBy: { type: String, default: "", trim: true },
    mediaModeration: {
      scanned: { type: Boolean, default: false },
      blocked: { type: Boolean, default: false },
      unsafeScore: { type: Number, default: 0, min: 0, max: 1 },
      mediaKind: { type: String, default: "", trim: true },
      framesScanned: { type: Number, default: 0, min: 0 },
      version: { type: String, default: "", trim: true },
      reasons: { type: [String], default: [] },
    },
    hiddenForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reports: { type: [socialPostReportSchema], default: [] },
  },
  { timestamps: true }
);

socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ tags: 1 });
socialPostSchema.index({ moderationStatus: 1, createdAt: -1 });

export default mongoose.model("SocialPost", socialPostSchema);
