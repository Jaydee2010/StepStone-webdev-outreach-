import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgencyPackagesConfig,
  EngineMode,
  LeadRecord,
  ModeBOutreachRecord,
  WebsiteClassification,
} from '../src/types/stepstone.ts';
import type { HttpInspectionReport } from './inspector.ts';
import { inspectWebsiteUrl, normalizeUrlInput } from './inspector.ts';
import { discoverFromFinelibDirectory, qualifyFromHttpEvidence } from './directory.ts';
import { buildNoWebsiteProbeSummary, probeCompanyWebsiteFree } from './domainProbe.ts';
import { buildPlaybookOutreachForLead, buildPlaybookReply } from './playbook.ts';

export function isQuotaOrKeyFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /429|RESOURCE_EXHAUSTED|GEMINI_API_KEY is not configured|API_KEY_INVALID|PERMISSION_DENIED/i.test(
    msg
  );
}

function summarizeGeminiNotice(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/GEMINI_API_KEY is not configured/i.test(raw)) {
    return 'GEMINI_API_KEY is not set on server; switched to 0-quota directory/playbook mode.';
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return 'Gemini API returned 429 quota limit; switched to Live Directory / Agency Playbook (0 AI quota used).';
  }
  return `Gemini API unavailable (${raw.slice(0, 120)}); switched to 0-quota mode.`;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your GEMINI_API_KEY environment variable or Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHardQuotaZeroOrDaily(msg: string): boolean {
  return /limit:\s*0\b|"limit"\s*:\s*0\b|PerDay|GenerateRequestsPerDay|billing/i.test(msg);
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isHardQuotaZeroOrDaily(msg)) {
        throw err;
      }
      const isRetryable = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|try again/i.test(
        msg
      );
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      await sleep(2500 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Calls gemini-4-hydrogen first; on 429/RESOURCE_EXHAUSTED, falls back to gemini-3.1-flash-lite
 * which offers higher RPM/TPM headroom for lightweight JSON classification and copy tasks.
 */
async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    tools?: Array<Record<string, unknown>>;
    primaryThinking?: ThinkingLevel;
  }
) {
  const runModel = (model: string, thinkingLevel: ThinkingLevel) =>
    ai.models.generateContent({
      model,
      contents: params.contents,
      config: {
        ...(params.tools ? { tools: params.tools } : {}),
        thinkingConfig: { thinkingLevel },
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      },
    });

  try {
    return await withGeminiRetry(
      () => runModel('gemini-4-hydrogen', params.primaryThinking ?? ThinkingLevel.LOW),
      1
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|RESOURCE_EXHAUSTED/i.test(msg)) {
      return await withGeminiRetry(
        () => runModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL),
        0
      );
    }
    throw err;
  }
}

function extractGroundingUrls(response: unknown): string[] {
  const r = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = r?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const urls: string[] = [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (uri && /^https?:\/\//i.test(uri) && !urls.includes(uri)) {
      urls.push(uri);
    }
  }
  return urls;
}

function parseJsonFromText<T>(rawText: string | undefined, fallback: T): T {
  if (!rawText) return fallback;
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const objStart = candidate.indexOf('{');
    const arrStart = candidate.indexOf('[');
    let start = -1;
    let end = -1;
    if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
      start = arrStart;
      end = candidate.lastIndexOf(']');
    } else if (objStart !== -1) {
      start = objStart;
      end = candidate.lastIndexOf('}');
    }
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export interface RawDiscoveredCompany {
  business_name: string;
  business_category: string;
  state: string;
  city: string;
  phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_business_profile_url: string | null;
  source_urls: string[];
  discovery_notes: string;
  corporate_email_domains?: string[];
  brand_email_handles?: string[];
  text_domain_hints?: string[];
}

