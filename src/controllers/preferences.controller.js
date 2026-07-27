import User from "../models/User.js";
import crypto from "node:crypto";
import TranslationCache from "../models/TranslationCache.js";

const SUPPORTED_LANGUAGES = new Set([
  "en",
  "hi",
  "es",
  "fr",
  "de",
  "pt",
  "ar",
  "zh",
  "ja",
  "ko",
  "ru",
  "it",
  "nl",
  "tr",
  "pl",
  "uk",
  "id",
  "vi",
  "th",
  "bn",
  "ta",
  "te",
  "kn",
  "ml",
  "mr",
  "gu",
  "pa",
  "ur",
]);
const DEFAULT_LANGUAGE = "en";

function normalizeLanguage(value) {
  const next = String(value || "").trim().toLowerCase();
  if (!next) return DEFAULT_LANGUAGE;
  if (SUPPORTED_LANGUAGES.has(next)) return next;
  const base = next.split("-")[0];
  if (SUPPORTED_LANGUAGES.has(base)) return base;
  return DEFAULT_LANGUAGE;
}

export async function getMyLanguagePreference(req, res, next) {
  try {
    const me = await User.findById(req.user._id).select("language role").lean();
    if (!me) return res.status(404).json({ message: "User not found" });
    return res.json({
      language: normalizeLanguage(me.language),
      role: me.role || "",
    });
  } catch (e) {
    next(e);
  }
}

export async function saveMyLanguagePreference(req, res, next) {
  try {
    const language = normalizeLanguage(req.body?.language);

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { language } },
      { returnDocument: "after" },
    )
      .select("language role")
      .lean();

    if (!updated) return res.status(404).json({ message: "User not found" });

    return res.json({
      ok: true,
      language: normalizeLanguage(updated.language),
      role: updated.role || "",
    });
  } catch (e) {
    next(e);
  }
}

function parseGoogleTranslateResponse(payload) {
  try {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return "";
    return payload[0].map((part) => String(part?.[0] || "")).join("").trim();
  } catch {
    return "";
  }
}

async function translateViaGoogle(text, targetLanguage) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(
    targetLanguage,
  )}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Translator failed: ${response.status}`);
  const json = await response.json();
  const translated = parseGoogleTranslateResponse(json);
  return translated || text;
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || "").trim()).digest("hex");
}

async function loadCachedTranslations(texts, targetLanguage) {
  if (!texts.length) return new Map();
  const hashes = texts.map((text) => hashText(text));
  const rows = await TranslationCache.find({
    sourceHash: { $in: hashes },
    sourceLang: "en",
    targetLang: targetLanguage,
  })
    .select("sourceHash translatedText")
    .lean();

  const byHash = new Map(rows.map((row) => [row.sourceHash, row.translatedText]));
  const out = new Map();
  texts.forEach((text) => {
    const key = hashText(text);
    if (byHash.has(key)) out.set(text, byHash.get(key));
  });
  return out;
}

async function bumpCacheHits(texts, targetLanguage) {
  if (!texts.length) return;
  const hashes = texts.map((text) => hashText(text));
  await TranslationCache.updateMany(
    {
      sourceHash: { $in: hashes },
      sourceLang: "en",
      targetLang: targetLanguage,
    },
    { $inc: { hits: 1 }, $set: { lastUsedAt: new Date() } },
  );
}

async function saveToCache(pairs, targetLanguage) {
  if (!pairs.length) return;
  const ops = pairs.map(({ sourceText, translatedText }) => ({
    updateOne: {
      filter: {
        sourceHash: hashText(sourceText),
        sourceLang: "en",
        targetLang: targetLanguage,
      },
      update: {
        $set: {
          sourceText,
          translatedText,
          provider: "google-gtx",
          lastUsedAt: new Date(),
        },
        $inc: { hits: 1 },
      },
      upsert: true,
    },
  }));
  await TranslationCache.bulkWrite(ops, { ordered: false });
}

async function translateInBatches(texts, targetLanguage, concurrency = 8) {
  const out = new Map();
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const rows = await Promise.all(
      batch.map(async (text) => {
        try {
          const translated = await translateViaGoogle(text, targetLanguage);
          return { sourceText: text, translatedText: translated || text };
        } catch {
          return { sourceText: text, translatedText: text };
        }
      }),
    );
    rows.forEach((row) => out.set(row.sourceText, row.translatedText));
  }
  return out;
}

export async function translateTexts(req, res, next) {
  try {
    const targetLanguage = normalizeLanguage(req.body?.language);
    const rawTexts = Array.isArray(req.body?.texts) ? req.body.texts : [];
    const texts = rawTexts
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 200);

    if (!texts.length || targetLanguage === "en") {
      return res.json({ language: targetLanguage, translations: texts });
    }

    const cached = await loadCachedTranslations(texts, targetLanguage);
    const misses = texts.filter((text) => !cached.has(text));

    const cachedKeys = cached.size ? Array.from(cached.keys()) : [];

    const freshlyTranslated = await translateInBatches(misses, targetLanguage, 8);
    const newlyTranslated = [];
    misses.forEach((text) => {
      const safe = freshlyTranslated.get(text) || text;
      cached.set(text, safe);
      newlyTranslated.push({ sourceText: text, translatedText: safe });
    });

    const translations = texts.map((text) => cached.get(text) || text);

    if (cachedKeys.length) {
      void bumpCacheHits(cachedKeys, targetLanguage).catch(() => {});
    }
    if (newlyTranslated.length) {
      void saveToCache(newlyTranslated, targetLanguage).catch(() => {});
    }

    return res.json({ language: targetLanguage, translations });
  } catch (e) {
    next(e);
  }
}
