import { v2 as cloudinary } from "cloudinary";

let configured = false;

const required = (key) => {
  const value = String(process.env[key] || "").trim();
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

export const getCloudinaryFolder = () => {
  const folder = String(process.env.CLOUDINARY_FOLDER || "tieu-luan").trim();
  return folder.replace(/^\/+|\/+$/g, "");
};

export const getCloudinary = () => {
  if (configured) return cloudinary;

  const cloudName = required("CLOUDINARY_CLOUD_NAME");
  const apiKey = required("CLOUDINARY_API_KEY");
  const apiSecret = required("CLOUDINARY_API_SECRET");

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
  return cloudinary;
};