export async function discoverBusinessesWithSearch(params: {
  selectedState: string;
  customKeywords?: string[];
  existingBusinessNames: string[];
  maxResults?: number;
  engineMode?: EngineMode;
}): Promise<{
  candidates: RawDiscoveredCompany[];
  honestNote: string;
  keywordsUsed: string[];
  groundingUrls: string[];
  engineUsed: 'gemini_ai' | 'free_directory';
  quotaNotice: string | null;
}> {
  const engineMode: EngineMode = params.engineMode ?? 'auto';
  if (engineMode === 'free') {
    const dirResult = await discoverFromFinelibDirectory(params);
    return {
      ...dirResult,
      engineUsed: 'free_directory',
      quotaNotice: null,
    };
  }

  let ai: GoogleGenAI;
  try {
    ai = getAiClient();
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      const dirResult = await discoverFromFinelibDirectory(params);
      return {
        ...dirResult,
        honestNote: `${dirResult.honestNote} (Gemini API key missing on server.)`,
        engineUsed: 'free_directory',
        quotaNotice: summarizeGeminiNotice(err),
      };
    }
    throw err;
  }
  const isAllStates = params.selectedState === 'All Nigerian States';
  const keywordsUsed =
    params.customKeywords && params.customKeywords.length > 0
      ? params.customKeywords
      : [
          `Real estate companies in ${isAllStates ? 'Nigeria' : params.selectedState}`,
          `Property developers in ${isAllStates ? 'Nigeria' : params.selectedState}`,
          `Estate development and property management companies in ${isAllStates ? 'Nigeria' : params.selectedState}`,
        ];

  const excludeSlice = params.existingBusinessNames.slice(0, 40);
  const targetCount = Math.min(Math.max(params.maxResults ?? 4, 3), 8);

  const locationConstraint = isAllStates
    ? `Target location: All Nigerian States. Label every company with its actual Nigerian state.`
    : `Target location: ${params.selectedState}, Nigeria ONLY. Never include businesses from other states or expand to neighboring states. If fewer than ${targetCount} verified firms are found, return only what is verified and note it in "honest_note".`;

  const prompt = `Search Google for established Nigerian real estate firms using these angles:
${keywordsUsed.map((k) => `- "${k}"`).join('\n')}

${locationConstraint}

Prioritize established real estate companies, property developers, estate development firms, and property management firms over individual agents.
Exclude already stored firms: ${excludeSlice.length > 0 ? excludeSlice.join('; ') : 'None'}.
For each firm, check for an official website, Instagram profile, Facebook page, or Google Business Profile. Never invent data; set unverified fields to null. Put directory URLs (Nigeria Property Centre, BusinessList, Finelib) in source_urls and leave website_url as null if no independent official domain is verified.

Return ONLY valid JSON:
{
  "honest_note": "Brief factual summary of search results in ${params.selectedState}.",
  "companies": [
    {
      "business_name": "Exact company name",
      "business_category": "Property Developer | Estate Development Company | Real Estate Company | Property Management Firm",
      "state": "${isAllStates ? 'Actual Nigerian State' : params.selectedState}",
      "city": "City or district",
      "phone": "+234... or null",
      "website_url": "https://... or null",
      "instagram_url": "https://instagram.com/... or null",
      "facebook_url": "https://facebook.com/... or null",
      "google_business_profile_url": "https://... or null",
      "source_urls": ["https://..."],
      "discovery_notes": "Brief factual evidence found."
    }
  ]
}`;

  let response;
  try {
    response = await generateWithFallback(ai, {
      contents: prompt,
      tools: [{ googleSearch: {} }],
      primaryThinking: ThinkingLevel.LOW,
    });
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      const dirResult = await discoverFromFinelibDirectory(params);
      const notice = summarizeGeminiNotice(err);
      return {
        ...dirResult,
        honestNote: `${dirResult.honestNote} [${notice}]`,
        engineUsed: 'free_directory',
        quotaNotice: notice,
      };
    }
    throw err;
  }

  const groundingUrls = extractGroundingUrls(response);
  const parsed = parseJsonFromText<{
    honest_note?: string;
    companies?: RawDiscoveredCompany[];
  }>(response.text, { honest_note: '', companies: [] });

  let companies = Array.isArray(parsed.companies) ? parsed.companies : [];

  if (!isAllStates) {
    const targetLower = params.selectedState.toLowerCase();
    const isFct = targetLower.includes('abuja') || targetLower.includes('fct');
    companies = companies.filter((c) => {
      const s = (c.state ?? '').toLowerCase();
      if (!s) return true;
      if (isFct) {
        return s.includes('abuja') || s.includes('fct') || s.includes('federal capital');
      }
      return s.includes(targetLower.replace(' state', '').trim());
    });
    companies = companies.map((c) => ({
      ...c,
      state: params.selectedState,
    }));
  }

  companies = companies
    .slice(0, targetCount)
    .map((c) => {
      const mergedSources = Array.from(
        new Set([
          ...(Array.isArray(c.source_urls) ? c.source_urls : []),
          ...groundingUrls.slice(0, 3),
        ])
      ).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));

      return {
        business_name: (c.business_name ?? '').trim(),
        business_category: (c.business_category ?? 'Real Estate Company').trim(),
        state: (c.state ?? params.selectedState).trim(),
        city: (c.city ?? '').trim(),
        phone: c.phone && c.phone !== 'null' ? String(c.phone).trim() : null,
        website_url:
          c.website_url && c.website_url !== 'null' ? normalizeUrlInput(c.website_url) : null,
        instagram_url:
          c.instagram_url && c.instagram_url !== 'null' ? String(c.instagram_url).trim() : null,
        facebook_url:
          c.facebook_url && c.facebook_url !== 'null' ? String(c.facebook_url).trim() : null,
        google_business_profile_url:
          c.google_business_profile_url && c.google_business_profile_url !== 'null'
            ? String(c.google_business_profile_url).trim()
            : null,
        source_urls: mergedSources,
        discovery_notes: (c.discovery_notes ?? '').trim(),
      };
    })
    .filter((c) => c.business_name.length > 1);

  return {
    candidates: companies,
    honestNote:
      parsed.honest_note ||
      `Searched ${params.selectedState} across multiple real estate categories and found ${companies.length} candidate companies.`,
    keywordsUsed,
    groundingUrls,
    engineUsed: 'gemini_ai',
    quotaNotice: null,
  };
}

