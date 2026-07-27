// // frontend/src/services/studentService.js
// // ✅ SELECT ALL in your file → DELETE → PASTE THIS ENTIRE FILE
// // This is a FRONTEND file — no express, no mongoose, no backend imports ever.
// // Uses your project's existing api instance from "./api.js"

// import api from "./api.js";

// const authConfig = (token, extra = {}) => ({
//   ...extra,
//   ...(token
//     ? { headers: { ...(extra.headers || {}), Authorization: `Bearer ${token}` } }
//     : {}),
// });

// // ─── EXISTING EXPORTS (unchanged) ────────────────────────────────────────────

// export const studentHome = async () => api.get("/student/home");

// export const studentSearchJobs = async (params = {}) =>
//   api.get("/student/jobs", { params });

// export const studentApplyJob = async (jobOrPayload = {}) => {
//   const id =
//     typeof jobOrPayload === "string"
//       ? jobOrPayload
//       : jobOrPayload?.id || jobOrPayload?._id;
//   if (!id) throw new Error("Job id is required to apply");
//   return api.post(`/student/jobs/${id}/apply`);
// };

// export const studentGetSavedJobs = async () =>
//   api.get("/student/me/saved-jobs");

// export const studentListSavedJobs = async (params = {}) =>
//   api.get("/student/me/saved-jobs", { params: { ...params, withMeta: 1 } });

// export const studentToggleSaveJob = async (jobId) => {
//   if (!jobId) throw new Error("Job id is required");
//   return api.post(`/student/jobs/${jobId}/save`);
// };

// export const studentMe = async (token) =>
//   api.get("/student/profile/me", authConfig(token));

// export const studentUpdateProfile = async (payload = {}, token) =>
//   api.put("/student/profile/me", payload, authConfig(token));

// export const studentMyApplications = async (params = {}) =>
//   api.get("/student/me/applications", { params });

// export const studentGetResume = async () =>
//   api.get("/student/me/resume");

// export const studentSaveResume = async (payload = {}) =>
//   api.put("/student/me/resume", payload);

// export const studentDownloadResumePDF = async () =>
//   api.get("/student/me/resume/pdf", { responseType: "blob" });

// export const studentGetSettings = async () =>
//   api.get("/student/settings");

// export const studentSaveSettings = async (payload = {}) =>
//   api.put("/student/settings", payload);

// export const studentDeleteAccount = async () =>
//   api.delete("/student/settings");

// export const studentListGovernmentJobs = async (params = {}) =>
//   api.get("/student/government", { params });

// export const studentGetGovernmentJobDetails = async (id) => {
//   if (!id) throw new Error("Government job id is required");
//   return api.get(`/student/government/${id}`);
// };

// export const studentListConversations = async () =>
//   api.get("/student/conversations");

// export const studentGetConversationMessages = async (conversationId) => {
//   if (!conversationId) throw new Error("Conversation id is required");
//   return api.get(`/student/conversations/${conversationId}/messages`);
// };

// export const studentSendConversationMessage = async (conversationId, payload = {}) => {
//   if (!conversationId) throw new Error("Conversation id is required");
//   return api.post(`/student/conversations/${conversationId}/messages`, payload);
// };

// export const studentReportConversationSpam = async (conversationId, payload = {}) => {
//   if (!conversationId) throw new Error("Conversation id is required");
//   return api.post(`/student/conversations/${conversationId}/spam-report`, payload);
// };

// export const studentListNotifications = async (params = {}) =>
//   api.get("/student/notifications", { params });

// export const studentMarkAllNotificationsRead = async () =>
//   api.post("/student/notifications/mark-all-read");

// export const studentToggleNotificationRead = async (notificationId) => {
//   if (!notificationId) throw new Error("Notification id is required");
//   return api.patch(`/student/notifications/${notificationId}/toggle`);
// };

// export const studentGetNotificationPrefs = async () =>
//   api.get("/student/notifications/preferences");

// export const studentSaveNotificationPrefs = async (payload = {}) =>
//   api.put("/student/notifications/preferences", payload);

// // ─── NEW EXPORTS — required by Profile.jsx ────────────────────────────────────

// // Upload resume PDF/DOC/DOCX — field name must be "file"
// export const uploadResume = async (file, token) => {
//   const fd = new FormData();
//   fd.append("file", file);
//   return api.post(
//     "/student/profile/upload-resume",
//     fd,
//     authConfig(token, { headers: { "Content-Type": "multipart/form-data" } })
//   );
// };

// // Upload profile avatar image — field name must be "file"
// export const uploadAvatar = async (file, token) => {
//   const fd = new FormData();
//   fd.append("file", file);
//   return api.post(
//     "/student/profile/upload-avatar",
//     fd,
//     authConfig(token, { headers: { "Content-Type": "multipart/form-data" } })
//   );
// };

// // Get real follow suggestions from DB (scored by shared skills / city / designation)
// export const getFollowSuggestions = async (token) =>
//   api.get("/student/profile/follow-suggestions", authConfig(token));

// // Toggle follow / unfollow another user
// export const toggleFollow = async (targetUserId, token) => {
//   if (!targetUserId) throw new Error("targetUserId is required");
//   return api.post(`/student/profile/follow/${targetUserId}`, {}, authConfig(token));
// };

// // Get all jobs the student has applied to
// export const getAppliedJobs = async (token) =>
//   api.get("/student/profile/applied-jobs", authConfig(token));

// // Withdraw a job application by applicationId
// export const withdrawApplication = async (applicationId, token) => {
//   if (!applicationId) throw new Error("applicationId is required");
//   return api.delete(`/student/profile/applied-jobs/${applicationId}`, authConfig(token));
// };


// export const getRecentUsers = async (token) => ({
//   data: { data: [] }
// });

/////////////////////////////////////////////////////////////////////////////////////////////////////////



