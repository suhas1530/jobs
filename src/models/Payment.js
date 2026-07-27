import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["company", "student"], required: true, index: true },
    purpose: {
      type: String,
      enum: ["company_subscription", "student_ad_plan"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
      index: true,
    },
    planModel: { type: String, enum: ["Plan", "AdPlan"], required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, required: true },
    planName: { type: String, default: "" },
    billingCycle: { type: String, enum: ["monthly", "yearly", "one_time"], default: "one_time" },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, default: "", index: true },
    razorpayPaymentId: { type: String, default: "", index: true },
    razorpaySignature: { type: String, default: "" },
    receipt: { type: String, default: "" },
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ purpose: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
