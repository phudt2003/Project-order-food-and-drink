import crypto from "crypto";
import { getCloudinary, getCloudinaryFolder } from "../config/cloudinary.js";

const sanitizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-z0-9_\-./]/gi, "_")
    .slice(0, 100);

const defaultUploadPreset = () => {
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || "").trim();
  return preset || null;
};

export const uploadImageBuffer = async ({
  buffer,
  filename,
  folder = getCloudinaryFolder(),
  tags = [],
}) => {
  const cloudinary = getCloudinary();
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("uploadImageBuffer: buffer is required");
  }

  const safeFolder = String(folder || "").trim();
  const publicIdSuffix = crypto.randomBytes(8).toString("hex");
  const baseName = String(filename || "upload")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9_\-]/gi, "_")
    .slice(0, 80);

  const uploadPreset = defaultUploadPreset();

  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: safeFolder || undefined,
        public_id: `${baseName}_${publicIdSuffix}`,
        overwrite: false,
        unique_filename: true,
        use_filename: false,
        tags: Array.isArray(tags) ? tags.map(sanitizeTag).filter(Boolean) : undefined,
        upload_preset: uploadPreset || undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error("Cloudinary upload failed"));
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });
};

export const uploadImageDataUrl = async ({ dataUrl, filename, folder = getCloudinaryFolder(), tags = [] }) => {
  const cloudinary = getCloudinary();
  const payload = String(dataUrl || "").trim();
  if (!payload) throw new Error("uploadImageDataUrl: dataUrl is required");

  const safeFolder = String(folder || "").trim();
  const baseName = String(filename || "upload")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9_\-]/gi, "_")
    .slice(0, 80);

  const uploadPreset = defaultUploadPreset();

  const result = await cloudinary.uploader.upload(payload, {
    resource_type: "image",
    folder: safeFolder || undefined,
    public_id: `${baseName}_${crypto.randomBytes(8).toString("hex")}`,
    overwrite: false,
    unique_filename: true,
    use_filename: false,
    tags: Array.isArray(tags) ? tags.map(sanitizeTag).filter(Boolean) : undefined,
    upload_preset: uploadPreset || undefined,
  });

  if (!result?.secure_url || !result?.public_id) throw new Error("Cloudinary upload failed");
  return result;
};

export const uploadImageRemoteUrl = async ({ remoteUrl, filename, folder = getCloudinaryFolder(), tags = [] }) => {
  const cloudinary = getCloudinary();
  const payload = String(remoteUrl || "").trim();
  if (!payload) throw new Error("uploadImageRemoteUrl: remoteUrl is required");

  const safeFolder = String(folder || "").trim();
  const baseName = String(filename || "upload")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9_\-]/gi, "_")
    .slice(0, 80);

  const uploadPreset = defaultUploadPreset();

  const result = await cloudinary.uploader.upload(payload, {
    resource_type: "image",
    folder: safeFolder || undefined,
    public_id: `${baseName}_${crypto.randomBytes(8).toString("hex")}`,
    overwrite: false,
    unique_filename: true,
    use_filename: false,
    tags: Array.isArray(tags) ? tags.map(sanitizeTag).filter(Boolean) : undefined,
    upload_preset: uploadPreset || undefined,
  });

  if (!result?.secure_url || !result?.public_id) throw new Error("Cloudinary upload failed");
  return result;
};

export const deleteByPublicId = async ({ publicId, resourceType = "image" }) => {
  const cloudinary = getCloudinary();
  const id = String(publicId || "").trim();
  if (!id) throw new Error("deleteByPublicId: publicId is required");

  return await cloudinary.uploader.destroy(id, { resource_type: resourceType });
};
