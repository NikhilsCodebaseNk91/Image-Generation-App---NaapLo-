import type { ProviderGenerateRequest } from './imageProvider/types.ts';
import { OUTPUT_TYPE_CONFIGS } from '../../shared/outputTypes.ts';

export interface AssembledPromptPayload {
  directiveText: string;
}

/**
 * Assembles the application-level instructions without duplicating garment domain rules.
 * The garment rules are provided in the masterPrompt. This orchestrator combines the master prompt,
 * the specific output request, close-up targets, correction instructions, and role assignments for attached images.
 */
export function assemblePrompt(request: ProviderGenerateRequest): AssembledPromptPayload {
  const {
    outputType,
    closeUpTarget,
    correction,
    currentGeneratedImage,
    identityReference,
    masterPrompt,
    productId,
  } = request;

  const typeConfig = OUTPUT_TYPE_CONFIGS[outputType];
  const isCorrection = Boolean(correction && currentGeneratedImage);
  const hasIdentityReference = Boolean(identityReference);

  const sections: string[] = [];

  // 1. Master Prompt inclusion (domain-specific garment rules)
  sections.push(masterPrompt);

  // 2. Production Job Header
  sections.push(`
==================================================
CURRENT PRODUCTION JOB EXECUTION
==================================================
- Product ID: ${productId || 'Unspecified'}
- Requested Output Type: ${outputType} (${typeConfig?.label || outputType})
- Execution Mode: ${isCorrection ? 'IMAGE REVISION & CORRECTION' : 'INITIAL CATALOGUE GENERATION'}
`);

  // 3. Output Type Directives
  sections.push(`
==================================================
OUTPUT SPECIFIC DIRECTIVE: ${outputType}
==================================================
Generate exactly ONE photorealistic catalogue image adhering to the framing and styling defined for "${outputType}":
${typeConfig?.description || ''}
`);

  // 4. Close-Up Target Directive
  if (outputType === 'CLOSE-UP') {
    sections.push(`
CRITICAL CLOSE-UP TARGET: "${closeUpTarget || 'Garment Craftsmanship Detail'}"
- Frame this shot as a macro high-definition detail portrait strictly centered on: "${closeUpTarget}".
- Reveal the fine fabric weave, metallic thread lustre (zari/resham), bead/sequin relief, and artisan stitch precision.
- Do not pull back to a wide shot. Maintain a dedicated close-up focus on the target area.
`);
  }

  // 5. System Asset Composition Guidelines
  if (outputType === 'MULTIPLE OUTFIT VIEW') {
    sections.push(`
COMPOSITION LAYOUT GUIDELINE:
- An approved NaapLo composition layout reference has been attached as an image input.
- Use this image solely as a structural guide for arranging multiple model poses (e.g. front, side 3/4, back) in a single unified catalogue spread.
- IMPORTANT: DO NOT copy the garment from the composition layout reference. The garment MUST come strictly from the uploaded Garment Reference Images.
`);
  }

  if (outputType === 'DESCRIPTIVE CATALOGUE POSTER') {
    sections.push(`
BRANDING & CATALOGUE POSTER GUIDELINE:
- The approved NaapLo brand emblem has been attached as an image input.
- Present this catalogue image as a high-end luxury editorial lookbook poster.
- Seamlessly incorporate clean, elegant placement of the NaapLo brand identity in an upper corner or understated lower footer position.
`);
  }

  // 6. Correction Instruction
  if (isCorrection) {
    sections.push(`
==================================================
REVISION & CORRECTION DIRECTIVE
==================================================
A previous generated catalogue image has been provided alongside the original garment reference images.
The client has reviewed the previous image and submitted this specific correction request:

CLIENT CORRECTION: "${correction}"

INSTRUCTIONS FOR CORRECTION:
1. Examine the client's correction carefully.
2. Compare the previous generated image against the original Garment Reference Images.
3. Apply the client's requested modification with precision (e.g. adjust silhouette, drape, neckline depth, posture, sleeve finish, or framing).
4. Retain all other accurate elements of the garment design, colors, embroidery motifs, and studio atmosphere.
`);
  }

  if (hasIdentityReference) {
    sections.push(`
==================================================
IDENTITY CONTINUITY DIRECTIVE
==================================================
A successful FRONT catalogue output is attached as the IDENTITY REFERENCE.
- Preserve the same adult model identity, face, hair, skin tone, proportions, and overall styling in this requested view.
- Use it only for person and presentation continuity; do not copy garment construction from it.
- The original GARMENT REFERENCE IMAGES remain the absolute truth for garment colors, cut, embroidery, fabric, and details.
`);
  }

  // 7. Input Roles Summary
  sections.push(`
==================================================
MULTIMODAL INPUTS SUMMARY
==================================================
- The first set of attached images are the GARMENT REFERENCE IMAGES. These are the absolute physical ground truth for all colors, embroidery, silhouette, cuts, and fabrics.
${isCorrection ? '- One of the attached images is the CURRENT GENERATED DRAFT, which must be corrected according to the instruction above.' : ''}
${hasIdentityReference ? '- One of the attached images is the FRONT IDENTITY REFERENCE. It controls model/person continuity only; it is not garment-truth authority.' : ''}
${outputType === 'MULTIPLE OUTFIT VIEW' ? '- One of the attached images is the SYSTEM COMPOSITION LAYOUT REFERENCE for pose arrangement.' : ''}
${outputType === 'DESCRIPTIVE CATALOGUE POSTER' ? '- One of the attached images is the NAAPLO LOGO for brand placement.' : ''}

CRITICAL: Return exactly ONE studio-grade, photorealistic portrait image that faithfully reflects the garment in the reference photographs.
`);

  return {
    directiveText: sections.join('\n\n'),
  };
}
