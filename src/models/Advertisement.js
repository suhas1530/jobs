import mongoose from "mongoose";

const advertisementSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    mediaType: {
      type: String,
      enum: ["video", "banner", "pamphlet", "other"],
      default: "banner",
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["upload", "link"],
      default: "upload",
    },
    mediaUrl: { type: String, required: true, trim: true },
    mediaPublicId: { type: String, default: "" },
    mediaResourceType: { type: String, default: "image" },
    mimeType: { type: String, default: "" },
    ctaLabel: { type: String, default: "Learn More", trim: true },
    targetUrl: { type: String, default: "", trim: true },
    contactLabel: { type: String, default: "", trim: true },
    audience: { type: String, default: "", trim: true },
    placement: { type: String, default: "student-home", trim: true },
    status: {
      type: String,
      enum: ["pending", "active", "inactive", "rejected", "archived"],
      default: "active",
      index: true,
    },
    rejectedReason: { type: String, default: "", trim: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metrics: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      fullscreenViews: { type: Number, default: 0 },
      pauses: { type: Number, default: 0 },
      resumes: { type: Number, default: 0 },
      cancels: { type: Number, default: 0 },
      skips: { type: Number, default: 0 },
      replays: { type: Number, default: 0 },
      lastInteractionAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

advertisementSchema.index({ status: 1, createdAt: -1 });
advertisementSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Advertisement", advertisementSchema);
