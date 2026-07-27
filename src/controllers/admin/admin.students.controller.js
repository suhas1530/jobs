// backend/src/controllers/admin/admin.students.controller.js
import mongoose from "mongoose";
import User from "../../models/User.js";
import Application from "../../models/Application.js";

/** Small helper */
function toId(x) {
  try {
    return String(x?._id || x?.id || x || "");
  } catch {
    return "";
  }
}

function safeStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const next = safeStr(value);
    if (next) return next;
  }
  return "";
}

function getStudentAvatar(user = {}) {
  const personal = safeObj(safeObj(user.studentProfile).personal);
  return firstNonEmpty(
    user.avatarUrl,
    user.avatar,
    user.profilePhoto,
    user.profileImageUrl,
    user.imageUrl,
    personal.avatarUrl,
    personal.profileImageUrl,
  );
}

function hasStructuredResume(resume = {}) {
  const doc = safeObj(resume);
  const personal = safeObj(doc.personal);

  return Boolean(
    firstNonEmpty(personal.name, personal.email, personal.phone, doc.summary) ||
      safeArr(doc.education).length ||
      safeArr(doc.skills).length ||
      safeArr(doc.experience).length ||
      safeArr(doc.projects).length ||
      safeArr(doc.certs).length,
  );
}

function buildCompanyName(companyUser = {}) {
  return companyUser?.companyName || companyUser?.name || companyUser?.email || "";
}

function getJobSource(jobDoc = {}) {
  const createdByRole = String(jobDoc?.createdByRole || "").toLowerCase();
  if (jobDoc?.createdByAdmin === true || createdByRole === "admin") return "admin";
  return "company";
}

/**
 * Compute a simple completion score (0-100)
 * Based on studentProfile sections + resumeUrl
 */
function computeCompletion(userDoc) {
  const sp = userDoc?.studentProfile || {};
  const personal = sp.personal || {};
  const education = Array.isArray(sp.education) ? sp.education : [];
  const skills = Array.isArray(sp.skills) ? sp.skills : [];
  const preferred = sp.preferred || {};
  const resumeUrl = userDoc?.resumeUrl || "";

  let score = 0;
  const total = 5;

  // personal complete: at least 3 keys with non-empty values
  const personalFilled = Object.values(personal).filter((v) => String(v || "").trim()).length >= 3;
  if (personalFilled) score += 1;

  if (education.length > 0) score += 1;
  if (skills.length > 0) score += 1;

  const prefFilled =
    String(preferred.stream || "").trim() ||
    String(preferred.category || "").trim() ||
    String(preferred.subCategory || preferred.subcategory || "").trim();
  if (prefFilled) score += 1;

  if (String(resumeUrl).trim()) score += 1;

  return Math.round((score / total) * 100);
}

function normalizeStudent(user, applications = []) {
  const sp = user?.studentProfile || {};
  const preferred = sp.preferred || {};
  const personal = sp.personal || {};

  // experience label
  const experienceLabel =
    sp.fresher === true
      ? "Fresher"
      : Array.isArray(sp.experience) && sp.experience.length
      ? `${sp.experience.length} exp`
      : "";

  // education summary (first item)
  let educationText = "";
  if (Array.isArray(sp.education) && sp.education.length) {
    const e0 = sp.education[0] || {};
    educationText =
      e0.degree ||
      e0.qualification ||
      e0.course ||
      e0.title ||
      (typeof e0 === "string" ? e0 : "");
  }

  // skills normalized for admin UI table/search
  const skills = (Array.isArray(sp.skills) ? sp.skills : [])
    .map((s) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") return String(s.name || s.skill || s.title || "");
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean);

  // status used by frontend: "active" | "suspended"
  const status = user.isActive ? "active" : "suspended";

  // map applications for details page
  const apps = (applications || []).map((a) => ({
    id: toId(a),
    status: a.status,
    date: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "",
    jobTitle: a.job?.title || a.jobTitle || "",
    company: buildCompanyName(safeObj(a.job?.company)) || a.companyName || "",
    category: a.job?.category || "",
    stream: a.job?.stream || "",
    source: getJobSource(a.job),
    sourceLabel: getJobSource(a.job) === "admin" ? "Admin Job" : "Company Job",
  }));

  return {
    id: toId(user),
    clerkId: user.clerkId,
    role: user.role,
    name: user.name || personal.fullName || "",
    email: user.email || "",
    phone: user.phone || personal.phone || "",
    location: user.location || personal.location || "",
    linkedin: user.linkedin || "",
    portfolio: user.portfolio || "",
    resumeUrl: user.resumeUrl || "",
    resumeData: hasStructuredResume(user.resume) ? user.resume : null,
    avatar: getStudentAvatar(user),
    avatarUrl: getStudentAvatar(user),

    status,
    isActive: !!user.isActive,
    registrationDate: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : "",

    completion: computeCompletion(user),

    // For your Students.jsx existing UI keys:
    preferred: {
      stream: preferred.stream || "",
      category: preferred.category || "",
      subCategory: preferred.subCategory || preferred.subcategory || "",
    },

    education: educationText,
    skills,
    experience: experienceLabel,

    // for details + list stats
    applications: apps,
    applicationsCount: apps.length,

    // send full raw studentProfile if you want in details page
    studentProfile: sp,
  };
}

