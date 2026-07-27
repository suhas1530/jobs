import jwt from "jsonwebtoken";

export const LOCAL_ADMIN_AUTH = {
  username: "admin",
  email: "admin@jobgateway.local",
  password: "Admin@12345",
  name: "JobGateway Admin",
};

const TOKEN_PURPOSE = "local_admin";

function getSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_AUTH_SECRET || "jobgateway_local_admin_secret";
}

export function verifyLocalAdminCredentials({ username = "", email = "", password = "" } = {}) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanEmail = String(email || "").trim().toLowerCase();

  return (
    cleanUsername === LOCAL_ADMIN_AUTH.username.toLowerCase() &&
    cleanEmail === LOCAL_ADMIN_AUTH.email.toLowerCase() &&
    String(password || "") === LOCAL_ADMIN_AUTH.password
  );
}

export function signLocalAdminToken() {
  return jwt.sign(
    {
      purpose: TOKEN_PURPOSE,
      role: "admin",
      username: LOCAL_ADMIN_AUTH.username,
      email: LOCAL_ADMIN_AUTH.email,
      name: LOCAL_ADMIN_AUTH.name,
    },
    getSecret(),
    { expiresIn: "12h" },
  );
}

export function verifyLocalAdminToken(token = "") {
  try {
    const payload = jwt.verify(String(token || ""), getSecret());
    if (payload?.purpose !== TOKEN_PURPOSE || payload?.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}
