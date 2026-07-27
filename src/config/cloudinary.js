// backend/src/config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";

const cloudinaryUrl = process.env.CLOUDINARY_URL        || "";
const cloudName     = process.env.CLOUDINARY_CLOUD_NAME || "";
const apiKey        = process.env.CLOUDINARY_API_KEY    || "";
const apiSecret     = process.env.CLOUDINARY_API_SECRET || "";

// ── Configure ─────────────────────────────────────────────────────────────────
if (cloudinaryUrl) {
  // CLOUDINARY_URL takes priority (format: cloudinary://api_key:api_secret@cloud_name)
  cloudinary.config({ secure: true });
  console.log("☁️  Cloudinary configured via CLOUDINARY_URL");
} else if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    apiKey,
    api_secret: apiSecret,
    secure:     true,
  });
} else {
  console.error("❌ Cloudinary: missing credentials — check your .env file");
  console.error("   Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
}

// ── Connection test with cloud name in log ────────────────────────────────────
const resolvedCloudName = cloudName
  || (cloudinaryUrl.match(/@(.+)$/) || [])[1]  // extract from URL if used
  || "unknown";

cloudinary.api.ping()
  .then(() => {
    console.log(`✅ Cloudinary connected  →  cloud: "${resolvedCloudName}"`);
  })
  .catch((err) => {
    console.error(`❌ Cloudinary connection FAILED  →  cloud: "${resolvedCloudName}"`);
    console.error(`   Reason: ${err?.message || err}`);
    console.error("   Check your CLOUDINARY_CLOUD_NAME, API_KEY, and API_SECRET in .env");
  });

export default cloudinary;