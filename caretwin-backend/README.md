# CareTwin Backend

Node.js + Express API for CareTwin, built in phases from the backend master plan.

The API includes authenticated user profiles, family members, medical records with private attachments, and local OCR for medical documents.

## Prerequisites

- Node.js 20+
- PostgreSQL 18 (local) + Redis on port 6379
- Git

## Setup

1. `copy .env.example .env` and keep `DATABASE_URL` as `postgresql://caretwin:caretwin@localhost:5432/caretwin?schema=public` after the `caretwin` role and database exist.
2. Start Redis (`redis-server`) if it is not already running on port 6379.
3. `npm install`
4. `npx prisma generate`
5. `npx prisma migrate deploy`
6. `npm run dev`

Then:

- `GET http://localhost:4000/health` — process is up
- `GET http://localhost:4000/health/ready` — Postgres and Redis are reachable (returns 503 with `database` / `redis` flags if either is down)

## AI assistant configuration

The chat API requires a valid AI provider key. The local `.env.example` selects Groq; add your private `GROQ_API_KEY` before starting the backend. Alternatively, set `LLM_PROVIDER=anthropic` and add `ANTHROPIC_API_KEY`. Do not commit provider keys. If `LLM_PROVIDER` is omitted and a Groq key is configured, the backend selects Groq automatically; otherwise it uses Anthropic.

## Family members and medical records

All routes below require the existing access token.

- `GET /family-members` returns `{ success: true, data: { familyMembers: [...] } }`.
- `POST /family-members` accepts `{ name, relationship, dateOfBirth?, gender? }` and returns `201` with `{ success: true, data: { familyMember } }`.
- `GET /family-members/:id` and `PATCH /family-members/:id` return `{ success: true, data: { familyMember } }`. PATCH may set `dateOfBirth` or `gender` to `null`; update the self member through `PATCH /users/me`.
- `DELETE /family-members/:id` returns `204`. The self member cannot be changed or deleted through these routes. A member with active records must have those records reassigned before deletion (`409`). Accounts may have at most 25 active family members, including self.
- Family DTO: `{ id, name, relationship, dateOfBirth, gender, isSelf, createdAt, updatedAt }`.
- `POST /records` accepts optional `familyMemberId`; omitted values attach the record to the account's self member. `PATCH /records/:id` may reassign it. `GET /records?familyMemberId=<uuid>` filters to that member; omitting the filter retains the existing all-records behavior. Record DTOs include `familyMemberId` and a compact `{ id, name, relationship }` `familyMember`.
- Existing `POST /records/:id/file` still accepts multipart field `file` (PDF/JPEG/PNG, max 10 MB). Its 201 response includes `data.ocr.status: "queued"`.

## OCR contract and runtime

Poll `GET /records/:id/ocr` every 2 seconds, stop at `succeeded` or `failed`, and cap a polling run at 3 minutes. A successful response is:

```json
{
  "success": true,
  "data": {
    "status": "succeeded",
    "text": "Extracted text...",
    "confidence": 91.2,
    "needsReview": false,
    "flags": [],
    "quality": "high",
    "updatedAt": "2026-10-07T00:00:00.000Z"
  }
}
```

The other statuses are `queued`, `processing`, and `failed`; failures include a stable safe `error` code. OCR text is present only on success. A record without a current attachment returns `404`; re-uploading replaces the OCR generation and is the retry mechanism. Confidence is a Tesseract word-score average, not a measure of medical accuracy. `needsReview`, `flags`, and `quality` are heuristic UI cues and must not be treated as clinical validation.

OCR runs locally in the API container using Tesseract and Poppler; uploaded document bytes and OCR text are not sent to an OCR provider. PDFs are limited to 10 pages, images to 12 megapixels, output to 100,000 characters, each OCR subprocess to 30 seconds, and each job to 2 minutes. Worker concurrency is one job at a time. The queue accepts up to 50 active jobs globally and 5 per account; saturation returns `429`. Temporary files are private to the process and removed after processing.

**Render production gate:** the current storage service writes to local disk. Render filesystems are ephemeral unless a persistent disk is mounted. Before claiming durable uploads or OCR, configure a persistent disk mounted at `STORAGE_DIR` and run a single API instance (the OCR worker runs in that same instance). This deployment configuration is not present in the repository and must be verified in Render. A multi-instance/separate-worker deployment requires shared durable storage and is not supported by the current local storage adapter. The S3 adapter is not currently wired into the active storage service.

Local development and production Docker images need `tesseract-ocr`, `tesseract-ocr-eng`, and `poppler-utils`; the checked-in Dockerfile installs these packages. OCR code is an independent implementation using the system Tesseract/Poppler tools. No source was copied from the cited CareTwin-OCR repository because it has no published license.

## Mortality risk demo

The authenticated `GET /predictions/schema` endpoint returns the form schema, and `POST /predictions/mortality` returns a research-demo estimate. Configure `ML_SERVICE_URL=http://localhost:8001` and `ML_SERVICE_API_KEY` in the backend environment; the key must match the ML service's `ML_API_KEY`. The backend calls the ML service using `X-API-Key`. Keep the ML service on a private network and never expose it publicly. Prediction inputs and results are not stored.
