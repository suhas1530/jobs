// backend/src/models/BoostCampaign.js
import mongoose from "mongoose";

const boostCampaignSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },

    planId: { type: String, required: true },     // basic / pro / ultimate
    planName: { type: String, required: true },

    cycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" }, // ✅ you wanted both

    start: { type: Date, required: true },
    end: { type: Date, required: true },

    status: { type: String, enum: ["Active", "Scheduled", "Expired", "Cancelled"], default: "Active" },

    price: { type: Number, default: 0 },
    durationDays: { type: Number, default: 7 },
  },
  { timestamps: true }
);

boostCampaignSchema.index({ company: 1, createdAt: -1 });
boostCampaignSchema.index({ job: 1, status: 1 });

export default mongoose.model("BoostCampaign", boostCampaignSchema);
