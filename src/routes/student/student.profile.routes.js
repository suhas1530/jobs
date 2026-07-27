// backend/src/routes/student/student.profile.routes.js
//
// ✅ Place this file at:
//    backend/src/routes/student/student.profile.routes.js
//
// Your app.js already has:
//   import studentProfileRoutes from "./routes/student/student.profile.routes.js"
//   app.use("/api/student", studentProfileRoutes)
//   app.use(requireAuth)   ← global auth, so NO per-route auth needed here
//
// Final API endpoints:
//   GET    /api/student/me
//   PUT    /api/student/me
//   POST   /api/student/upload-resume
//   POST   /api/student/upload-avatar
//   GET    /api/student/follow-suggestions
//   POST   /api/student/follow/:targetUserId
//   GET    /api/student/applied-jobs
//   DELETE /api/student/applied-jobs/:applicationId

import express          from "express";
import multer           from "multer";
import path             from "path";
import fs               from "fs";
import { fileURLToPath } from "url";

import {
  getMe,
  updateMe,
  uploadResumeHandler,
  viewResumeHandler,
  uploadAvatarHandler,
  getFollowSuggestionsHandler,
  getRecentUsersHandler,
  followUserHandler,
  getAppliedJobsHandler,
  withdrawApplicationHandler,
  getPublicProfile,
} from "../../controllers/student/student.profile.controller.js";

const router = express.Router();

// ── Multer: temp disk storage before Cloudinary upload ────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const tmpDir     = path.resolve(__dirname, "../../../tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`),
});

const resumeFilter = (_req, file, cb) => {
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Only PDF, DOC, or DOCX files are allowed"));
};

const imageFilter = (_req, file, cb) =>
  file.mimetype.startsWith("image/")
    ? cb(null, true)
    : cb(new Error("Only image files are allowed"));

const uploadResumeMW = multer({
  storage,
  fileFilter: resumeFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const uploadImageMW = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Routes ─────────────────────────────────────────────────────────────────────
// All routes use /profile/* prefix to avoid conflicts with other student route files
// Final URLs:
//   GET    /api/student/profile/me
//   PUT    /api/student/profile/me
//   POST   /api/student/profile/upload-resume
//   POST   /api/student/profile/upload-avatar
//   GET    /api/student/profile/follow-suggestions
//   POST   /api/student/profile/follow/:targetUserId
//   GET    /api/student/profile/applied-jobs
//   DELETE /api/student/profile/applied-jobs/:applicationId
//   GET    /api/student/profile/view/:userId

router.get   ("/profile/me",                          getMe);
router.put   ("/profile/me",                          updateMe);
router.post  ("/profile/upload-resume",               uploadResumeMW.single("file"), uploadResumeHandler);
router.get   ("/profile/resume/view",                 viewResumeHandler);
router.post  ("/profile/upload-avatar",               uploadImageMW.single("file"),  uploadAvatarHandler);
router.get   ("/profile/follow-suggestions",          getFollowSuggestionsHandler);
router.get   ("/profile/recent-users",                getRecentUsersHandler);
router.post  ("/profile/follow/:targetUserId",        followUserHandler);
router.get   ("/profile/applied-jobs",                getAppliedJobsHandler);
router.delete("/profile/applied-jobs/:applicationId", withdrawApplicationHandler);
router.get   ("/profile/view/:userId",                getPublicProfile);

// ── Multer error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err?.message) return res.status(400).json({ success: false, message: err.message });
  res.status(500).json({ success: false, message: "Server error" });
});

export default router;
