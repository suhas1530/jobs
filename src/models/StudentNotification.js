// // // backend/src/models/StudentNotification.js
// // import mongoose from "mongoose";

// // const studentNotificationSchema = new mongoose.Schema(
// //   {
// //     studentId: {
// //       type: mongoose.Schema.Types.ObjectId,
// //       ref: "User", // student is also User in your app
// //       required: true,
// //       index: true,
// //     },

// //     // Applications | Jobs | Messages | System
// //     type: { type: String, default: "System", index: true },

// //     title: { type: String, required: true },
// //     description: { type: String, default: "" },

// //     // UI helpers
// //     icon: {
// //       type: String,
// //       enum: ["application", "shortlisted", "hold", "rejected", "job", "message", "system"],
// //       default: "system",
// //     },

// //     actions: { type: [String], default: [] }, // ["View Application", "Reply", "View Job", ...]
// //     meta: { type: Object, default: {} }, // { jobId, applicationId, conversationId, url ... }

// //     read: { type: Boolean, default: false, index: true },
// //   },
// //   { timestamps: true }
// // );

// // studentNotificationSchema.index({ studentId: 1, createdAt: -1 });

// // export default mongoose.model("StudentNotification", studentNotificationSchema);


// /////////////////////////////////////////////////////////////////////

// // backend/models/notificationModel.js
// const mongoose = require("mongoose");

// /* ─── Notification ─────────────────────────────────────────────────────────── */
// const NotificationSchema = new mongoose.Schema(
//   {
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       index: true,
//     },
//     title:       { type: String, required: true },
//     description: { type: String, default: "" },
//     // icon drives the avatar color: job|application|shortlisted|hold|rejected|message|system
//     icon:        { type: String, default: "system" },
//     type:        { type: String, default: "system" },
//     status:      { type: String, enum: ["Unread", "Read"], default: "Unread", index: true },
//     // human-readable relative time e.g. "2h ago" — set by the creator
//     time:        { type: String, default: "" },
//     avatar:      { type: String, default: null },
//     senderName:  { type: String, default: "" },
//     // action button labels: ["View Job", "Save Job"] etc.
//     actions:     [{ type: String }],
//     // arbitrary extra data: jobId, conversationId, url …
//     meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
//   },
//   { timestamps: true }
// );

// /* ─── NotificationPrefs ────────────────────────────────────────────────────── */
// const NotificationPrefsSchema = new mongoose.Schema(
//   {
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       unique: true,
//       index: true,
//     },
//     // In-App toggles
//     appStatus:        { type: Boolean, default: true  },
//     employerMessages: { type: Boolean, default: true  },
//     jobRecs:          { type: Boolean, default: true  },
//     govUpdates:       { type: Boolean, default: true  },
//     internshipAlerts: { type: Boolean, default: true  },
//     announcements:    { type: Boolean, default: true  },
//     // Email toggles
//     emailStatus:      { type: Boolean, default: true  },
//     emailJobs:        { type: Boolean, default: true  },
//     emailMessages:    { type: Boolean, default: true  },
//     weeklyDigest:     { type: Boolean, default: false },
//     // Other channels
//     whatsapp:         { type: Boolean, default: false },
//     sms:              { type: Boolean, default: false },
//     frequency: {
//       type: String,
//       default: "Instant",
//       enum: ["Instant", "Daily summary", "Weekly summary"],
//     },
//   },
//   { timestamps: true }
// );

// const Notification      = mongoose.models.Notification      || mongoose.model("Notification",      NotificationSchema);
// const NotificationPrefs = mongoose.models.NotificationPrefs || mongoose.model("NotificationPrefs", NotificationPrefsSchema);

// module.exports = { Notification, NotificationPrefs };

/////////////////////////////////////////////////////////////////



// backend/src/models/StudentNotification.js
import mongoose from "mongoose";

/* ─── StudentNotification ──────────────────────────────────────────────────── */
const studentNotificationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Applications | Jobs | Messages | System
    type: { type: String, default: "System", index: true },

    title:       { type: String, required: true },
    description: { type: String, default: "" },

    // UI helpers
    icon: {
      type: String,
      enum: ["application", "shortlisted", "hold", "rejected", "job", "message", "system"],
      default: "system",
    },

    avatar:     { type: String, default: null },
    senderName: { type: String, default: "" },

    actions: { type: [String], default: [] }, // ["View Application", "Reply", "View Job", ...]
    meta:    { type: Object,   default: {} }, // { jobId, applicationId, conversationId, url ... }

    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

studentNotificationSchema.index({ studentId: 1, createdAt: -1 });

/* ─── NotificationPrefs ────────────────────────────────────────────────────── */
const notificationPrefsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    appStatus:        { type: Boolean, default: true  },
    employerMessages: { type: Boolean, default: true  },
    jobRecs:          { type: Boolean, default: true  },
    govUpdates:       { type: Boolean, default: true  },
    internshipAlerts: { type: Boolean, default: true  },
    announcements:    { type: Boolean, default: true  },
    emailStatus:      { type: Boolean, default: true  },
    emailJobs:        { type: Boolean, default: true  },
    emailMessages:    { type: Boolean, default: true  },
    weeklyDigest:     { type: Boolean, default: false },
    whatsapp:         { type: Boolean, default: false },
    sms:              { type: Boolean, default: false },
    frequency: {
      type: String,
      default: "Instant",
      enum: ["Instant", "Daily summary", "Weekly summary"],
    },
  },
  { timestamps: true }
);

const StudentNotification = mongoose.models.StudentNotification ||
  mongoose.model("StudentNotification", studentNotificationSchema);

const NotificationPrefs = mongoose.models.NotificationPrefs ||
  mongoose.model("NotificationPrefs", notificationPrefsSchema);

// default export = StudentNotification  (so existing files like company.applications.controller.js keep working)
export default StudentNotification;

// named export for the controller which needs both
export { StudentNotification, NotificationPrefs };
