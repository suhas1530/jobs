// backend/src/utils/mailer.js
import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env");
  }

  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  return nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for 587
    auth: { user, pass },
  });
}

export async function sendMail({ to, subject, text, html }) {
  const transporter = getTransport();

  const from =
    process.env.SMTP_FROM ||
    `JobGateway <${process.env.SMTP_USER}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return info;
}

export async function sendOtpEmail(to, otp, purpose = "verify_email", companyName = "JobGateway") {
  const subject = `Your OTP for ${companyName}`;
  const text =
    `Your OTP is: ${otp}\n\n` +
    `Purpose: ${purpose}\n` +
    `This OTP will expire in 10 minutes.\n\n` +
    `If you did not request this, ignore this email.`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2 style="margin: 0 0 12px">OTP Verification</h2>
      <p style="margin: 0 0 10px">Use this OTP to continue:</p>
      <div style="display:inline-block; padding:12px 18px; border-radius:10px; border:1px solid #e5e7eb; background:#f9fafb; font-size:24px; letter-spacing:4px; font-weight:700;">
        ${otp}
      </div>
      <p style="margin: 14px 0 0; color:#6b7280; font-size: 12px;">
        Purpose: ${purpose} • Expires in 10 minutes
      </p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}
