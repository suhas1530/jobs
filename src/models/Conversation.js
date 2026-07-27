import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: { type: String, required: true, trim: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
);

const jobDraftSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    stream: { type: String, default: "" },
    category: { type: String, default: "" },
    subCategory: { type: String, default: "" },
    location: { type: String, default: "" },
    salaryMin: { type: Number, default: null },
    salaryMax: { type: Number, default: null },
    experience: { type: String, default: "" },
    jobType: { type: String, default: "" },
    openings: { type: Number, default: 1 },
    description: { type: String, default: "" },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, unique: true, index: true },
    clerkId: { type: String, required: true, index: true },
    role: { type: String, default: "user" },
    mode: { type: String, enum: ["chat", "job_post"], default: "chat" },
    messages: { type: [messageSchema], default: [] },
    jobDraft: { type: jobDraftSchema, default: () => ({}) },
    status: { type: String, enum: ["draft", "awaiting_confirm", "posted"], default: "draft" },
  },
  { timestamps: true }
);

conversationSchema.index({ clerkId: 1, updatedAt: -1 });

export default mongoose.model("Conversation", conversationSchema);
