// backend/src/controllers/upload.controller.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import User from "../models/User.js";
import { uploadBufferToCloudinary, uploadRemoteUrlToCloudinary } from "../utils/cloudinaryUpload.js";
import { getPrimaryResumeUploadsDir } from "../utils/uploadPaths.js";

// ---------- helpers ----------
function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}
function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

// ✅ Fix 1: normalizeSkillCount supports more separators
function normalizeSkillCount(skills = []) {
  return safeArr(skills)
    .flatMap((s) =>
      String(typeof s === "string" ? s : s?.name || s?.skill || "").split(
        /[\n,;/|]+/g,
      ),
    )
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function hasValidEducation(education = []) {
  return safeArr(education).some((e) => e?.degree && e?.college && e?.year);
}

function calcProfileCompletion(studentProfile, resumeUrl, resumeDoc = {}) {
  const p = safeObj(studentProfile);

  const personal = safeObj(p.personal);
  const education = safeArr(p.education);
  const skills = safeArr(p.skills);
  const experience = safeArr(p.experience);
  const preferred = safeObj(p.preferred);

  const resume = safeObj(resumeDoc);
  const resumeSectionsFilled =
    Boolean(safeObj(resume.personal).name || safeObj(resume.personal).email) ||
    safeArr(resume.education).length > 0 ||
    safeArr(resume.skills).length > 0 ||
    safeArr(resume.experience).length > 0;

  const checks = {
    personal: !!(personal.fullName && personal.phone && personal.city && personal.state),
    education: hasValidEducation(education),
    skills: normalizeSkillCount(skills) >= 2,
    experience: p.fresher === true || experience.some((e) => e.company && e.role),
    resume: !!(
      p.resumeMeta?.fileName ||
      p.resumeMeta?.updatedAt ||
      resumeUrl ||
      resumeSectionsFilled
    ),
    preferred: !!(preferred.stream && preferred.category && preferred.locations),
  };

  const total = Object.keys(checks).length;
  const done = Object.values(checks).filter(Boolean).length;
  return Math.round((done / total) * 100);
}

// ---------- controller ----------
export const uploadResume = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "File is required" });

    const ext = (path.extname(file.originalname || "") || "").toLowerCase();
    const allowed = [".pdf", ".doc", ".docx"];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ message: "Only PDF, DOC, DOCX allowed" });
    }

    // Ensure upload dir exists
    const baseDir = getPrimaryResumeUploadsDir();
    fs.mkdirSync(baseDir, { recursive: true });

    // unique file name
    const rand = crypto.randomBytes(8).toString("hex");
    const filename = `resume_${req.user._id}_${Date.now()}_${rand}${ext}`;
    const absPath = path.join(baseDir, filename);

    // write file
    fs.writeFileSync(absPath, file.buffer);

    // public url (served by express static)
    const resumeUrl = `/uploads/resumes/${filename}`;

    const resumeMeta = {
      fileName: file.originalname,
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      updatedAt: new Date().toISOString(),
    };

    const existing = await User.findById(req.user._id).lean();
    if (!existing) return res.status(404).json({ message: "Student not found" });

    const oldSp = safeObj(existing.studentProfile);

    const patch = {
      resumeUrl,
      studentProfile: {
        ...oldSp,
        resumeMeta: {
          ...safeObj(oldSp.resumeMeta),
          ...resumeMeta,
        },
      },
    };

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: patch },
      { returnDocument: "after" },
    ).lean();

    // ✅ Fix 2: ensure updated exists
    if (!updated) return res.status(500).json({ message: "Failed to update resume" });

    const profileCompletion = calcProfileCompletion(
      updated.studentProfile,
      updated.resumeUrl,
      updated.resume,
    );

    return res.json({
      ok: true,
      resumeUrl: updated.resumeUrl,
      resumeMeta: updated.studentProfile?.resumeMeta || resumeMeta,
      profileCompletion,
    });
  } catch (err) {
    next(err);
  }
};

