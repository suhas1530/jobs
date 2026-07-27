// backend/src/controllers/company/company.jobs.controller.js
import Job from "../../models/Job.js";
import User from "../../models/User.js";
import Application from "../../models/Application.js";
import Interview from "../../models/Interview.js";
import MessageThread from "../../models/MessageThread.js";
import Message from "../../models/Message.js";
import { ensureSubscription } from "../../services/paymentActivation.js";

const UNLIMITED_JOB_LIMIT = 999999;

async function getCompanyFromClerk(req) {
  if (req.user?.role === "company" && req.user?.isActive !== false) {
    return req.user;
  }

  const clerkId = req.auth()?.userId;
  if (!clerkId) return null;

  const user = await User.findOne({ clerkId });
  if (!user || user.role !== "company" || !user.isActive) return null;

  return user;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeQuestions(questions = []) {
  if (!Array.isArray(questions)) return [];
  return questions
    .map((q) => ({
      id: q?.id || undefined,
      text: String(q?.text || "").trim(),
      type: String(q?.type || "Short answer"),
      required: q?.required !== false,
      knockout: !!q?.knockout,
      knockoutRule: !!q?.knockoutRule,
      options: Array.isArray(q?.options) ? q.options.map((x) => String(x).trim()).filter(Boolean) : [],
    }))
    .filter((q) => q.text);
}

function sanitizeStatus(status) {
  const raw = String(status || "Active").toLowerCase();
  if (raw === "draft") return "Draft";
  if (raw === "closed") return "Closed";
  if (raw === "disabled") return "Disabled";
  return "Active";
}

function toMode(workMode = "") {
  if (workMode === "On-site") return "Onsite";
  if (workMode === "Remote") return "Remote";
  return "Hybrid";
}

function normalizeHierarchyValue(value, otherValue) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "other" || raw === "__other__") {
    return String(otherValue || "").trim();
  }
  return raw;
}

function sanitizeApplicantProfileRequirement(value) {
  const raw = String(value || "both").toLowerCase();
  if (raw === "resume" || raw === "student_profile" || raw === "both") return raw;
  return "both";
}

function isSubscriptionActiveNow(subscription) {
  if (!subscription) return false;
  if (String(subscription.status || "").toLowerCase() !== "active") return false;
  if (!subscription.start || !subscription.end) return false;
  const now = Date.now();
  return now >= new Date(subscription.start).getTime() && now <= new Date(subscription.end).getTime();
}

async function syncCompanyJobsUsed(companyId) {
  const [subscription, activeJobs] = await Promise.all([
    ensureSubscription(companyId),
    Job.countDocuments({ company: companyId, status: "Active" }),
  ]);

  if (Number(subscription.jobsUsed ?? 0) !== Number(activeJobs || 0)) {
    subscription.jobsUsed = Number(activeJobs || 0);
    await subscription.save();
  }

  return {
    subscription,
    activeJobs: Number(activeJobs || 0),
  };
}

async function getCompanyPostingAccess(companyId) {
  const { subscription, activeJobs } = await syncCompanyJobsUsed(companyId);

  if (
    String(subscription.status || "").toLowerCase() === "active" &&
    subscription.end &&
    Date.now() > new Date(subscription.end).getTime()
  ) {
    subscription.status = "inactive";
    await subscription.save();
  }

  const jobsLimit = Number(subscription.jobsLimit ?? 0);
  const isUnlimited = jobsLimit >= UNLIMITED_JOB_LIMIT;
  const subscriptionActive = isSubscriptionActiveNow(subscription);

  if (!subscriptionActive) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "Buy a subscription to post jobs.",
      subscription,
      jobsLimit,
      jobsUsed: activeJobs,
    };
  }

  if (!isUnlimited && activeJobs >= jobsLimit) {
    return {
      allowed: false,
      code: "JOB_LIMIT_REACHED",
      message: "Your job posting limit is over. Upgrade your subscription to post more jobs.",
      subscription,
      jobsLimit,
      jobsUsed: activeJobs,
    };
  }

  return {
    allowed: true,
    subscription,
    jobsLimit,
    jobsUsed: activeJobs,
  };
}

