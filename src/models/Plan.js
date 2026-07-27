import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    jobsLimit: { type: mongoose.Schema.Types.Mixed, default: 1 },
    appsLimit: { type: mongoose.Schema.Types.Mixed, default: 100 },
    durationDays: { type: Number, default: 30 },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
    highlight: { type: Boolean, default: false },
  },
  { timestamps: true },
);

planSchema.index({ name: 1 }, { unique: true });

export default mongoose.model("Plan", planSchema);
