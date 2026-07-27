import mongoose from "mongoose";

const socialFollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

socialFollowSchema.index({ follower: 1, following: 1 }, { unique: true });

export default mongoose.model("SocialFollow", socialFollowSchema);
