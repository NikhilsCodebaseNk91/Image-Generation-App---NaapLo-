export const OUTPUT_TYPES = [
  'FRONT VIEW',
  'BACK VIEW',
  'SIDE VIEW',
  'FULL VIEW',
  'MULTIPLE OUTFIT VIEW',
  'CLOSE-UP',
  'SPECIAL POSE',
  'DESCRIPTIVE CATALOGUE POSTER',
  'UNSTITCHED DISPLAY VIEW',
] as const;

export type OutputType = typeof OUTPUT_TYPES[number];

export interface OutputTypeMeta {
  type: OutputType;
  label: string;
  description: string;
  requiresCloseUpTarget?: boolean;
  usesMultipleOutfitLayoutRef?: boolean;
  usesBrandingLogo?: boolean;
}

export const OUTPUT_TYPE_CONFIGS: Record<OutputType, OutputTypeMeta> = {
  'FRONT VIEW': {
    type: 'FRONT VIEW',
    label: 'Front View',
    description: 'Direct frontal 3/4 or full standing catalogue shot highlighting neckline, silhouette, and front drape.',
  },
  'BACK VIEW': {
    type: 'BACK VIEW',
    label: 'Back View',
    description: 'Rear perspective highlighting back neckline depth, tassels, back yoke, and rear silhouette.',
  },
  'SIDE VIEW': {
    type: 'SIDE VIEW',
    label: 'Side View',
    description: 'Profile 70-degree catalogue perspective showing silhouette line, side chaak slits, and dupatta fall.',
  },
  'FULL VIEW': {
    type: 'FULL VIEW',
    label: 'Full View',
    description: 'Complete head-to-toe editorial portrait showing the entire ensemble, bottom flare, and traditional footwear.',
  },
  'MULTIPLE OUTFIT VIEW': {
    type: 'MULTIPLE OUTFIT VIEW',
    label: 'Multiple Outfit View',
    description: 'Multi-model lookbook composition showing 2-3 harmonious angles (front, 3/4, and back) in one unified frame.',
    usesMultipleOutfitLayoutRef: true,
  },
  'CLOSE-UP': {
    type: 'CLOSE-UP',
    label: 'Close-up',
    description: 'High-definition macro detail shot of a specific embroidery, neckline, border lace, or fabric weave.',
    requiresCloseUpTarget: true,
  },
  'SPECIAL POSE': {
    type: 'SPECIAL POSE',
    label: 'Special Pose',
    description: 'Graceful traditional movement pose (twirl, dupatta hold, or greeting) demonstrating fabric flow and drape.',
  },
  'DESCRIPTIVE CATALOGUE POSTER': {
    type: 'DESCRIPTIVE CATALOGUE POSTER',
    label: 'Descriptive Catalogue Poster',
    description: 'Editorial lookbook poster format combining main garment portrait with refined NaapLo branding accents.',
    usesBrandingLogo: true,
  },
  'UNSTITCHED DISPLAY VIEW': {
    type: 'UNSTITCHED DISPLAY VIEW',
    label: 'Unstitched Display View',
    description: 'Curated flat-lay or draped display for unstitched fabric pieces (Kurta panel, bottom fabric, and folded dupatta).',
  },
};

export const COMMON_CLOSE_UP_PRESETS = [
  'Neckline & Yoke Embroidery',
  'Daman / Hem Border & Lace',
  'Sleeve Cuff Detailing',
  'Dupatta Pallu & Border Weave',
  'Fabric Weave & Texture',
  'Back Neckline & Latkan Tassels',
];
