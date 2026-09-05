# NaapLo Catalogue Generator — Development Roadmap

## Phase 1 / CP-004: Multi-Output Production — Completed

- Select one to four output views in one run.
- Execute one provider request per view, sequentially.
- Preserve independent result, failure, retry, correction, and download controls per view.
- Generate FRONT first and use its successful output as the model/person identity reference for BACK and SIDE; original product photographs remain garment truth.
- Verified with a four-view isolated-failure browser test and real FRONT/BACK/SIDE OpenAI generations.

---

## Phase 2: Continuity, Live Prompting & Drive Assets
*Estimated Scope:*
- **Google Drive-Backed Master Prompt:** Dynamic loading of the live master prompt from a designated Google Drive document, falling back automatically to local `config/master-prompt.md`.
- **Cloud-Hosted Permanent System Assets:** Syncing `NaapLo Logo.png` and `Reference Image for MULTIPLE OUTFIT VIEW.png` from cloud storage.
- **Explicit Identity Approval:** Optional operator approval/replacement of the automatically selected FRONT identity anchor.
- **Enhanced Continuity Engine:** Stronger fabric and drape alignment beyond the CP-004 FRONT-led continuity baseline.
- **Model Quality & Tier Selector:** User selection between fast turnaround and ultra-resolution modes.
- **Stronger Validation:** Client-side image dimensions, aspect ratios, and blur detection before submission.

---

## Phase 3: Hardening & Self-Hosted Production Deployment
*Estimated Scope:*
- **Private Internet Deployment:** Hostinger Node.js Web App hosting and Hostinger VPS deployment playbooks.
- **Access Protection:** Simple password or token-based authorization for studio operators.
- **Rate Limiting & Concurrency Controls:** Safeguarding Gemini API quotas and preventing request flooding.
- **Production Observability:** Structured JSON application logging (Winston/Pino) and error telemetry.
- **Containerization:** Production Dockerfile and `docker-compose.yml` for Linux VPS hosting.

---

## Phase 4: Automation, Brand Compositing & Auto-Storage
*Estimated Scope:*
- **Exact Programmatic Logo Compositing:** Vector-sharp SVG/PNG logo overlay compositing directly into high-res renders using Sharp/Canvas.
- **Approved Image State Machine:** Operators can mark images as "Approved", "Draft", or "Archived".
- **Automatic Product ID Naming & Categorization:** Intelligent naming rules based on season, garment type, and colorway.
- **Google Drive Automation:** Automatic discovery or creation of product folders on Drive with automated direct uploads upon image approval.
- **Zip / Download All:** One-click packaging of all generated views for a product SKU.

---

## Phase 5: Enterprise Multi-User Platform (Only If Explicitly Required)
*Estimated Scope:*
- **PostgreSQL Database:** Storing persistent catalogue records, user actions, and audit logs.
- **User Accounts & Role-Based Access Control:** Differentiating between photographers, retouchers, catalogue managers, and admins.
- **Persistent Product Catalog History:** Searchable gallery of all generated and approved catalogue items.
- **Usage Quotas & Billing:** Studio budget management and model token tracking.
- **Background Worker Queues:** Celery/BullMQ job queues for asynchronous batch catalogue processing.