export async function lookupWebsiteAndSocials(company: {
  business_name: string;
  state: string;
  city?: string;
}): Promise<{
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  lookup_notes: string;
  source_urls: string[];
}> {
  const ai = getAiClient();
  const prompt = `Perform Step 1 Website Discovery for this Nigerian real estate business:
Company: "${company.business_name}"
Location: ${company.city ? `${company.city}, ` : ''}${company.state}, Nigeria

Distinguish genuine official company domains from directory listings (Nigeria Property Centre, BusinessList, Finelib, LinkedIn) and unrelated companies.
Return ONLY valid JSON:
{
  "website_url": "official domain URL or null",
  "instagram_url": "official instagram profile URL or null",
  "facebook_url": "official facebook page URL or null",
  "lookup_notes": "factual note of what was found or not found",
  "source_urls": ["https://..."]
}`;

  const response = await generateWithFallback(ai, {
    contents: prompt,
    tools: [{ googleSearch: {} }],
    primaryThinking: ThinkingLevel.LOW,
  });

  const groundingUrls = extractGroundingUrls(response);
  const parsed = parseJsonFromText<{
    website_url?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
    lookup_notes?: string;
    source_urls?: string[];
  }>(response.text, {});

  return {
    website_url:
      parsed.website_url && parsed.website_url !== 'null'
        ? normalizeUrlInput(parsed.website_url)
        : null,
    instagram_url:
      parsed.instagram_url && parsed.instagram_url !== 'null'
        ? parsed.instagram_url.trim()
        : null,
    facebook_url:
      parsed.facebook_url && parsed.facebook_url !== 'null'
        ? parsed.facebook_url.trim()
        : null,
    lookup_notes: parsed.lookup_notes || 'Website discovery search completed.',
    source_urls: Array.from(
      new Set([...(parsed.source_urls ?? []), ...groundingUrls.slice(0, 3)])
    ).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)),
  };
}

