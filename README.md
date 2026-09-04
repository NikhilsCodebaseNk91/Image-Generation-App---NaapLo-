# NaapLo Catalogue Generator (Phase 1)

Professional catalogue image generation for Indian women's designer garments (Salwar Kameez, Anarkalis, Kurta Sets, and Unstitched Material) using the Gemini API.

Built with **React**, **Vite**, **TypeScript**, **Node.js**, **Express**, and the official **`@google/genai`** SDK.

---

## Quick Start Guide

### 1. Environment Configuration
Copy the example environment file and add your Gemini API Key:
```bash
cp .env.example .env
```
Ensure `GEMINI_API_KEY` is populated:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
IMAGE_PROVIDER="gemini"
IMAGE_MODEL="gemini-3.1-flash-image"
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

### 4. Build & Production Start
```bash
# Compile Vite frontend and bundle server into dist/server.cjs
npm run build

# Start production server (sets NODE_ENV=production portably on Windows/Linux)
npm start
```

`IMAGE_MODEL` is the single authoritative model setting. Provider API keys remain server-side.

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
