import multer from "multer";
import { uploadImageBuffer, deleteByPublicId } from "../services/cloudinaryService.js";
import {
  createTemporaryMedia,
  deleteMediaRecord,
  findMediaByPublicId,
} from "../services/mediaService.js";

const maxBytes = () => {
  const raw = Number(process.env.MEDIA_MAX_FILE_BYTES ?? 5 * 1024 * 1024);
  if (!Number.isFinite(raw) || raw <= 0) return 5 * 1024 * 1024;
  return Math.min(raw, 25 * 1024 * 1024);
};

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes(), files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = String(file?.mimetype || "").toLowerCase().startsWith("image/");
    cb(ok ? null : new Error("Only image uploads are allowed"), ok);
  },
}).single("file");

const actorFromRequest = (req) => ({
  userId: req.userId || null,
  adminUsername: req.admin?.username || "",
});

export const uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "File is required" });
    }

    const result = await uploadImageBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      tags: ["app_upload"],
    });

    const doc = await createTemporaryMedia({ cloudinaryResult: result, actor: actorFromRequest(req) });

    return res.json({
      success: true,
      message: "Uploaded",
      data: {
        id: doc._id,
        url: doc.url,
        publicId: doc.publicId,
        expiresAt: doc.expiresAt,
      },
    });
  } catch (error) {
    console.log("MEDIA UPLOAD ERROR:", error?.message || error);
    return res.status(400).json({ success: false, message: "Upload failed" });
  }
};

export const deleteImageByPublicId = async (req, res) => {
  try {
    const publicId = String(req.body?.publicId || req.query?.publicId || "").trim();
    if (!publicId) {
      return res.status(400).json({ success: false, message: "publicId is required" });
    }

    const media = await findMediaByPublicId(publicId);

    if (!req.isAdmin) {
      const requester = String(req.userId || "");
      const owner = media?.createdByUserId ? String(media.createdByUserId) : "";
      if (!media || !requester || requester !== owner) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const resourceType = media?.resourceType || "image";
    const result = await deleteByPublicId({ publicId, resourceType });
    await deleteMediaRecord(publicId);

    return res.json({ success: true, message: "Deleted", data: result });
  } catch (error) {
    console.log("MEDIA DELETE ERROR:", error?.message || error);
    return res.status(400).json({ success: false, message: "Delete failed" });
  }
};