function buildLeadRecord(params: {
  raw: RawDiscoveredCompany;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  lookupNotes: string;
  allSources: string[];
  httpReport: HttpInspectionReport | null;
  qualification: {
    website_status?: WebsiteClassification;
    inspection_evidence?: string;
    confidence?: 'High' | 'Medium' | 'Low';
    opportunity_score?: number;
    qualification_reason?: string;
    skip?: boolean;
  };
}): LeadRecord {
  const { raw, websiteUrl, instagramUrl, facebookUrl, lookupNotes, allSources, httpReport, qualification } =
    params;
  const today = new Date().toISOString().slice(0, 10);

  const validStatuses: WebsiteClassification[] = [
    'no_website',
    'instagram_only',
    'social_only',
    'broken_website',
    'weak_website',
    'good_website',
    'unknown',
  ];
  const websiteStatus: WebsiteClassification = validStatuses.includes(
    qualification.website_status as WebsiteClassification
  )
    ? (qualification.website_status as WebsiteClassification)
    : websiteUrl
    ? 'unknown'
    : instagramUrl
    ? 'instagram_only'
    : facebookUrl
    ? 'social_only'
    : 'no_website';

  const score = Math.min(5, Math.max(1, Number(qualification.opportunity_score ?? 3)));
  const skip = score <= 2 ? true : Boolean(qualification.skip);

  return {
    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    business_name: raw.business_name,
    business_category: raw.business_category,
    state: raw.state,
    city: raw.city,
    phone: raw.phone,
    website_url: websiteUrl,
    final_destination_url: httpReport?.final_destination_url ?? null,
    instagram_url: instagramUrl,
    facebook_url: facebookUrl,
    google_business_profile_url: raw.google_business_profile_url,
    website_status: websiteStatus,
    inspection_evidence:
      qualification.inspection_evidence ||
      httpReport?.factual_summary ||
      lookupNotes ||
      'No independent website discovered.',
    inspection_date: httpReport?.inspection_date ?? today,
    confidence:
      qualification.confidence === 'High' ||
      qualification.confidence === 'Medium' ||
      qualification.confidence === 'Low'
        ? qualification.confidence
        : httpReport
        ? 'High'
        : 'Medium',
    source_urls: allSources,
    opportunity_score: score,
    qualification_reason:
      qualification.qualification_reason || 'Qualified based on discovered real estate profile.',
    skip,
    discovered_at: new Date().toISOString(),
    search_state: raw.state,
    lead_lifecycle: 'new',
    outreach: null,
    http_signals: httpReport
      ? {
          reachable: httpReport.reachable,
          http_status: httpReport.http_status,
          redirect_chain: httpReport.redirect_chain,
          redirected_to_social: httpReport.redirected_to_social,
          access_restricted: httpReport.access_restricted,
          has_viewport_meta: httpReport.signals?.has_viewport_meta ?? false,
          has_nav: httpReport.signals?.has_nav ?? false,
          has_form: httpReport.signals?.has_form ?? false,
          has_whatsapp_link: httpReport.signals?.has_whatsapp_link ?? false,
          has_contact_info: httpReport.signals?.has_contact_info ?? false,
          page_title: httpReport.signals?.page_title ?? null,
        }
      : null,
  };
}

