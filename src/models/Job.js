// backend/src/models/Job.js
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    createdByRole: {
      type: String,
      enum: ["company", "admin"],
      default: "company",
    },
    createdByAdmin: { type: Boolean, default: false },

    // ================= BASIC INFO =================
    title: { type: String, required: true, trim: true },
    stream: { type: String, default: "" },
    category: { type: String, default: "" },
    subCategory: { type: String, default: "" },

    jobType: { type: String, default: "" },   // Full-time / Part-time / Internship
    workMode: { type: String, default: "" },  // Remote / Hybrid / On-site
    mode: { type: String, default: "" },      // UI uses this
    city: { type: String, default: "" },
    state: { type: String, default: "" },

    location: { type: String, default: "" },

    openings: { type: Number, default: 1 },
    deadline: { type: String, default: "" },

    // ================= EXPERIENCE =================
    experience: { type: String, default: "" },
    experienceText: { type: String, default: "" },

    // ================= SALARY =================
    salaryType: { type: String, default: "" },
    salaryMin: { type: Number, default: 0 },
    salaryMax: { type: Number, default: 0 },
    salaryText: { type: String, default: "" },
    benefits: { type: String, default: "" },
    showSalary: { type: Boolean, default: true },

    // ================= DESCRIPTION =================
    overview: { type: String, default: "" },
    responsibilities: { type: String, default: "" },
    requirements: { type: String, default: "" },
    skills: { type: [String], default: [] },

    // ================= APPLY SETTINGS =================
    requireResume: { type: Boolean, default: true },
    requireProfile100: { type: Boolean, default: false },
    applicantProfileRequirement: {
      type: String,
      enum: ["resume", "student_profile", "both"],
      default: "both",
    },
    oneClickApply: { type: Boolean, default: true },
    allowWhatsapp: { type: Boolean, default: false },
    allowCall: { type: Boolean, default: false },
    allowEmailThread: { type: Boolean, default: true },

    questions: { type: Array, default: [] },

    // ================= AI RANKING =================
    enableAiRanking: { type: Boolean, default: false },
    skillsWeight: { type: Number, default: 40 },
    experienceWeight: { type: Number, default: 30 },
    educationWeight: { type: Number, default: 10 },
    screeningWeight: { type: Number, default: 20 },

    autoHighlightTop10: { type: Boolean, default: false },
    autoTagMatch: { type: Boolean, default: false },
    allowInterviewSuggestions: { type: Boolean, default: false },

    // ================= BOOST SYSTEM =================
    boostActive: { type: Boolean, default: false },
    boostPlanId: { type: String, default: "" },
    boostPlanName: { type: String, default: "" },
    boostStart: { type: Date },
    boostEnd: { type: Date },

    // ================= STATUS =================
    status: {
      type: String,
      enum: ["Active", "Closed", "Draft", "Disabled"],
      default: "Active",
    },
  },
  { timestamps: true }
);

// ================= INDEXES =================
jobSchema.index({ company: 1, status: 1, createdAt: -1 });
jobSchema.index({ boostActive: 1, boostEnd: 1 });

export default mongoose.model("Job", jobSchema);

