// backend/src/models/User.js
// ✅ REPLACE your existing User.js with this file.
// Converted from CommonJS (require/module.exports) → ESM (import/export default)
// Schema is identical — only the module syntax changed.

import mongoose from "mongoose";

const EducationSchema = new mongoose.Schema({
  degree:           String,
  branch:           String,
  college:          String,
  board:            String,
  year:             String,
  score:            String,
  universityRollNo: String,
  achievements:     String,
  marksheet:        String,
}, { _id: false });

const ExperienceSchema = new mongoose.Schema({
  company:     String,
  role:        String,
  from:        String,
  to:          String,
  current:     { type: Boolean, default: false },
  description: String,
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  title:          String,
  description:    String,
  techStack:      String,
  hashtags:       String,
  imageUrl:       String,
  liveUrl:        String,
  githubUrl:      String,
  daysToComplete: String,
}, { _id: false });

const PersonalSchema = new mongoose.Schema({
  fullName:    String,
  email:       String,
  phone:       String,
  dob:         String,
  gender:      { type: String, default: "Male" },
  address:     String,
  city:        String,
  state:       String,
  location:    String,
  linkedin:    String,
  portfolio:   String,
  github:      String,
  twitter:     String,
  instagram:   String,
  youtube:     String,
  website:     String,
  designation: { type: String, default: "Student" },
  about:       String,
  coverPhoto:  String,
  avatarUrl:   String,
  profileImageUrl: String,
}, { _id: false });

const PreferredSchema = new mongoose.Schema({
  stream:         String,
  category:       String,
  subcategory:    String,
  subCategory:    String,
  locations:      mongoose.Schema.Types.Mixed, // string or array
  salary:         String,
  expectedSalary: String,
  workMode:       { type: String, default: "Hybrid" },
}, { _id: false });

const ResumeMetaSchema = new mongoose.Schema({
  fileName:     String,
  size:         String,
  updatedAt:    String,
  cloudinaryId: String,
}, { _id: false });

const StudentProfileSchema = new mongoose.Schema({
  personal:   PersonalSchema,
  education:  [EducationSchema],
  skills:     [mongoose.Schema.Types.Mixed], // strings or { name, skill }
  fresher:    { type: Boolean, default: true },
  experience: [ExperienceSchema],
  projects:   [ProjectSchema],
  preferred:  PreferredSchema,
  resumeMeta: ResumeMetaSchema,
}, { _id: false });

const AppliedJobSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  appliedAt: { type: Date, default: Date.now },
  status: {
    type:    String,
    enum:    ["Applied","Under Review","Shortlisted","Interview Scheduled","Offered","Rejected","Withdrawn"],
    default: "Applied",
  },
});

const AdAccessSchema = new mongoose.Schema({
  canPost: { type: Boolean, default: false },
  planStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected", "expired"],
    default: "none",
  },
  planName: { type: String, default: "Ads Starter Plan" },
  requestedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  note: { type: String, default: "" },
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    clerkId:   { type: String, required: true, unique: true, index: true },
    email:     { type: String, required: true, lowercase: true, trim: true },
    name:      String,
    phone:     String,
    location:  String,
    linkedin:  String,
    portfolio: String,
    resumeUrl: String,
    avatarUrl: String,
    avatar: String,
    profilePhoto: String,
    profileImageUrl: String,
    imageUrl: String,
    role:      { type: String, enum: ["student", "company", "recruiter", "admin"], default: "student" },
    isActive:  { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },

    studentProfile: StudentProfileSchema,
    resume: { type: mongoose.Schema.Types.Mixed, default: {} },
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],

    followers:  [{ type: String }],
    following:  [{ type: String }],

    appliedJobs: [AppliedJobSchema],

    profileViews: { type: Number, default: 0 },
    projectViews: { type: Number, default: 0 },
    adAccess: { type: AdAccessSchema, default: () => ({}) },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, "studentProfile.personal.designation": 1 });
UserSchema.index({ "studentProfile.personal.city": 1 });

// ✅ ESM default export (replaces: module.exports = mongoose.models.User || mongoose.model(...))
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