export async function inspectAndQualifyBatch(
  candidates: RawDiscoveredCompany[],
  engineMode: EngineMode = 'auto'
): Promise<LeadRecord[]> {
  if (candidates.length === 0) return [];

  const inspected = await Promise.all(
    candidates.map(async (raw) => {
      let websiteUrl = raw.website_url;
      let instagramUrl = raw.instagram_url;
      let facebookUrl = raw.facebook_url;
      let lookupNotes = raw.discovery_notes;
      let allSources = [...raw.source_urls];
      let httpReport: HttpInspectionReport | null = null;

      if (!websiteUrl) {
        const probeMatch = await probeCompanyWebsiteFree({
          business_name: raw.business_name,
          state: raw.state,
          city: raw.city,
          phone: raw.phone,
          corporateEmailDomains: raw.corporate_email_domains,
          brandEmailHandles: raw.brand_email_handles,
          textDomainHints: raw.text_domain_hints,
        });
        if (probeMatch) {
          websiteUrl = probeMatch.websiteUrl;
          if (!instagramUrl && probeMatch.discoveredInstagramUrl) {
            instagramUrl = probeMatch.discoveredInstagramUrl;
          }
          if (!facebookUrl && probeMatch.discoveredFacebookUrl) {
            facebookUrl = probeMatch.discoveredFacebookUrl;
          }
          allSources = Array.from(new Set([...allSources, ...probeMatch.sourceUrls]));
          lookupNotes = [lookupNotes, probeMatch.factualNote].filter(Boolean).join(' ');
        } else {
          const hadEmailHints = Boolean(
            (raw.corporate_email_domains?.length ?? 0) +
              (raw.brand_email_handles?.length ?? 0) +
              (raw.text_domain_hints?.length ?? 0) >
              0
          );
          lookupNotes = [lookupNotes, buildNoWebsiteProbeSummary(raw.business_name, hadEmailHints)]
            .filter(Boolean)
            .join(' ');
        }
      }

      if (websiteUrl) {
        httpReport = await inspectWebsiteUrl(websiteUrl);
        if (httpReport.redirected_to_social && httpReport.final_destination_url) {
          if (httpReport.social_platform === 'instagram' && !instagramUrl) {
            instagramUrl = httpReport.final_destination_url;
          } else if (httpReport.social_platform === 'facebook' && !facebookUrl) {
            facebookUrl = httpReport.final_destination_url;
          }
        }
      }
      return { raw, websiteUrl, instagramUrl, facebookUrl, lookupNotes, allSources, httpReport };
    })
  );

  if (engineMode === 'free') {
    return inspected.map((item) =>
      buildLeadRecord({
        raw: item.raw,
        websiteUrl: item.websiteUrl,
        instagramUrl: item.instagramUrl,
        facebookUrl: item.facebookUrl,
        lookupNotes: item.lookupNotes,
        allSources: item.allSources,
        httpReport: item.httpReport,
        qualification: qualifyFromHttpEvidence({
          websiteUrl: item.websiteUrl,
          instagramUrl: item.instagramUrl,
          facebookUrl: item.facebookUrl,
          httpReport: item.httpReport,
          lookupNotes: item.lookupNotes,
        }),
      })
    );
  }

  let qualifications: Array<{
    index: number;
    website_status?: WebsiteClassification;
    inspection_evidence?: string;
    confidence?: 'High' | 'Medium' | 'Low';
    opportunity_score?: number;
    qualification_reason?: string;
    skip?: boolean;
  }> = [];

  try {
    const ai = getAiClient();
    const payloadSummary = inspected.map((item, idx) => ({
      index: idx,
      business_name: item.raw.business_name,
      business_category: item.raw.business_category,
      location: `${item.raw.city ? `${item.raw.city}, ` : ''}${item.raw.state}`,
      phone: item.raw.phone,
      website_url: item.websiteUrl,
      instagram_url: item.instagramUrl,
      facebook_url: item.facebookUrl,
      google_business_profile_url: item.raw.google_business_profile_url,
      discovery_notes: item.lookupNotes,
      http_inspection_report:
        item.httpReport ?? 'No independent website URL discovered to inspect via HTTP.',
    }));

    const batchPrompt = `Classify the website situation and qualify EACH of these ${inspected.length} Nigerian real estate businesses for Stepstone Web Agency.

CANDIDATES & LIVE HTTP REPORTS:
${JSON.stringify(payloadSummary, null, 2)}

CLASSIFICATION RULES (choose exactly ONE per company):
- "no_website", "instagram_only", "social_only", "broken_website", "weak_website", "good_website", "unknown".
- Do NOT mark broken_website on a single 403/429 WAF block.
- Score 1-5: 5=Excellent (no/social/broken site + active firm), 4=Strong (weak site or clear gap), 3=Potential, 2=Weak, 1=Poor. If score <= 2, skip MUST be true.`;

    const response = await generateWithFallback(ai, {
      contents: batchPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            website_status: { type: Type.STRING },
            inspection_evidence: { type: Type.STRING },
            confidence: { type: Type.STRING },
            opportunity_score: { type: Type.INTEGER },
            qualification_reason: { type: Type.STRING },
            skip: { type: Type.BOOLEAN },
          },
          required: [
            'index',
            'website_status',
            'inspection_evidence',
            'confidence',
            'opportunity_score',
            'qualification_reason',
            'skip',
          ],
        },
      },
      primaryThinking: ThinkingLevel.LOW,
    });

    qualifications = parseJsonFromText(response.text, []);
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      return inspected.map((item) =>
        buildLeadRecord({
          raw: item.raw,
          websiteUrl: item.websiteUrl,
          instagramUrl: item.instagramUrl,
          facebookUrl: item.facebookUrl,
          lookupNotes: item.lookupNotes,
          allSources: item.allSources,
          httpReport: item.httpReport,
          qualification: qualifyFromHttpEvidence({
            websiteUrl: item.websiteUrl,
            instagramUrl: item.instagramUrl,
            facebookUrl: item.facebookUrl,
            httpReport: item.httpReport,
            lookupNotes: item.lookupNotes,
          }),
        })
      );
    }
    throw err;
  }

  return inspected.map((item, idx) => {
    const q = qualifications.find((entry) => entry.index === idx) ?? qualifications[idx] ?? {};
    return buildLeadRecord({
      raw: item.raw,
      websiteUrl: item.websiteUrl,
      instagramUrl: item.instagramUrl,
      facebookUrl: item.facebookUrl,
      lookupNotes: item.lookupNotes,
      allSources: item.allSources,
      httpReport: item.httpReport,
      qualification: q,
    });
  });
}

