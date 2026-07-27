import syncUser from "./syncUser.js";

export default function companyOnly(req, res, next) {
  return syncUser("company")(req, res, () => {
    if (req.user?.role !== "company") {
      return res.status(403).json({ message: "Company access only" });
    }
    next();
  });
}
