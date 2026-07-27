import mongoose from "mongoose";

const adminSettingsSchema = new mongoose.Schema(
  {
    profile: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      role: { type: String, default: "Super Admin" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      logoUrl: { type: String, default: "" },
    },
    social: {
      linkedin: { type: String, default: "" },
      twitter: { type: String, default: "" },
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
    },
    security: {
      twoFactor: { type: Boolean, default: false },
    },
    sessions: {
      active: { type: Number, default: 0 },
      lastPasswordChange: { type: String, default: "" },
    },
    email: {
      host: { type: String, default: "" },
      port: { type: String, default: "" },
      senderEmail: { type: String, default: "" },
      senderName: { type: String, default: "" },
    },
    notifications: {
      companyRegistration: { type: Boolean, default: true },
      studentRegistration: { type: Boolean, default: true },
      planPurchase: { type: Boolean, default: true },
      planExpiry: { type: Boolean, default: true },
      jobPosted: { type: Boolean, default: true },
      applicationSubmitted: { type: Boolean, default: true },
      applicationShortlisted: { type: Boolean, default: true },
      systemError: { type: Boolean, default: true },
    },
    platform: {
      governmentJobs: { type: Boolean, default: true },
      internship: { type: Boolean, default: true },
      resumeBuilder: { type: Boolean, default: true },
      chatSystem: { type: Boolean, default: false },
      videoInterview: { type: Boolean, default: false },
      aiResumeMatching: { type: Boolean, default: true },
      maintenanceMode: { type: Boolean, default: false },
      enableStudentModule: { type: Boolean, default: true },
      enableCompanyModule: { type: Boolean, default: true },
      enableGovernmentUpdates: { type: Boolean, default: true },
    },
    theme: {
      mode: { type: String, default: "light" },
      accent: { type: String, default: "blue" },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export default mongoose.model("AdminSettings", adminSettingsSchema);
