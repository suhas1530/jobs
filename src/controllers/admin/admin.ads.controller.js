import Advertisement from "../../models/Advertisement.js";
import AdPlan from "../../models/AdPlan.js";
import AdPlanRequest from "../../models/AdPlanRequest.js";
import AdminNotification from "../../models/AdminNotification.js";
import Payment from "../../models/Payment.js";
import StudentNotification from "../../models/StudentNotification.js";
import User from "../../models/User.js";
import mongoose from "mongoose";
import { activateStudentAdAccess } from "../../services/paymentActivation.js";

function toId(value) {
  return String(value?._id || value?.id || value || "");
}

function isoDate(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function addDays(dateLike, days) {
  const dt = new Date(dateLike || Date.now());
  dt.setDate(dt.getDate() + Number(days || 0));
  return dt;
}

function mapRequestStatus(rawStatus, adAccess) {
  const status = String(rawStatus || "pending").toLowerCase();
  const access = adAccess || {};
  const accessStatus = String(access.planStatus || "").toLowerCase();
  const canPost = Boolean(access.canPost);

  if (status === "paid" || status === "approved") {
    if (accessStatus === "rejected") return "rejected";
    return canPost ? "approved" : "inactive";
  }
  if (status === "failed") return "failed";
  if (status === "created") return "created";
  return status;
}

function normalizeAdAccessForInactive({
  current = {},
  planName = "Ads Starter Plan",
  note = "",
  requestedAt = null,
}) {
  return {
    canPost: false,
    planStatus: current?.planStatus === "rejected" ? "rejected" : "approved",
    planName: planName || current?.planName || "Ads Starter Plan",
    requestedAt: current?.requestedAt || requestedAt || new Date(),
    approvedAt: current?.approvedAt || new Date(),
    expiresAt: current?.expiresAt || null,
    note: note || current?.note || "",
  };
}

function clearAdAccessIfMatches(current = {}, planName = "", allowedStatuses = []) {
  const currentStatus = String(current?.planStatus || "").toLowerCase();
  if (String(current?.planName || "") !== String(planName || "")) return current;
  if (allowedStatuses.length && !allowedStatuses.includes(currentStatus)) return current;
  return {
    canPost: false,
    planStatus: "none",
    planName: "Ads Starter Plan",
    requestedAt: null,
    approvedAt: null,
    expiresAt: null,
    note: "",
  };
}

async function notifyAdAccessUpdate({
  userId,
  userName = "Student",
  status = "approved",
  requestId = "",
  createdBy,
  triggeredBy = "Admin",
}) {
  const titleByStatus = {
    approved: "Admin approved your ad plan",
    rejected: "Admin rejected your ad plan",
    inactive: "Admin disabled your ad posting access",
    active: "Admin re-activated your ad posting access",
  };
  const descriptionByStatus = {
    approved: "Your ad plan is approved. You can post ads now.",
    rejected: "Your ad plan request was rejected. Contact admin for the next step.",
    inactive: "Your ad posting access is now inactive.",
    active: "Your ad posting access is active again.",
  };

  await Promise.all([
    StudentNotification.create({
      studentId: userId,
      type: "System",
      title: titleByStatus[status] || "Ad access updated",
      description: descriptionByStatus[status] || `Admin marked your ad access as ${status}.`,
      icon: "system",
      actions: status === "approved" || status === "active" ? ["Post Ad"] : ["View Notifications"],
      meta: {
        category: "ads-plan-status",
        requestId,
        status,
      },
      read: false,
    }),
    AdminNotification.create({
      title: `Ad access ${status}`,
      type: "Ads",
      target: "Student",
      triggeredBy,
      message: `${userName} ad access marked as ${status}.`,
      date: new Date().toISOString().slice(0, 10),
      audience: "Admins",
      status: "sent",
      mode: "immediate",
      createdBy,
    }),
  ]);
}

function mapPlanRequest(row) {
  const rawStatus = String(row.status || "pending").toLowerCase();
  return {
    id: toId(row),
    userId: toId(row.user),
    userName: row.user?.name || "Student",
    email: row.user?.email || "",
    planName: row.planName || "Ads Starter Plan",
    amount: typeof row.amount === "number" ? `Rs ${row.amount}` : row.amount || "",
    note: row.note || "",
    status: mapRequestStatus(rawStatus, row.user?.adAccess),
    paymentStatus: rawStatus,
    source: row.purpose === "student_ad_plan" ? "razorpay" : "manual",
    orderId: row.razorpayOrderId || "",
    paymentId: row.razorpayPaymentId || "",
    requestedAt: isoDate(row.requestedAt || row.createdAt || row.paidAt),
    decidedAt: isoDate(row.decidedAt || row.paidAt),
    approvedAt: isoDate(row.user?.adAccess?.approvedAt),
    expiresAt: isoDate(row.user?.adAccess?.expiresAt),
  };
}

function mapAdPlan(row) {
  return {
    id: toId(row),
    name: row.name || "Ads Starter Plan",
    price: Number(row.price || 0),
    durationDays: Number(row.durationDays || 30),
    description: row.description || "",
    placements: Array.isArray(row.placements) ? row.placements : ["student-home"],
    mediaTypes: Array.isArray(row.mediaTypes) ? row.mediaTypes : ["banner", "video", "pamphlet", "other"],
    active: Boolean(row.active),
    highlight: Boolean(row.highlight),
  };
}

function mapAd(row) {
  return {
    id: toId(row),
    userId: toId(row.user),
    userName: row.user?.name || "Student",
    email: row.user?.email || "",
    title: row.title || "",
    description: row.description || "",
    mediaType: row.mediaType || "banner",
    mediaUrl: row.mediaUrl || "",
    mediaResourceType: row.mediaResourceType || "",
    ctaLabel: row.ctaLabel || "Learn More",
    targetUrl: row.targetUrl || "",
    contactLabel: row.contactLabel || "",
    audience: row.audience || "",
    status: row.status || "active",
    rejectedReason: row.rejectedReason || "",
    createdAt: isoDate(row.createdAt),
    approvedAt: isoDate(row.approvedAt),
  };
}

export async function adminGetAdsCenter(req, res, next) {
  try {
    const [requests, payments, ads, plans] = await Promise.all([
      AdPlanRequest.find({})
        .sort({ createdAt: -1 })
        .populate("user", "name email adAccess")
        .lean(),
      Payment.find({ purpose: "student_ad_plan" })
        .sort({ createdAt: -1 })
        .populate("user", "name email adAccess")
        .lean(),
      Advertisement.find({})
        .sort({ createdAt: -1 })
        .populate("user", "name email")
        .lean(),
      AdPlan.find({}).sort({ createdAt: -1 }).lean(),
    ]);

    return res.json({
      requests: [...payments, ...requests]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .map(mapPlanRequest),
      ads: ads.map(mapAd),
      plans: plans.map(mapAdPlan),
    });
  } catch (err) {
    next(err);
  }
}

export async function adminSaveAdPlan(req, res, next) {
  try {
    const body = req.body || {};
    const id = body.id || body._id;
    const payload = {
      name: String(body.name || "").trim(),
      price: Number(body.price || 0),
      durationDays: Number(body.durationDays || 30),
      description: String(body.description || "").trim(),
      placements: Array.isArray(body.placements) ? body.placements.filter(Boolean) : ["student-home"],
      mediaTypes: Array.isArray(body.mediaTypes) ? body.mediaTypes.filter(Boolean) : ["banner", "video", "pamphlet", "other"],
      active: body.active !== false,
      highlight: Boolean(body.highlight),
    };

    if (!payload.name) return res.status(400).json({ message: "Ad plan name is required." });

    let plan;
    if (id && mongoose.isValidObjectId(id)) {
      plan = await AdPlan.findByIdAndUpdate(id, { $set: payload }, { returnDocument: "after" }).lean();
      if (!plan) return res.status(404).json({ message: "Ad plan not found." });
    } else {
      try {
        plan = await AdPlan.create(payload);
        plan = plan.toObject();
      } catch (err) {
        if (err?.code !== 11000) throw err;
        const existing = await AdPlan.findOne({ name: payload.name });
        if (!existing) throw err;
        plan = await AdPlan.findByIdAndUpdate(existing._id, { $set: payload }, { returnDocument: "after" }).lean();
      }
    }

    return res.json({ ok: true, plan: mapAdPlan(plan) });
  } catch (err) {
    next(err);
  }
}

export async function adminDeleteAdPlan(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid ad plan id." });
    const deleted = await AdPlan.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ message: "Ad plan not found." });
    return res.json({ ok: true, id: toId(deleted) });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateAdPlanRequest(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const status = String(req.body?.status || "").toLowerCase();
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const request = await AdPlanRequest.findById(id).populate("user", "name email").lean();
    if (!request) return res.status(404).json({ message: "Ad plan request not found." });

    const decidedAt = new Date();
    const approvedAt = status === "approved" ? new Date() : null;
    const expiresAt = status === "approved" ? addDays(approvedAt, 30) : null;

    await AdPlanRequest.findByIdAndUpdate(id, {
      $set: {
        status,
        decidedAt,
        decidedBy: req.user._id,
      },
    });

    await User.findByIdAndUpdate(request.user?._id || request.user, {
      $set: {
        adAccess: {
          canPost: status === "approved",
          planStatus: status,
          planName: request.planName || "Ads Starter Plan",
          requestedAt: request.requestedAt || request.createdAt || new Date(),
          approvedAt,
          expiresAt,
          note: request.note || "",
        },
      },
    });

    const noteTitle =
      status === "approved"
        ? "Admin approved your ad plan"
        : status === "rejected"
        ? "Admin rejected your ad plan"
        : "Ad plan status updated";
    const noteDescription =
      status === "approved"
        ? "Admin had approve now you can post it."
        : status === "rejected"
        ? "Your ad plan request was rejected. Contact admin for the next step."
        : "Your ad plan request is pending review.";

    await Promise.all([
      StudentNotification.create({
        studentId: request.user?._id || request.user,
        type: "System",
        title: noteTitle,
        description: noteDescription,
        icon: "system",
        actions: status === "approved" ? ["Post Ad"] : ["View Notifications"],
        meta: {
          category: "ads-plan-status",
          requestId: id,
          status,
        },
        read: false,
      }),
      AdminNotification.create({
        title: `Ad plan ${status}`,
        type: "Ads",
        target: "Student",
        triggeredBy: req.user?.name || "Admin",
        message: `${request.user?.name || "Student"} ad plan request marked as ${status}.`,
        date: new Date().toISOString().slice(0, 10),
        audience: "Admins",
        status: "sent",
        mode: "immediate",
        createdBy: req.user._id,
      }),
    ]);

    const refreshed = await AdPlanRequest.findById(id)
      .populate("user", "name email adAccess")
      .lean();

    return res.json({
      ok: true,
      request: mapPlanRequest(refreshed),
    });
  } catch (err) {
    next(err);
  }
}

