import mongoose from "mongoose";

const adminNotificationSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    email: { type: Boolean, default: true },
    app: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
  },
  { timestamps: true },
);


export default mongoose.model("AdminNotificationSetting", adminNotificationSettingSchema);


