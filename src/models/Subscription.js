import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    planName: { type: String, default: "Starter" },

    // ✅ NEW
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    price: { type: Number, default: 0 },

    start: { type: Date },
    end: { type: Date },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" },

    jobsLimit: { type: Number, default: 1 },
    jobsUsed: { type: Number, default: 0 },
    appsLimit: { type: Number, default: 100 },
    appsUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);
