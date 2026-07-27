import mongoose from "mongoose";

const planRequestSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Optional: if you have Plan model later
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },

    planName: { type: String, default: "" },
    amount: { type: String, default: "" }, // keep string (₹350 / $299/mo)
    utr: { type: String, default: "" },
    note: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

planRequestSchema.index({ company: 1, status: 1, createdAt: -1 });

export default mongoose.model("PlanRequest", planRequestSchema);