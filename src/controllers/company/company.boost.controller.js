// backend/src/controllers/company/company.boost.controller.js
import Job from "../../models/Job.js";
import Plan from "../../models/Plan.js";
import BoostCampaign from "../../models/BoostCampaign.js";
import mongoose from "mongoose";

const YEARLY_MULTIPLIER = 10;

function normalizeCycle(cycle) {
  return cycle === "yearly" ? "yearly" : "monthly";
}

function toStartEnd({ startMode, startDate, durationDays }) {
  const nowISO = new Date().toISOString().slice(0, 10);
  const startStr = startMode === "later" ? startDate || nowISO : nowISO;
  const start = new Date(`${startStr}T00:00:00.000Z`);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Number(durationDays || 7));

  return { start, end };
}

function computeStatus(start, end) {
  const now = new Date();
  if (now < start) return "Scheduled";
  if (now >= start && now < end) return "Active";
  return "Expired";
}

function mapPlanToBoostPlan(plan) {
  const monthlyPrice = Number(plan.price || 0);
  const yearlyPrice = Math.round(monthlyPrice * YEARLY_MULTIPLIER);
  const duration = Math.max(1, Number(plan.durationDays || 7));

  return {
    id: String(plan._id),
    name: plan.name,
    duration,
    monthlyPrice,
    yearlyPrice,
    reach: plan.description || `${duration} day premium visibility`,
    recommended: !!plan.highlight,
  };
}

async function fetchActiveBoostPlans() {
  const rows = await Plan.find({ active: true })
    .sort({ highlight: -1, price: 1, name: 1 })
    .lean();

  return rows.map(mapPlanToBoostPlan);
}

/**
 * GET /api/company/boost/plans
 */
export async function companyListBoostPlans(req, res) {
  const items = await fetchActiveBoostPlans();
  return res.json({ items });
}

/**
 * GET /api/company/boosts
 */
export async function companyListBoosts(req, res) {
  const companyId = req.user._id;

  const items = await BoostCampaign.find({ company: companyId })
    .populate("job", "title")
    .sort({ createdAt: -1 })
    .lean();

  const mapped = items.map((b) => {
    const liveStatus = computeStatus(new Date(b.start), new Date(b.end));
    return {
      id: b._id,
      jobId: b.job?._id,
      title: b.job?.title || "Job",
      planId: b.planId,
      planName: b.planName,
      cycle: b.cycle,
      start: new Date(b.start).toISOString().slice(0, 10),
      end: new Date(b.end).toISOString().slice(0, 10),
      status: b.status === "Cancelled" ? "Cancelled" : liveStatus,
      price: b.price,
      durationDays: b.durationDays,
    };
  });

  return res.json({ items: mapped, total: mapped.length });
}

/**
 * POST /api/company/jobs/:id/boost
 * body: { planId, cycle, startMode, startDate, durationDays }
 */
export async function companyBoostJob(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;

  const { planId, cycle, startMode = "now", startDate, durationDays } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(String(planId || ""))) {
    return res.status(400).json({ message: "Invalid planId" });
  }
  if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
    return res.status(400).json({ message: "Invalid job id" });
  }

  const planDoc = await Plan.findOne({ _id: planId, active: true }).lean();
  if (!planDoc) return res.status(400).json({ message: "Invalid planId" });

  const plan = mapPlanToBoostPlan(planDoc);
  const normalizedCycle = normalizeCycle(cycle);
  const days = Math.max(1, Number(durationDays || plan.duration || 7));
  const { start, end } = toStartEnd({ startMode, startDate, durationDays: days });

  const job = await Job.findOne({ _id: id, company: companyId });
  if (!job) return res.status(404).json({ message: "Job not found" });

  const jobStatus = String(job.status || "").toLowerCase();
  if (jobStatus === "closed" || jobStatus === "disabled") {
    return res.status(400).json({ message: "Only active jobs can be boosted" });
  }

  const price = normalizedCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const status = computeStatus(start, end);

  const campaign = await BoostCampaign.create({
    company: companyId,
    job: job._id,
    planId: plan.id,
    planName: plan.name,
    cycle: normalizedCycle,
    start,
    end,
    status,
    price,
    durationDays: days,
  });

  job.boostActive = status === "Active";
  job.boostPlanId = plan.id;
  job.boostPlanName = plan.name;
  job.boostStart = start;
  job.boostEnd = end;
  await job.save();

  return res.json({
    message: "Boost created",
    campaign: {
      id: campaign._id,
      jobId: job._id,
      title: job.title,
      planName: plan.name,
      cycle: normalizedCycle,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      status,
      price,
    },
  });
}

/**
 * PATCH /api/company/boosts/:id/cancel
 */
export async function companyCancelBoost(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;

  const boost = await BoostCampaign.findOne({ _id: id, company: companyId });
  if (!boost) return res.status(404).json({ message: "Boost not found" });

  boost.status = "Cancelled";
  await boost.save();

  const job = await Job.findOne({ _id: boost.job, company: companyId });
  if (job && job.boostPlanId === boost.planId) {
    job.boostActive = false;
    await job.save();
  }

  return res.json({ message: "Boost cancelled" });
}

/**
 * PATCH /api/company/boosts/:id/extend
 * body: { extraDays }
 */
export async function companyExtendBoost(req, res) {
  const companyId = req.user._id;
  const { id } = req.params;
  const { extraDays = 7 } = req.body || {};

  const boost = await BoostCampaign.findOne({ _id: id, company: companyId });
  if (!boost) return res.status(404).json({ message: "Boost not found" });
  if (boost.status === "Cancelled") return res.status(400).json({ message: "Boost is cancelled" });

  const end = new Date(boost.end);
  end.setUTCDate(end.getUTCDate() + Number(extraDays || 7));
  boost.end = end;
  boost.status = computeStatus(new Date(boost.start), end);
  boost.durationDays = Number(boost.durationDays || 0) + Number(extraDays || 7);
  await boost.save();

  const job = await Job.findOne({ _id: boost.job, company: companyId });
  if (job) {
    job.boostEnd = end;
    job.boostActive = computeStatus(new Date(job.boostStart), end) === "Active";
    await job.save();
  }

  return res.json({
    message: "Boost extended",
    end: end.toISOString().slice(0, 10),
    status: boost.status,
  });
}
