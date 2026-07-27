import cloudinary from "../config/cloudinary.js";

function ensureConfigured() {
  const hasConfig =
    Boolean(process.env.CLOUDINARY_URL) ||
    Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
    Boolean(process.env.CLOUDINARY_API_KEY) &&
    Boolean(process.env.CLOUDINARY_API_SECRET);

  if (!hasConfig) {
    const err = new Error("Cloudinary is not configured");
    err.status = 500;
    throw err;
  }
}

export function uploadBufferToCloudinary(buffer, options = {}) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        const providerMessage =
          error?.message ||
          error?.error?.message ||
          "Cloudinary upload failed";
        const providerCode =
          Number(error?.http_code) ||
          Number(error?.error?.http_code) ||
          Number(error?.status) ||
          502;
        const err = new Error(providerMessage);
        err.status = providerCode;
        return reject(err);
      }
      resolve(result);
    });
    stream.end(buffer);
  });
}

export async function uploadRemoteUrlToCloudinary(remoteUrl, options = {}) {
  ensureConfigured();

  const url = String(remoteUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error("A valid http or https media link is required");
    err.status = 400;
    throw err;
  }

  try {
    return await cloudinary.uploader.upload(url, {
      resource_type: "auto",
      ...options,
    });
  } catch (error) {
    const providerMessage =
      error?.message ||
      error?.error?.message ||
      "Cloudinary upload failed";
    const providerCode =
      Number(error?.http_code) ||
      Number(error?.error?.http_code) ||
      Number(error?.status) ||
      502;
    const err = new Error(providerMessage);
    err.status = providerCode;
    throw err;
  }
}
