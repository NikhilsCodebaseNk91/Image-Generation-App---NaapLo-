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
- **Image Generation & Download:** Generates studio catalogue portraits with one-click full-resolution PNG download.
- **Iterative Correction:** Submit targeted feedback; the system orchestrates the original garment references, the previous generation, and the correction notes for precise revision.
- **Stateless & Portable:** Zero database requirement; run on any ordinary Node.js host (Hostinger VPS, Docker, Linux server).
