import type { LeadRecord } from '../types/stepstone.ts';
import abujaHeroImg from '../assets/images/abuja_luxury_estate_hero_1794939921294.jpg';
import lagosModernImg from '../assets/images/lagos_modern_residences_1794939921771.jpg';
import modernDuplexImg from '../assets/images/nigeria_modern_duplex_1795531513749.jpg';
import terracedEstateImg from '../assets/images/nigeria_terraced_estate_1795531514061.jpg';
import highriseAptImg from '../assets/images/nigeria_highrise_apartments_1795531514953.jpg';
import courtyardResidenceImg from '../assets/images/nigeria_courtyard_residence_1795531514772.jpg';
import commercialPlazaImg from '../assets/images/nigeria_commercial_plaza_1795531514673.jpg';

export type MockupLayoutId =
  | 'editorial_split'
  | 'full_bleed_hero'
  | 'minimal_framed'
  | 'search_grid_portal'
  | 'executive_sidebar';

export interface MockupPalette {
  id: string;
  label: string;
  // Tailwind classes for live React rendering
  surfaceClass: string;
  headerBgClass: string;
  bandBgClass: string;
  accentBgClass: string;
  accentTextClass: string;
  softAccentTextClass: string;
  btnPrimaryClass: string;
  btnSecondaryClass: string;
  borderClass: string;
  inkClass: string;
  mutedInkClass: string;
  // Matching Hex values for Canvas 2D PNG export
  surfaceHex: string;
  headerBgHex: string;
  bandBgHex: string;
  primaryHex: string;
  accentHex: string;
  softAccentHex: string;
  inkHex: string;
  mutedInkHex: string;
  borderHex: string;
}

export interface MockupPreset {
  id: string;
  layout: MockupLayoutId;
  layoutLabel: string;
  palette: MockupPalette;
  heroImg: string;
  secondaryImg: string;
  tertiaryImg: string;
}

export interface MockupCopy {
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta: string;
  cardOneTitle: string;
  cardOneDesc: string;
  cardTwoTitle: string;
  cardTwoDesc: string;
  cardThreeTitle: string;
  cardThreeDesc: string;
  mobileHeadline: string;
}

export const PROPERTY_PHOTOS = [
  modernDuplexImg,
  terracedEstateImg,
  highriseAptImg,
  courtyardResidenceImg,
  commercialPlazaImg,
  abujaHeroImg,
  lagosModernImg,
] as const;

export const PALETTES: Record<string, MockupPalette> = {
  forest_ivory: {
    id: 'forest_ivory',
    label: 'Forest & Ivory',
    surfaceClass: 'bg-stone-50',
    headerBgClass: 'bg-white',
    bandBgClass: 'bg-emerald-950',
    accentBgClass: 'bg-emerald-800',
    accentTextClass: 'text-emerald-800',
    softAccentTextClass: 'text-emerald-300',
    btnPrimaryClass: 'bg-emerald-800 text-white',
    btnSecondaryClass: 'border border-emerald-800/30 bg-white text-emerald-900',
    borderClass: 'border-stone-200',
    inkClass: 'text-slate-900',
    mutedInkClass: 'text-slate-600',
    surfaceHex: '#fafaf9',
    headerBgHex: '#ffffff',
    bandBgHex: '#022c22',
    primaryHex: '#065f46',
    accentHex: '#047857',
    softAccentHex: '#6ee7b7',
    inkHex: '#0f172a',
    mutedInkHex: '#475569',
    borderHex: '#e7e5e4',
  },
  navy_gold: {
    id: 'navy_gold',
    label: 'Midnight Navy & Gold',
    surfaceClass: 'bg-slate-50',
    headerBgClass: 'bg-slate-950',
    bandBgClass: 'bg-slate-900',
    accentBgClass: 'bg-amber-700',
    accentTextClass: 'text-amber-700',
    softAccentTextClass: 'text-amber-300',
    btnPrimaryClass: 'bg-amber-600 text-white',
    btnSecondaryClass: 'border border-slate-300 bg-white text-slate-900',
    borderClass: 'border-slate-200',
    inkClass: 'text-slate-900',
    mutedInkClass: 'text-slate-600',
    surfaceHex: '#f8fafc',
    headerBgHex: '#020617',
    bandBgHex: '#0f172a',
    primaryHex: '#0f172a',
    accentHex: '#b45309',
    softAccentHex: '#fcd34d',
    inkHex: '#0f172a',
    mutedInkHex: '#475569',
    borderHex: '#e2e8f0',
  },
  charcoal_terracotta: {
    id: 'charcoal_terracotta',
    label: 'Charcoal & Terracotta',
    surfaceClass: 'bg-orange-50/40',
    headerBgClass: 'bg-white',
    bandBgClass: 'bg-zinc-900',
    accentBgClass: 'bg-orange-800',
    accentTextClass: 'text-orange-800',
    softAccentTextClass: 'text-orange-300',
    btnPrimaryClass: 'bg-orange-800 text-white',
    btnSecondaryClass: 'border border-zinc-300 bg-white text-zinc-900',
    borderClass: 'border-stone-200',
    inkClass: 'text-zinc-900',
    mutedInkClass: 'text-zinc-600',
    surfaceHex: '#fffaf5',
    headerBgHex: '#ffffff',
    bandBgHex: '#18181b',
    primaryHex: '#9a3412',
    accentHex: '#c2410c',
    softAccentHex: '#fdba74',
    inkHex: '#18181b',
    mutedInkHex: '#52525b',
    borderHex: '#e7e5e4',
  },
  slate_cobalt: {
    id: 'slate_cobalt',
    label: 'Slate & Royal Cobalt',
    surfaceClass: 'bg-slate-50',
    headerBgClass: 'bg-white',
    bandBgClass: 'bg-slate-900',
    accentBgClass: 'bg-blue-700',
    accentTextClass: 'text-blue-700',
    softAccentTextClass: 'text-sky-300',
    btnPrimaryClass: 'bg-blue-700 text-white',
    btnSecondaryClass: 'border border-slate-300 bg-white text-slate-800',
    borderClass: 'border-slate-200',
    inkClass: 'text-slate-900',
    mutedInkClass: 'text-slate-600',
    surfaceHex: '#f8fafc',
    headerBgHex: '#ffffff',
    bandBgHex: '#0f172a',
    primaryHex: '#1d4ed8',
    accentHex: '#1e40af',
    softAccentHex: '#7dd3fc',
    inkHex: '#0f172a',
    mutedInkHex: '#475569',
    borderHex: '#e2e8f0',
  },
  olive_stone: {
    id: 'olive_stone',
    label: 'Warm Stone & Olive',
    surfaceClass: 'bg-stone-100/70',
    headerBgClass: 'bg-stone-50',
    bandBgClass: 'bg-stone-900',
    accentBgClass: 'bg-lime-900',
    accentTextClass: 'text-lime-900',
    softAccentTextClass: 'text-lime-300',
    btnPrimaryClass: 'bg-lime-900 text-white',
    btnSecondaryClass: 'border border-stone-300 bg-white text-stone-900',
    borderClass: 'border-stone-200',
    inkClass: 'text-stone-900',
    mutedInkClass: 'text-stone-600',
    surfaceHex: '#f5f5f4',
    headerBgHex: '#fafaf9',
    bandBgHex: '#1c1917',
    primaryHex: '#365314',
    accentHex: '#3f6212',
    softAccentHex: '#bef264',
    inkHex: '#1c1917',
    mutedInkHex: '#57534e',
    borderHex: '#e7e5e4',
  },
};

