import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const backendRoot = path.resolve(currentDir, "..", "..");
const workspaceRoot = path.resolve(backendRoot, "..");

function uniquePaths(paths = []) {
  return Array.from(new Set(paths.map((item) => path.resolve(item))));
}

export function getPrimaryUploadsDir() {
  return path.join(backendRoot, "uploads");
}

export function getPrimaryResumeUploadsDir() {
  return path.join(getPrimaryUploadsDir(), "resumes");
}

export function getUploadSearchDirs() {
  return uniquePaths([
    getPrimaryUploadsDir(),
    path.join(workspaceRoot, "uploads"),
    path.join(backendRoot, "src", "uploads"),
  ]);
}

function normalizeUploadPath(relativePath = "") {
  const normalized = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalized) return "";
  if (normalized.includes("..")) return "";
  return normalized;
}

function canReadFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function resolveUploadedFilePath(relativePath = "") {
  const normalized = normalizeUploadPath(relativePath);
  if (!normalized) return "";

  const basename = path.basename(normalized);

  for (const baseDir of getUploadSearchDirs()) {
    const directPath = path.resolve(baseDir, normalized);
    if (directPath.startsWith(baseDir) && canReadFile(directPath)) {
      return directPath;
    }

    if (normalized.startsWith("resumes/")) {
      const legacyFlatPath = path.resolve(baseDir, basename);
      if (legacyFlatPath.startsWith(baseDir) && canReadFile(legacyFlatPath)) {
        return legacyFlatPath;
      }
    }
  }

  return "";
}
