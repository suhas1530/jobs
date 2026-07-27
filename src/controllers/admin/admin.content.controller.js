import mongoose from "mongoose";
import ContentItem from "../../models/ContentItem.js";
import GovernmentUpdate from "../../models/GovernmentUpdate.js";

const SECTION_TO_TYPE = {
  homeSlides: "HOME_AD",
  publicPages: "PUBLIC_PAGE",
  blogs: "BLOG",
  announcements: "ANNOUNCEMENT",
  featuredCompanies: "FEATURED_COMPANY",

  // legacy compatibility
  banners: "HOME_AD",
  testimonials: "TESTIMONIAL",
  placed: "PLACED_STUDENT",
  internship: "INTERNSHIP_TIP",
  interviewQuestions: "INTERNSHIP_QA",
  mockTests: "MOCK_TEST",
};

const TYPE_TO_SECTION = {
  HOME_AD: "homeSlides",
  PUBLIC_PAGE: "publicPages",
  BLOG: "blogs",
  ANNOUNCEMENT: "announcements",
  FEATURED_COMPANY: "featuredCompanies",
  TESTIMONIAL: "testimonials",
  PLACED_STUDENT: "placed",
  INTERNSHIP_TIP: "internship",
  INTERNSHIP_QA: "interviewQuestions",
  MOCK_TEST: "mockTests",
  CATEGORY: "legacyCategories",
};

const ALL_TYPES = Object.values(SECTION_TO_TYPE);

function toId(x) {
  return String(x?._id || x?.id || x || "");
}

function toIsoDate(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt;
}

function toDbStatus(adminStatus = "active") {
  const s = String(adminStatus || "").toLowerCase();
  if (["draft"].includes(s)) return "Draft";
  if (["disabled", "archived", "inactive", "expired", "closed"].includes(s)) return "Inactive";
  return "Active";
}

function toAdminStatus(doc) {
  const explicit = String(doc?.data?.adminStatus || "").toLowerCase();
  if (explicit) return explicit;
  if (doc?.status === "Draft") return "draft";
  if (doc?.status === "Inactive") return "disabled";
  return "active";
}

function normalizeItem(doc) {
  const section = TYPE_TO_SECTION[doc.type] || "banners";
  const status = toAdminStatus(doc);
  const data = doc.data || {};

  return {
    id: toId(doc),
    section,
    type: doc.type,
    title: doc.title || data.name || "",
    name: data.name || doc.title || "",
    subtitle: doc.subtitle || data.designation || "",
    designation: data.designation || "",
    company: data.company || "",
    quote: data.quote || "",
    story: data.story || doc.description || "",
    salary: data.salary || "",
    category: data.category || "",
    author: data.author || "",
    pageSlug: String(data.pageSlug || ""),
    blockKey: String(data.blockKey || ""),
    buttonText: String(data.buttonText || ""),
    views: Number(data.views || 0),
    showOnHomepage: data.showOnHomepage !== false,
    image: doc.imageUrl || "",
    imageUrl: doc.imageUrl || "",
    url: doc.linkUrl || "",
    linkUrl: doc.linkUrl || "",
    startDate: toIsoDate(doc.startAt),
    endDate: toIsoDate(doc.endAt),
    createdAt: toIsoDate(doc.createdAt),
    publishDate: toIsoDate(doc.startAt || doc.createdAt),
    description: doc.description || "",
    priority: data.priorityLabel || "medium",
    priorityValue: Number(doc.priority || 0),
    status,
  };
}

function defaultSections() {
  return {
    homeSlides: [],
    publicPages: [],
    blogs: [],
    announcements: [],
    featuredCompanies: [],

    // legacy
    banners: [],
    testimonials: [],
    placed: [],
    internship: [],
    interviewQuestions: [],
    mockTests: [],
  };
}

function buildSections(docs) {
  const sections = defaultSections();
  for (const doc of docs) {
    const row = normalizeItem(doc);
    if (!sections[row.section]) sections[row.section] = [];
    sections[row.section].push(row);
  }
  return sections;
}

