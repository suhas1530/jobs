import Company from "../../models/Company.js";

/* =========================================================
   Helper: find or create Company doc for logged-in company user
   req.user is set by requireUser middleware
========================================================= */
async function getOrCreateCompany(req) {
  const user = req.user; // Mongo User doc
  if (!user?._id) return null;

  let company = await Company.findOne({ ownerUserId: user._id });

  // If not exists, create minimal company profile
  if (!company) {
    company = await Company.create({
      ownerUserId: user._id,

      // best-effort defaults (depends on your User model fields)
      name: user.name || user.fullName || user.email || "New Company",
      email: user.email || "",
      hrEmail: user.email || "",
      isActive: true,
    });
  }

  return company;
}

/* =========================================================
   GET /api/company/profile/me
========================================================= */
export async function getCompanyProfileMe(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    return res.json({
      company,
    });
  } catch (err) {
    console.error("getCompanyProfileMe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* =========================================================
   PATCH /api/company/profile/me
   Update company profile fields
========================================================= */
export async function updateCompanyProfileMe(req, res) {
  try {
    const company = await getOrCreateCompany(req);
    if (!company) return res.status(401).json({ message: "Unauthorized" });

    const body = req.body || {};

    // Only allow specific fields to update (safe allow-list)
    const allowed = [
      // profile
      "name",
      "website",
      "linkedin",
      "industry",
      "size",
      "founded",
      "logoUrl",
      "profileAudience",

      // contact
      "email",
      "phone",
      "hrEmail",
      "hrPhone",
      "address",
      "city",
      "state",
      "location",

      // about
      "about",
      "mission",
      "culture",
      "perks",
      "hiringProcess",
      "studentMessage",
      "category",

    ];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const val = body[key];

        // normalize strings
        if (typeof val === "string") {
          company[key] = val.trim();
        } else {
          company[key] = val;
        }
      }
    }

    // Auto build location if city/state provided
    if (
      (Object.prototype.hasOwnProperty.call(body, "city") ||
        Object.prototype.hasOwnProperty.call(body, "state")) &&
      (company.city || company.state)
    ) {
      company.location = [company.city, company.state].filter(Boolean).join(", ");
    }

    await company.save();

    return res.json({
      message: "Profile updated",
      company,
    });
  } catch (err) {
    console.error("updateCompanyProfileMe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
