# CareTwin deployment checklist

## 1. Push each project to its own GitHub repository

Open a fresh PowerShell session at the workspace root for each block. Replace `<YOUR-GITHUB-USER>` with your GitHub username. Confirm `.env` is not staged before pushing.

```powershell
cd caretwin-backend
git init
git add .
git status --short
git commit -m "Prepare CareTwin backend"
git branch -M main
git remote add origin https://github.com/<YOUR-GITHUB-USER>/caretwin-backend.git
git push -u origin main
```

```powershell
cd caretwin-ml-service
git init
git add .
git status --short
git commit -m "Prepare CareTwin ML service"
git branch -M main
git remote add origin https://github.com/<YOUR-GITHUB-USER>/caretwin-ml-service.git
git push -u origin main
```

```powershell
cd caretwin-frontend
git init
git add .
git status --short
git commit -m "Prepare CareTwin frontend"
git branch -M main
git remote add origin https://github.com/<YOUR-GITHUB-USER>/caretwin-frontend.git
git push -u origin main
```

## 2. Create Render Postgres and Redis

In Render, create a managed PostgreSQL database and a Redis/Key Value instance in the same region. Use a dedicated application database role with only the privileges the app needs; do not run the app as a Postgres superuser or use a role with `CREATEDB`. Copy the private connection strings for the backend environment.

## 3. Deploy the ML service on Render

Create a Render Docker service from the `caretwin-ml-service` repository. Add `ML_API_KEY` using a value generated in section 7. It must be at least 32 random bytes. Do not set `ML_ALLOW_INSECURE`. Keep the key private; the backend must receive the identical value as `ML_SERVICE_API_KEY`.

**Network-scope decision:** the backend README says the ML service must stay private, while the requested production template expects an HTTPS origin. A publicly reachable Render Web Service provides that origin but leaves `/health` open; its other routes require the key. If strict private-only access is required, confirm the internal service address and protocol in Render before deploying, because it may not match the template's HTTPS-origin comment.

## 4. Deploy the backend on Render

Create a Render Web Service from `caretwin-backend`, select Docker, and configure health check path `/health/ready`. Add a persistent disk mounted at `/var/data`; set `STORAGE_DIR=/var/data/storage`. Run one instance only because uploads and the OCR worker use the same instance-local disk.

The active storage adapter writes to local disk; the S3 adapter is not wired into the running service. The persistent disk and single instance are required for durable uploads and OCR.

Set **every variable** from [caretwin-backend/.env.production.example](./caretwin-backend/.env.production.example) in the Render Environment tab:

- `NODE_ENV`, `CORS_ORIGINS`, `FRONTEND_URL`
- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `COOKIE_SAMESITE`, `COOKIE_PATH`, `TRUST_PROXY_HOPS`
- `STORAGE_DIR`
- `MAIL_PROVIDER`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `LLM_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`
- `ML_SERVICE_URL`, `ML_SERVICE_API_KEY`
- `SENTRY_DSN`

Use the generated database/Redis values and real provider credentials. Use a temporary obvious HTTPS value such as `https://your-project.vercel.app` for `CORS_ORIGINS` and `FRONTEND_URL` until Vercel supplies the final origin. Set `ML_SERVICE_URL` to the ML service's HTTPS origin only, without a trailing slash or path. Keep all secrets in Render's dashboard, never in Git.

## 5. Deploy the frontend on Vercel

Import the `caretwin-frontend` repository and add `CARETWIN_BACKEND_ORIGIN=https://<YOUR-BACKEND-URL>` for Production (and any Preview environment you will use); enter the origin only, with no path. Redeploy after changing this value.

**Root-directory note:** step 1 creates a separate repository from inside `caretwin-frontend`, so the Vercel Root Directory is the repository root (`.`). The requested Root Directory value `caretwin-frontend` applies only if you instead connect a repository containing the whole workspace with `caretwin-frontend/` beneath it; that layout conflicts with step 1's separate repositories.

## 6. Update backend browser origins

After Vercel provides the production URL, replace the temporary origin in the backend's `CORS_ORIGINS` and `FRONTEND_URL` with the exact HTTPS Vercel origin, for example `https://<YOUR-VERCEL-URL>`. Save and redeploy the backend. Add any custom domain origins explicitly; do not use `*`.

## 7. Generate secrets

Run this exact command in a local terminal for each distinct secret, and enter the output only in the relevant provider dashboard:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate separate values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `ML_API_KEY`. The ML key must match `ML_SERVICE_API_KEY` on the backend. Do not paste secret output into chat, source files, or this checklist.

## 8. Smoke tests

- `GET https://<YOUR-ML-URL>/health` returns HTTP 200. The ML `/schema` and `/predict` routes require `X-API-Key`.
- `GET https://<YOUR-BACKEND-URL>/health/ready` returns HTTP 200 with database and Redis up.
- Sign up and sign in through the Vercel frontend; verify the session cookie works.
- Send an AI chat request and confirm the configured provider responds.
- Open the Mortality Risk page and verify a prediction request succeeds. Treat results as a research demo, not clinical advice.

## 9. Before real users

- Obtain clinician review of `src/data/symptomRules.js`, `src/data/chatSafety.js`, the chat system prompt, and the risk model; do not present predictions as clinical guidance.
- Review Groq data-retention and processing terms, and accurately disclose third-party AI processing in the privacy policy.
- Re-run diagnosis, dosage, and prompt-injection chat tests against the production model.
- Run `node scripts/security-check.js --prod` before release and clear every FAIL.
- Rotate any database password shared in chat; use a dedicated production database role without `CREATEDB`.
- Do not deploy the `scripts/` folder; in particular, `scripts/verify-user.js` bypasses email verification. Keep development scripts and docs out of the runtime image.
- Configure real email delivery and SPF/DKIM for your domain; console email is not production delivery.
- Re-run `npm audit` and reassess the Prisma/deepmerge-ts finding. The backend TODO notes a high CLI-only finding with no safe fix currently available.
- Check Render's current pricing page for free-tier sleep behavior and resource limits before relying on free hosting.
- If switching `LLM_PROVIDER` to Anthropic, configure a real `ANTHROPIC_API_KEY` and repeat the provider-specific tests.