export async function adminRunAdPlanRequestAction(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "").toLowerCase();
    const source = String(req.body?.source || "manual").toLowerCase();

    if (!["approve", "reject", "active", "inactive", "delete"].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }
    if (!["manual", "razorpay"].includes(source)) {
      return res.status(400).json({ message: "Invalid source." });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request id." });
    }

    if (source === "manual") {
      const request = await AdPlanRequest.findById(id).populate("user", "name email adAccess").lean();
      if (!request) return res.status(404).json({ message: "Ad plan request not found." });

      const userId = request.user?._id || request.user;
      const userName = request.user?.name || "Student";
      const planName = request.planName || "Ads Starter Plan";
      const adPlan = await AdPlan.findOne({ name: planName }).lean();
      const adPlanLike = adPlan || { name: planName, durationDays: 30 };

      if (action === "approve" || action === "active") {
        await AdPlanRequest.findByIdAndUpdate(id, {
          $set: {
            status: "approved",
            decidedAt: new Date(),
            decidedBy: req.user._id,
          },
        });
        await activateStudentAdAccess({
          userId,
          adPlan: adPlanLike,
          note: request.note || "",
        });
        await notifyAdAccessUpdate({
          userId,
          userName,
          status: action === "active" ? "active" : "approved",
          requestId: id,
          createdBy: req.user._id,
          triggeredBy: req.user?.name || "Admin",
        });

        const refreshed = await AdPlanRequest.findById(id)
          .populate("user", "name email adAccess")
          .lean();
        return res.json({ ok: true, request: mapPlanRequest(refreshed) });
      }

      if (action === "reject") {
        await AdPlanRequest.findByIdAndUpdate(id, {
          $set: {
            status: "rejected",
            decidedAt: new Date(),
            decidedBy: req.user._id,
          },
        });
        await User.findByIdAndUpdate(userId, {
          $set: {
            adAccess: {
              canPost: false,
              planStatus: "rejected",
              planName,
              requestedAt: request.requestedAt || request.createdAt || new Date(),
              approvedAt: null,
              expiresAt: null,
              note: request.note || "",
            },
          },
        });
        await notifyAdAccessUpdate({
          userId,
          userName,
          status: "rejected",
          requestId: id,
          createdBy: req.user._id,
          triggeredBy: req.user?.name || "Admin",
        });

        const refreshed = await AdPlanRequest.findById(id)
          .populate("user", "name email adAccess")
          .lean();
        return res.json({ ok: true, request: mapPlanRequest(refreshed) });
      }

      if (action === "inactive") {
        await User.findByIdAndUpdate(userId, {
          $set: {
            adAccess: normalizeAdAccessForInactive({
              current: request.user?.adAccess,
              planName,
              note: request.note || "",
              requestedAt: request.requestedAt || request.createdAt || new Date(),
            }),
          },
        });
        await notifyAdAccessUpdate({
          userId,
          userName,
          status: "inactive",
          requestId: id,
          createdBy: req.user._id,
          triggeredBy: req.user?.name || "Admin",
        });

        const refreshed = await AdPlanRequest.findById(id)
          .populate("user", "name email adAccess")
          .lean();
        return res.json({ ok: true, request: mapPlanRequest(refreshed) });
      }

      const nextAccess = clearAdAccessIfMatches(request.user?.adAccess || {}, planName, ["pending", "rejected"]);
      if (nextAccess !== (request.user?.adAccess || {})) {
        await User.findByIdAndUpdate(userId, { $set: { adAccess: nextAccess } });
      }
      await AdPlanRequest.findByIdAndDelete(id);
      return res.json({ ok: true, deleted: true, id, source });
    }

    const payment = await Payment.findOne({
      _id: id,
      purpose: "student_ad_plan",
    }).populate("user", "name email adAccess").lean();
    if (!payment) return res.status(404).json({ message: "Payment record not found." });

    const userId = payment.user?._id || payment.user;
    const userName = payment.user?.name || "Student";
    const planName = payment.planName || "Ads Starter Plan";
    const adPlan = payment.planId ? await AdPlan.findById(payment.planId).lean() : await AdPlan.findOne({ name: planName }).lean();
    const adPlanLike = adPlan || { name: planName, durationDays: 30 };

    if (action === "approve" || action === "active") {
      if (action === "approve" && String(payment.status || "").toLowerCase() !== "paid") {
        await Payment.findByIdAndUpdate(id, {
          $set: {
            status: "paid",
            paidAt: payment.paidAt || new Date(),
          },
        });
      }
      await activateStudentAdAccess({
        userId,
        adPlan: adPlanLike,
        note: payment.notes?.note || "",
      });
      await notifyAdAccessUpdate({
        userId,
        userName,
        status: action === "active" ? "active" : "approved",
        requestId: id,
        createdBy: req.user._id,
        triggeredBy: req.user?.name || "Admin",
      });

      const refreshed = await Payment.findById(id)
        .populate("user", "name email adAccess")
        .lean();
      return res.json({ ok: true, request: mapPlanRequest(refreshed) });
    }

    if (action === "inactive") {
      await User.findByIdAndUpdate(userId, {
        $set: {
          adAccess: normalizeAdAccessForInactive({
            current: payment.user?.adAccess,
            planName,
            requestedAt: payment.paidAt || payment.createdAt || new Date(),
          }),
        },
      });
      await notifyAdAccessUpdate({
        userId,
        userName,
        status: "inactive",
        requestId: id,
        createdBy: req.user._id,
        triggeredBy: req.user?.name || "Admin",
      });

      const refreshed = await Payment.findById(id)
        .populate("user", "name email adAccess")
        .lean();
      return res.json({ ok: true, request: mapPlanRequest(refreshed) });
    }

    if (action === "reject") {
      return res.status(400).json({ message: "Reject is only available for manual ad requests." });
    }

    await Payment.findByIdAndDelete(id);
    return res.json({ ok: true, deleted: true, id, source });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateAdStatus(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const status = String(req.body?.status || "").toLowerCase();
    const rejectedReason = String(req.body?.rejectedReason || "").trim();

    if (!["active", "inactive", "rejected", "archived"].includes(status)) {
      return res.status(400).json({ message: "Invalid ad status." });
    }
    if (status === "rejected" && !rejectedReason) {
      return res.status(400).json({ message: "Reject reason is required." });
    }

    const ad = await Advertisement.findById(id).populate("user", "name email").lean();
    if (!ad) return res.status(404).json({ message: "Advertisement not found." });

    await Advertisement.findByIdAndUpdate(id, {
      $set: {
        status,
        approvedAt: status === "active" ? new Date() : ad.approvedAt || null,
        approvedBy: status === "active" ? req.user._id : ad.approvedBy || null,
        rejectedReason: status === "rejected" ? rejectedReason : "",
      },
    });

    const titleByStatus = {
      active: "Your ad is live",
      inactive: "Your ad is inactive",
      rejected: "Your ad was rejected",
      archived: "Your ad was archived",
    };
    const descriptionByStatus = {
      active: "Admin marked your ad as active on the student home page.",
      inactive: "Admin marked your ad as inactive. It is hidden from the student home page.",
      rejected: rejectedReason,
      archived: "Admin archived your ad. It is no longer shown on the student home page.",
    };

    await StudentNotification.create({
      studentId: ad.user?._id || ad.user,
      type: "System",
      title: titleByStatus[status] || `Your ad was ${status}`,
      description: descriptionByStatus[status] || `Admin marked your ad as ${status}.`,
      icon: "system",
      actions: ["View Notifications"],
      meta: { category: "ad-status", adId: id, status },
      read: false,
    });

    const refreshed = await Advertisement.findById(id).populate("user", "name email").lean();
    return res.json({
      ok: true,
      ad: mapAd(refreshed),
    });
  } catch (err) {
    next(err);
  }
}
