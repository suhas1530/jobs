import Company from "../models/Company.js";
import syncUser from "../middleware/syncUser.js";

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value) {
  const role = String(value || "").toLowerCase();
  return ["student", "company", "admin"].includes(role) ? role : "student";
}

function sanitizeCompanyDraft(input = {}) {
  const source = input && typeof input === "object" ? input : {};

  return {
    contactName: safeText(source.contactName),
    companyName: safeText(source.companyName || source.name),
    industry: safeText(source.industry),
    website: safeText(source.website),
    phone: safeText(source.phone),
    location: safeText(source.location),
    about: safeText(source.about),
  };
}

async function upsertCompanyProfile(user, draft = {}) {
  let company = await Company.findOne({ ownerUserId: user._id });

  if (!company) {
    company = await Company.create({
      ownerUserId: user._id,
      name: draft.companyName || user.name || user.email || "New Company",
      email: user.email || "",
      hrEmail: user.email || "",
      industry: draft.industry || "",
      website: draft.website || "",
      phone: draft.phone || "",
      location: draft.location || "",
      about: draft.about || "",
      isActive: true,
    });
  } else {
    if (draft.companyName) company.name = draft.companyName;
    if (draft.industry) company.industry = draft.industry;
    if (draft.website) company.website = draft.website;
    if (draft.phone) company.phone = draft.phone;
    if (draft.location) company.location = draft.location;
    if (draft.about) company.about = draft.about;

    if (!company.email && user.email) company.email = user.email;
    if (!company.hrEmail && user.email) company.hrEmail = user.email;

    await company.save();
  }

  if (draft.contactName && (!user.name || user.name === "User")) {
    user.name = draft.contactName;
    await user.save();
  }

  return company;
}

export function bootstrapAuthSession(req, res, next) {
  const roleHint = normalizeRole(req.body?.roleHint);

  return syncUser(roleHint)(req, res, async () => {
    try {
      let company = null;

      if (req.user?.role === "company") {
        const companyDraft = sanitizeCompanyDraft(req.body?.companyProfileDraft);
        company = await upsertCompanyProfile(req.user, companyDraft);
      }

      return res.json({
        user: {
          id: req.user._id,
          clerkId: req.user.clerkId,
          role: req.user.role,
          name: req.user.name,
          email: req.user.email,
          isActive: req.user.isActive,
        },
        company: company
          ? {
              id: company._id,
              name: company.name,
              industry: company.industry,
              location: company.location,
            }
          : null,
      });
    } catch (error) {
      return next(error);
    }
  });
}
