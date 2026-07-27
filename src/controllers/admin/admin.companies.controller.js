// backend/src/controllers/admin/admin.companies.controller.js
import User from "../../models/User.js";
import CompanyProfile from "../../models/CompanyProfile.js";
import Company from "../../models/Company.js";
import Job from "../../models/Job.js";
import Application from "../../models/Application.js";
import Subscription from "../../models/Subscription.js";
import crypto from "crypto";
import mongoose from "mongoose";

async function requireAdmin(req, res) {
  if (req.user && String(req.user.role || "").toLowerCase() === "admin") {
    return req.user;
  }

  const clerkId = req.auth()?.userId;
  if (!clerkId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  const me = await User.findOne({ clerkId }).lean();
  if (!me) {
    res.status(401).json({ message: "User not synced in DB. Please login again." });
    return null;
  }

  if (String(me.role).toLowerCase() !== "admin") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return me;
}

/**
 * GET /api/admin/companies
 * query:
 *  - q (search)
 *  - status=all|active|suspended
 *  - page, limit
 */
export const adminListCompanies = async (req, res, next) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const {
      q = "",
      status = "all",
      page = 1,
      limit = 50,
    } = req.query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (safePage - 1) * safeLimit;

    const matchUser = { role: "company", deletedAt: null };

    // status filter (we store in CompanyProfile.status)
    // We'll apply after populate by querying CompanyProfile separately.
    const search = String(q || "").trim();

    // Find company user ids by profile search (companyName / email / phone)
    let companyUserIds = null;

    if (search) {
      const profHits = await CompanyProfile.find({
        $or: [
          { companyName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      })
        .select("user")
        .lean();

      const idsFromProfile = profHits.map((x) => x.user);

      const userHits = await User.find({
        role: "company",
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      const idsFromUser = userHits.map((x) => x._id);

      companyUserIds = Array.from(new Set([...idsFromProfile, ...idsFromUser].map(String))).map(
        (id) => id
      );

      matchUser._id = { $in: companyUserIds };
    }

    const [total, companies] = await Promise.all([
      User.countDocuments(matchUser),
      User.find(matchUser).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    ]);

    const companyIds = companies.map((c) => c._id);

    const [profiles, companyDocs, subs, jobsAgg, appsAgg] = await Promise.all([
      CompanyProfile.find({ user: { $in: companyIds } }).lean(),
      Company.find({ ownerUserId: { $in: companyIds } }).lean(),
      Subscription.find({ company: { $in: companyIds } }).sort({ createdAt: -1 }).lean(),
      Job.aggregate([
        { $match: { company: { $in: companyIds } } },
        { $group: { _id: "$company", jobsCount: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: { company: { $in: companyIds } } },
        { $group: { _id: "$company", appsCount: { $sum: 1 } } },
      ]),
    ]);

    const profMap = new Map(profiles.map((p) => [String(p.user), p]));
    const companyMap = new Map(companyDocs.map((c) => [String(c.ownerUserId), c]));
    const jobsMap = new Map(jobsAgg.map((x) => [String(x._id), x.jobsCount]));
    const appsMap = new Map(appsAgg.map((x) => [String(x._id), x.appsCount]));

    // choose latest sub per company (first occurrence due to sort)
    const subMap = new Map();
    for (const s of subs) {
      const key = String(s.company);
      if (!subMap.has(key)) subMap.set(key, s);
    }

    let rows = companies.map((u) => {
      const prof = profMap.get(String(u._id));
      const comp = companyMap.get(String(u._id));
      const sub = subMap.get(String(u._id));

      const statusVal = comp
        ? (comp.isActive === false ? "suspended" : "active")
        : (prof?.status || "active");

      return {
        id: String(u._id),
        name: comp?.name || prof?.companyName || u.name || "Company",
        email: comp?.hrEmail || comp?.email || prof?.email || u.email || "",
        phone: comp?.hrPhone || comp?.phone || prof?.phone || u.phone || "",
        logoUrl: comp?.logoUrl || "",
        location: comp?.location || comp?.address || prof?.address || u.location || "",
        category: comp?.category || prof?.category || "General",
        industry: comp?.industry || "",
        size: comp?.size || "",
        founded: comp?.founded || "",
        about: comp?.about || "",
        mission: comp?.mission || "",
        culture: comp?.culture || "",
        perks: comp?.perks || "",
        hiringProcess: comp?.hiringProcess || "",
        studentMessage: comp?.studentMessage || "",
        profileAudience: comp?.profileAudience || "both",
        status: statusVal,
        statusLabel: statusVal === "active" ? "Active" : "Suspended",
        isActive: statusVal === "active",
        website: comp?.website || prof?.website || "",
        address: comp?.address || prof?.address || "",

        // counts
        jobsCount: jobsMap.get(String(u._id)) || 0,
        applicationsCount: appsMap.get(String(u._id)) || 0,

        // plan (use your frontend shape)
        plan: sub
          ? {
              name: sub.planName || "Starter",
              start: sub.start ? new Date(sub.start).toISOString().slice(0, 10) : "",
              end: sub.end ? new Date(sub.end).toISOString().slice(0, 10) : "",
              jobsLimit: sub.jobsLimit ?? 0,
              jobsUsed: sub.jobsUsed ?? 0,
              appsLimit: sub.appsLimit ?? 0,
              appsUsed: sub.appsUsed ?? 0,
              amount: sub.price ? `₹${sub.price}` : "",
              status: sub.status || "inactive",
            }
          : {
              name: "Starter",
              start: "",
              end: "",
              jobsLimit: 0,
              jobsUsed: 0,
              appsLimit: 0,
              appsUsed: 0,
              amount: "",
              status: "inactive",
            },
      };
    });

    // Apply status filter AFTER computed
    if (String(status).toLowerCase() !== "all") {
      rows = rows.filter((r) => String(r.status).toLowerCase() === String(status).toLowerCase());
    }

    return res.json({
      rows,
      page: safePage,
      limit: safeLimit,
      total,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/admin/companies/:id
 * returns { company, jobs, applicants }
 */
export const adminGetCompanyDetails = async (req, res, next) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const { id } = req.params;

    const user = await User.findOne({ _id: id, role: "company", deletedAt: null }).lean();
    if (!user) return res.status(404).json({ message: "Company not found" });

    const prof = await CompanyProfile.findOne({ user: user._id }).lean();
    const comp = await Company.findOne({ ownerUserId: user._id }).lean();
    const sub = await Subscription.findOne({ company: user._id }).sort({ createdAt: -1 }).lean();

    // jobs with applications count
    const jobs = await Job.find({ company: user._id }).sort({ createdAt: -1 }).lean();
    const jobIds = jobs.map((j) => j._id);

    const appsAgg = await Application.aggregate([
      { $match: { job: { $in: jobIds } } },
      { $group: { _id: "$job", c: { $sum: 1 } } },
    ]);
    const appCountMap = new Map(appsAgg.map((x) => [String(x._id), x.c]));

    const jobsUi = jobs.map((j) => ({
      id: String(j._id),
      title: j.title,
      stream: j.stream,
      category: j.category,
      subCategory: j.subCategory,
      location: j.location || `${j.city || ""} ${j.state || ""}`.trim(),
      salary: j.salaryText || "",
      experience: j.experience || "",
      status: String(j.status || "Active").toLowerCase(), // UI expects active/disabled sometimes
      createdAt: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : "",
      applications: appCountMap.get(String(j._id)) || 0,
    }));

    // recent applications list
    const applicantsRaw = await Application.find({ company: user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("student", "name email phone location")
      .populate("job", "title")
      .lean();

    const applicants = applicantsRaw.map((a) => ({
      id: String(a._id),
      name: a.student?.name || "Student",
      email: a.student?.email || "",
      phone: a.student?.phone || "",
      location: a.student?.location || "",
      jobTitle: a.job?.title || "",
      status: String(a.status || "Applied").toLowerCase(),
      appliedAt: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "",
    }));

    const company = {
      id: String(user._id),
      name: comp?.name || prof?.companyName || user.name || "Company",
      category: comp?.category || prof?.category || "General",
      location: comp?.location || comp?.address || prof?.address || user.location || "",
      status: comp ? (comp.isActive === false ? "suspended" : "active") : (prof?.status || "active"),
      statusLabel: (comp ? comp.isActive !== false : prof?.status !== "suspended") ? "Active" : "Suspended",
      isActive: comp ? comp.isActive !== false : prof?.status !== "suspended",
      website: comp?.website || prof?.website || "",
      linkedin: comp?.linkedin || "",
      logoUrl: comp?.logoUrl || "",
      email: comp?.hrEmail || comp?.email || prof?.email || user.email || "",
      phone: comp?.hrPhone || comp?.phone || prof?.phone || user.phone || "",
      address: comp?.address || prof?.address || "",
      industry: comp?.industry || "",
      size: comp?.size || "",
      founded: comp?.founded || "",
      about: comp?.about || "",
      mission: comp?.mission || "",
      culture: comp?.culture || "",
      perks: comp?.perks || "",
      hiringProcess: comp?.hiringProcess || "",
      studentMessage: comp?.studentMessage || "",
      profileAudience: comp?.profileAudience || "both",
      hrName: prof?.hrName || "",
      hrPhone: comp?.hrPhone || prof?.hrPhone || "",
      hrEmail: comp?.hrEmail || prof?.hrEmail || "",
      plan: sub
        ? {
            name: sub.planName || "Starter",
            start: sub.start ? new Date(sub.start).toISOString().slice(0, 10) : "",
            end: sub.end ? new Date(sub.end).toISOString().slice(0, 10) : "",
            jobsLimit: sub.jobsLimit ?? 0,
            jobsUsed: sub.jobsUsed ?? 0,
            appsLimit: sub.appsLimit ?? 0,
            appsUsed: sub.appsUsed ?? 0,
            amount: sub.price ? `₹${sub.price}` : "",
            status: sub.status || "inactive",
          }
        : { name: "Starter", start: "", end: "", jobsLimit: 0, jobsUsed: 0, appsLimit: 0, appsUsed: 0, amount: "", status: "inactive" },
    };

    return res.json({ company, jobs: jobsUi, applicants });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/admin/companies/:id/status
 * body: { status: "active" | "suspended" }
 */
export const adminUpdateCompanyStatus = async (req, res, next) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const { id } = req.params;
    const { status } = req.body;

    const nextStatus = String(status || "").toLowerCase();
    if (!["active", "suspended"].includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findOne({ _id: id, role: "company", deletedAt: null });
    if (!user) return res.status(404).json({ message: "Company not found" });

    // update CompanyProfile.status (source of truth for UI)
    const prof = await CompanyProfile.findOneAndUpdate(
      { user: user._id },
      { $set: { status: nextStatus } },
      { returnDocument: "after", upsert: true }
    ).lean();

    await Company.findOneAndUpdate(
      { ownerUserId: user._id },
      {
        $set: {
          isActive: nextStatus === "active",
          name: user.name || "Company",
          email: user.email || "",
          hrEmail: user.email || "",
        },
      },
      { upsert: true }
    );

    return res.json({
      ok: true,
      companyId: String(user._id),
      status: prof?.status || nextStatus,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/admin/companies/:id
 * Soft delete company user and deactivate related company records.
 */
export const adminDeleteCompany = async (req, res, next) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid company id" });
    }

    const deletedAt = new Date();

    const user = await User.findOneAndUpdate(
      { _id: id, role: "company", deletedAt: null },
      { $set: { deletedAt, isActive: false } },
      { returnDocument: "after" }
    ).lean();

    if (!user) return res.status(404).json({ message: "Company not found" });

    const [jobsUpdate, subscriptionsUpdate, companyUpdate, profileUpdate] = await Promise.all([
      Job.updateMany(
        { company: user._id, status: "Active" },
        { $set: { status: "Disabled", boostActive: false } }
      ),
      Subscription.updateMany(
        { company: user._id, status: "active" },
        { $set: { status: "inactive" } }
      ),
      Company.findOneAndUpdate(
        { ownerUserId: user._id },
        { $set: { isActive: false } },
        { returnDocument: "after" }
      ),
      CompanyProfile.findOneAndUpdate(
        { user: user._id },
        { $set: { status: "suspended" } },
        { returnDocument: "after" }
      ),
    ]);

    return res.json({
      ok: true,
      id: String(user._id),
      disabledJobs: jobsUpdate.modifiedCount || 0,
      inactiveSubscriptions: subscriptionsUpdate.modifiedCount || 0,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/admin/companies
 * body: { name, email, phone, website, category, location, address, status }
 */
export const adminCreateCompany = async (req, res, next) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const payload = req.body || {};
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const website = String(payload.website || "").trim();
    const category = String(payload.category || "").trim() || "General";
    const location = String(payload.location || "").trim();
    const address = String(payload.address || "").trim();
    const status = String(payload.status || "active").toLowerCase() === "suspended" ? "suspended" : "active";

    if (!name) {
      return res.status(400).json({ message: "Company name is required" });
    }

    if (!email) {
      return res.status(400).json({ message: "Company email is required" });
    }

    const existing = await User.findOne({ role: "company", email }).lean();
    if (existing) {
      return res.status(409).json({ message: "A company with this email already exists" });
    }

    // Manual company accounts created by admin are DB-only records (non-Clerk login accounts).
    const clerkId = `manual_company_${crypto.randomUUID()}`;

    const user = await User.create({
      clerkId,
      role: "company",
      email,
      name,
      phone,
      location,
      isActive: status === "active",
    });

    await Promise.all([
      CompanyProfile.create({
        user: user._id,
        companyName: name,
        website,
        email,
        phone,
        address: address || location,
        status,
      }),
      Company.create({
        ownerUserId: user._id,
        name,
        website,
        email,
        phone,
        hrEmail: email,
        hrPhone: phone,
        address,
        location,
        category,
        isActive: status === "active",
      }),
    ]);

    return res.status(201).json({
      ok: true,
      company: {
        id: String(user._id),
        name,
        email,
        phone,
        location,
        category,
        status,
      },
    });
  } catch (e) {
    next(e);
  }
};