const LAYOUT_LABELS: Record<MockupLayoutId, string> = {
  editorial_split: 'Editorial Split',
  full_bleed_hero: 'Full-Bleed Showcase',
  minimal_framed: 'Minimal Framed',
  search_grid_portal: 'Property Portal Grid',
  executive_sidebar: 'Executive Sidebar',
};

const PRESET_SPECS: Array<{
  id: string;
  layout: MockupLayoutId;
  paletteKey: keyof typeof PALETTES;
  heroIdx: number;
  secIdx: number;
  terIdx: number;
}> = [
  { id: 'v1', layout: 'editorial_split', paletteKey: 'navy_gold', heroIdx: 0, secIdx: 1, terIdx: 3 },
  { id: 'v2', layout: 'full_bleed_hero', paletteKey: 'charcoal_terracotta', heroIdx: 1, secIdx: 3, terIdx: 4 },
  { id: 'v3', layout: 'minimal_framed', paletteKey: 'forest_ivory', heroIdx: 2, secIdx: 0, terIdx: 5 },
  { id: 'v4', layout: 'search_grid_portal', paletteKey: 'slate_cobalt', heroIdx: 3, secIdx: 2, terIdx: 1 },
  { id: 'v5', layout: 'executive_sidebar', paletteKey: 'olive_stone', heroIdx: 4, secIdx: 6, terIdx: 0 },
  { id: 'v6', layout: 'editorial_split', paletteKey: 'charcoal_terracotta', heroIdx: 5, secIdx: 2, terIdx: 4 },
  { id: 'v7', layout: 'full_bleed_hero', paletteKey: 'slate_cobalt', heroIdx: 6, secIdx: 0, terIdx: 2 },
  { id: 'v8', layout: 'minimal_framed', paletteKey: 'navy_gold', heroIdx: 3, secIdx: 4, terIdx: 1 },
  { id: 'v9', layout: 'search_grid_portal', paletteKey: 'forest_ivory', heroIdx: 1, secIdx: 5, terIdx: 6 },
  { id: 'v10', layout: 'executive_sidebar', paletteKey: 'navy_gold', heroIdx: 2, secIdx: 3, terIdx: 0 },
  { id: 'v11', layout: 'editorial_split', paletteKey: 'olive_stone', heroIdx: 4, secIdx: 1, terIdx: 5 },
  { id: 'v12', layout: 'full_bleed_hero', paletteKey: 'forest_ivory', heroIdx: 0, secIdx: 6, terIdx: 3 },
  { id: 'v13', layout: 'minimal_framed', paletteKey: 'charcoal_terracotta', heroIdx: 6, secIdx: 1, terIdx: 2 },
  { id: 'v14', layout: 'search_grid_portal', paletteKey: 'olive_stone', heroIdx: 5, secIdx: 0, terIdx: 4 },
  { id: 'v15', layout: 'executive_sidebar', paletteKey: 'slate_cobalt', heroIdx: 1, secIdx: 4, terIdx: 3 },
];

