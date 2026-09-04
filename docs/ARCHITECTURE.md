# NaapLo Catalogue Generator — Architecture Specification

## 1. System Overview & Technology Stack

The NaapLo Catalogue Generator is constructed as an ordinary, portable full-stack Node.js application without vendor lock-in.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React icons.
- **Backend:** Node.js (v20+), TypeScript, Express.
- **AI Provider SDK:** Official `@google/genai` TypeScript SDK.
- **Package Manager:** npm.
- **Database:** None in Phase 1 (stateless processing; zero persistent DB required).
- **Cloud Infrastructure:** Conventional Node.js runtime compatible with Hostinger Node.js Web App hosting, Linux VPS, Docker containers, or local developer workstations. No proprietary cloud dependencies (no Firebase, Firestore, Supabase, Cloud Functions, or serverless-only frameworks).

---

## 2. Directory Structure

```text
├── config/
│   ├── master-prompt.md            # Authoritative domain garment rules
│   └── system-assets/              # Permanent visual assets
│       ├── NaapLo Logo.png
│       └── Reference Image for MULTIPLE OUTFIT VIEW.png
├── docs/
│   ├── PRODUCT_SPEC.md             # Core purpose & anti-drift mandate
│   ├── ARCHITECTURE.md             # Technical architecture (this file)
│   └── ROADMAP.md                  # Future development phases (2 through 5)
├── server/
│   ├── routes/
│   │   └── generate.ts             # POST /api/generate & validation
│   └── services/
│       ├── imageProvider/          # AI Provider abstraction
│       │   ├── types.ts            # ImageGenerationProvider interface
│       │   ├── geminiProvider.ts   # Gemini 3.1 Flash Image implementation
│       │   └── index.ts            # Provider factory
│       ├── masterPrompt.ts         # loadMasterPrompt() abstraction
│       ├── promptAssembler.ts      # Multi-modal prompt orchestrator
│       └── systemAssets.ts         # Permanent brand and layout asset loader
├── shared/
│   ├── outputTypes.ts              # Canonical output types & metadata
│   └── types.ts                    # Shared API request/response contracts
├── src/
│   ├── components/                 # Extracted UI components
│   ├── App.tsx                     # Main catalogue production UI
│   ├── main.tsx                    # React client entry point
│   └── index.css                   # Tailwind styles
├── server.ts                       # Express full-stack server entry point
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 3. Key Architectural Design Decisions

### A. Provider Portability (`ImageGenerationProvider`)
The core image generation logic is decoupled from any specific AI provider via the `ImageGenerationProvider` interface:
```typescript
export interface ImageGenerationProvider {
  readonly name: string;
  generateImage(request: ProviderGenerateRequest): Promise<ProviderGenerateResult>;
}
```
In Phase 1, `GeminiImageProvider` implements this interface using `gemini-3.1-flash-image`. In future phases, additional providers (such as OpenRouter, OpenAI, or custom diffusion pipelines) can be added without altering UI code or route handlers.

### B. Master Prompt Abstraction (`loadMasterPrompt`)
The master prompt contains domain expertise for Indian women's fashion. In Phase 1, `loadMasterPrompt()` loads `config/master-prompt.md` from disk and returns a `MasterPromptDocument` containing `source`, `content`, and source identity metadata. In Phase 2, this function can transparently incorporate Google Drive fetching with local file fallback without impacting other application layers.

### C. Stateless Memory Processing
In Phase 1, uploaded garment reference photographs and generated images are kept in memory and passed directly through to the AI provider. No images are permanently written to server disk or database tables, ensuring high security and simple stateless scaling.

### D. Production Deployment Compatibility
The application adheres to standard production build scripts:
- `npm run build`: Compiles Vite frontend into `dist/` and bundles `server.ts` into a self-contained `dist/server.cjs` via `esbuild`.
- `npm start`: Sets `NODE_ENV=production` portably, runs `node dist/server.cjs`, and serves both the Express API and frontend static assets.

Development remains explicit through `npm run dev`.

### E. Generation API Transport

The current transport for `POST /api/generate` is JSON rather than multipart form data. Images are
sent as base64 strings in `referenceImages` and, for correction, `currentGeneratedImage`. Requests
identify the application contract as `generation-job.v1`. Responses preserve one-job/one-output
semantics and return one image as raw base64 plus a data URL convenience field. Provider-specific
request and response shapes remain confined to provider adapters.
