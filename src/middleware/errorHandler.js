export default function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  const status = err.statusCode || err.status || 500;

  if (err?.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }

  if (err?.code === 11000) {
    return res.status(409).json({ message: "Duplicate key error" });
  }

  if (err?.code === "ECONNRESET" || err?.name === "MongoNetworkError") {
    return res.status(503).json({ message: "Database connection interrupted. Please retry." });
  }

  return res.status(status).json({
    message: err?.message || "Server error",
  });
}
