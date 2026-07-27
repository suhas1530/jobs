import GovernmentUpdate from "../../models/GovernmentUpdate.js";

function safeRegex(q) {
  if (!q) return null;
  const esc = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i");
}

function asArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split("\n").map((x) => x.trim()).filter(Boolean);
  return [];
}

function mapGovernmentItem(doc) {
  const data = doc?.data || {};
  const id = String(doc?._id || "");

  return {
    id,
    _id: id,
    title: doc?.title || data?.title || "Government Update",
    summary: doc?.summary || data?.shortDescription || data?.summary || doc?.note || "",
    source: doc?.source || data?.officialWebsite || "Government",
    status: doc?.status || "Active",
    publishedAt: doc?.publishedAt || doc?.createdAt || null,

    department: data?.department || "",
    state: data?.state || "",
    jobType: data?.jobType || "",
    qualification: data?.qualification || "",
    examType: data?.examType || "",

    startDate: data?.applicationStartDate || data?.startDate || doc?.date || "",
    endDate: data?.applicationEndDate || data?.endDate || "",

    eligibility: asArray(data?.eligibility),
    selectionProcess: asArray(data?.selectionProcess),

    link: doc?.link || data?.externalUrl || data?.officialWebsite || "",
    fileUrl: doc?.fileUrl || data?.attachmentUrl || "",
    pdfUrl: data?.attachmentUrl || doc?.fileUrl || "",
    officialWebsite: data?.officialWebsite || doc?.source || doc?.link || "",
    applicationLink: data?.applicationLink || data?.externalUrl || doc?.link || "",

    data,
  };
}

// GET /api/student/government
export const listGovernmentJobs = async (req, res, next) => {
  try {
    const {
      search,
      state,
      department,
      jobType,
      qualification,
      examType,
      page = 1,
      limit = 6,
    } = req.query;

    const query = { status: "Active" };

    if (search) {
      const rx = safeRegex(search);
      query.$or = [{ title: rx }, { summary: rx }, { source: rx }, { "data.shortDescription": rx }, { "data.fullDescription": rx }];
    }

    if (state) query["data.state"] = new RegExp(`^${state}$`, "i");
    if (department) query["data.department"] = safeRegex(department);
    if (jobType) query["data.jobType"] = new RegExp(`^${jobType}$`, "i");
    if (qualification) query["data.qualification"] = safeRegex(qualification);
    if (examType) query["data.examType"] = new RegExp(`^${examType}$`, "i");

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(50, Number(limit) || 6));
    const skip = (pageNum - 1) * limitNum;

    const [total, docs] = await Promise.all([
      GovernmentUpdate.countDocuments(query),
      GovernmentUpdate.find(query)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      items: docs.map(mapGovernmentItem),
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/student/government/:id
export const getGovernmentJobById = async (req, res, next) => {
  try {
    const item = await GovernmentUpdate.findById(req.params.id).lean();
    if (!item || item.status !== "Active") return res.status(404).json({ message: "Not found" });
    res.json(mapGovernmentItem(item));
  } catch (err) {
    next(err);
  }
};
