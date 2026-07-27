// backend/src/controllers/company/company.settings.controller.js
import Company from "../../models/Company.js";
import Subscription from "../../models/Subscription.js";
import BoostCampaign from "../../models/BoostCampaign.js";
import { sendMail, sendOtpEmail } from "../../utils/mailer.js";

/* ================================
   Helpers
================================= */
async function getOrCreateCompany(req) {
  const user = req.user; // from requireUser
  if (!user) return null;

  let company = await Company.findOne({ ownerUserId: user._id });

  // Auto-create if missing
  if (!company) {
    company = await Company.create({
      ownerUserId: user._id,
      name: user.name || "Company",
      email: user.email || "",
      phone: user.phone || "",
      hrEmail: user.email || "",
      location: "",
      city: "",
      state: "",
      preferences: {},
      notifications: {},
      billing: {
        companyName: user.name || "Company",
        billingEmail: user.email || "",
      },
      privacy: {},
      teamMembers: [],
    });
  }

  return company;
}

function pick(obj, keys = []) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function makeOtp() {
  // 6-digit numeric OTP
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

async function buildInvoices(ownerUserId) {
  const [subs, boosts] = await Promise.all([
    Subscription.find({ company: ownerUserId }).sort({ createdAt: -1 }).lean(),
    BoostCampaign.find({ company: ownerUserId }).sort({ createdAt: -1 }).lean(),
  ]);

  const subRows = (subs || []).map((s) => ({
    id: `SUB-${String(s._id).slice(-6).toUpperCase()}`,
    amount: Number(s.price || 0),
    date: (s.createdAt ? new Date(s.createdAt) : new Date()).toISOString().slice(0, 10),
    type: "Subscription",
    description: `${s.planName || "Plan"} (${s.billingCycle || "monthly"})`,
  }));

  const boostRows = (boosts || []).map((b) => ({
    id: `BST-${String(b._id).slice(-6).toUpperCase()}`,
    amount: Number(b.price || 0),
    date: (b.createdAt ? new Date(b.createdAt) : new Date()).toISOString().slice(0, 10),
    type: "Boost",
    description: `${b.planName || "Boost"} (${b.cycle || "monthly"})`,
  }));

  return [...subRows, ...boostRows]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);
}

