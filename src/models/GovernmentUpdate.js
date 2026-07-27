// backend/src/models/GovernmentUpdate.js
import mongoose from "mongoose";

const governmentUpdateSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin

    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },

    // matches your frontend mock types
    type: {
      type: String,
      enum: ["PDF", "LINK", "IMAGE", "VIDEO", "NOTE"],
      default: "LINK",
      index: true,
    },

    // For LINK type
    link: { type: String, default: "" },

    // For uploaded content (PDF/IMAGE/VIDEO)
    fileUrl: { type: String, default: "" }, // store cloudinary/local url
    fileName: { type: String, default: "" },

    // For NOTE type
    note: { type: String, default: "" },

    // Meta
    source: { type: String, default: "" }, // e.g. "upsc.gov.in"
    tags: { type: [String], default: [] },

    // publish controls
    status: {
      type: String,
      enum: ["Active", "Inactive", "Draft"],
      default: "Active",
      index: true,
    },

    // shown date in UI
    date: { type: String, default: "" }, // keep string because your UI uses "2026-02-15"
    publishedAt: { type: Date, default: Date.now, index: true },

    // ordering
    priority: { type: Number, default: 0 },

    // Extended admin metadata used by dashboard UI
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

governmentUpdateSchema.index({ status: 1, publishedAt: -1 });
governmentUpdateSchema.index({ type: 1, status: 1, publishedAt: -1 });

export default mongoose.model("GovernmentUpdate", governmentUpdateSchema);


