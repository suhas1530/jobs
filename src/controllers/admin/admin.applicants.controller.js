import mongoose from "mongoose";
import Application from "../../models/Application.js";

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

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return item.split(/[\n,;/|]+/g);
        if (item && typeof item === "object") {
          return String(item.name || item.skill || item.title || "").split(/[\n,;/|]+/g);
        }
        return [];
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;/|]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatEducationItem(item) {
  if (typeof item === "string") return item.trim();

  const row = safeObj(item);
  const degree = firstNonEmpty(row.degree, row.qualification, row.course, row.title, row.fieldOfStudy, row.branch);
  const college = firstNonEmpty(row.college, row.institution, row.school, row.university);

  if (degree && college) return `${degree} - ${college}`;
  return degree || college;
}

function formatExperienceItem(item) {
  if (typeof item === "string") return item.trim();

  const row = safeObj(item);
  const role = firstNonEmpty(row.role, row.title, row.position, row.designation);
  const company = firstNonEmpty(row.company, row.organization, row.employer);

  if (role && company) return `${role} at ${company}`;
  return role || company || "";
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

function normalizeStudentName(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const resumePersonal = safeObj(safeObj(student.resume).personal);

  return firstNonEmpty(student.name, student.fullName, personal.fullName, resumePersonal.name);
}

function normalizeStudentEmail(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const resumePersonal = safeObj(safeObj(student.resume).personal);

  return firstNonEmpty(student.email, personal.email, resumePersonal.email);
}

function normalizeStudentPhone(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const resumePersonal = safeObj(safeObj(student.resume).personal);

  return firstNonEmpty(student.phone, personal.phone, resumePersonal.phone);
}

function normalizeStudentLocation(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const resumePersonal = safeObj(safeObj(student.resume).personal);

  return firstNonEmpty(
    student.location,
    personal.location,
    resumePersonal.location,
    [safeStr(personal.city), safeStr(personal.state)].filter(Boolean).join(", "),
  );
}

function normalizeStudentEducation(student = {}) {
  const topLevel = firstNonEmpty(student.education, student.degree);
  if (topLevel) return topLevel;

  const profile = safeObj(student.studentProfile);
  const resume = safeObj(student.resume);

  return formatEducationItem(safeArr(profile.education)[0]) || formatEducationItem(safeArr(resume.education)[0]);
}

function normalizeStudentExperience(student = {}) {
  const topLevel = firstNonEmpty(student.experience, student.experienceText);
  if (topLevel) return topLevel;

  const profile = safeObj(student.studentProfile);
  if (profile.fresher === true) return "Fresher";

  const profileExperience = safeArr(profile.experience);
  const resumeExperience = safeArr(safeObj(student.resume).experience);
  const source = profileExperience.length ? profileExperience : resumeExperience;

  return (
    formatExperienceItem(source[0]) ||
    (source.length ? `${source.length} experience item${source.length === 1 ? "" : "s"}` : "")
  );
}

function normalizeStudentSkills(student = {}) {
  const profile = safeObj(student.studentProfile);
  const resume = safeObj(student.resume);

  return Array.from(
    new Set([
      ...toStringList(student.skills),
      ...toStringList(profile.skills),
      ...toStringList(resume.skills),
    ]),
  );
}

function normalizeStudentAvatar(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  return firstNonEmpty(
    student.avatarUrl,
    student.avatar,
    student.profilePhoto,
    student.profileImageUrl,
    student.imageUrl,
    personal.avatarUrl,
    personal.profileImageUrl,
  );
}

function hasValidEducation(education = []) {
  return safeArr(education).some((item) => {
    if (typeof item === "string") return Boolean(item.trim());
    const row = safeObj(item);
    return Boolean(firstNonEmpty(row.degree, row.qualification, row.course, row.title, row.college, row.institution, row.school));
  });
}

function hasExperienceEntry(experience = []) {
  return safeArr(experience).some((item) => Boolean(formatExperienceItem(item)));
}

function calcProfileCompletion(student = {}) {
  const profile = safeObj(student.studentProfile);
  const personal = safeObj(profile.personal);
  const preferred = safeObj(profile.preferred);
  const resume = safeObj(student.resume);

  const checks = {
    personal: Boolean(
      normalizeStudentName(student) &&
        normalizeStudentPhone(student) &&
        normalizeStudentLocation(student) &&
        safeStr(personal.state),
    ),
    education: hasValidEducation(safeArr(profile.education).length ? profile.education : safeArr(resume.education)),
    skills: normalizeStudentSkills(student).length >= 2,
    experience: profile.fresher === true || hasExperienceEntry(profile.experience) || hasExperienceEntry(resume.experience),
    resume: Boolean(safeStr(student.resumeUrl) || hasStructuredResume(resume)),
    preferred: Boolean(safeStr(preferred.stream) && safeStr(preferred.category) && safeArr(preferred.locations).length),
  };

  const total = Object.keys(checks).length;
  const done = Object.values(checks).filter(Boolean).length;
  return Math.round((done / total) * 100);
}

function getStudentResumeData(student = {}) {
  const resume = safeObj(student.resume);
  return hasStructuredResume(resume) ? resume : null;
}

function assertAdmin(req) {
  const roleFromReqUser = req.user?.role;
  const claims = req.auth()?.sessionClaims || {};
  const roleFromClerk =
    claims?.publicMetadata?.role ||
    claims?.metadata?.role ||
    claims?.role;

  const role = roleFromReqUser || roleFromClerk;

  if (String(role || "").toLowerCase() !== "admin") {
    const err = new Error("Forbidden: Admin only");
    err.status = 403;
    throw err;
  }
}

function dbToUiStatus(dbStatus) {
  const value = String(dbStatus || "").toLowerCase();
  if (value === "applied") return "applied";
  if (value === "shortlisted") return "shortlisted";
  if (value === "hold") return "hold";
  if (value === "rejected") return "rejected";
  if (value === "interview scheduled") return "interview scheduled";
  return value || "applied";
}

function uiToDbStatus(uiStatus) {
  const value = String(uiStatus || "").trim().toLowerCase();

  if (value === "applied") return "Applied";
  if (value === "shortlisted") return "Shortlisted";
  if (value === "hold") return "Hold";
  if (value === "rejected") return "Rejected";
  if (value === "interview scheduled" || value === "interview_scheduled") return "Interview Scheduled";

  if (
    uiStatus === "Applied" ||
    uiStatus === "Shortlisted" ||
    uiStatus === "Hold" ||
    uiStatus === "Rejected" ||
    uiStatus === "Interview Scheduled"
  ) {
    return uiStatus;
  }

  return null;
}

function safeDateOnly(dateValue) {
  if (!dateValue) return "";
  const next = new Date(dateValue);
  if (Number.isNaN(next.getTime())) return "";
  return next.toISOString().slice(0, 10);
}

function buildCompanyName(companyUser) {
  return companyUser?.companyName || companyUser?.name || companyUser?.email || "Company";
}

function getJobSource(jobDoc = {}) {
  const createdByRole = String(jobDoc?.createdByRole || "").toLowerCase();
  if (jobDoc?.createdByAdmin === true || createdByRole === "admin") return "admin";
  return "company";
}

function mapApplicationRow(appDoc) {
  const job = appDoc.job || {};
  const companyUser = job.company || appDoc.company || {};
  const student = appDoc.student || {};
  const source = getJobSource(job);

  return {
    id: String(appDoc._id),
    status: dbToUiStatus(appDoc.status),
    statusRaw: appDoc.status,
    appliedAt: safeDateOnly(appDoc.createdAt),
    createdAt: appDoc.createdAt,
    updatedAt: appDoc.updatedAt,
    student: {
      id: student._id ? String(student._id) : undefined,
      name: normalizeStudentName(student),
      email: normalizeStudentEmail(student),
      phone: normalizeStudentPhone(student),
      location: normalizeStudentLocation(student),
      education: normalizeStudentEducation(student),
      experience: normalizeStudentExperience(student),
      skills: normalizeStudentSkills(student),
      resumeUrl: safeStr(student.resumeUrl),
      resumeData: getStudentResumeData(student),
      profileCompletion: calcProfileCompletion(student),
      avatar: normalizeStudentAvatar(student),
      avatarUrl: normalizeStudentAvatar(student),
    },
    job: {
      id: job._id ? String(job._id) : undefined,
      title: safeStr(job.title),
      stream: safeStr(job.stream),
      category: safeStr(job.category),
      subCategory: safeStr(job.subCategory),
      location: safeStr(job.location) || `${safeStr(job.city)}${job.state ? `, ${job.state}` : ""}`.trim(),
      experience: safeStr(job.experience) || safeStr(job.experienceText),
      salary:
        safeStr(job.salaryText) ||
        (job.salaryMin || job.salaryMax ? `INR ${job.salaryMin || 0} - INR ${job.salaryMax || 0}` : ""),
      companyName: buildCompanyName(companyUser),
      companyId: companyUser?._id
        ? String(companyUser._id)
        : appDoc.company?._id
        ? String(appDoc.company._id)
        : undefined,
      source,
      sourceLabel: source === "admin" ? "Admin Job" : "Company Job",
    },
  };
}

function withApplicationRelations(query) {
  return query
    .populate({
      path: "student",
      select: "name email phone location resumeUrl resume studentProfile avatarUrl avatar profilePhoto imageUrl profileImageUrl",
    })
    .populate({
      path: "job",
      select:
        "title stream category subCategory location city state experience experienceText salaryText salaryMin salaryMax company createdByRole createdByAdmin",
      populate: { path: "company", select: "name companyName email" },
    })
    .populate({ path: "company", select: "name companyName email" });
}

export const adminListApplications = async (req, res, next) => {
  try {
    assertAdmin(req);

    const {
      q = "",
      status = "all",
      company = "all",
      stream = "all",
      jobId = "",
      fromDate = "",
      toDate = "",
      page = 1,
      limit = 20,
      source = "all",
    } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (status && status !== "all") {
      const dbStatus = uiToDbStatus(status);
      if (dbStatus) filter.status = dbStatus;
    }

    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      filter.job = new mongoose.Types.ObjectId(jobId);
    }

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    if (from && !Number.isNaN(from.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $gte: from };
    }

    if (to && !Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { ...(filter.createdAt || {}), $lte: end };
    }

    const docs = await withApplicationRelations(
      Application.find(filter).sort({ createdAt: -1 }),
    ).lean();

    const mapped = docs.map(mapApplicationRow);

    const qText = String(q || "").trim().toLowerCase();
    const companyText = String(company || "").trim().toLowerCase();
    const sourceKey = String(source || "all").trim().toLowerCase();

    const filtered = mapped.filter((row) => {
      const matchStream = stream === "all" || String(row.job?.stream || "") === String(stream);

      const matchSource =
        sourceKey === "all" ||
        (sourceKey === "admin" && row.job?.source === "admin") ||
        (sourceKey === "company" && row.job?.source === "company");

      let matchCompany = true;
      if (company !== "all" && company) {
        if (mongoose.Types.ObjectId.isValid(company)) {
          matchCompany = String(row.job?.companyId || "") === String(company);
        } else {
          matchCompany = String(row.job?.companyName || "").toLowerCase().includes(companyText);
        }
      }

      const matchQ =
        !qText ||
        `${row.student?.name} ${row.student?.email} ${row.job?.title} ${row.job?.companyName}`
          .toLowerCase()
          .includes(qText);

      return matchStream && matchSource && matchCompany && matchQ;
    });

    const total = filtered.length;
    const rows = filtered.slice(skip, skip + limitNum);

    res.json({
      rows,
      page: pageNum,
      limit: limitNum,
      total,
    });
  } catch (err) {
    next(err);
  }
};

