import type { HttpInspectionReport } from './inspector.ts';
import { normalizeUrlInput } from './inspector.ts';
import type { RawDiscoveredCompany } from './gemini.ts';
import {
  extractAlternateEntityNames,
  extractEmailHintsFromHtml,
  extractTextDomainsFromSnippet,
} from './domainProbe.ts';
import { ALL_STATES_OPTION, NIGERIAN_STATES, type WebsiteClassification } from '../src/types/stepstone.ts';

const FINELIB_BASE = 'https://www.finelib.com';

const STATE_CATEGORY_SLUGS: Record<string, string[]> = {
  'FCT (Abuja)': [
    '/cities/abuja/business/real-estate/real-estate-developers',
    '/cities/abuja/business/real-estate/real-estate-agents',
    '/cities/abuja/business/real-estate',
  ],
  Lagos: [
    '/cities/lagos/business/real-estate/real-estate-developers',
    '/cities/lagos/business/real-estate/real-estate-agents',
    '/cities/lagos/business/real-estate',
  ],
  Rivers: [
    '/cities/port-harcourt/business/real-estate/real-estate-developers',
    '/cities/port-harcourt/business/real-estate',
  ],
  Oyo: [
    '/cities/ibadan/business/real-estate/real-estate-developers',
    '/cities/ibadan/business/real-estate',
  ],
  Kano: ['/cities/kano/business/real-estate'],
  Enugu: ['/cities/enugu/business/real-estate'],
  Anambra: ['/cities/awka/business/real-estate'],
  Edo: ['/cities/benin-city/business/real-estate'],
  Delta: ['/cities/asaba/business/real-estate'],
  Ogun: ['/cities/abeokuta/business/real-estate'],
  Kaduna: ['/cities/kaduna/business/real-estate'],
};

const STATE_MATCH_ALIASES: Record<string, string[]> = {
  'FCT (Abuja)': ['abuja', 'fct', 'federal capital'],
  Rivers: ['rivers', 'port harcourt', 'port-harcourt', 'portharcourt'],
  Oyo: ['oyo', 'ibadan'],
  Lagos: ['lagos', 'ikeja', 'lekki', 'victoria island', 'ikoyi', 'ajah', 'surulere', 'yaba'],
  Ogun: ['ogun', 'abeokuta', 'sagamu', 'ota'],
  Anambra: ['anambra', 'awka', 'onitsha', 'nnewi'],
  Delta: ['delta', 'asaba', 'warri'],
  Edo: ['edo', 'benin'],
  Abia: ['abia', 'umuahia', 'aba'],
  'Akwa Ibom': ['akwa ibom', 'uyo', 'eket'],
  'Cross River': ['cross river', 'calabar'],
  Plateau: ['plateau', 'jos'],
  Kwara: ['kwara', 'ilorin'],
  Osun: ['osun', 'osogbo', 'oshogbo', 'ife'],
  Ondo: ['ondo', 'akure'],
  Ekiti: ['ekiti', 'ado ekiti', 'ado-ekiti'],
  Imo: ['imo', 'owerri'],
  Enugu: ['enugu', 'nsukka'],
  Ebonyi: ['ebonyi', 'abakaliki'],
  Bayelsa: ['bayelsa', 'yenagoa'],
  Benue: ['benue', 'makurdi'],
  Kogi: ['kogi', 'lokoja'],
  Nasarawa: ['nasarawa', 'lafia', 'keffi', 'karu'],
  Niger: ['niger', 'minna', 'suleja'],
  Kaduna: ['kaduna', 'zaria'],
  Kano: ['kano'],
  Katsina: ['katsina'],
  Sokoto: ['sokoto'],
  Bauchi: ['bauchi'],
  Borno: ['borno', 'maiduguri'],
  Adamawa: ['adamawa', 'yola'],
  Taraba: ['taraba', 'jalingo'],
  Gombe: ['gombe'],
  Jigawa: ['jigawa', 'dutse'],
  Kebbi: ['kebbi', 'birnin kebbi'],
  Yobe: ['yobe', 'damaturu'],
  Zamfara: ['zamfara', 'gusau'],
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

async function fetchDirectoryHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-NG,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractListingUrlsFromHtml(html: string): string[] {
  // Prefer main list links before "Similar Listings" if present, or capture all unique listing URLs cleanly
  const mainSection = html.split(/class="red-headings">Similar Listings/i)[0] ?? html;
  const matches = mainSection.matchAll(
    /href="(https?:\/\/www\.finelib\.com\/listing\/[^"]+|\/listing\/[^"]+)"/gi
  );
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const raw = m[1];
    if (!raw || raw.includes('edit_listing') || raw.includes('review.php')) continue;
    const normalized = raw.startsWith('http') ? raw : `${FINELIB_BASE}${raw}`;
    const clean = normalized.split('#')[0].split('?')[0];
    if (!seen.has(clean)) {
      seen.add(clean);
      urls.push(clean);
    }
  }
  return urls;
}

