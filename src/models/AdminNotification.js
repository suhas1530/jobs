import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: "System", trim: true },
    target: { type: String, default: "Admin", trim: true },
    triggeredBy: { type: String, default: "System", trim: true },
    message: { type: String, default: "" },
    date: { type: String, default: "" },
    status: { type: String, enum: ["sent", "scheduled", "failed"], default: "sent" },
    audience: { type: String, default: "All Users" },
    mode: { type: String, enum: ["immediate", "scheduled"], default: "immediate" },
    scheduleAt: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

adminNotificationSchema.index({ createdAt: -1, status: 1 });

export default mongoose.model("AdminNotification", adminNotificationSchema);
