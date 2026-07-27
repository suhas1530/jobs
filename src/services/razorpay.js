import crypto from "crypto";

const ORDER_ENDPOINT = "https://api.razorpay.com/v1/orders";
const MAX_RECEIPT_LENGTH = 40;

export function getRazorpayConfig() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
  };
}

export function assertRazorpayConfigured() {
  const { keyId, keySecret } = getRazorpayConfig();
  if (!keyId || !keySecret) {
    const err = new Error("Razorpay is not configured on the server.");
    err.statusCode = 500;
    throw err;
  }
  return { keyId, keySecret };
}

export function makeRazorpayReceipt(prefix = "ord", ...parts) {
  const cleanPrefix = String(prefix || "ord")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6) || "ord";

  const normalizedParts = parts
    .map((part) => String(part || "").replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  const hash = crypto
    .createHash("sha1")
    .update(normalizedParts.join("|") || `${cleanPrefix}|${Date.now()}`)
    .digest("hex")
    .slice(0, 12);

  const timestamp = Date.now().toString(36).slice(-8);
  return `${cleanPrefix}_${timestamp}_${hash}`.slice(0, MAX_RECEIPT_LENGTH);
}

export async function createRazorpayOrder({
  amount,
  currency = "INR",
  receipt,
  notes = {},
}) {
  const { keyId, keySecret } = assertRazorpayConfigured();

  const response = await fetch(ORDER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(Number(amount || 0)),
      currency,
      receipt,
      notes,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.error?.description || "Failed to create Razorpay order.");
    err.statusCode = response.status || 502;
    throw err;
  }

  return payload;
}

export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
}) {
  const { keySecret } = assertRazorpayConfigured();
  const digest = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return digest === String(signature || "");
}
