import { Router } from "express";
import multer from "multer";
import syncUser from "../middleware/syncUser.js";
import {
  uploadAdMedia,
  uploadAdMediaFromUrl,
  uploadCompanyLogo,
  uploadContentImage,
  uploadMessageAttachment,
  uploadResume,
  uploadSocialMedia,
  uploadStudentAvatar,
} from "../controllers/upload.controller.js";
import socialActorOnly from "../middleware/socialActorOnly.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const adMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB for ad creatives like mp4/video files
});

router.post(
  "/resume",
  syncUser("student"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size must be 5MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadResume
);

router.post(
  "/message-attachment",
  syncUser("company"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size must be 5MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadMessageAttachment
);

router.post(
  "/content-image",
  syncUser("admin"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size must be 5MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadContentImage
);

router.post(
  "/company-logo",
  syncUser("company"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size must be 5MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadCompanyLogo
);

router.post(
  "/student-avatar",
  syncUser("student"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size must be 5MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadStudentAvatar
);

router.post(
  "/ad-media",
  syncUser("student"),
  (req, res, next) => {
    adMediaUpload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "Ad media file size must be 25MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadAdMedia
);

router.post("/ad-media/link", syncUser("student"), uploadAdMediaFromUrl);

router.post(
  "/social-media",
  socialActorOnly,
  (req, res, next) => {
    adMediaUpload.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "Social media file size must be 25MB or less" });
        }
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }

      return next(err);
    });
  },
  uploadSocialMedia
);

export default router;
