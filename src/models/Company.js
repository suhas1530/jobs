// backend/src/models/Company.js
import mongoose from "mongoose";

/* ================= TEAM MEMBER SUB-SCHEMA ================= */
const teamMemberSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    role: {
      type: String,
      enum: ["Admin", "Recruiter", "Viewer"],
      default: "Recruiter",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Invited"],
      default: "Active",
    },
    invitedAt: { type: Date },
  },
  { _id: true }
);

/* ================= MAIN COMPANY SCHEMA ================= */
const companySchema = new mongoose.Schema(
  {
    // Owner user (role=company)
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ================= PROFILE =================
    name: { type: String, required: true, trim: true },
    website: { type: String, default: "", trim: true },
    linkedin: { type: String, default: "", trim: true },
    industry: { type: String, default: "", trim: true },
    size: { type: String, default: "", trim: true }, // e.g. "201-500"
    founded: { type: String, default: "", trim: true }, // e.g. "2017"
    logoUrl: { type: String, default: "", trim: true },
    profileAudience: {
      type: String,
      enum: ["company", "student", "both"],
      default: "both",
    },

    // ================= CONTACT =================
    email: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    hrEmail: { type: String, default: "", trim: true },
    hrPhone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },

    // ================= ABOUT =================
    about: { type: String, default: "", trim: true },
    mission: { type: String, default: "", trim: true },
    culture: { type: String, default: "", trim: true },
    perks: { type: String, default: "", trim: true },
    hiringProcess: { type: String, default: "", trim: true },
    studentMessage: { type: String, default: "", trim: true },

    category: { type: String, default: "", trim: true },

    // ================= HIRING PREFERENCES =================
    preferences: {
      location: { type: String, default: "" },
      experience: { type: String, default: "" },
      salary: { type: String, default: "" },
      oneClick: { type: Boolean, default: true },
      aiRanking: { type: Boolean, default: true },
      preScreening: { type: Boolean, default: true },
    },

    // ================= TEAM ACCESS =================
    teamMembers: { type: [teamMemberSchema], default: [] },

    // ================= NOTIFICATIONS =================
    notifications: {
      newApplication: { type: Boolean, default: true },
      interviewScheduled: { type: Boolean, default: true },
      candidateMessage: { type: Boolean, default: true },
      planExpiry: { type: Boolean, default: true },
      boostExpiry: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: true },
      dailySummary: { type: Boolean, default: true },
    },

    // ================= SECURITY =================
    security: {
      twofa: { type: Boolean, default: false },

      // Optional email OTP storage
      otp: {
        code: { type: String, default: "" },
        expiresAt: { type: Date },
        purpose: { type: String, default: "" }, // e.g. "verify_email"
      },
    },

    // ================= BILLING =================
    billing: {
      companyName: { type: String, default: "", trim: true },
      gst: { type: String, default: "", trim: true },
      billingEmail: { type: String, default: "", trim: true },
      billingAddress: { type: String, default: "", trim: true },
      cardLast4: { type: String, default: "", trim: true },
    },

    // ================= PRIVACY =================
    privacy: {
      publicProfile: { type: Boolean, default: true },
      hideContactUntilShortlist: { type: Boolean, default: true },
    },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ================= INDEX ================= */
companySchema.index({ ownerUserId: 1 }, { unique: true });

export default mongoose.model("Company", companySchema);