function buildPayload(section, body = {}) {
  const type = SECTION_TO_TYPE[section];
  if (!type) return { error: "Invalid content section" };

  const adminStatus = String(body.status || "active").toLowerCase();
  const priorityValue = Number(body.priorityValue);

  const payload = {
    type,
    status: toDbStatus(adminStatus),
    title: String(body.title || body.name || "").trim(),
    subtitle: String(body.subtitle || body.designation || "").trim(),
    description: String(body.description || body.quote || body.story || "").trim(),
    imageUrl: String(body.image || body.imageUrl || "").trim(),
    linkUrl: String(body.url || body.linkUrl || "").trim(),
    startAt: parseDate(body.startDate || body.publishDate),
    endAt: parseDate(body.endDate),
    placement: ["homeSlides", "banners", "featuredCompanies"].includes(section)
      ? "HOME"
      : ["internship", "interviewQuestions", "mockTests"].includes(section)
      ? "INTERNSHIP"
      : "GLOBAL",
    priority: Number.isFinite(priorityValue) ? priorityValue : 0,
    data: {
      adminStatus,
      name: String(body.name || body.title || "").trim(),
      designation: String(body.designation || body.subtitle || "").trim(),
      company: String(body.company || "").trim(),
      quote: String(body.quote || body.description || "").trim(),
      story: String(body.story || body.description || "").trim(),
      salary: String(body.salary || "").trim(),
      category: String(body.category || "").trim(),
      author: String(body.author || "").trim(),
      pageSlug: String(body.pageSlug || "").trim().toLowerCase(),
      blockKey: String(body.blockKey || "").trim().toLowerCase(),
      buttonText: String(body.buttonText || "").trim(),
      views: Number(body.views || 0),
      showOnHomepage: body.showOnHomepage !== false,
      priorityLabel: String(body.priority || "medium").toLowerCase(),
    },
  };

  return { payload };
}

export async function adminGetContent(req, res, next) {
  try {
    const [docs, govQuick] = await Promise.all([
      ContentItem.find({ type: { $in: ALL_TYPES } })
        .sort({ priority: -1, createdAt: -1 })
        .lean(),
      GovernmentUpdate.find({ status: "Active" })
        .sort({ priority: -1, publishedAt: -1, createdAt: -1 })
        .limit(8)
        .select("title")
        .lean(),
    ]);

    const sections = buildSections(docs);

    return res.json({
      ...sections,
      homeSlides: sections.homeSlides,
      publicPages: sections.publicPages,
      blogs: sections.blogs,
      announcements: sections.announcements,
      featuredCompanies: sections.featuredCompanies,

      // legacy aliases
      banners: sections.homeSlides,
      ads: sections.homeSlides,
      testimonials: sections.testimonials,
      placed: sections.placed,
      internship: {
        tips: sections.internship,
        questions: sections.interviewQuestions,
        mockTests: sections.mockTests,
      },
      governmentQuick: govQuick.map((x) => x.title).filter(Boolean),
    });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveContentItem(req, res, next) {
  try {
    const section = String(req.body?.section || "");
    const id = req.body?.id;

    const { payload, error } = buildPayload(section, req.body || {});
    if (error) return res.status(400).json({ message: error });

    if (req.user?._id) payload.createdBy = req.user._id;

    let doc;
    if (id) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid content id" });
      doc = await ContentItem.findByIdAndUpdate(id, { $set: payload }, { returnDocument: "after" }).lean();
      if (!doc) return res.status(404).json({ message: "Content item not found" });
    } else {
      doc = await ContentItem.create(payload);
      doc = doc.toObject();
    }

    return res.json({ ok: true, item: normalizeItem(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteContentItem(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid content id" });

    const doc = await ContentItem.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ message: "Content item not found" });

    return res.json({ ok: true, id: toId(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateContentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const nextStatus = String(req.body?.status || "").toLowerCase();

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid content id" });
    if (!nextStatus) return res.status(400).json({ message: "Status is required" });

    const dbStatus = toDbStatus(nextStatus);
    const doc = await ContentItem.findByIdAndUpdate(
      id,
      {
        $set: {
          status: dbStatus,
          "data.adminStatus": nextStatus,
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (!doc) return res.status(404).json({ message: "Content item not found" });

    return res.json({ ok: true, item: normalizeItem(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminBulkContentAction(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const action = String(req.body?.action || "").toLowerCase();

    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!validIds.length) return res.status(400).json({ message: "No valid ids provided" });

    if (action === "delete") {
      await ContentItem.deleteMany({ _id: { $in: validIds } });
      return res.json({ ok: true, ids: validIds.map(String) });
    }

    let status = "active";
    if (action === "publish") status = "published";
    if (action === "archive") status = "archived";
    if (action === "unpublish") status = "draft";

    await ContentItem.updateMany(
      { _id: { $in: validIds } },
      {
        $set: {
          status: toDbStatus(status),
          "data.adminStatus": status,
        },
      },
    );

    return res.json({ ok: true, ids: validIds.map(String), status });
  } catch (e) {
    next(e);
  }
}
