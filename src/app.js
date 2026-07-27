// backend/src/app.js
import express from "express";
import cors from "cors";
import path from "path";
import requireAuth from "./middleware/requireAuth.js";
import errorHandler from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";




// Company
import companyDashboardRoutes from "./routes/company/company.dashboard.routes.js";
import companyApplicationsRoutes from "./routes/company/company.applications.routes.js";
import companyMetaRoutes from "./routes/company/company.meta.routes.js";
import companyJobsRoutes from "./routes/company/company.jobs.routes.js";
import companyInterviewsRoutes from "./routes/company/company.interviews.routes.js";
import companyAIRoutes from "./routes/company/company.ai.routes.js";
import companyShortlistedRoutes from "./routes/company/company.shortlisted.routes.js";
import companyMessagesRoutes from "./routes/company/company.messages.routes.js";
import companyBillingRoutes from "./routes/company/company.billing.routes.js";
import companyNotificationsRoutes from "./routes/company/company.notifications.routes.js";
import companyBoostRoutes from "./routes/company/company.boost.routes.js";
import companySettingsRoutes from "./routes/company/company.settings.routes.js";
import companyProfileRoutes from "./routes/company/company.profile.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";

// Student
import studentMetaRoutes from "./routes/student/student.meta.routes.js";
import studentHomeRoutes from "./routes/student/student.home.routes.js";
import studentJobsRoutes from "./routes/student/student.jobs.routes.js";
import studentInternshipsRoutes from "./routes/student/student.internships.routes.js";
import studentGovernmentRoutes from "./routes/student/student.government.routes.js";
import studentProfileRoutes from "./routes/student/student.profile.routes.js";
import studentMessagesRoutes from "./routes/student/student.messages.routes.js";
import studentNotificationsRoutes from "./routes/student/student.notifications.routes.js";
import studentSettingsRoutes from "./routes/student/student.settings.routes.js";
import studentInterviewsRoutes from "./routes/student/student.interviews.routes.js";
import studentAdsRoutes from "./routes/student/student.ads.routes.js";

// Admin
import adminDashboardRoutes from "./routes/admin/admin.dashboard.routes.js";
import adminAuthRoutes from "./routes/admin/admin.auth.routes.js";
import adminCompaniesRoutes from "./routes/admin/admin.companies.routes.js";
import adminJobsRoutes from "./routes/admin/admin.jobs.routes.js";
import adminApplicantsRoutes from "./routes/admin/admin.applicants.routes.js";
import adminStudentsRoutes from "./routes/admin/admin.students.routes.js";
import adminPlansRoutes from "./routes/admin/admin.plans.routes.js";
import adminContentRoutes from "./routes/admin/admin.content.routes.js";
import adminGovernmentRoutes from "./routes/admin/admin.government.routes.js";
import adminRolesRoutes from "./routes/admin/admin.roles.routes.js";
import adminNotificationsRoutes from "./routes/admin/admin.notifications.routes.js";
import adminSettingsRoutes from "./routes/admin/admin.settings.routes.js";
import adminProfileRoutes from "./routes/admin/admin.profile.routes.js";
import adminInterviewsRoutes from "./routes/admin/admin.interviews.routes.js";
import adminAdsRoutes from "./routes/admin/admin.ads.routes.js";
import contentRoutes from "./routes/content.routes.js";

// Uploads
import uploadsRoutes from "./routes/uploads.routes.js";
import preferencesRoutes from "./routes/preferences.routes.js";
import socialRoutes from "./routes/social.routes.js";
import { resolveUploadedFilePath } from "./utils/uploadPaths.js";

const app = express();

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https:\/\/job-gateway(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(String(origin).trim());
}

const allowedOrigins = [
  ...new Set([
    "http://localhost:5173",
    ...String(process.env.CLIENT_URL || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]),
];

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

// Serve uploaded files publicly from stable and legacy upload directories.
app.use("/uploads", (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    return res.sendStatus(405);
  }

  const filePath = resolveUploadedFilePath(req.path);
  if (!filePath) {
    return res.status(404).type("text/plain").send(`Upload not found: ${req.path}`);
  }

  return res.sendFile(filePath, (err) => {
    if (err) next(err);
  });
});

// Public content endpoints (About/Contact/Home sections) must be accessible without auth
app.use("/api/content", contentRoutes);
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/admin", adminAuthRoutes);

// ✅ Clerk middleware (global) — must be BEFORE routes
app.use(requireAuth);

// Company routes
app.use("/api/auth", authRoutes);
app.use("/api/company", companyDashboardRoutes);
app.use("/api/company", companyApplicationsRoutes);
app.use("/api/company", companyMetaRoutes);
app.use("/api/company", companyJobsRoutes);
app.use("/api/company", companyInterviewsRoutes);
app.use("/api/company", companyShortlistedRoutes);
app.use("/api/company", companyAIRoutes);
app.use("/api/company/billing", companyBillingRoutes);
app.use("/api/company/messages", companyMessagesRoutes);
app.use("/api/company", companyBoostRoutes);
app.use("/api/company/profile", companyProfileRoutes);
app.use("/api/company/notifications", companyNotificationsRoutes);
app.use("/api/company/settings", companySettingsRoutes);
app.use("/api", chatbotRoutes);

// Student routes
app.use("/api/student", studentHomeRoutes);
app.use("/api/student", studentJobsRoutes);
app.use("/api/student", studentInternshipsRoutes);
app.use("/api/student", studentGovernmentRoutes);
app.use("/api/student", studentProfileRoutes);
app.use("/api/student", studentMetaRoutes);
app.use("/api/student", studentMessagesRoutes);
app.use("/api/student", studentNotificationsRoutes);
app.use("/api/student", studentSettingsRoutes);
app.use("/api/student", studentInterviewsRoutes);
app.use("/api/student", studentAdsRoutes);

// Admin routes
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/admin", adminCompaniesRoutes);
app.use("/api/admin", adminJobsRoutes);
app.use("/api/admin", adminApplicantsRoutes);
app.use("/api/admin", adminStudentsRoutes);
app.use("/api/admin", adminPlansRoutes);
app.use("/api/admin", adminContentRoutes);
app.use("/api/admin", adminGovernmentRoutes);
app.use("/api/admin", adminRolesRoutes);
app.use("/api/admin", adminNotificationsRoutes);
app.use("/api/admin", adminSettingsRoutes);
app.use("/api/admin", adminProfileRoutes);
app.use("/api/admin", adminInterviewsRoutes);
app.use("/api/admin", adminAdsRoutes);

// ✅ Upload routes
app.use("/api/upload", uploadsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/social", socialRoutes);




app.use(express.static(distPath));

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    return res.sendFile(path.join(distPath, "index.html"));
  }
});



app.use(errorHandler);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

export default app;
