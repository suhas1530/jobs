import syncUser from "./syncUser.js";

export default function studentOnly(req, res, next) {
  return syncUser("student")(req, res, () => {
    const role = String(req.user?.role || "").toLowerCase();
    if (role !== "student") {
      return res.status(403).json({ message: "Student access only" });
    }
    next();
  });
}