export const MOCKUP_PRESETS: MockupPreset[] = PRESET_SPECS.map((spec) => ({
  id: spec.id,
  layout: spec.layout,
  layoutLabel: LAYOUT_LABELS[spec.layout],
  palette: PALETTES[spec.paletteKey],
  heroImg: PROPERTY_PHOTOS[spec.heroIdx],
  secondaryImg: PROPERTY_PHOTOS[spec.secIdx],
  tertiaryImg: PROPERTY_PHOTOS[spec.terIdx],
}));

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function resolveMockupPreset(lead: LeadRecord): MockupPreset {
  if (lead.mockup_variant_id) {
    const matched = MOCKUP_PRESETS.find((p) => p.id === lead.mockup_variant_id);
    if (matched) return matched;
  }
  const idx =
    hashString(`${lead.id}:${lead.business_name}:${lead.state}`) % MOCKUP_PRESETS.length;
  return MOCKUP_PRESETS[idx];
}

export function getNextMockupPresetId(currentId: string): string {
  const idx = MOCKUP_PRESETS.findIndex((p) => p.id === currentId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % MOCKUP_PRESETS.length;
  return MOCKUP_PRESETS[nextIdx].id;
}

export function getDomainTailoredCopy(
  lead: LeadRecord,
  layout: MockupLayoutId
): MockupCopy {
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  const catLower = lead.business_category.toLowerCase();

  const isDeveloper = /developer|development|construction|estate/i.test(catLower);
  const isManagement = /management|facility/i.test(catLower);

  if (isDeveloper) {
    return {
      eyebrow: `${lead.business_category} · ${locationLabel}`,
      headline:
        layout === 'minimal_framed'
          ? `Thoughtful Residential Estates Built for ${locationLabel}`
          : `Contemporary Homes & Planned Estates in ${locationLabel}`,
      subheadline: `Explore active residential developments, architectural floor plans, and direct site inspection scheduling with ${lead.business_name}.`,
      primaryCta: 'Explore Estates',
      secondaryCta: 'Book Site Inspection',
      cardOneTitle: 'Residential Estate Portfolio',
      cardOneDesc: `Modern duplexes & terraced developments across ${lead.state}.`,
      cardTwoTitle: 'Plot & Unit Availability',
      cardTwoDesc: 'Clear layout specs, documentation guides & payment options.',
      cardThreeTitle: 'Direct Developer Desk',
      cardThreeDesc: `Schedule private site visits in ${locationLabel} via WhatsApp.`,
      mobileHeadline: `Planned Estates & Homes in ${lead.state}`,
    };
  }

  if (isManagement) {
    return {
      eyebrow: `${lead.business_category} · ${locationLabel}`,
      headline: `Trusted Property Stewardship & Leasing in ${locationLabel}`,
      subheadline: `A structured digital home for ${lead.business_name} — connecting property owners, corporate tenants, and buyers directly.`,
      primaryCta: 'View Managed Portfolio',
      secondaryCta: 'Contact Advisory Team',
      cardOneTitle: 'Residential & Commercial Leasing',
      cardOneDesc: `Curated spaces across key districts in ${locationLabel}.`,
      cardTwoTitle: 'Facility & Asset Oversight',
      cardTwoDesc: 'Transparent maintenance coordination and landlord reporting.',
      cardThreeTitle: 'Direct Tenant & Owner Support',
      cardThreeDesc: `Reach ${lead.business_name} immediately via WhatsApp or inquiry form.`,
      mobileHeadline: `Property Management in ${lead.state}`,
    };
  }

  return {
    eyebrow: `${lead.business_category} · ${locationLabel}`,
    headline:
      layout === 'search_grid_portal'
        ? `Find Verified Properties Across ${locationLabel}`
        : `Verified Real Estate Opportunities in ${locationLabel}`,
    subheadline: `${lead.business_name} gives serious buyers one clear destination to browse listings, verify office details, and book viewings on WhatsApp.`,
    primaryCta: 'Browse Listings',
    secondaryCta: 'Schedule Viewing',
    cardOneTitle: 'Featured Residential Homes',
    cardOneDesc: `Detached duplexes, apartments & family homes in ${locationLabel}.`,
    cardTwoTitle: 'Commercial & Investment Assets',
    cardTwoDesc: 'Strategically located commercial plazas and verified plots.',
    cardThreeTitle: 'Direct WhatsApp Advisory',
    cardThreeDesc: `Connect directly with ${lead.business_name} for private viewings.`,
    mobileHeadline: `Trusted Real Estate in ${lead.state}`,
  };
}