export async function inspectAndQualifyCandidate(
  raw: RawDiscoveredCompany,
  allowSearchLookup = true,
  engineMode: EngineMode = 'auto'
): Promise<LeadRecord> {
  let websiteUrl = raw.website_url;
  let instagramUrl = raw.instagram_url;
  let facebookUrl = raw.facebook_url;
  let lookupNotes = raw.discovery_notes;
  let allSources = [...raw.source_urls];

  if (!websiteUrl && allowSearchLookup && engineMode !== 'free') {
    try {
      const lookup = await lookupWebsiteAndSocials({
        business_name: raw.business_name,
        state: raw.state,
        city: raw.city,
      });
      if (lookup.website_url) websiteUrl = lookup.website_url;
      if (!instagramUrl && lookup.instagram_url) instagramUrl = lookup.instagram_url;
      if (!facebookUrl && lookup.facebook_url) facebookUrl = lookup.facebook_url;
      lookupNotes = [lookupNotes, lookup.lookup_notes].filter(Boolean).join(' ');
      allSources = Array.from(new Set([...allSources, ...lookup.source_urls]));
    } catch {
      // Keep original discovery details if secondary lookup fails
    }
  }

  if (!websiteUrl) {
    const probeMatch = await probeCompanyWebsiteFree({
      business_name: raw.business_name,
      state: raw.state,
      city: raw.city,
      phone: raw.phone,
      corporateEmailDomains: raw.corporate_email_domains,
      brandEmailHandles: raw.brand_email_handles,
      textDomainHints: raw.text_domain_hints,
    });
    if (probeMatch) {
      websiteUrl = probeMatch.websiteUrl;
      if (!instagramUrl && probeMatch.discoveredInstagramUrl) {
        instagramUrl = probeMatch.discoveredInstagramUrl;
      }
      if (!facebookUrl && probeMatch.discoveredFacebookUrl) {
        facebookUrl = probeMatch.discoveredFacebookUrl;
      }
      allSources = Array.from(new Set([...allSources, ...probeMatch.sourceUrls]));
      lookupNotes = [lookupNotes, probeMatch.factualNote].filter(Boolean).join(' ');
    } else {
      const hadEmailHints = Boolean(
        (raw.corporate_email_domains?.length ?? 0) +
          (raw.brand_email_handles?.length ?? 0) +
          (raw.text_domain_hints?.length ?? 0) >
          0
      );
      lookupNotes = [lookupNotes, buildNoWebsiteProbeSummary(raw.business_name, hadEmailHints)]
        .filter(Boolean)
        .join(' ');
    }
  }

  let httpReport: HttpInspectionReport | null = null;
  if (websiteUrl) {
    httpReport = await inspectWebsiteUrl(websiteUrl);
    if (httpReport.redirected_to_social && httpReport.final_destination_url) {
      if (httpReport.social_platform === 'instagram' && !instagramUrl) {
        instagramUrl = httpReport.final_destination_url;
      } else if (httpReport.social_platform === 'facebook' && !facebookUrl) {
        facebookUrl = httpReport.final_destination_url;
      }
    }
  }

  if (engineMode === 'free') {
    return buildLeadRecord({
      raw,
      websiteUrl,
      instagramUrl,
      facebookUrl,
      lookupNotes,
      allSources,
      httpReport,
      qualification: qualifyFromHttpEvidence({
        websiteUrl,
        instagramUrl,
        facebookUrl,
        httpReport,
        lookupNotes,
      }),
    });
  }

  try {
    const ai = getAiClient();
    const qualificationPrompt = `Classify the website situation and qualify this Nigerian real estate business for Stepstone Web Agency.

COMPANY RECORD:
- Business Name: ${raw.business_name}
- Category: ${raw.business_category}
- Location: ${raw.city ? `${raw.city}, ` : ''}${raw.state}
- Phone: ${raw.phone ?? 'null'}
- Discovered Website URL: ${websiteUrl ?? 'null'}
- Instagram URL: ${instagramUrl ?? 'null'}
- Facebook URL: ${facebookUrl ?? 'null'}
- Google Business Profile: ${raw.google_business_profile_url ?? 'null'}
- Discovery & Lookup Notes: ${lookupNotes}

LIVE SERVER HTTP INSPECTION REPORT:
${httpReport ? JSON.stringify(httpReport, null, 2) : 'No independent website URL was discovered to inspect via HTTP.'}

CLASSIFICATION RULES:
- "no_website", "instagram_only", "social_only", "broken_website", "weak_website", "good_website", "unknown".
- If score is 1 or 2, skip MUST be true. Otherwise skip MUST be false.
- Do NOT invent inspection facts not present in the HTTP report or discovery notes.`;

    const response = await generateWithFallback(ai, {
      contents: qualificationPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          website_status: { type: Type.STRING },
          inspection_evidence: { type: Type.STRING },
          confidence: { type: Type.STRING },
          opportunity_score: { type: Type.INTEGER },
          qualification_reason: { type: Type.STRING },
          skip: { type: Type.BOOLEAN },
        },
        required: [
          'website_status',
          'inspection_evidence',
          'confidence',
          'opportunity_score',
          'qualification_reason',
          'skip',
        ],
      },
      primaryThinking: ThinkingLevel.LOW,
    });

    const result = parseJsonFromText<{
      website_status?: WebsiteClassification;
      inspection_evidence?: string;
      confidence?: 'High' | 'Medium' | 'Low';
      opportunity_score?: number;
      qualification_reason?: string;
      skip?: boolean;
    }>(response.text, {});

    return buildLeadRecord({
      raw,
      websiteUrl,
      instagramUrl,
      facebookUrl,
      lookupNotes,
      allSources,
      httpReport,
      qualification: result,
    });
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      return buildLeadRecord({
        raw,
        websiteUrl,
        instagramUrl,
        facebookUrl,
        lookupNotes,
        allSources,
        httpReport,
        qualification: qualifyFromHttpEvidence({
          websiteUrl,
          instagramUrl,
          facebookUrl,
          httpReport,
          lookupNotes,
        }),
      });
    }
    throw err;
  }
}

