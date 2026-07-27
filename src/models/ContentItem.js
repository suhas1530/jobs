// backend/src/models/ContentItem.js
import mongoose from "mongoose";

const contentItemSchema = new mongoose.Schema(
  {
    // Who created this (admin user id)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // CONTENT TYPES used across the platform
    // - HOME_AD: banner/card ads on student home
    // - TESTIMONIAL: student success stories / testimonials
    // - CATEGORY: popular categories shown on student home
    // - INTERNSHIP_TIP / INTERNSHIP_QA / MOCK_TEST: internship learning content
    type: {
      type: String,
      enum: [
        "HOME_AD",
        "TESTIMONIAL",
        "CATEGORY",
        "INTERNSHIP_TIP",
        "INTERNSHIP_QA",
        "MOCK_TEST",
        "PLACED_STUDENT",
        "FEATURED_COMPANY",
        "ANNOUNCEMENT",
        "BLOG",
        "PUBLIC_PAGE",
      ],
      required: true,
      index: true,
    },

    // Control visibility on UI
    status: {
      type: String,
      enum: ["Active", "Inactive", "Draft"],
      default: "Active",
      index: true,
    },

    // Common fields
    title: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "" }, // banner/testimonial image (optional)
    linkUrl: { type: String, default: "" },  // click-through link (optional)

    // If you want to schedule content
    startAt: { type: Date },
    endAt: { type: Date },

    // Targeting (optional)
    tags: { type: [String], default: [] }, // e.g. ["IT", "Hyderabad"]
    stream: { type: String, default: "" },
    category: { type: String, default: "" },
    subCategory: { type: String, default: "" },

    // Flexible payload per type
    // Examples:
    // TESTIMONIAL: { name, quote, company }
    // CATEGORY: { label }
    // INTERNSHIP_TIP: { desc }
    // INTERNSHIP_QA: { q, a }
    // MOCK_TEST: { questions, mins }
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ordering in UI
    priority: { type: Number, default: 0 },
    placement: {
      type: String,
      enum: ["HOME", "INTERNSHIP", "GLOBAL"],
      default: "GLOBAL",
      index: true,
    },
  },
  { timestamps: true }
);

// helpful indexes
contentItemSchema.index({ type: 1, status: 1, priority: -1, createdAt: -1 });
contentItemSchema.index({ placement: 1, status: 1, priority: -1 });

export default mongoose.model("ContentItem", contentItemSchema);


