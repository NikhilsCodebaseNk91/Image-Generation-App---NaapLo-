import type { ProviderGenerateRequest } from './imageProvider/types.ts';
import { OUTPUT_TYPE_CONFIGS } from '../../shared/outputTypes.ts';

export interface AssembledPromptPayload {
  directiveText: string;
}

const BASE_MASTER_SECTIONS = ['1', '2', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const VIEW_SUBSECTIONS: Partial<Record<ProviderGenerateRequest['outputType'], { blouse: string; other: string[] }>> = {
  'FRONT VIEW': { blouse: '13.1', other: ['14.1', '14.5'] },
  'BACK VIEW': { blouse: '13.2', other: ['14.2', '14.5'] },
  'SIDE VIEW': { blouse: '13.3', other: ['14.3', '14.5'] },
  'FULL VIEW': { blouse: '13.4', other: ['14.4', '14.5'] },
  'MULTIPLE OUTFIT VIEW': { blouse: '13.5', other: ['14.5', '14.6'] },
};

function splitByHeading(document: string, level: 2 | 3): Map<string, string> {
  const marker = '#'.repeat(level);
  const pattern = new RegExp(`^${marker}\\s+(\\d+(?:\\.\\d+)?)\\.?.*$`, 'gm');
  const matches = [...document.matchAll(pattern)];
  const sections = new Map<string, string>();

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? document.length;
    sections.set(match[1], document.slice(start, end).trim());
  });

  return sections;
}

/**
 * The Image API accepts at most 32,000 prompt characters. The approved control
 * document is larger because it contains rules for every output type. Compile it
 * by selecting its unchanged global rules and only the view-specific sections
 * needed for the current job; no garment rule is rewritten or duplicated here.
 */
export function compileMasterPromptForOutput(
  masterPrompt: string,
  outputType: ProviderGenerateRequest['outputType']
): string {
  const h2Sections = splitByHeading(masterPrompt, 2);
  const selected: string[] = [];
  const preambleEnd = masterPrompt.search(/^##\s+/m);
  if (preambleEnd > 0) selected.push(masterPrompt.slice(0, preambleEnd).trim());

  for (const sectionNumber of BASE_MASTER_SECTIONS) {
    const section = h2Sections.get(sectionNumber);
    if (section) selected.push(section);
  }

  const viewSections = VIEW_SUBSECTIONS[outputType];
  if (viewSections) {
    const blouseRules = h2Sections.get('13');
    const otherRules = h2Sections.get('14');
    const blouseSubsections = blouseRules ? splitByHeading(blouseRules, 3) : new Map<string, string>();
    const otherSubsections = otherRules ? splitByHeading(otherRules, 3) : new Map<string, string>();

    const selectedBlouse = blouseSubsections.get(viewSections.blouse);
    if (selectedBlouse) selected.push('## 13. BLOUSE VIEW RULES\n\n' + selectedBlouse);

    const selectedOther = viewSections.other
      .map((number) => otherSubsections.get(number))
      .filter((section): section is string => Boolean(section));
    if (selectedOther.length > 0) {
      selected.push('## 14. SINGLE-KURTA AND OTHER NON-BLOUSE VIEW RULES\n\n' + selectedOther.join('\n\n'));
    }
  }

  const specializedSections: Partial<Record<ProviderGenerateRequest['outputType'], string[]>> = {
    'UNSTITCHED DISPLAY VIEW': ['15'],
    'CLOSE-UP': ['16'],
    'SPECIAL POSE': ['17', '18'],
    'DESCRIPTIVE CATALOGUE POSTER': ['19'],
  };
  for (const sectionNumber of specializedSections[outputType] ?? []) {
    const section = h2Sections.get(sectionNumber);
    if (section) selected.push(section);
  }

  for (const sectionNumber of ['20', '21']) {
    const section = h2Sections.get(sectionNumber);
    if (section) selected.push(section);
  }

  return selected.join('\n\n').trim();
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
    additionalInstructions,
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
  sections.push(compileMasterPromptForOutput(masterPrompt, outputType));

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

  if (additionalInstructions) {
    sections.push(`
==================================================
OPERATOR-SPECIFIC DIRECTION
==================================================
${additionalInstructions}

Apply this direction only where it does not conflict with garment fidelity, safety, output-view framing, or other authoritative master-prompt rules.
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
