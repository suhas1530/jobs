// // backend/src/routes/student/student.notifications.routes.js
// import { Router } from "express";
// import studentOnly from "../../middleware/studentOnly.js";
// import {
//   listStudentNotifications,
//   markAllRead,
//   toggleRead,
//   getNotificationPrefs,
//   saveNotificationPrefs,
//   seedNotifications,
// } from "../../controllers/student/student.notifications.controller.js";

// const router = Router();

// // list
// router.get("/notifications", studentOnly, listStudentNotifications);

// // mark all read
// router.post("/notifications/mark-all-read", studentOnly, markAllRead);

// // toggle read/unread
// router.patch("/notifications/:id/toggle", studentOnly, toggleRead);

// // preferences
// router.get("/notifications/preferences", studentOnly, getNotificationPrefs);
// router.put("/notifications/preferences", studentOnly, saveNotificationPrefs);

// // optional seed
// router.post("/notifications/seed", studentOnly, seedNotifications);

// export default router;


////////////////////////////////////////////////////////////////////////////////////


// // backend/routes/notificationRoutes.js
// const express = require("express");
// const router  = express.Router();
// const auth    = require("../middleware/auth");   // your existing JWT auth middleware
// const ctrl    = require("../controllers/student.notifications.controller");

// /*
//  * Mount this router in your server.js / app.js:
//  *
//  *   const studentNotificationRoutes = require("./routes/student.notifications.routes");
//  *   app.use("/api/student/notifications", studentNotificationRoutes);
//  */

// // ── Notifications ──────────────────────────────────────────────────────────
// // GET    /api/student/notifications               list + filter + search
// // POST   /api/student/notifications/mark-all-read mark everything Read
// // PATCH  /api/student/notifications/:id/toggle    toggle Read ↔ Unread

// router.get   ("/",                   auth, ctrl.listNotifications);
// router.post  ("/mark-all-read",      auth, ctrl.markAllRead);
// router.patch ("/:id/toggle",         auth, ctrl.toggleRead);

// // ── Preferences ───────────────────────────────────────────────────────────
// // GET  /api/student/notifications/prefs
// // PUT  /api/student/notifications/prefs

// router.get   ("/prefs",              auth, ctrl.getPrefs);
// router.put   ("/prefs",              auth, ctrl.savePrefs);

// // ── Profile stats (real counts) ───────────────────────────────────────────
// // GET  /api/student/notifications/profile-stats

// router.get   ("/profile-stats",      auth, ctrl.profileStats);

// // ── Sidebar suggestions ───────────────────────────────────────────────────
// // GET  /api/student/notifications/suggestions/people     real students
// // GET  /api/student/notifications/suggestions/companies  real companies

// router.get   ("/suggestions/people",    auth, ctrl.peopleSuggestions);
// router.get   ("/suggestions/companies", auth, ctrl.companySuggestions);

// // ── Follow / Unfollow ─────────────────────────────────────────────────────
// // POST   /api/student/notifications/follow/:targetId
// // DELETE /api/student/notifications/follow/:targetId

// router.post  ("/follow/:targetId",   auth, ctrl.follow);
// router.delete("/follow/:targetId",   auth, ctrl.unfollow);

// module.exports = router;

///////////////////////////////////////////////////////////////////////////////////////////////

// backend/src/routes/student/student.notifications.routes.js
import { Router } from "express";
import studentOnly from "../../middleware/studentOnly.js";
import {
  listStudentNotifications,
  markAllRead,
  toggleRead,
  getNotificationPrefs,
  saveNotificationPrefs,
  seedNotifications,
  getProfileStats,
  peopleSuggestions,
  companySuggestions,
  follow,
  unfollow,
} from "../../controllers/student/student.notifications.controller.js";

const router = Router();

/*
 * Mount in your server.js:
 *   import studentNotifRoutes from "./routes/student/student.notifications.routes.js";
 *   app.use("/api/student", studentNotifRoutes);
 *
 * Routes:
 *   GET    /api/student/notifications
 *   POST   /api/student/notifications/mark-all-read
 *   PATCH  /api/student/notifications/:id/toggle
 *   GET    /api/student/notifications/preferences
 *   PUT    /api/student/notifications/preferences
 *   POST   /api/student/notifications/seed
 *   GET    /api/student/notifications/profile-stats
 *   GET    /api/student/notifications/suggestions/people
 *   GET    /api/student/notifications/suggestions/companies
 *   POST   /api/student/notifications/follow/:targetId
 *   DELETE /api/student/notifications/follow/:targetId
 */

// ── Core (same as your old routes) ────────────────────────────────────────
router.get    ("/notifications",               studentOnly, listStudentNotifications);
router.post   ("/notifications/mark-all-read", studentOnly, markAllRead);
router.patch  ("/notifications/:id/toggle",    studentOnly, toggleRead);

// ── Preferences (same as your old routes) ─────────────────────────────────
router.get    ("/notifications/preferences",   studentOnly, getNotificationPrefs);
router.put    ("/notifications/preferences",   studentOnly, saveNotificationPrefs);

// ── Seed (same as your old route) ─────────────────────────────────────────
router.post   ("/notifications/seed",          studentOnly, seedNotifications);

// ── New real-data routes ───────────────────────────────────────────────────
router.get    ("/notifications/profile-stats",         studentOnly, getProfileStats);
router.get    ("/notifications/suggestions/people",    studentOnly, peopleSuggestions);
router.get    ("/notifications/suggestions/companies", studentOnly, companySuggestions);
router.post   ("/notifications/follow/:targetId",      studentOnly, follow);
router.delete ("/notifications/follow/:targetId",      studentOnly, unfollow);

export default router;
