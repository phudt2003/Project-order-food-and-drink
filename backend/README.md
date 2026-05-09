# Backend (Express + MongoDB) — Cloudinary Media

## 1) Environment variables (server-side only)

Add these to `backend/.env` (do **not** put API Secret in any frontend):

```bash
# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Optional (recommended)
CLOUDINARY_FOLDER=tieu-luan
CLOUDINARY_UPLOAD_PRESET=

# Upload limits / cleanup
MEDIA_MAX_FILE_BYTES=5242880
MEDIA_TEMP_TTL_HOURS=24
MEDIA_CLEANUP_EVERY_MINUTES=60
MEDIA_CLEANUP_BATCH=50
MEDIA_CLEANUP_MAX_PER_RUN=200
MEDIA_CLEANUP_JOB_DISABLED=0
```

## 2) Media API

- `POST /api/media/upload` (multipart `file`)  
  Upload ảnh lên Cloudinary qua backend, lưu vào MongoDB (`media`) với trạng thái `temporary`.

- `DELETE /api/media/by-public-id` (JSON `{ publicId }`)  
  Xóa ảnh theo `publicId` (admin hoặc chủ sở hữu upload).

## 3) Lưu `url` + `public_id` vào MongoDB

- `food.image` = Cloudinary `secure_url`  
- `food.imagePublicId` = Cloudinary `public_id`

- `category.image` = Cloudinary `secure_url`  
- `category.imagePublicId` = Cloudinary `public_id`

## 4) Tự động xóa ảnh không sử dụng

Job chạy nền trong `backend/jobs/mediaCleanupScheduler.js`:

- Tìm `media` còn `temporary` và `expiresAt <= now`
- Xóa ảnh trên Cloudinary + xóa record trong MongoDB

## 5) Migrate ảnh local lên Cloudinary + dọn `backend/uploads`

### Migrate (DRY RUN)

```bash
cd backend
npm run migrate-images:dry
```

### Migrate (APPLY + xóa local file ngay sau khi upload)

```bash
cd backend
npm run migrate-images
```

### Cleanup `backend/uploads` (chỉ xóa file không còn được tham chiếu trong DB)

```bash
cd backend
npm run cleanup-uploads:dry
npm run cleanup-uploads
```
