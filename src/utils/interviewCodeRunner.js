function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScriptContent(value) {
  return String(value || "").replace(/<\/script/gi, "<\\/script");
}

const SERVER_RUNTIME_PATTERN = /\b(express\s*\(|app\.listen\s*\(|createServer\s*\(|fastify\s*\(|koa\s*\(|NestFactory|serve\s*\(|listen\s*\(\s*\d+)/i;

export function normalizeInterviewCodeLanguage(value) {
  const normalized = String(value || "javascript").trim().toLowerCase();
  if (["html", "htm"].includes(normalized)) return "html";
  return "javascript";
}

export function normalizeInterviewCodeRunMode(value) {
  const normalized = String(value || "console").trim().toLowerCase();
  return normalized === "server" ? "server" : "console";
}

export function runJavascriptSnippet(code) {
  const logs = [];
  const mockConsole = {
    log: (...args) => logs.push(args.map((item) => String(item)).join(" ")),
  };

  const fn = new Function("console", `"use strict";\n${String(code || "")}`);
  const result = fn(mockConsole);

  if (typeof result !== "undefined") {
    logs.push(String(result));
  }

  return logs.join("\n") || "Code executed successfully.";
}

function buildBrowserPreviewHtml(language, code) {
  if (language === "html") {
    return String(code || "");
  }

  if (language !== "javascript") return "";

  const safeScript = escapeScriptContent(code);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Interview Preview</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: Arial, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      #app {
        min-height: 200px;
      }
      .preview-error {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 12px;
        background: #fee2e2;
        color: #b91c1c;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      try {
        ${safeScript}
      } catch (error) {
        const node = document.createElement("pre");
        node.className = "preview-error";
        node.textContent = error?.message || "Preview failed";
        document.body.appendChild(node);
      }
    </script>
  </body>
</html>`;
}

export function executeInterviewCode({ language = "javascript", content = "", mode = "console" } = {}) {
  const normalizedLanguage = normalizeInterviewCodeLanguage(language);
  const normalizedMode = normalizeInterviewCodeRunMode(mode);
  const safeContent = String(content || "");
  const result = {
    language: normalizedLanguage,
    outputMode: normalizedMode,
    output: "",
    error: "",
    serverOutput: "",
    serverError: "",
    previewHtml: "",
  };

  if (normalizedMode === "console") {
    try {
      if (normalizedLanguage !== "javascript") {
        throw new Error("Normal output supports JavaScript only.");
      }
      result.output = runJavascriptSnippet(safeContent);
      result.serverOutput = "Use Server Output to render browser preview. Real Node/Express server hosting is not available in this interview workspace yet.";
    } catch (error) {
      result.error = error?.message || "Code execution failed";
    }
    return result;
  }

  if (SERVER_RUNTIME_PATTERN.test(safeContent)) {
    result.serverOutput = "Server mode checked the shared code.";
    result.serverError = "Live localhost or public Node/Express hosting is not available in this interview workspace yet. Browser preview supports HTML/CSS/JS only.";
    return result;
  }

  const previewHtml = buildBrowserPreviewHtml(normalizedLanguage, safeContent);
  if (!previewHtml) {
    result.serverOutput = "Server mode checked the shared code.";
    result.serverError = "Server Output currently supports browser preview for JavaScript or HTML only.";
    return result;
  }

  result.previewHtml = previewHtml;
  result.serverOutput = normalizedLanguage === "html"
    ? "Browser preview generated from the shared HTML."
    : "Browser preview generated from the shared JavaScript.";
  return result;
}

export function emptyInterviewCodeResult(outputMode = "console") {
  return {
    outputMode: normalizeInterviewCodeRunMode(outputMode),
    output: "",
    error: "",
    serverOutput: "",
    serverError: "",
    previewHtml: "",
  };
}

export function buildPreviewUnsupportedHtml(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview Unavailable</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: Arial, sans-serif;
        background: #fff7ed;
        color: #9a3412;
      }
      .card {
        border: 1px solid #fdba74;
        border-radius: 16px;
        background: #fffbeb;
        padding: 18px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="card">${escapeHtml(message)}</div>
  </body>
</html>`;
}