export const adminGetApplicationById = async (req, res, next) => {
  try {
    assertAdmin(req);

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const doc = await withApplicationRelations(Application.findById(id)).lean();

    if (!doc) return res.status(404).json({ message: "Application not found" });

    const studentId = doc?.student?._id || doc?.student;
    let studentApplications = [];

    if (studentId) {
      const relatedDocs = await withApplicationRelations(
        Application.find({ student: studentId }).sort({ createdAt: -1 }),
      ).lean();

      studentApplications = relatedDocs.map((item) => {
        const mapped = mapApplicationRow(item);
        return {
          id: mapped.id,
          jobTitle: mapped.job?.title || "",
          company: mapped.job?.companyName || "",
          date: mapped.appliedAt,
          status: mapped.status,
          source: mapped.job?.source || "company",
          sourceLabel: mapped.job?.sourceLabel || "Company Job",
        };
      });
    }

    res.json({
      ...mapApplicationRow(doc),
      studentApplications,
    });
  } catch (err) {
    next(err);
  }
};

export const adminUpdateApplicationStatus = async (req, res, next) => {
  try {
    assertAdmin(req);

    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const dbStatus = uiToDbStatus(status);
    if (!dbStatus) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updated = await withApplicationRelations(
      Application.findByIdAndUpdate(
        id,
        { status: dbStatus },
        { returnDocument: "after" },
      ),
    ).lean();

    if (!updated) return res.status(404).json({ message: "Application not found" });

    res.json({ ok: true, application: mapApplicationRow(updated) });
  } catch (err) {
    next(err);
  }
};

export const adminDeleteApplication = async (req, res, next) => {
  try {
    assertAdmin(req);

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const deleted = await Application.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ message: "Application not found" });

    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
};