export const uploadMessageAttachment = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "File is required" });

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/messages",
      resource_type: "auto",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      fileUrl: result?.secure_url || "",
      fileName: file.originalname || result?.original_filename || "attachment",
      fileSize: `${Math.max(1, Math.round((file.size || result?.bytes || 0) / 1024))} KB`,
      mimeType: file.mimetype || "",
      publicId: result?.public_id || "",
      resourceType: result?.resource_type || "",
    });
  } catch (err) {
    next(err);
  }
};

export const uploadContentImage = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Image file is required" });

    if (!String(file.mimetype || "").startsWith("image/")) {
      return res.status(400).json({ message: "Only image files are allowed" });
    }

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/content",
      resource_type: "image",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      imageUrl: result?.secure_url || "",
      fileName: file.originalname || result?.original_filename || "image",
      publicId: result?.public_id || "",
      mimeType: file.mimetype || "",
      width: Number(result?.width || 0),
      height: Number(result?.height || 0),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadCompanyLogo = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Image file is required" });

    if (!String(file.mimetype || "").startsWith("image/")) {
      return res.status(400).json({ message: "Only image files are allowed" });
    }

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/company-logos",
      resource_type: "image",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      imageUrl: result?.secure_url || "",
      logoUrl: result?.secure_url || "",
      fileName: file.originalname || result?.original_filename || "company-logo",
      publicId: result?.public_id || "",
      mimeType: file.mimetype || "",
      width: Number(result?.width || 0),
      height: Number(result?.height || 0),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadStudentAvatar = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Image file is required" });

    if (!String(file.mimetype || "").startsWith("image/")) {
      return res.status(400).json({ message: "Only image files are allowed" });
    }

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/student-avatars",
      resource_type: "image",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    const avatarUrl = result?.secure_url || "";
    if (!avatarUrl) return res.status(500).json({ message: "Upload did not return an image URL" });

    await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          avatarUrl,
          avatar: avatarUrl,
          profilePhoto: avatarUrl,
          profileImageUrl: avatarUrl,
          imageUrl: avatarUrl,
          "studentProfile.personal.avatarUrl": avatarUrl,
          "studentProfile.personal.profileImageUrl": avatarUrl,
        },
      },
      { returnDocument: "after" },
    ).lean();

    return res.json({
      ok: true,
      avatarUrl,
      imageUrl: avatarUrl,
      profileImageUrl: avatarUrl,
      fileName: file.originalname || result?.original_filename || "student-avatar",
      publicId: result?.public_id || "",
      mimeType: file.mimetype || "",
      width: Number(result?.width || 0),
      height: Number(result?.height || 0),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadAdMedia = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Media file is required" });

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/ads",
      resource_type: "auto",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      mediaUrl: result?.secure_url || "",
      fileName: file.originalname || result?.original_filename || "ad-media",
      publicId: result?.public_id || "",
      mimeType: file.mimetype || "",
      resourceType: result?.resource_type || "",
      bytes: Number(result?.bytes || file.size || 0),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadAdMediaFromUrl = async (req, res, next) => {
  try {
    const remoteUrl = String(req.body?.url || "").trim();
    if (!remoteUrl) return res.status(400).json({ message: "Media URL is required" });

    const result = await uploadRemoteUrlToCloudinary(remoteUrl, {
      folder: "jobgateway/ads",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      mediaUrl: result?.secure_url || "",
      fileName: result?.original_filename || "ad-media",
      publicId: result?.public_id || "",
      resourceType: result?.resource_type || "",
      bytes: Number(result?.bytes || 0),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadSocialMedia = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Media file is required" });

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "jobgateway/social",
      resource_type: "auto",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return res.json({
      ok: true,
      mediaUrl: result?.secure_url || "",
      fileName: file.originalname || result?.original_filename || "social-media",
      publicId: result?.public_id || "",
      mimeType: file.mimetype || "",
      resourceType: result?.resource_type || "",
      bytes: Number(result?.bytes || file.size || 0),
    });
  } catch (err) {
    next(err);
  }
};
