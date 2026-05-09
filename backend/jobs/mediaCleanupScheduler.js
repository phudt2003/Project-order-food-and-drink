import { deleteByPublicId } from "../services/cloudinaryService.js";
import mediaModel from "../models/mediaModel.js";
import { deleteMediaRecord } from "../services/mediaService.js";

const everyMinutes = () => {
  const raw = Number(process.env.MEDIA_CLEANUP_EVERY_MINUTES ?? 60);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(24 * 60, Math.floor(raw));
};

const batchSize = () => {
  const raw = Number(process.env.MEDIA_CLEANUP_BATCH ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(200, Math.floor(raw));
};

const maxPerRun = () => {
  const raw = Number(process.env.MEDIA_CLEANUP_MAX_PER_RUN ?? 200);
  if (!Number.isFinite(raw) || raw <= 0) return 200;
  return Math.min(2000, Math.floor(raw));
};

export const runMediaCleanupJob = async () => {
  const startedAt = new Date();
  const now = startedAt;

  const stats = {
    expiredFound: 0,
    deleted: 0,
    errors: 0,
  };

  try {
    const max = maxPerRun();
    const limit = batchSize();

    // Process in small batches to avoid API bursts.
    while (stats.deleted + stats.errors < max) {
      const expired = await mediaModel
        .find({
          status: "temporary",
          expiresAt: { $ne: null, $lte: now },
        })
        .sort({ expiresAt: 1 })
        .limit(limit)
        .lean();

      if (!expired.length) break;
      stats.expiredFound += expired.length;

      for (const doc of expired) {
        const publicId = String(doc?.publicId || "").trim();
        if (!publicId) continue;

        try {
          await deleteByPublicId({ publicId, resourceType: doc.resourceType || "image" });
          await deleteMediaRecord(publicId);
          stats.deleted += 1;
        } catch (error) {
          // Avoid infinite loops: drop the record so it doesn't block future cleanups.
          await deleteMediaRecord(publicId).catch(() => {});
          stats.errors += 1;
          console.log("[MEDIA CLEANUP] delete error:", publicId, error?.message || error);
        }

        if (stats.deleted + stats.errors >= max) break;
      }
    }
  } catch (error) {
    stats.errors += 1;
    console.log("[MEDIA CLEANUP] job error:", error?.message || error);
  }

  const finishedAt = new Date();
  console.log(
    "[MEDIA CLEANUP]",
    finishedAt.toISOString(),
    `expired: ${stats.expiredFound}`,
    `deleted: ${stats.deleted}`,
    `errors: ${stats.errors}`
  );

  return { ok: true, stats };
};

export const startMediaCleanupScheduler = () => {
  if (process.env.MEDIA_CLEANUP_JOB_DISABLED === "1") {
    console.log("[MEDIA CLEANUP] Disabled via MEDIA_CLEANUP_JOB_DISABLED=1");
    return;
  }

  const intervalMs = everyMinutes() * 60 * 1000;
  console.log("[MEDIA CLEANUP] Running every", everyMinutes(), "minute(s)");

  const tick = async () => {
    try {
      await runMediaCleanupJob();
    } finally {
      setTimeout(tick, intervalMs);
    }
  };

  // Small delay so startup isn't blocked by the first run.
  setTimeout(tick, 10 * 1000);
};

