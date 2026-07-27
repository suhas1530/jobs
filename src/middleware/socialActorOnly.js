import syncUser from "./syncUser.js";

export default function socialActorOnly(req, res, next) {
  return syncUser("student")(req, res, () => {
    const role = String(req.user?.role || "").toLowerCase();
    if (!["student", "company"].includes(role)) {
      return res.status(403).json({ message: "Student or company access only" });
    }
    next();
  });
}
