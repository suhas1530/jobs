// backend/src/controllers/student/student.home.controller.js
import mongoose from "mongoose";
import Job from "../../models/Job.js";
import User from "../../models/User.js";
import Application from "../../models/Application.js";
import ContentItem from "../../models/ContentItem.js";
import GovernmentUpdate from "../../models/GovernmentUpdate.js";
import Advertisement from "../../models/Advertisement.js";
import Company from "../../models/Company.js";

function safeStr(x) {
  return typeof x === "string" ? x : "";
}

function isVisibleContent(doc, now = new Date()) {
  if (!doc) return false;
  if (String(doc.status || "") !== "Active") return false;
  if (doc.startAt && new Date(doc.startAt) > now) return false;
  if (doc.endAt && new Date(doc.endAt) < now) return false;
  if (doc.data?.showOnHomepage === false) return false;
  return true;
}

function toSalaryText(job) {
  if (safeStr(job.salaryText)) return job.salaryText;

  const min = Number(job.salaryMin || 0);
  const max = Number(job.salaryMax || 0);

  if (min || max) {
    const a = min ? `${min}` : "";
    const b = max ? `${max}` : "";
    return `Rs ${a}${min && max ? "-" : ""}${b}`;
  }

  return safeStr(job.salary) || "";
}

function toStipendText(job) {
  if (safeStr(job.stipendText)) return job.stipendText;

  const min = Number(job.stipendMin || 0);
  const max = Number(job.stipendMax || 0);

  if (min || max) {
    const a = min ? `${min}` : "";
    const b = max ? `${max}` : "";
    return `Rs ${a}${min && max ? "-" : ""}${b}/mo`;
  }

  const s = toSalaryText(job);
  return s ? `${s}${s.includes("/mo") ? "" : "/mo"}` : "";
}

function companyIdOf(jobDoc) {
  if (!jobDoc?.company) return "";
  if (typeof jobDoc.company === "string") return jobDoc.company;
  if (jobDoc.company?._id) return String(jobDoc.company._id);
  return String(jobDoc.company);
}

function mapJob(jobDoc, companyMap) {
  const cid = companyIdOf(jobDoc);
  const companyInfo = companyMap.get(cid) || {};
  const companyName = companyInfo.name || jobDoc.companyName || "Company";

  return {
    _id: jobDoc._id,
    title: jobDoc.title || "Job",
    company: cid || jobDoc.company,
    companyName,
    companyLogo: companyInfo.logoUrl || "",
    logoUrl: companyInfo.logoUrl || "",
    experience: jobDoc.experience || jobDoc.experienceText || "",
    experienceText: jobDoc.experienceText || jobDoc.experience || "",
    salaryMin: jobDoc.salaryMin || 0,
    salaryMax: jobDoc.salaryMax || 0,
    salaryText: toSalaryText(jobDoc),
    salary: jobDoc.salaryText || "",
    location: jobDoc.location || jobDoc.city || "",
    city: jobDoc.city || "",
    state: jobDoc.state || "",
    category: jobDoc.category || "",
    stream: jobDoc.stream || "",
    subCategory: jobDoc.subCategory || "",
    jobType: jobDoc.jobType || "",
    workMode: jobDoc.workMode || jobDoc.mode || "",
    mode: jobDoc.mode || "",
    boostActive: Boolean(jobDoc.boostActive),
    createdAt: jobDoc.createdAt,
  };
}

function mapInternship(jobDoc, companyMap) {
  const cid = companyIdOf(jobDoc);
  const companyInfo = companyMap.get(cid) || {};
  const companyName = companyInfo.name || jobDoc.companyName || "Company";

  return {
    _id: jobDoc._id,
    title: jobDoc.title || "Internship",
    company: cid || jobDoc.company,
    companyName,
    companyLogo: companyInfo.logoUrl || "",
    logoUrl: companyInfo.logoUrl || "",
    location: jobDoc.location || jobDoc.city || "",
    city: jobDoc.city || "",
    stipendMin: jobDoc.stipendMin || jobDoc.salaryMin || 0,
    stipendMax: jobDoc.stipendMax || jobDoc.salaryMax || 0,
    stipendText: toStipendText(jobDoc),
    createdAt: jobDoc.createdAt,
  };
}

