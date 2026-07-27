import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Job from "../models/Job.js";
import Plan from "../models/Plan.js";

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const DAYS_365 = 365 * 24 * 60 * 60 * 1000;
const UNLIMITED_THRESHOLD = 999999;

export function toSafeLimit(v, fallback = 0) {
  if (typeof v === "string" && v.toLowerCase() === "unlimited") return UNLIMITED_THRESHOLD;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapCompanyPlanForUi(planDoc) {
  const monthlyPrice = Number(planDoc.price || 0);
  const yearlyPrice = Math.round(monthlyPrice * 10);
  const monthlyJobs = toSafeLimit(planDoc.jobsLimit, 1);
  const monthlyApps = toSafeLimit(planDoc.appsLimit, 100);
  const prettyJobs = monthlyJobs >= UNLIMITED_THRESHOLD ? "Unlimited" : monthlyJobs;
  const prettyApps = monthlyApps >= UNLIMITED_THRESHOLD ? "Unlimited" : monthlyApps;

  return {
    id: String(planDoc._id),
    name: planDoc.name,
    tagline: planDoc.description || "Company hiring plan",
    features: [
      `${prettyJobs} jobs / month`,
      `${prettyApps} applications / month`,
      "Razorpay checkout enabled",
    ],
    monthlyPrice,
    yearlyPrice,
    monthly: {
      jobsLimit: monthlyJobs,
      appsLimit: monthlyApps,
    },
    yearly: {
      jobsLimit: monthlyJobs >= UNLIMITED_THRESHOLD ? UNLIMITED_THRESHOLD : monthlyJobs * 12,
      appsLimit: monthlyApps >= UNLIMITED_THRESHOLD ? UNLIMITED_THRESHOLD : monthlyApps * 12,
    },
  };
}

function resolvePlanLimitsForCycle(planDoc, cycle = "monthly") {
  const mapped = mapCompanyPlanForUi(planDoc);
  return cycle === "yearly" ? mapped.yearly : mapped.monthly;
}

export async function syncSubscriptionPlanLimits(sub) {
  if (!sub?.planName) return sub;

  const planDoc = await Plan.findOne({ name: sub.planName }).lean();
  if (!planDoc) return sub;

  const limits = resolvePlanLimitsForCycle(planDoc, sub.billingCycle);
  const nextJobsLimit = Number(limits.jobsLimit ?? sub.jobsLimit ?? 0);
  const nextAppsLimit = Number(limits.appsLimit ?? sub.appsLimit ?? 0);
  const jobsChanged = Number(sub.jobsLimit ?? 0) !== nextJobsLimit;
  const appsChanged = Number(sub.appsLimit ?? 0) !== nextAppsLimit;

  if (!jobsChanged && !appsChanged) return sub;

  sub.jobsLimit = nextJobsLimit;
  sub.appsLimit = nextAppsLimit;
  await sub.save();
  return sub;
}

export async function ensureSubscription(userId) {
  let sub = await Subscription.findOne({ company: userId });
  if (!sub) {
    sub = await Subscription.create({
      company: userId,
      planName: "Starter",
      billingCycle: "monthly",
      price: 0,
      start: null,
      end: null,
      status: "inactive",
      jobsLimit: 0,
      jobsUsed: 0,
      appsLimit: 0,
      appsUsed: 0,
    });
  }
  await syncSubscriptionPlanLimits(sub);
  return sub;
}

export async function activateCompanySubscription({
  companyId,
  plan,
  cycle = "monthly",
}) {
  const billingCycle = cycle === "yearly" ? "yearly" : "monthly";
  const duration = billingCycle === "yearly" ? DAYS_365 : DAYS_30;
  const mapped = mapCompanyPlanForUi(plan);
  const limits = resolvePlanLimitsForCycle(plan, billingCycle);
  const price = billingCycle === "yearly" ? mapped.yearlyPrice : mapped.monthlyPrice;
  const activeJobs = await Job.countDocuments({ company: companyId, status: "Active" });

  const sub = await ensureSubscription(companyId);
  sub.planName = mapped.name;
  sub.billingCycle = billingCycle;
  sub.price = price;
  sub.status = "active";
  sub.start = new Date();
  sub.end = new Date(Date.now() + duration);
  sub.jobsLimit = limits.jobsLimit;
  sub.appsLimit = limits.appsLimit;
  sub.jobsUsed = activeJobs;
  sub.appsUsed = 0;
  await sub.save();
  return sub;
}

export async function activateStudentAdAccess({
  userId,
  adPlan,
  note = "",
}) {
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime() + (Number(adPlan.durationDays || 30) * 24 * 60 * 60 * 1000));

  await User.findByIdAndUpdate(userId, {
    $set: {
      adAccess: {
        canPost: true,
        planStatus: "approved",
        planName: adPlan.name || "Ads Starter Plan",
        requestedAt: approvedAt,
        approvedAt,
        expiresAt,
        note,
      },
    },
  });

  return { approvedAt, expiresAt };
}
