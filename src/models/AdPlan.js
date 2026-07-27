import mongoose from "mongoose";

const adPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    price: { type: Number, default: 0 },
    durationDays: { type: Number, default: 30 },
    description: { type: String, default: "" },
    placements: { type: [String], default: ["student-home"] },
    mediaTypes: { type: [String], default: ["banner", "video", "pamphlet", "other"] },
    active: { type: Boolean, default: true },
    highlight: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("AdPlan", adPlanSchema);
