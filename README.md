# WIM

WIM is a full-stack inventory + warranty manager.

- API: Node.js + Express + TypeScript + Prisma
- Web: React + Vite

## Docs

- API reference: `docs/api.md`

## Workspace structure

- `apps/api`: backend API (`/api/*`)
- `apps/web`: frontend web app

## Notes

- Production API base URL (Render): `https://wimapi.onrender.com/api`
- Uploaded files are served publicly from `/uploads/*` on the API host.
  The metadata endpoints under `/api/attachments/*` require JWT.

## Dev quickstart (Windows)

API (dev):

```powershell
cd .\apps\api
npm install
npm run dev
```

Web (dev):

```powershell
cd .\apps\web
npm install
npm run dev
```

### Configure API base URL for the web app

Set `VITE_API_BASE_URL` to one of:

- `https://wimapi.onrender.com/api` (Render)
- `http://localhost:3000/api` (local dev)

The frontend logic lives in `apps/web/src/services/api.ts`.
