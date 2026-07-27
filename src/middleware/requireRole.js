// backend/src/middleware/requireRole.js
export default function requireRole(...roles) {
  const allow = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (!role || !allow.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

export const requireCompany = requireRole("company");
export const requireAdmin = requireRole("admin");
export const requireStudent = requireRole("student");
