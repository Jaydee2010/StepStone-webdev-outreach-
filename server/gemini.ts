import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgencyPackagesConfig,
  ChatMessage,
  LeadRecord,
  ModeBOutreachRecord,
  WebsiteClassification,
} from '../src/types/stepstone.ts';
import type { HttpInspectionReport } from './inspector.ts';
import { inspectWebsiteUrl, normalizeUrlInput } from './inspector.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check the Settings > Secrets panel.'
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
}

export async function discoverBusinessesWithSearch(params: {
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
  const ai = getAiClient();
  const isAllStates = params.selectedState === 'All Nigerian States';
  const keywordsUsed =
    params.customKeywords && params.customKeywords.length > 0
      ? params.customKeywords
      : [
          `Real estate companies in ${isAllStates ? 'Nigeria' : params.selectedState}`,
          `Property developers in ${isAllStates ? 'Nigeria' : params.selectedState}`,
          `Estate development companies in ${isAllStates ? 'Nigeria' : params.selectedState}`,
          `Property management companies in ${isAllStates ? 'Nigeria' : params.selectedState}`,
        ];

  const excludeSlice = params.existingBusinessNames.slice(0, 60);
  const targetCount = Math.min(Math.max(params.maxResults ?? 6, 3), 10);

  const locationConstraint = isAllStates
    ? `Target location: All Nigerian States. For every company, accurately identify and label its actual Nigerian state.`
    : `Target location: ${params.selectedState}, Nigeria ONLY.
STRICT LOCATION RULES:
- Search ONLY inside ${params.selectedState}.
- NEVER include businesses headquartered or primarily operating in neighboring or other Nigerian states.
- NEVER automatically switch to another state if results are limited.
- If fewer than ${targetCount} genuine companies are verified in ${params.selectedState}, return only what was genuinely verified and explain honestly in "honest_note".`;

  const prompt = `You are the business discovery engine for Stepstone Web Agency.
Search Google using multiple real estate search angles:
${keywordsUsed.map((k) => `- "${k}"`).join('\n')}

${locationConstraint}

Target market priority:
- Prioritize established real estate companies, property developers, estate development companies, property investment firms, and property management firms over individual property agents.
- Avoid these already-discovered businesses: ${excludeSlice.length > 0 ? excludeSlice.join('; ') : 'None yet'}.

DATA INTEGRITY RULES (CRITICAL):
- NEVER invent business names, phone numbers, addresses, websites, Instagram handles, or listings.
- Set any unverified field to null (phone, website_url, instagram_url, facebook_url, google_business_profile_url).
- Distinguish official company websites from business directories (e.g., Nigeria Property Centre, BusinessList, Finelib, VConnect). If only a directory page was found, put the directory URL in source_urls and leave website_url as null!

Return ONLY a valid JSON object with this exact shape:
{
  "honest_note": "Concise factual summary of what searches yielded in the selected state.",
  "companies": [
    {
      "business_name": "Exact company name",
      "business_category": "e.g. Property Developer | Estate Development Company | Real Estate Company | Property Management Firm",
      "state": "${isAllStates ? 'Actual Nigerian State' : params.selectedState}",
      "city": "City or district (e.g. Maitama, Wuse II, Gwarinpa, Lekki, GRA)",
      "phone": "+234... or null",
      "website_url": "https://... or null",
      "instagram_url": "https://instagram.com/... or null",
      "facebook_url": "https://facebook.com/... or null",
      "google_business_profile_url": "https://... or null",
      "source_urls": ["https://..."],
      "discovery_notes": "Brief factual evidence of active company operations or listings found."
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    },
  });

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

  companies = companies.slice(0, targetCount).map((c) => {
    const mergedSources = Array.from(
      new Set([...(Array.isArray(c.source_urls) ? c.source_urls : []), ...groundingUrls.slice(0, 3)])
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
  }).filter((c) => c.business_name.length > 1);

  return {
    candidates: companies,
    honestNote:
      parsed.honest_note ||
      `Searched ${params.selectedState} across multiple real estate categories and found ${companies.length} candidate companies.`,
    keywordsUsed,
    groundingUrls,
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

Search using:
1. "${company.business_name}"
2. "${company.business_name}" ${company.state}
3. "${company.business_name}" instagram OR website

Distinguish genuine official company domains from directory listings (Nigeria Property Centre, BusinessList, Finelib, LinkedIn, etc.) and unrelated companies with similar names.
Return ONLY valid JSON:
{
  "website_url": "official domain URL or null",
  "instagram_url": "official instagram profile URL or null",
  "facebook_url": "official facebook page URL or null",
  "lookup_notes": "factual note of what was found or not found",
  "source_urls": ["https://..."]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
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

export async function inspectAndQualifyCandidate(
  raw: RawDiscoveredCompany
): Promise<LeadRecord> {
  let websiteUrl = raw.website_url;
  let instagramUrl = raw.instagram_url;
  let facebookUrl = raw.facebook_url;
  let lookupNotes = raw.discovery_notes;
  let allSources = [...raw.source_urls];

  // Step 1: If website_url is missing, run targeted Step 1 Website Discovery
  if (!websiteUrl) {
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
      // Keep original discovery details if secondary lookup fails transiently
    }
  }

  // Step 2 & 3: Real server-side HTTP destination & functionality check
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

  // Step 4 & Part 5: Classify website and qualify prospect (1–5) using verified evidence
  const ai = getAiClient();
  const today = new Date().toISOString().slice(0, 10);

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

CLASSIFICATION RULES (choose exactly ONE):
- "no_website": No identifiable official website discovered after reasonable research and no primary social presence.
- "instagram_only": Uses Instagram as primary online presence without an independent website (or website URL redirects to Instagram).
- "social_only": Identifiable Facebook/WhatsApp/other social presence without a verified independent website.
- "broken_website": Official website repeatedly failed to load or returned confirmed 404/5xx/DNS failure (NOT a single 403/429 WAF block).
- "weak_website": Website loads but has significant identifiable design, mobile viewport, contact, inquiry form, or functionality shortcomings.
- "good_website": Website loads cleanly with working structure, mobile viewport, and professional presence.
- "unknown": Evidence is insufficient or access was blocked by WAF/bot protection (403/429) so functionality could not be verified.

QUALIFICATION SCORING RULES (1 to 5):
- 5 = Excellent prospect (established company/developer with no_website, instagram_only, social_only, or broken_website + active evidence).
- 4 = Strong prospect (real estate firm/developer with clear website opportunity or weak_website).
- 3 = Potential prospect (moderate opportunity or smaller firm with weak/missing site).
- 2 = Weak prospect (good_website with minor improvements, or unverified/individual agent).
- 1 = Poor prospect (strong existing website, inactive, or unknown status without clear need).
- If score is 1 or 2, skip MUST be true. Otherwise skip MUST be false.
- Do NOT invent inspection facts not present in the HTTP report or discovery notes.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: qualificationPrompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          website_status: {
            type: Type.STRING,
            description:
              'One of: no_website, instagram_only, social_only, broken_website, weak_website, good_website, unknown',
          },
          inspection_evidence: {
            type: Type.STRING,
            description: 'Concise factual reason and evidence observed.',
          },
          confidence: {
            type: Type.STRING,
            description: 'High, Medium, or Low',
          },
          opportunity_score: {
            type: Type.INTEGER,
            description: 'Integer from 1 to 5',
          },
          qualification_reason: {
            type: Type.STRING,
            description: 'Concise justification for the score',
          },
          skip: {
            type: Type.BOOLEAN,
          },
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
    },
  });

  const result = parseJsonFromText<{
    website_status?: WebsiteClassification;
    inspection_evidence?: string;
    confidence?: 'High' | 'Medium' | 'Low';
    opportunity_score?: number;
    qualification_reason?: string;
    skip?: boolean;
  }>(response.text, {});

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
    result.website_status as WebsiteClassification
  )
    ? (result.website_status as WebsiteClassification)
    : websiteUrl
    ? 'unknown'
    : instagramUrl
    ? 'instagram_only'
    : facebookUrl
    ? 'social_only'
    : 'no_website';

  const score = Math.min(5, Math.max(1, Number(result.opportunity_score ?? 3)));
  const skip = score <= 2 ? true : Boolean(result.skip);

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
      result.inspection_evidence ||
      httpReport?.factual_summary ||
      lookupNotes ||
      'No independent website discovered.',
    inspection_date: httpReport?.inspection_date ?? today,
    confidence:
      result.confidence === 'High' ||
      result.confidence === 'Medium' ||
      result.confidence === 'Low'
        ? result.confidence
        : httpReport
        ? 'High'
        : 'Medium',
    source_urls: allSources,
    opportunity_score: score,
    qualification_reason:
      result.qualification_reason || 'Qualified based on discovered real estate profile.',
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

export async function generateOutreachForLead(
  lead: LeadRecord,
  packages: AgencyPackagesConfig
): Promise<ModeBOutreachRecord> {
  if (lead.skip || lead.opportunity_score <= 2) {
    throw new Error(
      `Outreach is blocked for "${lead.business_name}" because it is marked skip (score ${lead.opportunity_score}/5).`
    );
  }

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
2. FIRST WHATSAPP MESSAGE:
   - Strictly UNDER 60 words.
   - Friendly Nigerian business English (warm, respectful, concise — no slang overload).
   - Greet by company name.
   - Mention ONE specific, verified observation from inspection_evidence.
   - Offer the free homepage preview.
   - End with ONE easy question.
   - NO prices or package lists.
   - Maximum ONE emoji (or zero).
   - Never pretend to be a customer.
   - Honest marketing: never promise a specific number of clients, sales, or guaranteed revenue.
3. INSTAGRAM MESSAGE:
   - Maximum 40 words. Same verified observation + free preview offer + easy question.
4. FOLLOW-UP 1 (DAY 2):
   - Under 40 words. Introduce something useful (e.g., direct inquiry capture alongside Instagram/WhatsApp) or ask a gentle question.
5. FOLLOW-UP 2 (DAY 5):
   - Under 40 words. Politely close the conversation and leave the door open without pressure.
6. PREVIEW BRIEF (PART 10):
   - Detailed image-generation brief for a concept homepage mockup.
   - Specify: the exact company name ("${lead.business_name}"), company name as logo text, brand colours (note "neutral architectural slate & warm sand unless official brand colours are provided" if unknown — do not invent branding), suitable Nigerian property image (e.g. modern Abuja/Lagos residential development matching ${lead.state}), professional real estate website layout, clear headline, property showcase section, WhatsApp contact button, both mobile and desktop presentation, appropriate portrait composition, and explicitly marked as a "Concept Homepage Preview" (not an existing website).`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
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
    },
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
    ...parsed,
    score: lead.opportunity_score,
    skip: false,
  };
}

