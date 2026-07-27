const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let nextKeyIndex = 0;

function getGroqKeys() {
  const keys = [
    ...String(process.env.GROQ_API_KEYS || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
    String(process.env.GROQ_API_KEY || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(keys));
}

function pickKey(keys, attempt) {
  if (!keys.length) return "";
  const index = (nextKeyIndex + attempt) % keys.length;
  if (attempt === 0) nextKeyIndex = (nextKeyIndex + 1) % keys.length;
  return keys[index];
}

export async function callGroq(messages = [], options = {}) {
  const apiKeys = getGroqKeys();
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!apiKeys.length) {
    throw new Error("GROQ_API_KEY or GROQ_API_KEYS is missing");
  }

  let lastError = null;
  for (let attempt = 0; attempt < apiKeys.length; attempt += 1) {
    const apiKey = pickKey(apiKeys, attempt);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
          messages,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        lastError = new Error(`Groq API failed (${resp.status}): ${errText || "Unknown error"}`);
        if ([429, 500, 502, 503, 504].includes(resp.status) && attempt < apiKeys.length - 1) continue;
        throw lastError;
      }

      const data = await resp.json();
      return data?.choices?.[0]?.message?.content?.trim() || "";
    } catch (err) {
      lastError = err;
      if (attempt >= apiKeys.length - 1) throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Groq API failed");
}

export default callGroq;
