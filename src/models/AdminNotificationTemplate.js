import mongoose from "mongoose";

const adminNotificationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    trigger: { type: String, required: true, trim: true },
    subject: { type: String, default: "", trim: true },
    body: { type: String, default: "", trim: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    modified: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

adminNotificationTemplateSchema.index({ trigger: 1, status: 1 });

export default mongoose.model("AdminNotificationTemplate", adminNotificationTemplateSchema);