function isSocialHostname(urlStr: string): 'instagram' | 'facebook' | 'other_social' | null {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (/(^|\.)instagram\.com$/i.test(host)) return 'instagram';
    if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/i.test(host)) return 'facebook';
    if (
      /(^|\.)wa\.me$|(^|\.)whatsapp\.com$|(^|\.)linktr\.ee$|(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)linkedin\.com$/i.test(
        host
      )
    ) {
      return 'other_social';
    }
    return null;
  } catch {
    return null;
  }
}

function matchesSelectedState(selectedState: string, regionText: string): boolean {
  if (selectedState === ALL_STATES_OPTION) return true;
  const lower = regionText.toLowerCase();
  const aliases = STATE_MATCH_ALIASES[selectedState] ?? [
    selectedState.toLowerCase().replace(/\s*state$/i, ''),
  ];
  return aliases.some((alias) => lower.includes(alias));
}

function resolveActualNigerianState(regionText: string): string {
  const lower = regionText.toLowerCase();
  for (const st of NIGERIAN_STATES) {
    const aliases = STATE_MATCH_ALIASES[st] ?? [st.toLowerCase()];
    if (aliases.some((a) => lower.includes(a))) {
      return st;
    }
  }
  return 'Lagos';
}

function parseFinelibListingPage(
  html: string,
  listingUrl: string,
  selectedState: string
): RawDiscoveredCompany | null {
  const mainBody = html.split(/class="red-headings">Reviews/i)[0] ?? html;

  const nameMatch =
    mainBody.match(/<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i) ??
    mainBody.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const businessName = nameMatch ? stripTags(nameMatch[1]) : '';
  if (!businessName || businessName.length < 2) return null;

  const breadcrumbMatch = html.match(/<div class="breadcrumb">([\s\S]*?)<\/div>/i);
  const breadcrumbText = breadcrumbMatch ? stripTags(breadcrumbMatch[1]) : '';

  const localityMatch = mainBody.match(
    /<span[^>]+itemprop=["']addressLocality["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const regionMatch = mainBody.match(
    /<span[^>]+itemprop=["']addressRegion["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const streetMatch = mainBody.match(
    /<span[^>]+itemprop=["']streetAddress["'][^>]*>([\s\S]*?)<\/span>/i
  );

  const city = localityMatch ? stripTags(localityMatch[1]) : '';
  const region = regionMatch ? stripTags(regionMatch[1]) : '';
  const street = streetMatch ? stripTags(streetMatch[1]) : '';
  const combinedLocation = `${street} ${city} ${region} ${breadcrumbText}`;

  if (!matchesSelectedState(selectedState, combinedLocation)) {
    return null;
  }

  const resolvedState =
    selectedState === ALL_STATES_OPTION
      ? resolveActualNigerianState(combinedLocation)
      : selectedState;

  const phoneMatch =
    mainBody.match(/<span[^>]+itemprop=["']telephone["'][^>]*>([\s\S]*?)<\/span>/i) ??
    mainBody.match(/href="tel:([^"]+)"/i);
  const phone = phoneMatch ? stripTags(phoneMatch[1]).replace(/\s+/g, ' ').trim() || null : null;

  // Website / URL slot on Finelib listing page
  const urlDivMatch = mainBody.match(
    /<div[^>]+class=["'][^"']*cmpny-lstng url[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  let websiteUrl: string | null = null;
  let instagramUrl: string | null = null;
  let facebookUrl: string | null = null;

  if (urlDivMatch) {
    const hrefMatch = urlDivMatch[1].match(/href=["']([^"']+)["']/i);
    const rawHref = hrefMatch ? decodeHtmlEntities(hrefMatch[1]) : '';
    const normalized = rawHref ? normalizeUrlInput(rawHref) : null;
    if (normalized && !/finelib\.com/i.test(normalized)) {
      const socialKind = isSocialHostname(normalized);
      if (socialKind === 'instagram') {
        instagramUrl = normalized;
      } else if (socialKind === 'facebook') {
        facebookUrl = normalized;
      } else if (!socialKind) {
        websiteUrl = normalized;
      }
    }
  }

  // Also check if Instagram or Facebook links appear inside business info / description
  const descMatch = mainBody.match(
    /<span[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const description = descMatch ? stripTags(descMatch[1]) : '';

  const emailSectionMatch = mainBody.match(/E-mail Contact[\s\S]{0,600}/i);
  const emailHints = extractEmailHintsFromHtml(emailSectionMatch ? emailSectionMatch[0] : mainBody);
  const textDomainHints = extractTextDomainsFromSnippet(
    `${description} ${street} ${stripTags(urlDivMatch?.[1] ?? '')}`
  );

  if (!instagramUrl) {
    const igMatch = mainBody.match(
      /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|share\b)([A-Za-z0-9_.-]+)\/?/i
    );
    if (igMatch) instagramUrl = igMatch[0];
  }
  if (!facebookUrl) {
    const fbMatch = mainBody.match(
      /https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/(?!sharer|share\.php|tr\b|plugins\b|finelib)([A-Za-z0-9_.-]+)\/?/i
    );
    if (fbMatch && !/finelib/i.test(fbMatch[0])) facebookUrl = fbMatch[0];
  }

  // Determine clean business category from breadcrumb or description
  let businessCategory = 'Real Estate Company';
  const combinedCatText = `${breadcrumbText} ${description} ${businessName}`.toLowerCase();
  if (/developer|development|homes|estates|housing|construction/i.test(combinedCatText)) {
    businessCategory = 'Property Developer';
  } else if (/management|facility|properties|realty/i.test(combinedCatText)) {
    businessCategory = 'Real Estate & Property Management';
  } else if (/real estate agent|realtor|broker/i.test(combinedCatText)) {
    businessCategory = 'Real Estate Agency';
  }

  return {
    business_name: businessName,
    business_category: businessCategory,
    state: resolvedState,
    city: city || (region && !region.toLowerCase().includes(resolvedState.toLowerCase()) ? region : ''),
    phone,
    website_url: websiteUrl,
    instagram_url: instagramUrl,
    facebook_url: facebookUrl,
    google_business_profile_url: null,
    source_urls: [listingUrl],
    discovery_notes: `Verified via Finelib Nigerian Business Directory${street ? ` (${street}${city ? `, ${city}` : ''})` : ''}.`,
    corporate_email_domains: emailHints.corporateEmailDomains,
    brand_email_handles: emailHints.brandEmailHandles,
    text_domain_hints: textDomainHints,
    alternate_names: extractAlternateEntityNames(description),
  };
}

export async function discoverFromFinelibDirectory(params: {
  selectedState: string;
  customKeywords?: string[];
  existingBusinessNames: string[];
  maxResults?: number;
}): Promise<{
  candidates: RawDiscoveredCompany[];
  honestNote: string;
  keywordsUsed: string[];
  groundingUrls: string[];
}> {
  const isAllStates = params.selectedState === ALL_STATES_OPTION;
  const targetCount = Math.min(Math.max(params.maxResults ?? 5, 3), 8);
  const existingSet = new Set(
    params.existingBusinessNames.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );

  const searchLocation = isAllStates
    ? 'Nigeria'
    : params.selectedState.replace('FCT (Abuja)', 'Abuja');

  const keywordsUsed =
    params.customKeywords && params.customKeywords.length > 0
      ? params.customKeywords.map((k) => `${k} ${searchLocation}`.trim())
      : [
          `real estate developers ${searchLocation}`,
          `estate development company ${searchLocation}`,
          `real estate company ${searchLocation}`,
        ];

  const sourcePageUrls: string[] = [];
  if (!isAllStates && STATE_CATEGORY_SLUGS[params.selectedState]) {
    for (const slug of STATE_CATEGORY_SLUGS[params.selectedState]) {
      sourcePageUrls.push(`${FINELIB_BASE}${slug}`);
    }
  } else if (isAllStates) {
    sourcePageUrls.push(
      `${FINELIB_BASE}/cities/abuja/business/real-estate/real-estate-developers`,
      `${FINELIB_BASE}/cities/lagos/business/real-estate/real-estate-developers`
    );
  }

  for (const kw of keywordsUsed) {
    sourcePageUrls.push(`${FINELIB_BASE}/search.php?q=${encodeURIComponent(kw)}`);
  }

  // Fetch up to 3 directory index pages in parallel to collect candidate listing URLs quickly
  const indexPages = await Promise.all(
    sourcePageUrls.slice(0, 3).map((u) => fetchDirectoryHtml(u, 7000))
  );

  const listingUrls: string[] = [];
  const seenListings = new Set<string>();

  for (const html of indexPages) {
    if (!html) continue;
    for (const url of extractListingUrlsFromHtml(html)) {
      if (!seenListings.has(url)) {
        seenListings.add(url);
        // Quick heuristic filter on URL slug against existing business names before even fetching detail page
        const slugPart = (url.split('/listing/')[1]?.split('/')[0] ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (slugPart && existingSet.has(slugPart)) {
          continue;
        }
        listingUrls.push(url);
      }
    }
  }

  // Fetch listing pages in small batches until we reach targetCount verified state-matched firms
  const candidates: RawDiscoveredCompany[] = [];
  const maxInspectPages = Math.min(listingUrls.length, Math.max(targetCount * 3, 14));
  const batchSize = 4;

  for (let i = 0; i < maxInspectPages && candidates.length < targetCount; i += batchSize) {
    const slice = listingUrls.slice(i, i + batchSize);
    const pages = await Promise.all(
      slice.map(async (url) => ({
        url,
        html: await fetchDirectoryHtml(url, 6500),
      }))
    );

    for (const page of pages) {
      if (!page.html || candidates.length >= targetCount) continue;
      const parsed = parseFinelibListingPage(page.html, page.url, params.selectedState);
      if (!parsed) continue;
      const normName = parsed.business_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (existingSet.has(normName)) continue;
      existingSet.add(normName);
      candidates.push(parsed);
    }
  }

  const honestNote =
    candidates.length > 0
      ? `Discovered ${candidates.length} real estate firm(s) in ${params.selectedState} directly from the Finelib Nigerian Business Directory (0 AI quota used).`
      : `Searched the Finelib Nigerian Business Directory for ${params.selectedState}, but no new unstored real estate listings matching ${params.selectedState} were found for these keywords.`;

  return {
    candidates,
    honestNote,
    keywordsUsed,
    groundingUrls: sourcePageUrls.slice(0, 3),
  };
}

export function qualifyFromHttpEvidence(params: {
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  httpReport: HttpInspectionReport | null;
  lookupNotes: string;
}): {
  website_status: WebsiteClassification;
  inspection_evidence: string;
  confidence: 'High' | 'Medium' | 'Low';
  opportunity_score: number;
  qualification_reason: string;
  skip: boolean;
} {
  const { websiteUrl, instagramUrl, facebookUrl, httpReport, lookupNotes } = params;

  if (httpReport?.redirected_to_social) {
    const isIg = httpReport.social_platform === 'instagram';
    return {
      website_status: isIg ? 'instagram_only' : 'social_only',
      inspection_evidence: httpReport.factual_summary,
      confidence: 'High',
      opportunity_score: 5,
      qualification_reason: `Company website redirects visitors straight to ${httpReport.social_platform} instead of an independent property site.`,
      skip: false,
    };
  }

  if (!websiteUrl) {
    if (instagramUrl) {
      return {
        website_status: 'instagram_only',
        inspection_evidence: `No official website domain listed in directory; active Instagram profile found (${instagramUrl}). ${lookupNotes}`.trim(),
        confidence: 'Medium',
        opportunity_score: 5,
        qualification_reason: 'Relying on Instagram without an independent real estate website or buyer inquiry destination.',
        skip: false,
      };
    }
    if (facebookUrl) {
      return {
        website_status: 'social_only',
        inspection_evidence: `No official website domain listed in directory; social page found (${facebookUrl}). ${lookupNotes}`.trim(),
        confidence: 'Medium',
        opportunity_score: 5,
        qualification_reason: 'Social-only online presence with no owned property website.',
        skip: false,
      };
    }
    return {
      website_status: 'no_website',
      inspection_evidence: `No independent company website URL listed in verified directory record. ${lookupNotes}`.trim(),
      confidence: 'Medium',
      opportunity_score: 5,
      qualification_reason: 'Active Nigerian real estate firm with no listed official website — strong prospect for Stepstone.',
      skip: false,
    };
  }

  if (!httpReport) {
    return {
      website_status: 'unknown',
      inspection_evidence: `Website URL ${websiteUrl} listed, HTTP inspection unavailable.`,
      confidence: 'Low',
      opportunity_score: 3,
      qualification_reason: 'Website URL exists but live HTTP verification did not complete.',
      skip: false,
    };
  }

  const probeDiscoveryNote = lookupNotes.includes('Directory URL was blank;')
    ? ` ${lookupNotes.slice(lookupNotes.indexOf('Directory URL was blank;'))}`
    : '';

  if (httpReport.access_restricted) {
    return {
      website_status: 'unknown',
      inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
      confidence: 'Low',
      opportunity_score: 2,
      qualification_reason: `Active domain ${websiteUrl} returned HTTP ${httpReport.http_status ?? 'WAF'} firewall/bot restriction; open in browser to verify before outreach so you never pitch "no website" to a live site.`,
      skip: true,
    };
  }

  if (!httpReport.reachable || (httpReport.http_status !== null && httpReport.http_status >= 400)) {
    return {
      website_status: 'broken_website',
      inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
      confidence: 'High',
      opportunity_score: 5,
      qualification_reason: `Listed website (${websiteUrl}) failed live HTTP check (${httpReport.error_message || `HTTP ${httpReport.http_status}`}).`,
      skip: false,
    };
  }

  const sig = httpReport.signals;
  if (!sig) {
    return {
      website_status: 'unknown',
      inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
      confidence: 'Low',
      opportunity_score: 3,
      qualification_reason: 'Site responded without parsable HTML signals.',
      skip: false,
    };
  }

  const weaknesses: string[] = [];
  if (!httpReport.is_https) weaknesses.push('no HTTPS');
  if (!sig.has_viewport_meta) weaknesses.push('missing mobile viewport tag');
  if (!sig.has_nav) weaknesses.push('minimal navigation');
  if (!sig.has_form && !sig.has_whatsapp_link) weaknesses.push('no inquiry form or WhatsApp CTA');
  if (!sig.has_contact_info) weaknesses.push('no obvious contact details in HTML');
  if (sig.html_length < 2500) weaknesses.push('very thin landing page HTML');

  if (weaknesses.length >= 2 || !sig.has_viewport_meta || !httpReport.is_https) {
    return {
      website_status: 'weak_website',
      inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
      confidence: 'High',
      opportunity_score: weaknesses.length >= 3 ? 4 : 3,
      qualification_reason: `Live website reachable (HTTP ${httpReport.http_status}) but shows clear gaps: ${weaknesses.join(', ')}.`,
      skip: false,
    };
  }

  if (weaknesses.length === 1) {
    return {
      website_status: 'weak_website',
      inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
      confidence: 'High',
      opportunity_score: 3,
      qualification_reason: `Live website reachable (HTTP ${httpReport.http_status}) with opportunity to improve (${weaknesses[0]}).`,
      skip: false,
    };
  }

  return {
    website_status: 'good_website',
    inspection_evidence: `${httpReport.factual_summary}${probeDiscoveryNote}`,
    confidence: 'High',
    opportunity_score: 1,
    qualification_reason: `Live HTTPS website verified (HTTP ${httpReport.http_status}) with mobile viewport, navigation, contact details, and inquiry channel.`,
    skip: true,
  };
}
