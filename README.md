# NaapLo Catalogue Generator

Professional AI catalogue image generation for Indian women's designer garments, using OpenAI `gpt-image-2` by default with a retained Gemini adapter.

Built with **React**, **Vite**, **TypeScript**, **Node.js**, **Express**, and provider-neutral image-generation adapters.

---

## Quick Start Guide

### 1. Environment Configuration
Copy the example environment file and add your provider API key:
```bash
cp .env.example .env
```
For the default OpenAI provider, configure the server-side key:
```env
OPENAI_API_KEY="your-openai-api-key-here"
IMAGE_PROVIDER="openai"
IMAGE_MODEL="gpt-image-2"
PORT=3000
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```
The application will be accessible at: `http://localhost:3000`

The development server must remain running in that terminal while using the localhost URL.

### 4. Build & Production Start
```bash
# Compile Vite frontend and bundle server into dist/server.cjs
npm run build

# Start production server (sets NODE_ENV=production portably on Windows/Linux)
npm start
```

`IMAGE_MODEL` is the single authoritative model setting. Provider API keys remain server-side. To use the retained Gemini adapter instead, set `IMAGE_PROVIDER="gemini"`, configure `GEMINI_API_KEY`, and choose a compatible Gemini image model.

### Optional Google Drive prompt and assets (CP-005)

Keep `DRIVE_ENABLED=false` until server-side Drive authentication is ready. For production, create a Google service account, share the configured prompt/logo/layout files with its `client_email`, base64-encode the complete service-account JSON, and set:

```env
DRIVE_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_JSON="base64-encoded-service-account-json"
```

For local development, keep the key in a protected folder and set `GOOGLE_SERVICE_ACCOUNT_JSON_FILE` to its absolute path instead of copying the credential into `.env`.

The file IDs and minimum approved prompt version are documented in `.env.example`. If Drive cannot be authenticated or validated, the application automatically uses the registered local prompt and assets.

### Production access protection

Before exposing the app to the internet, set `ACCESS_PROTECTION_ENABLED=true` with a strong `APP_ACCESS_USERNAME` and `APP_ACCESS_PASSWORD`. CP-007 also applies an in-memory per-IP generation rate limit, request-body limits, per-image and combined-image limits, security headers, and request-ID logs that exclude uploaded images, credentials, prompts, and Product IDs.

### Approved output branding and Drive storage (CP-008)

`SPECIAL POSE`, `DESCRIPTIVE CATALOGUE POSTER`, and `MULTIPLE OUTFIT VIEW` are post-composited with the exact approved NaapLo logo at the top right; the AI provider is not trusted to redraw it. Downloads use deterministic sanitized names such as `NaapLo-B1-special-pose.png`. Successful multi-view runs can also be downloaded together as one Product-ID-based ZIP archive.

Approved-output upload to a regular Google My Drive folder uses OAuth because Google service accounts do not have storage quota. Configure `DRIVE_OUTPUT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_JSON_FILE`, and `GOOGLE_OAUTH_REFRESH_TOKEN_FILE` in `.env`, then run the one-time authorization flow:

```powershell
npx tsx scripts/googleDriveOAuthSetup.ts
```

Open the displayed Google authorization URL and approve Drive access. The callback writes the refresh token to the protected path configured by `GOOGLE_OAUTH_REFRESH_TOKEN_FILE`; never commit that file or the OAuth client secret. The OAuth client's authorized redirect URI must include `http://localhost:3000/api/auth/google/callback`.

After authorization, clicking **Approve & Upload** creates or reuses a Product ID subfolder and creates or replaces the deterministic PNG. Without complete output-storage credentials, approval remains local and the app clearly reports that storage is not configured. The service account configuration remains available independently for the read-only prompt and reference assets used by CP-005.

## Generation API transport

`POST /api/generate` uses JSON with base64-encoded image payloads (`Content-Type: application/json`).
The request includes `contractVersion: "generation-job.v1"`, one `outputType`, and one or more
`referenceImages`. A successful response returns one image as `base64` plus a browser-ready
`dataUrl`. This transport encoding preserves the provider-neutral one-job/one-output contract;
provider-specific payloads remain inside the selected image-provider adapter.

---

## Phase 1 Features

- **Product Metadata:** Enter a Product ID for catalogue tracking.
- **Reference Image Management:** Upload up to 10 raw physical garment photographs, view previews, and remove individual references.
- **9 Standard Catalogue Views:**
  - `FRONT VIEW`
  - `BACK VIEW`
  - `SIDE VIEW`
  - `FULL VIEW`
  - `MULTIPLE OUTFIT VIEW` (incorporates composition layout reference)
  - `CLOSE-UP` (enforces mandatory Close-Up Target)
  - `SPECIAL POSE`
  - `DESCRIPTIVE CATALOGUE POSTER` (incorporates NaapLo brand emblem)
  - `UNSTITCHED DISPLAY VIEW`
- **Mandatory Close-Up Target:** Enforced input preventing invalid broad generations when macro detail is requested.
- **Image Generation & Download:** Generates studio catalogue portraits with one-click full-resolution PNG download and a ZIP-based Download All action for successful views.
- **Iterative Correction:** Submit targeted feedback; the system orchestrates the original garment references, the previous generation, and the correction notes for precise revision.
- **Explicit Identity Approval:** Accept or replace a generated FRONT image as the locked identity reference for later BACK and SIDE views. Changing the Product ID or garment references clears the lock.
- **Stateless & Portable:** Zero database requirement; run on any ordinary Node.js host (Hostinger VPS, Docker, Linux server).
