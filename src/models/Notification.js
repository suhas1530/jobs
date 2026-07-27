// backend/src/models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },

    // Applications | Interviews | Messages | Billing | System
    type: { type: String, default: "System", index: true },

    title: { type: String, required: true },
    desc: { type: String, default: "" },

    // optional CTA used by frontend
    actionLabel: { type: String, default: "" },
    actionUrl: { type: String, default: "" },

    // read state
    read: { type: Boolean, default: false, index: true },

    // grouping helper (optional)
    dateGroup: { type: String, default: "" },
  },
  { timestamps: true }
);

notificationSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
