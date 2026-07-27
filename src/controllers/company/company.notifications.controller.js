// backend/src/controllers/company/company.notifications.controller.js
import Company from "../../models/Company.js";
import Notification from "../../models/Notification.js";

function groupLabel(dateValue) {
  const d = new Date(dateValue);
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d1 = new Date(d0);
  d1.setDate(d1.getDate() - 1);

  if (d >= d0) return "Today";
  if (d >= d1 && d < d0) return "Yesterday";
  return "Earlier";
}

function timeAgo(dateValue) {
  const d = new Date(dateValue);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function getCompanyIdForUser(req) {
  const ownerUserId = req.user?._id;
  if (!ownerUserId) return null;

  // Ensure company document exists for company users created before Company model usage.
  const fallbackName =
    req.user?.name?.trim() ||
    req.user?.email?.split("@")?.[0] ||
    "Company";

  const company = await Company.findOneAndUpdate(
    { ownerUserId },
    {
      $setOnInsert: {
        ownerUserId,
        name: fallbackName,
        email: req.user?.email || "",
      },
    },
    { returnDocument: "after", upsert: true }
  );

  return company?._id || null;
}

// GET /api/company/notifications?type=&status=&limit=&page=
export const listCompanyNotifications = async (req, res, next) => {
  try {
    const companyId = await getCompanyIdForUser(req);
    if (!companyId) return res.status(404).json({ message: "Company not found" });

    const { type = "All", status = "All", page = 1, limit = 30 } = req.query;

    const q = { companyId };

    if (type && type !== "All") {
      // Frontend might send "System Alerts"
      q.type = type === "System Alerts" ? "System" : type;
    }

    if (status === "Unread") q.read = false;
    if (status === "Read") q.read = true;

    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.min(100, Math.max(1, Number(limit) || 30));
    const skip = (pageNum - 1) * lim;

    const [items, total] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      Notification.countDocuments(q),
    ]);

    const mapped = items.map((n) => ({
      id: n._id,
      type: n.type,
      title: n.title,
      desc: n.desc,
      time: timeAgo(n.createdAt),
      read: !!n.read,
      dateGroup: n.dateGroup || groupLabel(n.createdAt),
      action: n.actionLabel || "Open",
      actionUrl: n.actionUrl || "",
      createdAt: n.createdAt,
    }));

    res.json({ items: mapped, total });
  } catch (e) {
    next(e);
  }
};

// PATCH /api/company/notifications/:id/read  { read: true/false }
export const markCompanyNotificationRead = async (req, res, next) => {
  try {
    const companyId = await getCompanyIdForUser(req);
    if (!companyId) return res.status(404).json({ message: "Company not found" });

    const { id } = req.params;
    const { read = true } = req.body;

    const updated = await Notification.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { read: !!read } },
      { returnDocument: "after" }
    );

    if (!updated) return res.status(404).json({ message: "Notification not found" });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// PATCH /api/company/notifications/read-all
export const markAllCompanyNotificationsRead = async (req, res, next) => {
  try {
    const companyId = await getCompanyIdForUser(req);
    if (!companyId) return res.status(404).json({ message: "Company not found" });

    await Notification.updateMany({ companyId, read: false }, { $set: { read: true } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// POST /api/company/notifications/seed  (dev helper)
export const seedCompanyNotifications = async (req, res, next) => {
  try {
    const companyId = await getCompanyIdForUser(req);
    if (!companyId) return res.status(404).json({ message: "Company not found" });

    const seed = [
      {
        companyId,
        type: "Applications",
        title: "New application received for Software Developer",
        desc: "Ananya Reddy submitted a new application.",
        actionLabel: "View Application",
        actionUrl: "/company/candidates",
        read: false,
      },
      {
        companyId,
        type: "Interviews",
        title: "Interview scheduled",
        desc: "Rahul Sharma is scheduled for Technical Round.",
        actionLabel: "Open Interview",
        actionUrl: "/company/interviews",
        read: false,
      },
      {
        companyId,
        type: "Messages",
        title: "New message from candidate",
        desc: "Sana Khan asked about the interview timeline.",
        actionLabel: "Open Message",
        actionUrl: "/company/messages",
        read: true,
      },
      {
        companyId,
        type: "Billing",
        title: "Your subscription will expire soon",
        desc: "Renew now to keep premium features active.",
        actionLabel: "View Plan",
        actionUrl: "/company/pricing",
        read: false,
      },
      {
        companyId,
        type: "System",
        title: "Boost campaign ended",
        desc: "Backend Engineer boost has ended. Extend to continue reach.",
        actionLabel: "View Plan",
        actionUrl: "/company/boost-job",
        read: true,
      },
    ];

    await Notification.insertMany(seed);

    res.json({ ok: true, inserted: seed.length });
  } catch (e) {
    next(e);
  }
};