export async function generateOutreachForLead(
  lead: LeadRecord,
  packages: AgencyPackagesConfig,
  engineMode: EngineMode = 'auto'
): Promise<{
  outreach: ModeBOutreachRecord;
  engineUsed: 'gemini_ai' | 'free_playbook';
  quotaNotice: string | null;
}> {
  if (lead.skip || lead.opportunity_score <= 2) {
    throw new Error(
      `Outreach is blocked for "${lead.business_name}" because it is marked skip (score ${lead.opportunity_score}/5).`
    );
  }

  if (engineMode === 'free') {
    return {
      outreach: buildPlaybookOutreachForLead(lead, packages),
      engineUsed: 'free_playbook',
      quotaNotice: null,
    };
  }

  try {
    const ai = getAiClient();
    const prompt = `Generate Mode B personalized outreach and a homepage mockup image-generation brief for Stepstone Web Agency (Abuja, Nigeria, run by Jaydee).

PROSPECT DATA (VERIFIED):
${JSON.stringify(
      {
        business_name: lead.business_name,
        business_category: lead.business_category,
        state: lead.state,
        city: lead.city,
        website_url: lead.website_url,
        final_destination_url: lead.final_destination_url,
        instagram_url: lead.instagram_url,
        facebook_url: lead.facebook_url,
        website_status: lead.website_status,
        inspection_evidence: lead.inspection_evidence,
        opportunity_score: lead.opportunity_score,
        qualification_reason: lead.qualification_reason,
      },
      null,
      2
    )}

OUR OFFER CONTEXT (do NOT include prices or package lists in first outreach messages):
- Free homepage preview using the company's actual name before anyone pays.
- Delivery timeline: ${packages.deliveryTimeline}.

STRICT OUTREACH RULES:
1. Choose angle from: "no_website", "instagram_only", "social_only", "broken_website", "weak_website". Never claim a problem unless inspection_evidence supports it.
2. FIRST WHATSAPP MESSAGE: Strictly UNDER 60 words, friendly Nigerian business English, greet by company name, mention ONE verified observation, offer free homepage preview, end with ONE easy question, NO prices, max 1 emoji, never pretend to be a customer, never promise sales/clients.
3. INSTAGRAM MESSAGE: Max 40 words, concise & natural.
4. FOLLOW-UP 1 (DAY 2): Under 40 words, introduce something useful or ask a relevant question.
5. FOLLOW-UP 2 (DAY 5): Under 40 words, politely close without pressure.
6. PREVIEW BRIEF (PART 10): Detailed image-generation brief specifying "${lead.business_name}" as logo text, brand colours note (do not invent branding), suitable Nigerian property image matching ${lead.state}, professional real estate layout, clear headline, property showcase, WhatsApp button, mobile & desktop portrait presentation, explicitly presented as a Concept Homepage Preview.`;

    const response = await generateWithFallback(ai, {
      contents: prompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          reason: { type: Type.STRING },
          skip: { type: Type.BOOLEAN },
          angle: { type: Type.STRING },
          whatsapp_message: { type: Type.STRING },
          instagram_message: { type: Type.STRING },
          followup_1: { type: Type.STRING },
          followup_2: { type: Type.STRING },
          preview_brief: { type: Type.STRING },
        },
        required: [
          'score',
          'reason',
          'skip',
          'angle',
          'whatsapp_message',
          'instagram_message',
          'followup_1',
          'followup_2',
          'preview_brief',
        ],
      },
      primaryThinking: ThinkingLevel.MEDIUM,
    });

    const parsed = parseJsonFromText<ModeBOutreachRecord>(response.text, {
      score: lead.opportunity_score,
      reason: lead.qualification_reason,
      skip: false,
      angle: 'no_website',
      whatsapp_message: '',
      instagram_message: '',
      followup_1: '',
      followup_2: '',
      preview_brief: '',
    });

    return {
      outreach: {
        ...parsed,
        score: lead.opportunity_score,
        skip: false,
      },
      engineUsed: 'gemini_ai',
      quotaNotice: null,
    };
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      return {
        outreach: buildPlaybookOutreachForLead(lead, packages),
        engineUsed: 'free_playbook',
        quotaNotice: summarizeGeminiNotice(err),
      };
    }
    throw err;
  }
}