function buildPostingAccessPayload(access) {
  return {
    code: access.code,
    message: access.message,
    subscription: {
      planName: access.subscription?.planName || "Starter",
      status: String(access.subscription?.status || "inactive").toLowerCase(),
      startDate: access.subscription?.start || null,
      endDate: access.subscription?.end || null,
      jobsLimit: Number(access.jobsLimit ?? 0),
      jobsUsed: Number(access.jobsUsed ?? 0),
      upgradeRequired: access.code === "JOB_LIMIT_REACHED",
    },
  };
}

export async function companyCreateJob(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};
    const status = sanitizeStatus(data.status);

    if (status === "Active") {
      const access = await getCompanyPostingAccess(companyUser._id);
      if (!access.allowed) {
        return res.status(403).json(buildPostingAccessPayload(access));
      }
    }

    if (!data.title?.trim()) {
      return res.status(400).json({ message: "Job title is required" });
    }

    const stream = normalizeHierarchyValue(data.stream, data.streamOther);
    const category = normalizeHierarchyValue(data.category, data.categoryOther);
    const subCategory = normalizeHierarchyValue(data.subCategory, data.subCategoryOther);

    const job = await Job.create({
      company: companyUser._id,
      title: data.title.trim(),
      stream,
      category,
      subCategory,
      jobType: data.jobType,
      workMode: data.workMode,
      city: data.city,
      state: data.state,
      location: [data.city, data.state].filter(Boolean).join(", "),
      mode: toMode(data.workMode),
      openings: Number(data.openings || 1),
      deadline: data.deadline,
      experience: data.experience,
      salaryType: data.salaryType,
      salaryMin: Number(data.salaryMin || 0),
      salaryMax: Number(data.salaryMax || 0),
      benefits: data.benefits,
      showSalary: data.showSalary !== false,
      overview: data.overview,
      responsibilities: data.responsibilities,
      requirements: data.requirements,
      skills: normalizeSkills(data.skills),
      requireResume: data.requireResume !== false,
      requireProfile100: !!data.requireProfile100,
      applicantProfileRequirement: sanitizeApplicantProfileRequirement(data.applicantProfileRequirement),
      oneClickApply: data.oneClickApply !== false,
      allowWhatsapp: !!data.allowWhatsapp,
      allowCall: !!data.allowCall,
      allowEmailThread: data.allowEmailThread !== false,
      questions: normalizeQuestions(data.questions),
      enableAiRanking: !!data.enableAiRanking,
      skillsWeight: Number(data.skillsWeight || 0),
      experienceWeight: Number(data.experienceWeight || 0),
      educationWeight: Number(data.educationWeight || 0),
      screeningWeight: Number(data.screeningWeight || 0),
      autoHighlightTop10: !!data.autoHighlightTop10,
      autoTagMatch: !!data.autoTagMatch,
      allowInterviewSuggestions: !!data.allowInterviewSuggestions,
      boostActive: !!data.boostJob,
      boostPlanName: data.boostDays || "",
      status,
    });

    await syncCompanyJobsUsed(companyUser._id);

    return res.status(201).json({
      message: status === "Draft" ? "Draft saved" : "Job created successfully",
      job,
    });
  } catch (err) {
    console.error("companyCreateJob error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyListJobs(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { status = "all", title = "", stream = "" } = req.query;
    const filter = { company: companyUser._id };
    if (status !== "all") filter.status = status;
    if (title) filter.title = new RegExp(`^${String(title).trim()}$`, "i");
    if (stream) filter.stream = new RegExp(`^${String(stream).trim()}$`, "i");

    const items = await Job.find(filter).sort({ createdAt: -1 }).lean();
    const ids = items.map((j) => j._id);

    const agg = ids.length
      ? await Application.aggregate([
          { $match: { company: companyUser._id, job: { $in: ids } } },
          {
            $group: {
              _id: "$job",
              applicationsCount: { $sum: 1 },
              shortlistedCount: {
                $sum: {
                  $cond: [{ $eq: ["$status", "Shortlisted"] }, 1, 0],
                },
              },
            },
          },
        ])
      : [];

    const counts = new Map(agg.map((a) => [String(a._id), a]));

    const enriched = items.map((j) => {
      const c = counts.get(String(j._id));
      return {
        ...j,
        applicationsCount: Number(c?.applicationsCount || 0),
        shortlistedCount: Number(c?.shortlistedCount || 0),
      };
    });

    return res.json({ items: enriched, total: enriched.length });
  } catch (err) {
    console.error("companyListJobs error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyGetJobById(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const job = await Job.findOne({ _id: id, company: companyUser._id }).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const [applicationsCount, shortlistedCount] = await Promise.all([
      Application.countDocuments({ company: companyUser._id, job: job._id }),
      Application.countDocuments({ company: companyUser._id, job: job._id, status: "Shortlisted" }),
    ]);

    return res.json({
      job: {
        ...job,
        applicationsCount,
        shortlistedCount,
      },
    });
  } catch (err) {
    console.error("companyGetJobById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyUpdateJob(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const data = req.body || {};
    const existingJob = await Job.findOne({ _id: id, company: companyUser._id }).lean();
    if (!existingJob) return res.status(404).json({ message: "Job not found" });

    const update = {};

    if (typeof data.title === "string") update.title = data.title.trim();
    if (typeof data.stream === "string") {
      update.stream = normalizeHierarchyValue(data.stream, data.streamOther);
    }
    if (typeof data.category === "string") {
      update.category = normalizeHierarchyValue(data.category, data.categoryOther);
    }
    if (typeof data.subCategory === "string") {
      update.subCategory = normalizeHierarchyValue(data.subCategory, data.subCategoryOther);
    }
    if (typeof data.jobType === "string") update.jobType = data.jobType;
    if (typeof data.workMode === "string") {
      update.workMode = data.workMode;
      update.mode = toMode(data.workMode);
    }
    if (typeof data.city === "string") update.city = data.city;
    if (typeof data.state === "string") update.state = data.state;
    if (typeof data.city === "string" || typeof data.state === "string") {
      const city = typeof data.city === "string" ? data.city : undefined;
      const state = typeof data.state === "string" ? data.state : undefined;
      if (city !== undefined || state !== undefined) {
        const finalCity = city !== undefined ? city : existingJob.city;
        const finalState = state !== undefined ? state : existingJob.state;
        update.location = [finalCity, finalState].filter(Boolean).join(", ");
      }
    }

    if (data.openings != null) update.openings = Number(data.openings || 1);
    if (typeof data.deadline === "string") update.deadline = data.deadline;
    if (typeof data.experience === "string") update.experience = data.experience;
    if (typeof data.salaryType === "string") update.salaryType = data.salaryType;
    if (data.salaryMin != null) update.salaryMin = Number(data.salaryMin || 0);
    if (data.salaryMax != null) update.salaryMax = Number(data.salaryMax || 0);
    if (typeof data.benefits === "string") update.benefits = data.benefits;
    if (typeof data.showSalary === "boolean") update.showSalary = data.showSalary;
    if (typeof data.overview === "string") update.overview = data.overview;
    if (typeof data.responsibilities === "string") update.responsibilities = data.responsibilities;
    if (typeof data.requirements === "string") update.requirements = data.requirements;
    if (data.skills !== undefined) update.skills = normalizeSkills(data.skills);
    if (typeof data.requireResume === "boolean") update.requireResume = data.requireResume;
    if (typeof data.requireProfile100 === "boolean") update.requireProfile100 = data.requireProfile100;
    if (typeof data.applicantProfileRequirement === "string") {
      update.applicantProfileRequirement = sanitizeApplicantProfileRequirement(data.applicantProfileRequirement);
    }
    if (typeof data.oneClickApply === "boolean") update.oneClickApply = data.oneClickApply;
    if (typeof data.allowWhatsapp === "boolean") update.allowWhatsapp = data.allowWhatsapp;
    if (typeof data.allowCall === "boolean") update.allowCall = data.allowCall;
    if (typeof data.allowEmailThread === "boolean") update.allowEmailThread = data.allowEmailThread;
    if (data.questions !== undefined) update.questions = normalizeQuestions(data.questions);
    if (typeof data.enableAiRanking === "boolean") update.enableAiRanking = data.enableAiRanking;
    if (data.skillsWeight != null) update.skillsWeight = Number(data.skillsWeight || 0);
    if (data.experienceWeight != null) update.experienceWeight = Number(data.experienceWeight || 0);
    if (data.educationWeight != null) update.educationWeight = Number(data.educationWeight || 0);
    if (data.screeningWeight != null) update.screeningWeight = Number(data.screeningWeight || 0);
    if (typeof data.autoHighlightTop10 === "boolean") update.autoHighlightTop10 = data.autoHighlightTop10;
    if (typeof data.autoTagMatch === "boolean") update.autoTagMatch = data.autoTagMatch;
    if (typeof data.allowInterviewSuggestions === "boolean") update.allowInterviewSuggestions = data.allowInterviewSuggestions;
    if (typeof data.boostJob === "boolean") update.boostActive = data.boostJob;
    if (typeof data.boostDays === "string") update.boostPlanName = data.boostDays;
    if (data.status !== undefined) {
      update.status = sanitizeStatus(data.status);
      if (update.status === "Active" && existingJob.status !== "Active") {
        const access = await getCompanyPostingAccess(companyUser._id);
        if (!access.allowed) {
          return res.status(403).json(buildPostingAccessPayload(access));
        }
      }
    }

    const job = await Job.findOneAndUpdate(
      { _id: id, company: companyUser._id },
      { $set: update },
      { returnDocument: "after" }
    ).lean();

    await syncCompanyJobsUsed(companyUser._id);

    return res.json({ ok: true, job });
  } catch (err) {
    console.error("companyUpdateJob error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyDeleteJob(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const job = await Job.findOne({ _id: id, company: companyUser._id }).select("_id").lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const appIds = await Application.find({ company: companyUser._id, job: job._id }).distinct("_id");
    const threadQuery = {
      company: companyUser._id,
      $or: [
        { job: job._id },
        ...(appIds.length ? [{ application: { $in: appIds } }] : []),
      ],
    };
    const threadIds = await MessageThread.find(threadQuery).distinct("_id");

    const [messagesResult, threadsResult, interviewsResult, applicationsResult, jobResult] = await Promise.all([
      threadIds.length ? Message.deleteMany({ thread: { $in: threadIds } }) : Promise.resolve({ deletedCount: 0 }),
      threadIds.length ? MessageThread.deleteMany({ _id: { $in: threadIds } }) : Promise.resolve({ deletedCount: 0 }),
      Interview.deleteMany({ job: job._id, company: companyUser._id }),
      Application.deleteMany({ company: companyUser._id, job: job._id }),
      Job.deleteOne({ _id: job._id, company: companyUser._id }),
    ]);

    if (!jobResult?.deletedCount) {
      return res.status(404).json({ message: "Job not found" });
    }

    await syncCompanyJobsUsed(companyUser._id);

    return res.json({
      ok: true,
      id,
      deleted: {
        applications: Number(applicationsResult?.deletedCount || 0),
        interviews: Number(interviewsResult?.deletedCount || 0),
        threads: Number(threadsResult?.deletedCount || 0),
        messages: Number(messagesResult?.deletedCount || 0),
      },
    });
  } catch (err) {
    console.error("companyDeleteJob error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyDuplicateJob(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const src = await Job.findOne({ _id: id, company: companyUser._id }).lean();
    if (!src) return res.status(404).json({ message: "Job not found" });

    const copy = { ...src };
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;

    copy.title = `${src.title || "Untitled"} (Copy)`;
    copy.status = "Draft";

    const job = await Job.create(copy);

    return res.status(201).json({ ok: true, job });
  } catch (err) {
    console.error("companyDuplicateJob error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function companyCloseJob(req, res) {
  try {
    const companyUser = await getCompanyFromClerk(req);
    if (!companyUser) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;

    const job = await Job.findOneAndUpdate(
      { _id: id, company: companyUser._id },
      { status: "Closed" },
      { returnDocument: "after" }
    );

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await syncCompanyJobsUsed(companyUser._id);

    return res.json({
      message: "Job closed successfully",
      job,
    });
  } catch (err) {
    console.error("companyCloseJob error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