export async function generateProspectReply(params: {
  lead: LeadRecord | null;
  prospectMessage: string;
  packages: AgencyPackagesConfig;
}): Promise<{ reply: string; shouldMarkClosed: boolean }> {
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          should_mark_closed: { type: Type.BOOLEAN },
        },
        required: ['reply', 'should_mark_closed'],
      },
    },
  });

  const parsed = parseJsonFromText<{ reply?: string; should_mark_closed?: boolean }>(
    response.text,
    { reply: '', should_mark_closed: false }
  );

  return {
    reply: parsed.reply || 'Thank you for your response. Please let us know if you would like to review a free homepage preview.',
    shouldMarkClosed: Boolean(parsed.should_mark_closed),
  };
}

export async function chatWithStepstoneBrain(params: {
  history: ChatMessage[];
  userMessage: string;
  selectedState: string;
  leads: LeadRecord[];
  packages: AgencyPackagesConfig;
}): Promise<string> {
  const ai = getAiClient();

  const qualifiedCount = params.leads.filter((l) => !l.skip).length;
  const statusBreakdown = params.leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.website_status] = (acc[lead.website_status] ?? 0) + 1;
    return acc;
  }, {});

  const recentLeadsSnippet = params.leads.slice(0, 12).map((l) => ({
    business_name: l.business_name,
    state: l.state,
    city: l.city,
    website_status: l.website_status,
    opportunity_score: l.opportunity_score,
    skip: l.skip,
    website_url: l.website_url,
    instagram_url: l.instagram_url,
  }));

  const packagesSnippet = params.packages.tiers
    .map((t) => `${t.name}: ₦${t.priceNaira.toLocaleString('en-NG')} (${t.pagesLabel})`)
    .join(' | ');

  const systemInstruction = `You are the Stepstone Web Agency Brain — the central business discovery, website intelligence, qualification, and outreach system for Stepstone Web Agency in Abuja, Nigeria, run by Jaydee.

WHO YOU ARE & WHAT YOU DO:
- You help discover genuine Nigerian real estate businesses (real estate companies, property developers, estate development firms, property investment & management firms), investigate their websites with live HTTP checks, classify their web presence, qualify leads (1-5), generate Mode B outreach (WhatsApp, Instagram, Day 2 & Day 5 follow-ups), handle prospect replies, and produce Concept Homepage Preview briefs.
- Strict Location Rule: The user controls the state dropdown (currently set to: ${params.selectedState}). Never automatically switch or expand states.
- Honest Marketing Rule: Websites build trust, showcase properties, and capture direct inquiries; never promise guaranteed sales or specific client counts.
- Packages (${params.packages.deliveryTimeline}): ${packagesSnippet}. Payment split authorized: ${params.packages.authorizePaymentSplit ? 'Yes' : 'No'}.

CURRENT PIPELINE SNAPSHOT:
- Total stored leads: ${params.leads.length} (Qualified: ${qualifiedCount})
- Website status breakdown: ${JSON.stringify(statusBreakdown)}
- Sample stored leads: ${JSON.stringify(recentLeadsSnippet)}

Be crisp, practical, well-structured, and strictly honest—never invent business leads or metrics not present in the snapshot above. If the user wants to run a live Google-grounded discovery search, guide them to click "Run Discovery" in the top bar (or select any Nigerian state first).`;

  const contents = [
    ...params.history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: params.userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  return response.text || 'I could not generate a response right now. Please try again.';
}