export async function generateProspectReply(params: {
  lead: LeadRecord | null;
  prospectMessage: string;
  packages: AgencyPackagesConfig;
  engineMode?: EngineMode;
}): Promise<{
  reply: string;
  shouldMarkClosed: boolean;
  engineUsed: 'gemini_ai' | 'free_playbook';
  quotaNotice: string | null;
}> {
  const engineMode: EngineMode = params.engineMode ?? 'auto';
  if (engineMode === 'free') {
    const playbook = buildPlaybookReply(params);
    return {
      ...playbook,
      engineUsed: 'free_playbook',
      quotaNotice: null,
    };
  }

  try {
    const ai = getAiClient();
    const packagesSummary = params.packages.tiers
      .map(
        (t) =>
          `${t.name.toUpperCase()} — ₦${t.priceNaira.toLocaleString('en-NG')} (${t.pagesLabel}): ${t.features.join(', ')}`
      )
      .join('\n');

    const prompt = `You are replying on behalf of Stepstone Web Agency (Abuja, Nigeria, run by Jaydee) to a real estate prospect's message.

PROSPECT CONTEXT:
${
      params.lead
        ? `Company: ${params.lead.business_name} (${params.lead.business_category}, ${params.lead.state})\nWebsite status: ${params.lead.website_status}\nVerified note: ${params.lead.inspection_evidence}`
        : 'General Nigerian real estate prospect inquiry'
    }

PROSPECT MESSAGE:
"${params.prospectMessage}"

CURRENT AGENCY PACKAGES (Delivery: ${params.packages.deliveryTimeline}):
${packagesSummary}

JAYDEE AUTHORIZATION FOR PAYMENT SPLIT / DISCOUNT:
${params.packages.authorizePaymentSplit ? 'AUTHORIZED: If the prospect objects to price, you may offer Basic or a structured 50/50 payment split.' : 'NOT AUTHORIZED: Do NOT offer discounts or payment splits automatically. If they object to price, you may mention the Basic package (₦' + (params.packages.tiers[0]?.priceNaira.toLocaleString('en-NG') ?? '55,000') + ') without inventing unauthorized discounts.'}

PART 9 & PART 7 RULES:
- Answer their actual question first. Keep responses short, natural, polite Nigerian business English.
- If asked how a website gets clients: explain honestly how it provides a destination for property listings, improves accessibility, supports social ads, and gives buyers direct inquiry channels (WhatsApp & forms). NEVER promise a specific number of clients, sales, or guaranteed revenue.
- If asked about price: share all 3 packages clearly and recommend Standard for established firms.
- If asked about package differences: explain briefly and clearly.
- If they say they will get back: respond politely without pressure.
- If they say stop or not interested: give a polite goodbye and set should_mark_closed = true.

Return JSON with "reply" (string) and "should_mark_closed" (boolean).`;

    const response = await generateWithFallback(ai, {
      contents: prompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          should_mark_closed: { type: Type.BOOLEAN },
        },
        required: ['reply', 'should_mark_closed'],
      },
      primaryThinking: ThinkingLevel.LOW,
    });

    const parsed = parseJsonFromText<{ reply?: string; should_mark_closed?: boolean }>(
      response.text,
      { reply: '', should_mark_closed: false }
    );

    return {
      reply:
        parsed.reply ||
        'Thank you for your response. Please let us know if you would like to review a free homepage preview.',
      shouldMarkClosed: Boolean(parsed.should_mark_closed),
      engineUsed: 'gemini_ai',
      quotaNotice: null,
    };
  } catch (err) {
    if (engineMode === 'auto' && isQuotaOrKeyFallbackError(err)) {
      const playbook = buildPlaybookReply(params);
      return {
        ...playbook,
        engineUsed: 'free_playbook',
        quotaNotice: summarizeGeminiNotice(err),
      };
    }
    throw err;
  }
}
