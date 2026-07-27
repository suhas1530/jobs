import User from "../../models/User.js";
import Job from "../../models/Job.js";
import Application from "../../models/Application.js";
import CompanyProfile from "../../models/CompanyProfile.js";
import PlanRequest from "../../models/PlanRequest.js";

/**
 * Small helper to compute percent trend between two numbers
 */
function pctTrend(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;

  if (prev === 0 && cur === 0) return { dir: "flat", value: "0%", label: "" };
  if (prev === 0 && cur > 0) return { dir: "up", value: "+100%", label: "" };

  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return { dir, value: `${sign}${pct}%`, label: "" };
}

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(date, days) {
  const x = new Date(date);
  x.setDate(x.getDate() + days);
  return x;
}

async function requireDbUser(req, res) {
  if (req.user) return req.user;

  const clerkId = req.auth()?.userId;
  if (!clerkId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  const user = await User.findOne({ clerkId }).lean();
  if (!user) {
    res.status(401).json({ message: "User not synced in DB. Please login again." });
    return null;
  }
  return user;
}

export const getAdminDashboard = async (req, res, next) => {
  try {
    const me = await requireDbUser(req, res);
    if (!me) return;
    if (String(me.role).toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ---------- totals ----------
    const [companies, students, jobs, applications, pendingPlans] = await Promise.all([
      User.countDocuments({ role: "company", deletedAt: null }),
      User.countDocuments({ role: "student", deletedAt: null }),
      Job.countDocuments({}),
      Application.countDocuments({}),
      PlanRequest.countDocuments({ status: "pending" }),
    ]);

    // ---------- trends ----------
    // 30-day windows for users
    const now = new Date();
    const d30 = addDays(now, -30);
    const d60 = addDays(now, -60);

    const [
      companies30,
      companiesPrev30,
      students30,
      studentsPrev30,
      jobs7,
      jobsPrev7,
      apps7,
      appsPrev7,
      pendingToday,
      pendingYesterday,
    ] = await Promise.all([
      User.countDocuments({ role: "company", createdAt: { $gte: d30 }, deletedAt: null }),
      User.countDocuments({ role: "company", createdAt: { $gte: d60, $lt: d30 }, deletedAt: null }),

      User.countDocuments({ role: "student", createdAt: { $gte: d30 }, deletedAt: null }),
      User.countDocuments({ role: "student", createdAt: { $gte: d60, $lt: d30 }, deletedAt: null }),

      Job.countDocuments({ createdAt: { $gte: addDays(now, -7) } }),
      Job.countDocuments({ createdAt: { $gte: addDays(now, -14), $lt: addDays(now, -7) } }),

      Application.countDocuments({ createdAt: { $gte: addDays(now, -7) } }),
      Application.countDocuments({ createdAt: { $gte: addDays(now, -14), $lt: addDays(now, -7) } }),

      PlanRequest.countDocuments({ status: "pending", createdAt: { $gte: dayStart(now) } }),
      PlanRequest.countDocuments({
        status: "pending",
        createdAt: { $gte: dayStart(addDays(now, -1)), $lt: dayStart(now) },
      }),
    ]);

    const trends = {
      companies: { ...pctTrend(companies30, companiesPrev30), label: "this month" },
      students: { ...pctTrend(students30, studentsPrev30), label: "this month" },
      jobs: { ...pctTrend(jobs7, jobsPrev7), label: "this week" },
      applications: { ...pctTrend(apps7, appsPrev7), label: "this week" },
      pendingPlans: {
        dir: pendingToday > pendingYesterday ? "up" : pendingToday < pendingYesterday ? "down" : "flat",
        value:
          pendingToday === pendingYesterday
            ? "0"
            : pendingToday > pendingYesterday
            ? `+${pendingToday - pendingYesterday}`
            : `${pendingToday - pendingYesterday}`,
        label: "today",
      },
    };

    // ---------- charts (last 7 days buckets) ----------
    const start = dayStart(addDays(now, -6)); // 7 days including today
    const end = addDays(dayStart(now), 1);

    const [jobsAgg, appsAgg] = await Promise.all([
      Job.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, c: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Application.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, c: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const mapAgg = (arr) => {
      const m = new Map();
      arr.forEach((x) => m.set(x._id, x.c));
      return m;
    };

    const jobsMap = mapAgg(jobsAgg);
    const appsMap = mapAgg(appsAgg);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
    }

    const jobs7d = days.map((k) => jobsMap.get(k) || 0);
    const applications7d = days.map((k) => appsMap.get(k) || 0);

    // ---------- pending plan requests list ----------
    const pending = await PlanRequest.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("company", "name email phone")
      .lean();

    const planRequests = await Promise.all(
      pending.map(async (pr) => {
        // optional: try to pick company name from CompanyProfile if available
        let companyName = pr.company?.name || "Company";
        if (pr.company?._id) {
          const cp = await CompanyProfile.findOne({ user: pr.company._id }).lean();
          if (cp?.companyName) companyName = cp.companyName;
        }

        return {
          id: String(pr._id),
          company: companyName,
          planLabel: pr.planName || "Plan",
          amount: pr.amount || "",
          date: (pr.requestedAt || pr.createdAt || new Date()).toISOString().slice(0, 10),
          status: pr.status,
        };
      })
    );

    // ---------- activity ----------
    // keep it simple and useful for your UI
    const [recentJobs, recentCompanies, recentApps] = await Promise.all([
      Job.find({}).sort({ createdAt: -1 }).limit(2).populate("company", "name").lean(),
      User.find({ role: "company" }).sort({ createdAt: -1 }).limit(2).lean(),
      Application.find({}).sort({ createdAt: -1 }).limit(2).populate("job", "title").lean(),
    ]);

    const activity = [
      ...recentCompanies.map((c, idx) => ({
        id: `c_${c._id}_${idx}`,
        title: "New company registered",
        desc: `${c.name || "A company"} joined JobGateway.`,
        time: new Date(c.createdAt).toLocaleString(),
      })),
      ...recentJobs.map((j, idx) => ({
        id: `j_${j._id}_${idx}`,
        title: "Job posted",
        desc: `${j.title} is now live.`,
        time: new Date(j.createdAt).toLocaleString(),
      })),
      ...recentApps.map((a, idx) => ({
        id: `a_${a._id}_${idx}`,
        title: "New application received",
        desc: `${a.job?.title || "A job"} got a new application.`,
        time: new Date(a.createdAt).toLocaleString(),
      })),
    ].slice(0, 6);

    return res.json({
      totals: { companies, students, jobs, applications, pendingPlans },
      trends,
      charts: { jobs7d, applications7d },
      planRequests,
      activity,
    });
  } catch (e) {
    next(e);
  }
};

export const approvePlanRequest = async (req, res, next) => {
  try {
    const me = await requireDbUser(req, res);
    if (!me) return;
    if (String(me.role).toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    const pr = await PlanRequest.findById(id);
    if (!pr) return res.status(404).json({ message: "Plan request not found" });

    if (pr.status !== "pending") {
      return res.status(400).json({ message: `Already ${pr.status}` });
    }

    pr.status = "approved";
    pr.decidedAt = new Date();
    pr.decidedBy = me._id;
    await pr.save();

    return res.json({ ok: true, id: String(pr._id), status: pr.status });
  } catch (e) {
    next(e);
  }
};

export const rejectPlanRequest = async (req, res, next) => {
  try {
    const me = await requireDbUser(req, res);
    if (!me) return;
    if (String(me.role).toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    const pr = await PlanRequest.findById(id);
    if (!pr) return res.status(404).json({ message: "Plan request not found" });

    if (pr.status !== "pending") {
      return res.status(400).json({ message: `Already ${pr.status}` });
    }

    pr.status = "rejected";
    pr.decidedAt = new Date();
    pr.decidedBy = me._id;
    await pr.save();

    return res.json({ ok: true, id: String(pr._id), status: pr.status });
  } catch (e) {
    next(e);
  }
};
