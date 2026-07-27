import mongoose from "mongoose";

const { Schema } = mongoose;

const translationCacheSchema = new Schema(
  {
    sourceHash: { type: String, required: true, index: true },
    sourceText: { type: String, required: true },
    sourceLang: { type: String, required: true, default: "en" },
    targetLang: { type: String, required: true, index: true },
    translatedText: { type: String, required: true },
    provider: { type: String, default: "google-gtx" },
    hits: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

translationCacheSchema.index(
  { sourceHash: 1, sourceLang: 1, targetLang: 1 },
  { unique: true },
);

export default mongoose.model("TranslationCache", translationCacheSchema);

