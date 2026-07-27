import ContentItem from "../models/ContentItem.js";

function isVisible(doc, now = new Date()) {
  if (!doc) return false;
  if (String(doc.status || "") !== "Active") return false;
  if (doc.startAt && new Date(doc.startAt) > now) return false;
  if (doc.endAt && new Date(doc.endAt) < now) return false;
  if (doc.data?.showOnHomepage === false) return false;
  return true;
}

function mapBanner(doc) {
  return {
    id: String(doc._id),
    title: doc.title || doc.data?.name || "",
    subtitle: doc.subtitle || doc.description || "",
    imageUrl: doc.imageUrl || "",
    linkUrl: doc.linkUrl || "",
    description: doc.description || "",
    priority: Number(doc.priority || 0),
  };
}

function mapAnnouncement(doc) {
  return {
    id: String(doc._id),
    title: doc.title || "",
    subtitle: doc.subtitle || "",
    description: doc.description || "",
    linkUrl: doc.linkUrl || "",
    imageUrl: doc.imageUrl || "",
    priority: Number(doc.priority || 0),
    createdAt: doc.createdAt,
  };
}

function mapPublicPage(doc) {
  return {
    id: String(doc._id),
    title: doc.title || "",
    subtitle: doc.subtitle || "",
    description: doc.description || "",
    imageUrl: doc.imageUrl || "",
    linkUrl: doc.linkUrl || "",
    pageSlug: String(doc.data?.pageSlug || "home"),
    blockKey: String(doc.data?.blockKey || ""),
    buttonText: String(doc.data?.buttonText || ""),
    priority: Number(doc.priority || 0),
  };
}

function mapBlog(doc) {
  return {
    id: String(doc._id),
    title: doc.title || "",
    subtitle: doc.subtitle || "",
    description: doc.description || "",
    imageUrl: doc.imageUrl || "",
    linkUrl: doc.linkUrl || "",
    author: String(doc.data?.author || ""),
    pageSlug: String(doc.data?.pageSlug || "home"),
    priority: Number(doc.priority || 0),
    createdAt: doc.createdAt,
  };
}

function mapFeaturedCompany(doc) {
  return {
    id: String(doc._id),
    title: doc.title || doc.data?.name || "",
    subtitle: doc.subtitle || "",
    description: doc.description || "",
    imageUrl: doc.imageUrl || "",
    linkUrl: doc.linkUrl || "",
    priority: Number(doc.priority || 0),
  };
}

export async function getStudentHomeContent(req, res, next) {
  try {
    const [bannerDocs, announcementDocs, featuredDocs] = await Promise.all([
      ContentItem.find({ type: "HOME_AD", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      ContentItem.find({ type: "ANNOUNCEMENT", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      ContentItem.find({ type: "FEATURED_COMPANY", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const now = new Date();
    const banners = bannerDocs.filter((x) => isVisible(x, now)).map(mapBanner);
    const announcements = announcementDocs.filter((x) => isVisible(x, now)).map(mapAnnouncement);
    const featuredCompanies = featuredDocs.filter((x) => isVisible(x, now)).map(mapFeaturedCompany);

    return res.json({ banners, announcements, featuredCompanies });
  } catch (err) {
    next(err);
  }
}

export async function getPublicContent(req, res, next) {
  try {
    const [bannerDocs, announcementDocs, publicPageDocs, blogDocs] = await Promise.all([
      ContentItem.find({ type: "HOME_AD", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      ContentItem.find({ type: "ANNOUNCEMENT", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      ContentItem.find({ type: "PUBLIC_PAGE", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(60)
        .lean(),
      ContentItem.find({ type: "BLOG", status: "Active" })
        .sort({ priority: -1, createdAt: -1 })
        .limit(40)
        .lean(),
    ]);

    const now = new Date();
    const banners = bannerDocs.filter((x) => isVisible(x, now)).map(mapBanner);
    const announcements = announcementDocs.filter((x) => isVisible(x, now)).map(mapAnnouncement);
    const publicPages = publicPageDocs.filter((x) => isVisible(x, now)).map(mapPublicPage);
    const blogs = blogDocs.filter((x) => isVisible(x, now)).map(mapBlog);

    return res.json({ banners, announcements, publicPages, blogs });
  } catch (err) {
    next(err);
  }
}
