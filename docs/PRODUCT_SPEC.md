# NaapLo Catalogue Generator — Product Specification

## Central Mission & Goal
> **"Generate accurate NaapLo fashion catalogue images from product reference photographs."**

NaapLo is an Indian women's fashion brand specializing in designer ethnic wear—including Salwar Kameez, Anarkalis, Kurta Sets, Shararas, Ghararas, Palazzo sets, and Unstitched Fabric ensembles. 

The primary objective of this system is to transform raw, unpolished reference photographs of physical garments into realistic, studio-quality commercial catalogue photography suitable for e-commerce, lookbooks, and fashion line sheets.

---

## The Core Anti-Drift Principle
> **"Garment intelligence belongs primarily in the master prompt. Application code orchestrates the process and must not become a competing copy of the garment rules."**

To maintain long-term flexibility, accuracy, and prevent code rot:
1. **Master Prompt Authority:** The domain rules regarding Indian ethnic garment cuts, necklines (gala), hemline borders (daman), sleeve trims, embroidery styles (Zari, Resham, Gota Patti, Chikankari, Sequins, Mirrorwork), fabric textures, and drape belong exclusively in the master prompt (`config/master-prompt.md`).
2. **Orchestration Role:** The application server acts purely as an orchestrator. It manages user input, job metadata, asset bundling, AI provider dispatching, and response handling without hardcoding competing garment rules into TypeScript business logic.

---

## Phase 1 Scope (Current Phase)

Phase 1 provides the initial production-proven vertical slice allowing catalogue managers to generate single-view catalogue images from uploaded reference photos:

1. **Job Identification:** Client enters a Product ID for operational metadata.
2. **Raw Reference Upload:** Multi-photo uploader supporting up to 10 high-resolution garment photographs (with preview and deletion).
3. **Approved Catalogue Views:** Single-selection dropdown supporting the 9 canonical output views:
   - `FRONT VIEW`: Standing 3/4 or full portrait highlighting front neckline embroidery and drape.
   - `BACK VIEW`: Rear perspective showcasing back neckline depth, tassels (latkans), and rear yoke.
   - `SIDE VIEW`: Profile perspective displaying silhouette lines, side slits (chaak), and dupatta fall.
   - `FULL VIEW`: Head-to-toe complete editorial composition including traditional footwear.
   - `MULTIPLE OUTFIT VIEW`: Unified spread showing 2–3 harmonious model angles, guided by the system composition reference.
   - `CLOSE-UP`: Macro high-definition detail shot strictly requiring a designated **Close-Up Target**.
   - `SPECIAL POSE`: Graceful traditional movement pose (twirl, dupatta hold, or greeting).
   - `DESCRIPTIVE CATALOGUE POSTER`: Editorial poster format featuring the NaapLo brand emblem.
   - `UNSTITCHED DISPLAY VIEW`: Draped or flat-lay presentation tailored for unstitched fabric cuts.
4. **Targeted Close-Up Control:** A dedicated input field for specifying the target area (e.g., "Neckline Zardozi Work", "Daman Scallop Border") required whenever CLOSE-UP is selected.
5. **Generation & Download:** Seamless generation via the official Gemini API and instant browser-side high-resolution PNG download.
6. **Iterative Correction:** User can provide precise correction feedback; the server re-submits the original references, the current generated draft, and the correction text to produce a revised catalogue image.
