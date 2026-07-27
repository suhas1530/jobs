import mongoose from "mongoose";

const adminUserRoleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "AdminRole", required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

adminUserRoleSchema.index({ role: 1, status: 1 });

export default mongoose.model("AdminUserRole", adminUserRoleSchema);
