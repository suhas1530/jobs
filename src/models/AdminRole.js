import mongoose from "mongoose";

const adminRoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "", trim: true },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);


export default mongoose.model("AdminRole", adminRoleSchema);


