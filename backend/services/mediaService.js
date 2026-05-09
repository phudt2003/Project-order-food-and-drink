import mediaModel from "../models/mediaModel.js";

const ttlHours = () => {
  const raw = Number(process.env.MEDIA_TEMP_TTL_HOURS ?? 24);
  if (!Number.isFinite(raw) || raw <= 0) return 24;
  return Math.min(24 * 14, Math.floor(raw));
};

export const buildTemporaryExpiry = () => {
  const hours = ttlHours();
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

export const createTemporaryMedia = async ({ cloudinaryResult, actor }) => {
  const expiresAt = buildTemporaryExpiry();

  return await mediaModel.create({
    publicId: cloudinaryResult.public_id,
    url: cloudinaryResult.secure_url,
    resourceType: cloudinaryResult.resource_type || "image",
    format: cloudinaryResult.format || "",
    bytes: Number(cloudinaryResult.bytes || 0) || 0,
    width: Number(cloudinaryResult.width || 0) || 0,
    height: Number(cloudinaryResult.height || 0) || 0,
    status: "temporary",
    expiresAt,
    createdByUserId: actor?.userId || null,
    createdByAdmin: actor?.adminUsername || "",
    linkedTo: {},
  });
};

export const claimMediaAsUsed = async ({ publicId, url, actor, linkedTo }) => {
  const id = String(publicId || "").trim();
  const safeUrl = String(url || "").trim();
  if (!id || !safeUrl) return null;

  const update = {
    $set: {
      url: safeUrl,
      status: "used",
      expiresAt: null,
      linkedTo: {
        model: String(linkedTo?.model || ""),
        id: linkedTo?.id || null,
        field: String(linkedTo?.field || ""),
      },
    },
    $setOnInsert: {
      publicId: id,
      resourceType: "image",
      format: "",
      bytes: 0,
      width: 0,
      height: 0,
      createdByUserId: actor?.userId || null,
      createdByAdmin: actor?.adminUsername || "",
    },
  };

  return await mediaModel.findOneAndUpdate({ publicId: id }, update, {
    new: true,
    upsert: true,
  });
};

export const findMediaByPublicId = async (publicId) => {
  const id = String(publicId || "").trim();
  if (!id) return null;
  return await mediaModel.findOne({ publicId: id });
};

export const deleteMediaRecord = async (publicId) => {
  const id = String(publicId || "").trim();
  if (!id) return;
  await mediaModel.deleteOne({ publicId: id });
};

