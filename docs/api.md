# WIM API documentation

Base URL (Render): `https://wimapi.onrender.com/api`

This file is meant to be copy/paste friendly for quick testing and for onboarding.

## Authentication

Most endpoints are protected by JWT.

Send the token using the `Authorization` header:

- `Authorization: Bearer <JWT>`

If the header is missing/invalid, the API returns `401`.

### Quick test (PowerShell)

```powershell
# Login and capture token
$base = "https://wimapi.onrender.com/api"
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (
  @{ email = "user@example.com"; password = "your-password" } | ConvertTo-Json
)
$token = $login.token

# Use token in requests
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "$base/profile/me" -Headers $headers
```

## Conventions

- All IDs are integers.
- Unless explicitly stated, endpoints return JSON.
- Date fields are ISO strings.

## Profile

### GET `/profile/me`

Returns the current user profile.

**Auth:** required

**Response `200`**

```json
{ "userId": 123, "email": "user@example.com", "role": "USER" }
```

### PUT `/profile/me/email`

Updates the current user email.

**Auth:** required

**Body**

```json
{ "email": "new@example.com", "currentPassword": "..." }
```

**Responses**

- `200` updated profile JSON
- `401` password invalid
- `409` email already exists

### PUT `/profile/me/password`

Updates the current user password.

**Auth:** required

**Body**

```json
{ "currentPassword": "...", "newPassword": "..." }
```

**Responses**

- `200` updated profile JSON
- `401` password invalid

### DELETE `/profile/me`

Deletes the current account.

**Auth:** required

**Body**

```json
{ "currentPassword": "..." }
```

**Response `204`**

No content.

**Notes**

- The server deletes dependent records owned by the user (alerts, shares, invites, audit logs, attachments, warranties, articles) in a transaction.
- After success, the frontend should clear local auth and redirect.

#### Example (PowerShell)

```powershell
$base = "https://wimapi.onrender.com/api"
$headers = @{ Authorization = "Bearer $token" }

Invoke-RestMethod -Method Delete -Uri "$base/profile/me" -Headers $headers -ContentType "application/json" -Body (
  @{ currentPassword = "your-password" } | ConvertTo-Json
)
```

## Attachments

Attachments are metadata records that can point to an uploaded file via `fileUrl`.

### Important: `/api/*` vs `/uploads/*`

- `/api/attachments/*` returns JSON metadata and **requires JWT**.
- `/uploads/<filename>` is the raw file hosting (static) and is **public**.

That’s why the UI must open/download using `attachment.fileUrl` (not by navigating to `/api/attachments/:id`).

### GET `/attachments`

Lists the current user attachments.

**Auth:** required

**Query parameters**

- `articleId` (optional number)
- `garantieId` (optional number)

**Response `200`**

Array of attachments.

#### Example (PowerShell)

```powershell
$base = "https://wimapi.onrender.com/api"
$headers = @{ Authorization = "Bearer $token" }

# All attachments
Invoke-RestMethod -Uri "$base/attachments" -Headers $headers

# Filter by articleId
Invoke-RestMethod -Uri "$base/attachments?articleId=1" -Headers $headers
```

### GET `/attachments/:id`

Returns a single attachment if owned by the current user.

**Auth:** required

**Response**

- `200` attachment JSON
- `404` not found

### POST `/attachments`

Creates an attachment metadata record (no file upload).

**Auth:** required

**Body (example)**

```json
{
  "type": "OTHER",
  "fileName": "manual.pdf",
  "fileUrl": "https://wimapi.onrender.com/uploads/manual-123.pdf",
  "articleId": 1,
  "garantieId": 2
}
```

### POST `/attachments/upload`

Uploads a file and creates an attachment.

**Auth:** required

**Content-Type:** `multipart/form-data`

**Form fields**

- `file` (required)
- `type` (optional): `INVOICE` | `WARRANTY` | `OTHER` (defaults to `OTHER`)

**Response `201`**

Attachment JSON including `fileUrl`.

**Important**

- `fileUrl` is a public URL to `/uploads/<filename>` and **does not require JWT**.
- Don’t open `/api/attachments/:id` in a browser tab without headers; use `fileUrl` to view/download.

#### Example upload (PowerShell)

PowerShell’s `Invoke-RestMethod` can send multipart form-data, but it’s a bit verbose.
If you have curl installed, this is the easiest:

```powershell
$base = "https://wimapi.onrender.com/api"
curl -X POST "$base/attachments/upload" ^
  -H "Authorization: Bearer $token" ^
  -F "type=OTHER" ^
  -F "file=@C:\path\to\document.pdf"

# Then open the returned `fileUrl` in a browser
```

### PUT `/attachments/:id`

Updates attachment fields.

**Auth:** required

### DELETE `/attachments/:id`

Deletes attachment metadata.

**Auth:** required

**Query**

- `removeFile=true` (optional): best-effort deletion from disk for local dev.

## Health

### GET `/health`

Returns API health.

```json
{ "status": "ok" }
```

## Troubleshooting

### "Token manquant" when opening an attachment

**Cause:** your browser is navigating to a protected JSON endpoint like:

- `https://wimapi.onrender.com/api/attachments/123`

Navigating in a browser tab does **not** automatically send your JWT header, so the API returns `401`.

**Fix:** open/download the file using the attachment’s `fileUrl` instead, e.g.:

- `https://wimapi.onrender.com/uploads/<filename>`

### Attachment download doesn’t work / mixed-content errors

If an attachment record contains a historic/bad `fileUrl` such as:

- `http://localhost:3000/uploads/...`
- `http://wimapi.onrender.com/uploads/...` (HTTP)

then the browser may block it (mixed content) or the host is invalid.

**Fix options:**

1. Update the DB records to correct `fileUrl` to HTTPS on the Render host.
2. Client-side normalization for `/uploads/...` paths (already implemented in the web app).

### Delete account returns "Internal error" but the user is deleted

This usually means the backend deleted some data (including the user) but then hit an error later in the transaction/flow, returning `500` even though the account is effectively gone.

**Expected UX:** the frontend should clear local auth and redirect if the session becomes invalid.

**Fix options:**

- Backend: make delete-account fully atomic (transaction) and ensure it always returns `204` only when everything succeeds.
- Frontend: if delete fails but subsequent `/profile/me` returns `401/404`, auto-logout and redirect.
