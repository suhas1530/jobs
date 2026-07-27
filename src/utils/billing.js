export const GST_RATE = 0.18;

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function makeBillingAmounts(amount) {
  const subtotal = roundMoney(amount);
  const gst = roundMoney(subtotal * GST_RATE);
  const total = roundMoney(subtotal + gst);
  return { subtotal, gst, total };
}

export function formatDateOnly(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}