async function loadCompanyMap(...lists) {
  const ids = [];
  for (const list of lists) {
    for (const item of list || []) {
      const cid = companyIdOf(item);
      if (mongoose.Types.ObjectId.isValid(cid)) ids.push(cid);
    }
  }

  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map();

  const [users, companies] = await Promise.all([
    User.find({ _id: { $in: unique } }).select("name").lean(),
    Company.find({ ownerUserId: { $in: unique } }).select("ownerUserId name logoUrl").lean(),
  ]);

  const map = new Map();
  const companyMap = new Map(companies.map((company) => [String(company.ownerUserId), company]));
  for (const u of users) {
    const company = companyMap.get(String(u._id));
    map.set(String(u._id), {
      name: company?.name || u.name || "Company",
      logoUrl: company?.logoUrl || "",
    });
  }
  return map;
}

export const getStudentHome = async (req, res, next) => {
  try {
    const [categoryItems, testimonialItems, bannerItems, announcementItems, gov, jobsDocs, internshipsDocs, adsDocs, liveJobs, topCompanies, studentsHired] = await Promise.all([
      ContentItem.find({ type: "CATEGORY", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(30)
        .lean(),
      ContentItem.find({ type: "TESTIMONIAL", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(12)
        .lean(),
      ContentItem.find({ type: "HOME_AD", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      ContentItem.find({ type: "ANNOUNCEMENT", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      GovernmentUpdate.find({ status: "Active" })
        .sort({ priority: -1, publishedAt: -1, createdAt: -1 })
        .limit(8)
        .lean(),
      Job.find({ status: "Active" })
        .sort({ boostActive: -1, createdAt: -1 })
        .limit(12)
        .lean(),
      Job.find({
        status: "Active",
        $or: [
          { jobType: { $regex: /^internship$/i } },
          { category: { $regex: /intern/i } },
          { title: { $regex: /intern/i } },
        ],
      })
        .sort({ boostActive: -1, createdAt: -1 })
        .limit(6)
        .lean(),
      Advertisement.find({ status: "active", placement: "student-home" })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate("user", "name email")
        .lean(),
      Job.countDocuments({ status: "Active" }),
      User.countDocuments({ role: "company", isActive: true }),
      Application.countDocuments({}),
    ]);

    let categories = categoryItems
      .map((c) => c?.data?.label || c?.title)
      .filter(Boolean);

    const testimonials = testimonialItems.map((t) => ({
      id: String(t._id),
      name: t?.data?.name || t?.title || "Student",
      quote: t?.data?.quote || t?.description || "",
      company: t?.data?.company || t?.subtitle || "",
      imageUrl: t?.imageUrl || "",
    }));

    const governmentLinks = gov
      .map((g) => ({
        id: String(g._id),
        title: g.title || "",
        link: g.link || "",
      }))
      .filter((g) => g.title);

    const now = new Date();
    const banners = bannerItems
      .filter((x) => isVisibleContent(x, now))
      .map((x) => ({
        id: String(x._id),
        title: x.title || x.data?.name || "",
        subtitle: x.subtitle || x.description || "",
        imageUrl: x.imageUrl || "",
        linkUrl: x.linkUrl || "",
        description: x.description || "",
      }));

    const announcements = announcementItems
      .filter((x) => isVisibleContent(x, now))
      .map((x) => ({
        id: String(x._id),
        title: x.title || "",
        subtitle: x.subtitle || "",
        description: x.description || "",
        linkUrl: x.linkUrl || "",
        imageUrl: x.imageUrl || "",
      }));

    const ads = adsDocs.map((ad) => ({
      id: String(ad._id),
      title: ad.title || "",
      description: ad.description || "",
      mediaType: ad.mediaType || "banner",
      mediaUrl: ad.mediaUrl || "",
      mediaResourceType: ad.mediaResourceType || "",
      ctaLabel: ad.ctaLabel || "Learn More",
      targetUrl: ad.targetUrl || "",
      contactLabel: ad.contactLabel || "",
      audience: ad.audience || "",
      advertiserName: ad.user?.name || "Sponsored",
      createdAt: ad.createdAt,
    }));

    const companyMap = await loadCompanyMap(jobsDocs, internshipsDocs);
    const jobs = jobsDocs.map((j) => mapJob(j, companyMap));
    const internships = internshipsDocs.map((j) => mapInternship(j, companyMap));

    if (!categories.length) {
      const fromJobs = [];
      for (const j of jobsDocs) {
        if (j?.category) fromJobs.push(j.category);
        if (j?.stream && !fromJobs.includes(j.stream)) fromJobs.push(j.stream);
      }
      categories = Array.from(new Set(fromJobs)).slice(0, 12);
    }

    return res.json({
      categories,
      internships,
      jobs,
      stats: {
        liveJobs,
        topCompanies,
        studentsHired,
      },
      governmentLinks,
      testimonials,
      banners,
      announcements,
      ads,
    });
  } catch (err) {
    next(err);
  }
};
