import crypto from "crypto";
import express from "express";
import Conversation from "../models/Conversation.js";
import requireAuth from "../middleware/requireAuth.js";
import requireUser from "../middleware/requireUser.js";
import companyChatbotRateLimit from "../middleware/companyChatbotRateLimit.js";
import { callGroq } from "../services/groqChatService.js";

const router = express.Router();
const chatbotLimiter = companyChatbotRateLimit();

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMessageBody(req, res, next) {
  const { message, conversationId } = req.body || {};

  if (!isNonEmptyString(message)) {
    return res.status(400).json({ message: "message is required" });
  }

  if (String(message).trim().length > 3000) {
    return res.status(400).json({ message: "message is too long" });
  }

  if (conversationId != null && (typeof conversationId !== "string" || conversationId.trim().length < 6)) {
    return res.status(400).json({ message: "conversationId is invalid" });
  }

  return next();
}

function roleGuidance(role = "") {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin") {
    return "Help with platform operations, moderation, settings, plans, and analytics.";
  }
  if (normalized === "company") {
    return "Help with hiring workflows, jobs, applications, interviews, plans, and profile settings.";
  }
  return "Help with jobs, internships, resume/profile, interviews, and application tracking.";
}

async function runChat({ role, history, userMessage }) {
  const messages = [
    {
      role: "system",
      content: [
        "You are JobGateway Assistant.",
        roleGuidance(role),
        "Be concise, practical, and safe.",
      ].join(" "),
    },
    ...history,
    { role: "user", content: userMessage },
  ];
  return callGroq(messages, { temperature: 0.4 });
}

router.post("/chatbot/message", requireAuth, requireUser, chatbotLimiter, validateMessageBody, async (req, res) => {
  try {
    const clerkId = req.user?.clerkId;
    const role = req.user?.role || "user";
    const message = String(req.body.message || "").trim();
    const inputConversationId = String(req.body.conversationId || "").trim();
    const conversationId = inputConversationId || crypto.randomUUID();

    let conversation = await Conversation.findOne({ conversationId, clerkId });
    if (!conversation) {
      conversation = await Conversation.create({
        conversationId,
        clerkId,
        role,
        mode: "chat",
        messages: [],
        status: "draft",
      });
    }

    conversation.messages.push({ role: "user", content: message, ts: new Date() });

    const history = (conversation.messages || [])
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    let reply = "";
    try {
      reply = String((await runChat({ role, history, userMessage: message })) || "").trim();
    } catch (e) {
      console.error("generic chatbot call failed:", e?.message || e);
      reply = "I can help with platform questions right now. Please try your request again.";
    }

    if (!reply) {
      reply = "I can help with JobGateway questions. What would you like to do?";
    }

    conversation.mode = "chat";
    conversation.role = role;
    conversation.messages.push({ role: "assistant", content: reply, ts: new Date() });
    await conversation.save();

    return res.json({
      conversationId: conversation.conversationId,
      reply,
      role,
      mode: "chat",
    });
  } catch (err) {
    console.error("chatbot /message error:", err);
    return res.status(500).json({ message: "Failed to process chatbot message" });
  }
});

export default router;