/**
 * GET /api/admin/students
 * Query:
 *  q, status(active|suspended|all), stream, location, page, limit
 */
export async function adminListStudents(req, res) {
  const {
    q = "",
    status = "all",
    stream = "all",
    location = "all",
    page = "1",
    limit = "20",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const match = {
    role: "student",
    deletedAt: null,
  };

  // status filter
  if (String(status).toLowerCase() === "active") match.isActive = true;
  if (String(status).toLowerCase() === "suspended") match.isActive = false;

  // stream filter
  if (stream && stream !== "all") {
    match["studentProfile.preferred.stream"] = stream;
  }

  // location filter
  if (location && location !== "all") {
    match.location = location;
  }

  // search filter
  const queryText = String(q || "").trim();
  if (queryText) {
    const rx = new RegExp(queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }, { location: rx }];
  }

  // We also want applicationsCount
  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "applications",
        localField: "_id",
        foreignField: "student",
        as: "apps",
      },
    },
    {
      $addFields: {
        applicationsCount: { $size: "$apps" },
      },
    },
    {
      $project: {
        apps: 0, // remove big array for list response
      },
    },
    { $skip: skip },
    { $limit: limitNum },
  ];

  const countPipeline = [{ $match: match }, { $count: "total" }];

  const [rowsRaw, countRaw] = await Promise.all([
    User.aggregate(pipeline),
    User.aggregate(countPipeline),
  ]);

  // normalize rows
  const rows = rowsRaw.map((u) => {
    // add fake apps list just for Students.jsx length (use applicationsCount)
    const normalized = normalizeStudent(u, []);
    normalized.applications = new Array(u.applicationsCount || 0).fill({}); // for your existing UI
    return normalized;
  });

  const total = countRaw?.[0]?.total || 0;

  return res.json({
    rows,
    page: pageNum,
    limit: limitNum,
    total,
  });
}

/**
 * GET /api/admin/students/:id
 */
export async function adminGetStudent(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid student id" });
  }

  const student = await User.findOne({ _id: id, role: "student", deletedAt: null }).lean();
  if (!student) return res.status(404).json({ message: "Student not found" });

  // applications list
  const applications = await Application.find({ student: id })
    .sort({ createdAt: -1 })
    .populate({
      path: "job",
      select: "title location stream category company createdByRole createdByAdmin",
      populate: { path: "company", select: "name companyName email" },
    })
    .lean();

  return res.json(normalizeStudent(student, applications));
}

/**
 * PATCH /api/admin/students/:id/status
 * body: { status: "active" | "suspended" }
 */
export async function adminToggleStudentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid student id" });
  }

  const next = String(status || "").toLowerCase();
  if (!["active", "suspended"].includes(next)) {
    return res.status(400).json({ message: "status must be active or suspended" });
  }

  const updated = await User.findOneAndUpdate(
    { _id: id, role: "student", deletedAt: null },
    { $set: { isActive: next === "active" } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) return res.status(404).json({ message: "Student not found" });

  return res.json({
    ok: true,
    student: {
      id: String(updated._id),
      status: updated.isActive ? "active" : "suspended",
      isActive: updated.isActive,
    },
  });
}

/**
 * DELETE /api/admin/students/:id
 * Soft delete
 */
export async function adminDeleteStudent(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid student id" });
  }

  const updated = await User.findOneAndUpdate(
    { _id: id, role: "student", deletedAt: null },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) return res.status(404).json({ message: "Student not found" });

  return res.json({ ok: true, id: String(updated._id) });
}
