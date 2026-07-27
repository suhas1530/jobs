// backend/src/controllers/company/company.billing.controller.js
import Subscription from "../../models/Subscription.js";
import Plan from "../../models/Plan.js";
import Company from "../../models/Company.js";
import Payment from "../../models/Payment.js";
import Job from "../../models/Job.js";
import {
  createRazorpayOrder,
  getRazorpayConfig,
  makeRazorpayReceipt,
  verifyRazorpaySignature,
} from "../../services/razorpay.js";
import {
  activateCompanySubscription,
  ensureSubscription,
  mapCompanyPlanForUi,
} from "../../services/paymentActivation.js";
import { formatDateOnly, makeBillingAmounts } from "../../utils/billing.js";

function activeNow(sub) {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (!sub.start || !sub.end) return false;
  const now = Date.now();
  return now >= new Date(sub.start).getTime() && now <= new Date(sub.end).getTime();
}

function toISODate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

async function buildCompanyBillingHistory(userId) {
  const [payments, subscriptions] = await Promise.all([
    Payment.find({ user: userId, purpose: "company_subscription" }).sort({ createdAt: -1 }).lean(),
    Subscription.find({ company: userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const paymentRows = payments.map((row) => {
    const amounts = makeBillingAmounts(row.amount);
    return {
      id: String(row._id),
      invoiceId: `INV-CMP-${String(row._id).slice(-6).toUpperCase()}`,
      source: "razorpay",
      status: row.status === "paid" ? "paid" : row.status === "failed" ? "failed" : "pending",
      planName: row.planName || "Plan",
      billingCycle: row.billingCycle || "monthly",
      paymentMethod: "Razorpay",
      transactionId: row.razorpayPaymentId || row.razorpayOrderId || "",
      orderId: row.razorpayOrderId || "",
      paidAt: formatDateOnly(row.paidAt || row.createdAt),
      periodStart: "",
      periodEnd: "",
      ...amounts,
    };
  });

  const coveredPlanKeys = new Set(paymentRows.map((row) => `${row.planName}|${row.paidAt}`));
  const legacyRows = subscriptions
    .filter((row) => !coveredPlanKeys.has(`${row.planName || "Plan"}|${formatDateOnly(row.createdAt)}`))
    .map((row) => {
      const amounts = makeBillingAmounts(row.price);
      return {
        id: String(row._id),
        invoiceId: `INV-LEG-${String(row._id).slice(-6).toUpperCase()}`,
        source: "legacy-subscription",
        status: row.status || "inactive",
        planName: row.planName || "Plan",
        billingCycle: row.billingCycle || "monthly",
        paymentMethod: "Manual / Legacy",
        transactionId: "",
        orderId: "",
        paidAt: formatDateOnly(row.createdAt || row.start),
        periodStart: formatDateOnly(row.start),
        periodEnd: formatDateOnly(row.end),
        ...amounts,
      };
    });

  return [...paymentRows, ...legacyRows].sort(
    (a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime(),
  );
}

export async function listPlans(req, res, next) {
  try {
    const rows = await Plan.find({ active: true }).sort({ price: 1, name: 1 }).lean();
    const items = rows.map(mapCompanyPlanForUi);
    return res.json({
      items,
      payment: {
        provider: "razorpay",
        enabled: Boolean(getRazorpayConfig().keyId),
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function getMyBilling(req, res, next) {
  try {
    const userId = req.user._id;
    const [sub, company, history, activeJobs] = await Promise.all([
      ensureSubscription(userId),
      Company.findOne({ ownerUserId: userId }).select("billing name email hrEmail").lean(),
      buildCompanyBillingHistory(userId),
      Job.countDocuments({ company: userId, status: "Active" }),
    ]);

    let shouldSaveSubscription = false;
    if (sub.status === "active" && sub.end && Date.now() > new Date(sub.end).getTime()) {
      sub.status = "inactive";
      shouldSaveSubscription = true;
    }

    if (Number(sub.jobsUsed ?? 0) !== Number(activeJobs || 0)) {
      sub.jobsUsed = Number(activeJobs || 0);
      shouldSaveSubscription = true;
    }

    if (shouldSaveSubscription) {
      await sub.save();
    }

    const isActive = activeNow(sub);
    const currentAmounts = makeBillingAmounts(sub.price || 0);

    return res.json({
      subscription: {
        planName: sub.planName,
        billingCycle: sub.billingCycle || "monthly",
        price: Number(sub.price || 0),
        subtotal: currentAmounts.subtotal,
        gst: currentAmounts.gst,
        total: currentAmounts.total,
        status: isActive ? "active" : "inactive",
        startDate: toISODate(sub.start),
        endDate: toISODate(sub.end),
        jobsLimit: Number(sub.jobsLimit ?? 0),
        jobsUsed: Number(activeJobs || 0),
        applicationsLimit: Number(sub.appsLimit ?? 0),
        applicationsUsed: sub.appsUsed,
      },
      billingProfile: {
        companyName: company?.billing?.companyName || company?.name || req.user?.name || "Company",
        gstNumber: company?.billing?.gst || "",
        billingEmail: company?.billing?.billingEmail || company?.hrEmail || company?.email || req.user?.email || "",
        billingAddress: company?.billing?.billingAddress || "",
      },
      invoices: history,
    });
  } catch (e) {
    next(e);
  }
}

export async function subscribePlan(req, res, next) {
  try {
    const userId = req.user._id;
    const { planId, cycle } = req.body;

    const planDoc = await Plan.findOne({ _id: planId, active: true }).lean();
    if (!planDoc) return res.status(400).json({ message: "Invalid planId" });
    const sub = await activateCompanySubscription({ companyId: userId, plan: planDoc, cycle });

    return res.json({
      message: `Subscribed to ${sub.planName} (${sub.billingCycle})`,
      subscription: {
        planName: sub.planName,
        billingCycle: sub.billingCycle,
        price: Number(sub.price || 0),
        status: "active",
        startDate: toISODate(sub.start),
        endDate: toISODate(sub.end),
        jobsLimit: sub.jobsLimit,
        jobsUsed: sub.jobsUsed,
        applicationsLimit: sub.appsLimit,
        applicationsUsed: sub.appsUsed,
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function createSubscriptionOrder(req, res, next) {
  try {
    const userId = req.user._id;
    const { planId, cycle } = req.body || {};
    const billingCycle = cycle === "yearly" ? "yearly" : "monthly";

    const planDoc = await Plan.findOne({ _id: planId, active: true }).lean();
    if (!planDoc) return res.status(400).json({ message: "Invalid planId" });

    const mapped = mapCompanyPlanForUi(planDoc);
    const amountRupees = billingCycle === "yearly" ? mapped.yearlyPrice : mapped.monthlyPrice;
    const amountPaise = Math.round(Number(amountRupees || 0) * 100);
    if (amountPaise <= 0) {
      return res.status(400).json({ message: "Plan amount must be greater than zero." });
    }

    const receipt = makeRazorpayReceipt("cmp", userId, planDoc._id, billingCycle, Date.now());
    const order = await createRazorpayOrder({
      amount: amountPaise,
      receipt,
      notes: {
        purpose: "company_subscription",
        planId: String(planDoc._id),
        companyId: String(userId),
        cycle: billingCycle,
      },
    });

    const payment = await Payment.create({
      user: userId,
      role: "company",
      purpose: "company_subscription",
      status: "created",
      planModel: "Plan",
      planId: planDoc._id,
      planName: planDoc.name,
      billingCycle,
      amount: amountRupees,
      currency: "INR",
      receipt,
      razorpayOrderId: order.id,
      notes: order.notes || {},
    });

    return res.json({
      ok: true,
      keyId: getRazorpayConfig().keyId,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      payment: {
        id: String(payment._id),
        planName: planDoc.name,
        billingCycle,
        amount: amountRupees,
      },
      company: {
        name: req.user?.name || "Company",
        email: req.user?.email || "",
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function verifySubscriptionPayment(req, res, next) {
  try {
    const userId = String(req.user._id);
    const {
      paymentId,
      razorpay_order_id: orderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature,
    } = req.body || {};

    const resolvedPaymentId = String(paymentId || "");
    const resolvedOrderId = String(orderId || "");
    const resolvedRazorpayPaymentId = String(razorpayPaymentId || "");

    if (!resolvedOrderId || !resolvedRazorpayPaymentId || !signature) {
      return res.status(400).json({ message: "Missing Razorpay payment verification fields." });
    }

    const isValid = verifyRazorpaySignature({
      orderId: resolvedOrderId,
      paymentId: resolvedRazorpayPaymentId,
      signature,
    });
    if (!isValid) return res.status(400).json({ message: "Invalid Razorpay signature." });

    const payment = await Payment.findOne({
      _id: resolvedPaymentId,
      user: userId,
      purpose: "company_subscription",
      razorpayOrderId: resolvedOrderId,
    });
    if (!payment) return res.status(404).json({ message: "Payment record not found." });

    const plan = await Plan.findById(payment.planId).lean();
    if (!plan) return res.status(404).json({ message: "Plan not found." });

    const sub = await activateCompanySubscription({
      companyId: userId,
      plan,
      cycle: payment.billingCycle,
    });

    payment.status = "paid";
    payment.razorpayPaymentId = resolvedRazorpayPaymentId;
    payment.razorpaySignature = String(signature);
    payment.paidAt = new Date();
    await payment.save();

    return res.json({
      ok: true,
      message: "Payment verified and subscription activated.",
      subscription: {
        planName: sub.planName,
        billingCycle: sub.billingCycle,
        price: Number(sub.price || 0),
        status: sub.status,
        startDate: toISODate(sub.start),
        endDate: toISODate(sub.end),
        jobsLimit: sub.jobsLimit,
        jobsUsed: sub.jobsUsed,
        applicationsLimit: sub.appsLimit,
        applicationsUsed: sub.appsUsed,
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function cancelSubscription(req, res, next) {
  try {
    const userId = req.user._id;
    const sub = await ensureSubscription(userId);

    sub.status = "inactive";
    await sub.save();

    return res.json({ message: "Subscription cancelled", ok: true });
  } catch (e) {
    next(e);
  }
}
