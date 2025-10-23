# MinIO Upload Integration Fix

## Issues Fixed

### 1. **Bucket Creation & CORS**

- The `ensureBucket()` method was a no-op, so the bucket was never created
- CORS was not configured, preventing browser direct uploads
- **Fix**: Implemented proper bucket creation and CORS configuration in `minio.service.ts`

### 2. **Missing Logging**

- No visibility into what was happening during upload flow
- **Fix**: Added comprehensive logging to:
  - `attachments.controller.ts` - presigned-upload and confirm-upload endpoints
  - `attachments.service.ts` - createUploadUrl and confirmUpload methods
  - `minio.service.ts` - bucket initialization

### 3. **Service Initialization**

- MinIO service wasn't initializing bucket on startup
- **Fix**: Added `OnModuleInit` implementation to ensure bucket on app startup

## Changes Made

### `/backend/src/attachments/minio.service.ts`

```typescript
- Implements OnModuleInit
- Creates bucket if it doesn't exist
- Configures CORS for browser uploads
- Adds logging for debugging
```

### `/backend/src/attachments/attachments.controller.ts`

```typescript
- Enhanced logging in presigned-upload endpoint
- Enhanced logging in confirm-upload endpoint
- Better error messages
```

### `/backend/src/attachments/attachments.service.ts`

```typescript
- Added logging to createUploadUrl
- Added logging to confirmUpload
- Better error messages
```

## Testing the Fix

1. **Restart the backend server** to apply MinIO initialization:

   ```bash
   cd backend
   pnpm run start:dev
   ```

2. **Check logs on startup** - you should see:

   ```
   [MinIO] Bucket "uploads" already exists
   [MinIO] CORS configured for bucket "uploads"
   ```

   Or:

   ```
   [MinIO] Created bucket "uploads"
   [MinIO] CORS configured for bucket "uploads"
   ```

3. **Test upload flow**:
   - Go to Settings → Profile
   - Try uploading an avatar or banner
   - Watch the browser console and backend logs

## Expected Log Flow

### Step 1: Request Upload URL

**Backend logs:**

```
[presigned-upload] Request received
[presigned-upload] Body: { "filename": "image.jpg", "contentType": "image/jpeg" }
[presigned-upload] User: 67890abcdef...
[createUploadUrl] Creating attachment with: { ownerId: '...', originalFilename: 'image.jpg', ... }
[createUploadUrl] Attachment saved: 12345...
[createUploadUrl] Presigned URL generated for key: 67890.../...
[presigned-upload] Success! MinIO key: 67890.../...
```

### Step 2: Upload to MinIO (in browser)

**Browser console:**

```
File uploaded to MinIO successfully
```

### Step 3: Confirm Upload

**Backend logs:**

```
[confirm-upload] Request received
[confirm-upload] Body: { "key": "67890.../...", "filename": "image.jpg", ... }
[confirmUpload] Confirming upload for key: 67890.../...
[confirmUpload] Object found in MinIO: { key: '...', size: 12345, contentType: 'image/jpeg' }
[confirmUpload] Updating existing record: 12345...
[confirmUpload] Attachment confirmed: 12345...
[confirm-upload] Success! Attachment ID: 12345...
```

## Common Issues & Solutions

### Issue: "Bucket doesn't exist"

**Solution**: The service will now auto-create it on startup

### Issue: CORS error in browser

**Solution**: The service now configures CORS automatically

### Issue: "Failed to get upload URL"

**Check**:

- Is MinIO running? `docker ps | grep minio`
- Are credentials correct in `.env`?
- Check backend logs for detailed error

### Issue: "Failed to upload file to MinIO"

**Check**:

- Is the upload URL valid?
- Is MinIO accessible from browser at `http://localhost:9000`?
- Check browser console for CORS errors
- Try accessing MinIO console at `http://localhost:9001`

### Issue: "Failed to confirm upload"

**Check**:

- Was the file actually uploaded to MinIO?
- Check backend logs for MinIO headObject errors
- Verify the MinIO key matches between steps

## Environment Configuration

Make sure your `.env` file has:

```env
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=uploads
MINIO_USE_SSL=false
MINIO_REGION=us-east-1
MINIO_PUBLIC_URL=http://localhost:9000
```

## Frontend Integration

The frontend is already correctly configured to:

1. Request presigned URL from `/attachments/presigned-upload`
2. Upload file directly to MinIO using PUT
3. Confirm upload via `/attachments/confirm-upload`

No frontend changes needed!

## Next Steps

After verifying uploads work:

1. ✅ Test avatar upload
2. ✅ Test banner upload
3. ✅ Test post attachment upload
4. 🔒 Implement CAPTCHA protection (see `CAPTCHA_IMPLEMENTATION.md`)

---

**Status**: ✅ Fixed - Ready to test