/* ================================
   GET /api/company/settings/me
================================= */
export async function companyGetSettingsMe(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });
    const invoices = await buildInvoices(company.ownerUserId);
    const sessions = [
      {
        id: "current",
        device: req.headers["user-agent"] || "Current device",
        location: req.ip || "Unknown location",
        active: "Active now",
      },
    ];

    return res.json({
      company: {
        id: company._id,
        name: company.name,
        website: company.website,
        industry: company.industry,
        size: company.size,
        founded: company.founded,
        logoUrl: company.logoUrl,
        profileAudience: company.profileAudience,

        email: company.email,
        phone: company.phone,
        hrEmail: company.hrEmail,
        hrPhone: company.hrPhone,
        address: company.address,
        city: company.city,
        state: company.state,
        location: company.location,

        about: company.about,
        mission: company.mission,
        culture: company.culture,
        perks: company.perks,
        hiringProcess: company.hiringProcess,
        studentMessage: company.studentMessage,

        preferences: company.preferences || {},
        teamMembers: company.teamMembers || [],
        notifications: company.notifications || {},
        security: { twofa: Boolean(company.security?.twofa) },
        billing: company.billing || {},
        privacy: company.privacy || {},
      },
      sessions,
      invoices,
    });
  } catch (err) {
    console.error("companyGetSettingsMe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/profile
================================= */
export async function companyUpdateProfile(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};

    const allowed = [
      "name",
      "website",
      "linkedin",
      "industry",
      "size",
      "founded",
      "logoUrl",
      "profileAudience",
      "email",
      "phone",
      "hrEmail",
      "hrPhone",
      "address",
      "city",
      "state",
      "location",
      "about",
      "mission",
      "culture",
      "perks",
      "hiringProcess",
      "studentMessage",
      "category",
    ];

    const update = pick(data, allowed);

    // small normalization
    if (typeof update.name === "string") update.name = update.name.trim();
    if (typeof update.website === "string") update.website = update.website.trim();
    if (typeof update.hrEmail === "string") update.hrEmail = update.hrEmail.trim();
    if (update.profileAudience && !["company", "student", "both"].includes(update.profileAudience)) {
      update.profileAudience = "both";
    }

    Object.assign(company, update);
    await company.save();

    return res.json({ message: "Profile updated", company });
  } catch (err) {
    console.error("companyUpdateProfile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/preferences
================================= */
export async function companyUpdatePreferences(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};
    const allowed = ["location", "experience", "salary", "oneClick", "aiRanking", "preScreening"];
    const update = pick(data, allowed);

    company.preferences = { ...(company.preferences || {}), ...update };
    await company.save();

    return res.json({ message: "Hiring preferences updated", preferences: company.preferences });
  } catch (err) {
    console.error("companyUpdatePreferences error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/notifications
================================= */
export async function companyUpdateNotifications(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};
    const allowed = [
      "newApplication",
      "interviewScheduled",
      "candidateMessage",
      "planExpiry",
      "boostExpiry",
      "sms",
      "whatsapp",
      "dailySummary",
    ];
    const update = pick(data, allowed);

    company.notifications = { ...(company.notifications || {}), ...update };
    await company.save();

    return res.json({ message: "Notifications updated", notifications: company.notifications });
  } catch (err) {
    console.error("companyUpdateNotifications error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/billing
================================= */
export async function companyUpdateBilling(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};
    const allowed = ["companyName", "gst", "billingEmail", "billingAddress", "cardLast4"];
    const update = pick(data, allowed);

    company.billing = { ...(company.billing || {}), ...update };
    await company.save();

    return res.json({ message: "Billing updated", billing: company.billing });
  } catch (err) {
    console.error("companyUpdateBilling error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/privacy
================================= */
export async function companyUpdatePrivacy(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body || {};
    const allowed = ["publicProfile", "hideContactUntilShortlist"];
    const update = pick(data, allowed);

    company.privacy = { ...(company.privacy || {}), ...update };
    await company.save();

    return res.json({ message: "Privacy updated", privacy: company.privacy });
  } catch (err) {
    console.error("companyUpdatePrivacy error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   TEAM
   POST /api/company/settings/team/invite
   body: { name, email, role }
================================= */
export async function companyInviteTeamMember(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const { name = "", email = "", role = "Recruiter" } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();

    if (!cleanEmail) return res.status(400).json({ message: "Email is required" });

    const exists = (company.teamMembers || []).some((m) => (m.email || "").toLowerCase() === cleanEmail);
    if (exists) return res.status(409).json({ message: "Member already exists" });

    company.teamMembers.push({
      name: cleanName || cleanEmail.split("@")[0],
      email: cleanEmail,
      role: ["Admin", "Recruiter", "Viewer"].includes(role) ? role : "Recruiter",
      status: "Invited",
      invitedAt: new Date(),
    });

    await company.save();

    // Send invite email (optional – works only if SMTP configured)
    try {
      const subject = `You are invited to join ${company.name} on JobGateway`;
      const text =
        `Hi ${cleanName || ""},\n\n` +
        `You have been invited as ${role} to ${company.name}.\n` +
        `Login here: ${process.env.CLIENT_URL || "http://localhost:5173"}/company/login\n\n` +
        `Thanks,\nJobGateway`;

      await sendMail({ to: cleanEmail, subject, text });
    } catch (e) {
      // do not fail the API if email sending fails
      console.warn("Invite email failed:", e?.message || e);
    }

    return res.status(201).json({ message: "Invite created", teamMembers: company.teamMembers });
  } catch (err) {
    console.error("companyInviteTeamMember error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   DELETE /api/company/settings/team/:memberId
================================= */
export async function companyRemoveTeamMember(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const { memberId } = req.params;

    const before = company.teamMembers.length;
    company.teamMembers = company.teamMembers.filter((m) => String(m._id) !== String(memberId));
    const after = company.teamMembers.length;

    if (before === after) return res.status(404).json({ message: "Member not found" });

    await company.save();
    return res.json({ message: "Member removed", teamMembers: company.teamMembers });
  } catch (err) {
    console.error("companyRemoveTeamMember error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/team/:memberId
   body: { role }
================================= */
export async function companyUpdateTeamMemberRole(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const { memberId } = req.params;
    const role = String(req.body?.role || "");
    if (!["Admin", "Recruiter", "Viewer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const member = (company.teamMembers || []).find((m) => String(m._id) === String(memberId));
    if (!member) return res.status(404).json({ message: "Member not found" });

    member.role = role;
    await company.save();

    return res.json({ message: "Member role updated", teamMembers: company.teamMembers });
  } catch (err) {
    console.error("companyUpdateTeamMemberRole error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   SECURITY (OTP)
   POST /api/company/settings/security/send-otp
   body: { purpose?: "verify_email" }
================================= */
export async function companySendSecurityOtp(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const purpose = String(req.body?.purpose || "verify_email");
    const otp = makeOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    company.security = company.security || {};
    company.security.otp = { code: otp, expiresAt, purpose };
    await company.save();

    // send OTP to HR email (fallback to company email)
    const to = company.hrEmail || company.email;
    if (!to) return res.status(400).json({ message: "No email found for OTP (hrEmail/email)" });

    try {
      await sendOtpEmail(to, otp, purpose, company.name);
    } catch (e) {
      console.warn("OTP email failed:", e?.message || e);
      return res.status(500).json({ message: "OTP send failed (SMTP not configured?)" });
    }

    return res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("companySendSecurityOtp error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   POST /api/company/settings/security/verify-otp
   body: { otp, purpose? }
================================= */
export async function companyVerifySecurityOtp(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const otp = String(req.body?.otp || "").trim();
    const purpose = String(req.body?.purpose || "verify_email");

    const saved = company.security?.otp;
    if (!saved?.code) return res.status(400).json({ message: "No OTP requested" });

    if (saved.purpose !== purpose) return res.status(400).json({ message: "OTP purpose mismatch" });
    if (!saved.expiresAt || new Date(saved.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }
    if (saved.code !== otp) return res.status(400).json({ message: "Invalid OTP" });

    // clear OTP after success
    company.security.otp = { code: "", expiresAt: null, purpose: "" };
    await company.save();

    return res.json({ message: "OTP verified" });
  } catch (err) {
    console.error("companyVerifySecurityOtp error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PATCH /api/company/settings/security
   body: { twofa?: boolean }
================================= */
export async function companyUpdateSecurity(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    if (typeof req.body?.twofa === "boolean") {
      company.security = company.security || {};
      company.security.twofa = req.body.twofa;
      await company.save();
    }

    return res.json({
      message: "Security settings updated",
      security: { twofa: Boolean(company.security?.twofa) },
    });
  } catch (err) {
    console.error("companyUpdateSecurity error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   PRIVACY - Export Data (stub)
   GET /api/company/settings/export
================================= */
export async function companyExportData(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });
    const invoices = await buildInvoices(company.ownerUserId);

    return res.json({
      message: "Export ready",
      export: {
        company,
        invoices,
      },
    });
  } catch (err) {
    console.error("companyExportData error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ================================
   DELETE /api/company/settings/account
   body: { confirm: "DELETE" }
================================= */
export async function companyDeleteAccount(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const confirm = String(req.body?.confirm || "");
    if (confirm !== "DELETE") return res.status(400).json({ message: 'Type "DELETE" to confirm' });

    // Soft-delete
    company.isActive = false;
    await company.save();

    // Optional: also deactivate User
    // req.user.isActive = false; await req.user.save();

    return res.json({ message: "Company account deactivated" });
  } catch (err) {
    console.error("companyDeleteAccount error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
