import mongoose from "mongoose";
import Job from "../../models/Job.js";
import ContentItem from "../../models/ContentItem.js";

function asInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function safeStr(x) {
  return typeof x === "string" ? x : "";
}

function buildInternshipTags(job) {
  const tags = [];
  if (job?.boostActive) tags.push("Top Companies");
  if (safeStr(job?.workMode).toLowerCase() === "remote") tags.push("Remote");
  if (safeStr(job?.type).toLowerCase() === "paid") tags.push("Paid");
  if (safeStr(job?.urgentTag).toLowerCase() === "urgent") tags.push("Urgent");
  return Array.from(new Set(tags));
}

function mapInternship(jobDoc) {
  const stipendMin = asInt(jobDoc.stipendMin ?? jobDoc.salaryMin ?? 0);
  const stipendMax = asInt(jobDoc.stipendMax ?? jobDoc.salaryMax ?? 0);

  return {
    id: String(jobDoc._id),
    _id: jobDoc._id,
    title: jobDoc.title || "Internship",
    company: jobDoc.company?.name || jobDoc.companyName || "Company",
    companyEmail: jobDoc.company?.email || "",
    companyPhone: jobDoc.company?.phone || "",
    companyWebsite: jobDoc.company?.website || "",
    stream: jobDoc.stream || "",
    category: jobDoc.category || "",
    subCategory: jobDoc.subCategory || "",
    location: jobDoc.location || jobDoc.city || "",
    duration: jobDoc.duration || "",
    stipendMin,
    stipendMax,
    workMode: jobDoc.workMode || jobDoc.mode || "",
    type: jobDoc.type || jobDoc.internshipType || (stipendMin || stipendMax ? "Paid" : "Unpaid"),
    companyType: jobDoc.companyType || "",
    skills: Array.isArray(jobDoc.skills) ? jobDoc.skills : [],
    tags: Array.isArray(jobDoc.tags) && jobDoc.tags.length ? jobDoc.tags : buildInternshipTags(jobDoc),
    createdAt: jobDoc.createdAt,
  };
}

export const listStudentInternships = async (req, res, next) => {
  try {
    const {
      q = "",
      stream = "",
      category = "",
      location = "",
      duration = "",
      workMode = "",
      type = "",
      companyType = "",
      stipendMin = "",
      stipendMax = "",
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(1, asInt(page, 1));
    const limitNum = Math.min(50, Math.max(1, asInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      status: "Active",
      $or: [
        { jobType: { $regex: /^internship$/i } },
        { title: { $regex: /intern/i } },
        { category: { $regex: /intern/i } },
      ],
    };

    if (q) query.title = { $regex: q, $options: "i" };
    if (stream) query.stream = stream;
    if (category) query.category = category;
    if (duration) query.duration = duration;
    if (workMode) query.workMode = workMode;
    if (type) query.type = type;
    if (companyType) query.companyType = companyType;

    if (location) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { location: { $regex: location, $options: "i" } },
          { city: { $regex: location, $options: "i" } },
          { state: { $regex: location, $options: "i" } },
        ],
      });
    }

    const minN = stipendMin !== "" ? asInt(stipendMin) : null;
    const maxN = stipendMax !== "" ? asInt(stipendMax) : null;

    if (minN != null) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [{ stipendMin: { $gte: minN } }, { salaryMin: { $gte: minN } }],
      });
    }
    if (maxN != null) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [{ stipendMax: { $lte: maxN } }, { salaryMax: { $lte: maxN } }],
      });
    }

    const [total, docs] = await Promise.all([
      Job.countDocuments(query),
      Job.find(query)
        .populate("company", "name email phone website")
        .sort({ boostActive: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      items: docs.map(mapInternship),
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    next(err);
  }
};

export const getStudentInternshipById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid internship id" });
    }

    const doc = await Job.findOne({ _id: id, status: "Active" })
      .populate("company", "name email website phone industry address")
      .lean();

    if (!doc) return res.status(404).json({ message: "Internship not found" });

    const stipendMin = asInt(doc.stipendMin ?? doc.salaryMin ?? 0);
    const stipendMax = asInt(doc.stipendMax ?? doc.salaryMax ?? 0);

    return res.json({
      id: String(doc._id),
      title: doc.title || "Internship",
      company: doc.company?.name || "Company",
      companyName: doc.company?.name || "Company",
      location: doc.location || doc.city || "",
      duration: doc.duration || "",
      stipendMin,
      stipendMax,
      stipend: stipendMin || stipendMax ? `Rs ${stipendMin} - Rs ${stipendMax}` : (doc.stipendText || doc.salaryText || ""),
      overview: doc.overview || doc.description || "",
      description: doc.overview || doc.description || "",
      skills: Array.isArray(doc.skills) ? doc.skills : [],
      responsibilities: safeStr(doc.responsibilities)
        ? safeStr(doc.responsibilities).split("\n").filter(Boolean)
        : Array.isArray(doc.responsibilities)
          ? doc.responsibilities
          : [],
      requirements: safeStr(doc.requirements)
        ? safeStr(doc.requirements).split("\n").filter(Boolean)
        : Array.isArray(doc.requirements)
          ? doc.requirements
          : [],
      aboutCompany: doc.company?.about || "",
      contactEmail: doc.company?.email || "",
      companyPhone: doc.company?.phone || "",
      companyWebsite: doc.company?.website || "",
      companyInfo: {
        name: doc.company?.name || "Company",
        website: doc.company?.website || "",
        phone: doc.company?.phone || "",
        industry: doc.company?.industry || "",
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getStudentInternshipContent = async (req, res, next) => {
  try {
    const [tipsDocs, qaDocs, mockDocs] = await Promise.all([
      ContentItem.find({ type: "INTERNSHIP_TIP", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(50)
        .lean(),
      ContentItem.find({ type: "INTERNSHIP_QA", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(50)
        .lean(),
      ContentItem.find({ type: "MOCK_TEST", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    const tips = tipsDocs.map((x) => ({
      id: String(x._id),
      title: x.title || x.data?.title || "Tip",
      desc: x.description || x.data?.desc || "",
    }));

    const questions = qaDocs.map((x) => ({
      id: String(x._id),
      q: x.data?.q || x.title || "",
      a: x.data?.a || x.description || "",
    }));

    const mockTests = mockDocs.map((x) => ({
      id: String(x._id),
      title: x.title || "Mock Test",
      questions: asInt(x.data?.questions, 0),
      mins: asInt(x.data?.mins, 0),
    }));

    return res.json({ tips, questions, mockTests });
  } catch (err) {
    next(err);
  }
};
