import mongoose from "mongoose";
import GovernmentUpdate from "../../models/GovernmentUpdate.js";

function toId(x) {
  return String(x?._id || x?.id || x || "");
}

function toIsoDate(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function toDbStatus(uiStatus = "draft") {
  const s = String(uiStatus || "").toLowerCase();
  if (["published", "active"].includes(s)) return "Active";
  if (["draft"].includes(s)) return "Draft";
  return "Inactive";
}

function toUiStatus(doc) {
  const ui = String(doc?.data?.status || "").toLowerCase();
  if (ui) return ui;
  if (doc.status === "Active") return "published";
  if (doc.status === "Draft") return "draft";
  return "expired";
}

function normalizeGov(doc) {
  const data = doc.data || {};

  return {
    id: toId(doc),
    title: doc.title || "",
    department: data.department || "",
    state: data.state || "",
    jobType: data.jobType || "",
    officialWebsite: data.officialWebsite || doc.link || "",
    applicationStartDate: data.applicationStartDate || doc.date || toIsoDate(doc.createdAt),
    applicationEndDate: data.applicationEndDate || "",
    applicationDeadline: data.applicationEndDate || "",
    shortDescription: data.shortDescription || doc.summary || "",
    fullDescription: data.fullDescription || doc.note || doc.summary || "",
    attachmentType: doc.type || "PDF",
    attachmentUrl: data.attachmentUrl || doc.fileUrl || doc.link || "",
    imageUrl: data.imageUrl || "",
    videoUrl: data.videoUrl || "",
    externalUrl: data.externalUrl || doc.link || "",
    metaTitle: data.metaTitle || doc.title || "",
    metaDescription: data.metaDescription || doc.summary || "",
    postedDate: doc.date || toIsoDate(doc.createdAt),
    status: toUiStatus(doc),
  };
}

function buildPayload(body = {}, createdBy) {
  const status = String(body.status || "draft").toLowerCase();
  const postedDate = body.postedDate || body.applicationStartDate || toIsoDate(new Date());
  const link = body.attachmentUrl || body.externalUrl || body.officialWebsite || "";

  return {
    createdBy,
    title: String(body.title || "").trim(),
    summary: String(body.shortDescription || "").trim(),
    type: String(body.attachmentType || "PDF").toUpperCase(),
    link: String(link || "").trim(),
    fileUrl: String(body.attachmentUrl || "").trim(),
    note: String(body.fullDescription || "").trim(),
    source: String(body.officialWebsite || "").trim(),
    status: toDbStatus(status),
    date: postedDate,
    publishedAt: new Date(),
    priority: Number(body.priority || 0),
    data: {
      department: String(body.department || "").trim(),
      state: String(body.state || "").trim(),
      jobType: String(body.jobType || "").trim(),
      officialWebsite: String(body.officialWebsite || "").trim(),
      applicationStartDate: String(body.applicationStartDate || "").trim(),
      applicationEndDate: String(body.applicationEndDate || "").trim(),
      shortDescription: String(body.shortDescription || "").trim(),
      fullDescription: String(body.fullDescription || "").trim(),
      attachmentUrl: String(body.attachmentUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim(),
      videoUrl: String(body.videoUrl || "").trim(),
      externalUrl: String(body.externalUrl || "").trim(),
      metaTitle: String(body.metaTitle || "").trim(),
      metaDescription: String(body.metaDescription || "").trim(),
      status,
    },
  };
}

export async function adminListGovUpdates(req, res, next) {
  try {
    const docs = await GovernmentUpdate.find({})
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ rows: docs.map(normalizeGov) });
  } catch (e) {
    next(e);
  }
}

export async function adminSaveGovUpdate(req, res, next) {
  try {
    const { id } = req.body || {};
    const payload = buildPayload(req.body || {}, req.user?._id);

    if (!payload.title) return res.status(400).json({ message: "Title is required" });

    let doc;
    if (id) {
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid update id" });

      doc = await GovernmentUpdate.findByIdAndUpdate(
        id,
        { $set: payload },
        { returnDocument: "after" },
      ).lean();

      if (!doc) return res.status(404).json({ message: "Government update not found" });
    } else {
      doc = await GovernmentUpdate.create(payload);
      doc = doc.toObject();
    }

    return res.json({ ok: true, row: normalizeGov(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteGovUpdate(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid update id" });

    const doc = await GovernmentUpdate.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ message: "Government update not found" });

    return res.json({ ok: true, id: toId(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateGovStatus(req, res, next) {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "").toLowerCase();

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid update id" });
    if (!status) return res.status(400).json({ message: "Status is required" });

    const doc = await GovernmentUpdate.findByIdAndUpdate(
      id,
      {
        $set: {
          status: toDbStatus(status),
          "data.status": status,
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (!doc) return res.status(404).json({ message: "Government update not found" });

    return res.json({ ok: true, row: normalizeGov(doc) });
  } catch (e) {
    next(e);
  }
}

export async function adminBulkGovUpdates(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const action = String(req.body?.action || "").toLowerCase();

    const validIds = ids.filter((x) => mongoose.isValidObjectId(x));
    if (!validIds.length) return res.status(400).json({ message: "No valid ids provided" });

    if (action === "delete") {
      await GovernmentUpdate.deleteMany({ _id: { $in: validIds } });
      return res.json({ ok: true, ids: validIds.map(String) });
    }

    const status = action === "publish" ? "published" : "draft";

    await GovernmentUpdate.updateMany(
      { _id: { $in: validIds } },
      {
        $set: {
          status: toDbStatus(status),
          "data.status": status,
        },
      },
    );

    return res.json({ ok: true, ids: validIds.map(String), status });
  } catch (e) {
    next(e);
  }
}
