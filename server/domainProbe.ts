import dns from 'dns/promises';

export interface CandidateDomainHint {
  domainOrUrl: string;
  source: 'email_domain' | 'email_handle' | 'description_text' | 'name_permutation';
  strongIdentity: boolean;
}

export interface VerifiedDomainMatch {
  websiteUrl: string;
  matchedHost: string;
  matchReason: string;
  sourceUrls: string[];
  discoveredInstagramUrl: string | null;
  discoveredFacebookUrl: string | null;
  checkedHostsCount: number;
  dnsResolvedCount: number;
  factualNote: string;
}

const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
]);

const GENERIC_EMAIL_HANDLES = new Set([
  'info',
  'contact',
  'sales',
  'admin',
  'support',
  'hello',
  'enquiries',
  'enquiry',
  'office',
  'realtor',
  'realtors',
  'realestate',
  'property',
  'properties',
  'homes',
  'estate',
  'estates',
  'marketing',
  'customercare',
  'careers',
  'hr',
]);

const LEGAL_SUFFIX_WORDS = new Set([
  'limited',
  'ltd',
  'plc',
  'llp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'nig',
  'nigeria',
  'ventures',
  'enterprises',
  'enterprise',
]);

const GENERIC_INDUSTRY_WORDS = new Set([
  'real',
  'estate',
  'estates',
  'property',
  'properties',
  'realtor',
  'realtors',
  'homes',
  'home',
  'housing',
  'development',
  'developers',
  'developer',
  'management',
  'consult',
  'consulting',
  'consultants',
  'construction',
  'engineering',
  'investment',
  'investments',
  'global',
  'international',
  'group',
  'services',
  'service',
  'projects',
  'project',
  'center',
  'centre',
  'ventures',
  'limited',
  'ltd',
  'plc',
  'nigeria',
  'nig',
  'co',
  'company',
  'abuja',
  'lagos',
  'port',
  'harcourt',
  'ibadan',
  'kano',
  'the',
  'and',
  'of',
  'for',
  'in',
]);

const PARKED_DOMAIN_PATTERN =
  /domain is for sale|for sale\s*::|buy this domain|this domain may be for sale|inquire about this domain|make an offer on this domain|sedoparking|hugedomains|dan\.com\/buy-domain|afternic|parkingcrew|bodis\.com|domainmarket|godaddy\.com\/domainsearch|cgi-sys\/defaultwebpage|account suspended/i;

const REAL_ESTATE_CONTEXT_PATTERN =
  /real estate|property|properties|estate|homes|housing|realtor|developer|development|construction|apartments|duplex|terrace|bungalow|plots|land|mortgage|facility management|abuja|lagos|nigeria/gi;

const SOCIAL_HOST_IGNORE =
  /finelib\.com|instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|linktr\.ee|twitter\.com|x\.com|linkedin\.com|tiktok\.com|youtube\.com|google\.com|goo\.gl/i;

/**
 * Decodes Cloudflare `/cdn-cgi/l/email-protection#hex` obfuscated email addresses.
 */
export function decodeCloudflareEmailHex(hex: string): string | null {
  const clean = hex.trim();
  if (!/^[0-9a-f]{6,}$/i.test(clean) || clean.length % 2 !== 0) return null;
  try {
    const key = parseInt(clean.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16) ^ key;
      out += String.fromCharCode(code);
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function extractEmailHintsFromHtml(rawHtml: string): {
  emails: string[];
  corporateEmailDomains: string[];
  brandEmailHandles: string[];
} {
  const decoded = rawHtml
    .replace(/&#64;|&#x40;|&commat;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));

  const foundEmails = new Set<string>();

  for (const m of decoded.matchAll(/email-protection#([0-9a-f]+)/gi)) {
    const addr = decodeCloudflareEmailHex(m[1]);
    if (addr) foundEmails.add(addr);
  }

  for (const m of decoded.matchAll(/\b([a-z0-9._%+-]{2,}@[a-z0-9.-]+\.[a-z]{2,})\b/gi)) {
    const addr = m[1].toLowerCase();
    if (!addr.includes('finelib.com') && !addr.includes('example.com')) {
      foundEmails.add(addr);
    }
  }

  const corporateEmailDomains = new Set<string>();
  const brandEmailHandles = new Set<string>();

  for (const email of foundEmails) {
    const [localPart, domainPart] = email.split('@');
    if (!localPart || !domainPart) continue;
    const cleanDomain = domainPart.replace(/^www\./, '').toLowerCase();
    if (FREE_WEBMAIL_DOMAINS.has(cleanDomain)) {
      const compactLocal = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (compactLocal.length >= 6 && !GENERIC_EMAIL_HANDLES.has(compactLocal)) {
        brandEmailHandles.add(compactLocal);
      }
    } else if (!SOCIAL_HOST_IGNORE.test(cleanDomain)) {
      corporateEmailDomains.add(cleanDomain);
    }
  }

  return {
    emails: Array.from(foundEmails),
    corporateEmailDomains: Array.from(corporateEmailDomains),
    brandEmailHandles: Array.from(brandEmailHandles),
  };
}

export function extractTextDomainsFromSnippet(snippet: string): string[] {
  const domains = new Set<string>();
  const matches = snippet.matchAll(
    /(?:https?:\/\/|www\.)([a-z0-9-]+(?:\.[a-z0-9-]+)+)|(?<![a-z0-9@.])([a-z0-9-]{4,}\.(?:com\.ng|ng|com|org|africa|net))(?![a-z0-9.-])/gi
  );
  for (const m of matches) {
    const rawHost = (m[1] || m[2] || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (
      !rawHost ||
      rawHost.length < 5 ||
      SOCIAL_HOST_IGNORE.test(rawHost) ||
      FREE_WEBMAIL_DOMAINS.has(rawHost) ||
      /\.(png|jpe?g|gif|webp|svg|css|js|pdf|php|html?)$/i.test(rawHost)
    ) {
      continue;
    }
    domains.add(rawHost);
  }
  return Array.from(domains);
}

function tokenizeBusinessName(businessName: string): {
  allWords: string[];
  nonLegalWords: string[];
  brandWords: string[];
  distinctiveTokens: string[];
} {
  const cleaned = businessName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const allWords = cleaned.split(' ').filter(Boolean);
  const nonLegalWords = allWords.filter((w) => !LEGAL_SUFFIX_WORDS.has(w));
  const coreNonLegal = nonLegalWords.length > 0 ? nonLegalWords : allWords;
  const brandWords = coreNonLegal.filter((w) => !GENERIC_INDUSTRY_WORDS.has(w));
  const finalBrandWords = brandWords.length > 0 ? brandWords : coreNonLegal;
  const distinctiveTokens = finalBrandWords.filter((w) => w.length >= 3);

  return {
    allWords,
    nonLegalWords: coreNonLegal,
    brandWords: finalBrandWords,
    distinctiveTokens: distinctiveTokens.length > 0 ? distinctiveTokens : finalBrandWords,
  };
}

function generateDomainCandidates(params: {
  businessName: string;
  corporateEmailDomains?: string[];
  brandEmailHandles?: string[];
  textDomainHints?: string[];
}): CandidateDomainHint[] {
  const seen = new Set<string>();
  const out: CandidateDomainHint[] = [];

  const add = (
    host: string,
    source: CandidateDomainHint['source'],
    strongIdentity: boolean
  ) => {
    const clean = host
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .trim();
    if (!clean || clean.length < 4 || !clean.includes('.') || seen.has(clean)) return;
    if (FREE_WEBMAIL_DOMAINS.has(clean) || SOCIAL_HOST_IGNORE.test(clean)) return;
    seen.add(clean);
    out.push({ domainOrUrl: clean, source, strongIdentity });
  };

  for (const d of params.corporateEmailDomains ?? []) {
    add(d, 'email_domain', true);
  }
  for (const d of params.textDomainHints ?? []) {
    add(d, 'description_text', true);
  }
  for (const handle of params.brandEmailHandles ?? []) {
    add(`${handle}.com`, 'email_handle', false);
    add(`${handle}.com.ng`, 'email_handle', false);
    add(`${handle}.ng`, 'email_handle', false);
  }

  const { allWords, nonLegalWords, brandWords } = tokenizeBusinessName(params.businessName);
  const allJoined = allWords.join('');
  const nonLegalJoined = nonLegalWords.join('');
  const nonLegalNoAnd = nonLegalWords.filter((w) => w !== 'and').join('');
  const brandJoined = brandWords.join('');

  if (nonLegalJoined.length >= 4) {
    add(`${nonLegalJoined}.com`, 'name_permutation', nonLegalJoined.length >= 8);
    add(`${nonLegalJoined}.com.ng`, 'name_permutation', nonLegalJoined.length >= 8);
    add(`${nonLegalJoined}.ng`, 'name_permutation', nonLegalJoined.length >= 8);
  }

  if (allJoined.length >= 6 && allJoined !== nonLegalJoined) {
    add(`${allJoined}.com`, 'name_permutation', true);
    add(`${allJoined}.com.ng`, 'name_permutation', true);
  }

  if (nonLegalNoAnd.length >= 5 && nonLegalNoAnd !== nonLegalJoined) {
    add(`${nonLegalNoAnd}.com`, 'name_permutation', nonLegalNoAnd.length >= 8);
    add(`${nonLegalNoAnd}.com.ng`, 'name_permutation', nonLegalNoAnd.length >= 8);
  }

  if (nonLegalWords.length >= 2 && nonLegalJoined.length >= 5) {
    const hyphenated = nonLegalWords.join('-');
    add(`${hyphenated}.com`, 'name_permutation', nonLegalJoined.length >= 8);
    add(`${hyphenated}.com.ng`, 'name_permutation', nonLegalJoined.length >= 8);
  }

  if (brandJoined.length >= 5 && brandJoined !== nonLegalJoined) {
    add(`${brandJoined}.com`, 'name_permutation', false);
    add(`${brandJoined}.com.ng`, 'name_permutation', false);
    add(`${brandJoined}.ng`, 'name_permutation', false);
  }

  if (brandJoined.length >= 4) {
    const suffixes = ['nigeria', 'africa', 'homes', 'properties', 'group', 'estates'];
    for (const sfx of suffixes) {
      if (!nonLegalJoined.endsWith(sfx)) {
        add(`${brandJoined}${sfx}.com`, 'name_permutation', false);
        add(`${brandJoined}${sfx}.com.ng`, 'name_permutation', false);
      }
    }
  }

  if (nonLegalJoined.length >= 4 && !nonLegalJoined.includes('nigeria')) {
    add(`${nonLegalJoined}nigeria.com`, 'name_permutation', false);
    add(`${nonLegalJoined}nigeria.com.ng`, 'name_permutation', false);
  }

  return out.slice(0, 36);
}

async function resolveHostDns(host: string, timeoutMs = 1800): Promise<boolean> {
  try {
    const ips = await Promise.race([
      dns.resolve4(host),
      new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error('DNS timeout')), timeoutMs)
      ),
    ]);
    return Array.isArray(ips) && ips.length > 0;
  } catch {
    // Also try www.<host> in case apex A record isn't set
    try {
      const ips = await Promise.race([
        dns.resolve4(`www.${host}`),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error('DNS timeout')), timeoutMs)
        ),
      ]);
      return Array.isArray(ips) && ips.length > 0;
    } catch {
      return false;
    }
  }
}

async function fetchCandidateHtml(
  host: string,
  timeoutMs = 7500
): Promise<{
  finalUrl: string;
  status: number;
  html: string;
  wafBlocked: boolean;
} | null> {
  const tryScheme = async (scheme: 'https' | 'http') => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${scheme}://${host}`, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-NG,en;q=0.9',
        },
      });
      const html = res.status === 200 || res.status < 400 ? (await res.text()).slice(0, 180000) : '';
      const isChallenge =
        res.status === 403 ||
        res.status === 429 ||
        /cf-browser-verification|just a moment\.\.\.|attention required! \| cloudflare/i.test(html);

      return {
        finalUrl: res.url || `${scheme}://${host}`,
        status: res.status,
        html,
        wafBlocked: isChallenge,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const httpsResult = await tryScheme('https');
  if (httpsResult) return httpsResult;
  return await tryScheme('http');
}

function verifyHtmlBelongsToBusiness(params: {
  html: string;
  finalUrl: string;
  candidate: CandidateDomainHint;
  businessName: string;
  state: string;
  city: string;
  phone: string | null;
}): {
  matched: boolean;
  reason: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
} {
  const { html, finalUrl, candidate, businessName, state, city, phone } = params;
  const decodedLower = html
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, ' ')
    .toLowerCase();

  if (PARKED_DOMAIN_PATTERN.test(decodedLower)) {
    return { matched: false, reason: 'Parked/for-sale domain', instagramUrl: null, facebookUrl: null };
  }

  // Redirect to a social profile (like instagram.com)
  if (SOCIAL_HOST_IGNORE.test(new URL(finalUrl).hostname)) {
    const isIg = /instagram\.com/i.test(finalUrl);
    const isFb = /facebook\.com|fb\.com/i.test(finalUrl);
    return {
      matched: candidate.strongIdentity,
      reason: `Redirects to social profile (${finalUrl})`,
      instagramUrl: isIg ? finalUrl : null,
      facebookUrl: isFb ? finalUrl : null,
    };
  }

  const compactHtml = decodedLower.replace(/[^a-z0-9]/g, '');
  const { nonLegalWords, brandWords, distinctiveTokens } = tokenizeBusinessName(businessName);
  const nonLegalSlug = nonLegalWords.join('');
  const brandSlug = brandWords.join('');

  // Extract phone tail (last 7 digits) if present
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  const phoneTail = phoneDigits.length >= 7 ? phoneDigits.slice(-7) : null;
  const phoneMatched = Boolean(phoneTail && compactHtml.includes(phoneTail));

  // Brand matches
  const slugMatched =
    (nonLegalSlug.length >= 6 && compactHtml.includes(nonLegalSlug)) ||
    (brandSlug.length >= 6 && compactHtml.includes(brandSlug));

  const matchedDistinctive = distinctiveTokens.filter((tok) => decodedLower.includes(tok));
  const requiredTokens =
    distinctiveTokens.length <= 2 ? distinctiveTokens.length : Math.max(2, distinctiveTokens.length - 1);
  const tokensMatched = matchedDistinctive.length >= requiredTokens;

  // Real estate / Nigerian location alignment
  const reMatches = decodedLower.match(REAL_ESTATE_CONTEXT_PATTERN) ?? [];
  const stateLower = state.toLowerCase().replace('fct (abuja)', 'abuja').replace(/\s*state$/, '');
  const locationMatched =
    decodedLower.includes('nigeria') ||
    decodedLower.includes(stateLower) ||
    (city.trim().length >= 3 && decodedLower.includes(city.trim().toLowerCase()));

  const hasIndustryOrLocation = reMatches.length >= 1 || locationMatched;

  const isBrandMatch = slugMatched || tokensMatched;
  const isVerified =
    phoneMatched ||
    (isBrandMatch && hasIndustryOrLocation) ||
    (candidate.source === 'email_domain' && hasIndustryOrLocation);

  if (!isVerified) {
    return {
      matched: false,
      reason: `Brand/industry check failed (tokens=${matchedDistinctive.length}/${distinctiveTokens.length}, reHits=${reMatches.length})`,
      instagramUrl: null,
      facebookUrl: null,
    };
  }

  // Extract official social links from verified homepage HTML
  let instagramUrl: string | null = null;
  let facebookUrl: string | null = null;
  const igMatch = html.match(
    /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|share\b)([A-Za-z0-9_.-]+)\/?/i
  );
  if (igMatch) instagramUrl = igMatch[0];

  const fbMatch = html.match(
    /https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/(?!sharer|share\.php|tr\b|plugins\b)([A-Za-z0-9_.-]+)\/?/i
  );
  if (fbMatch) facebookUrl = fbMatch[0];

  const matchBasis = phoneMatched
    ? 'verified phone match + brand identity'
    : candidate.source === 'email_domain'
    ? 'corporate email domain + live HTTP site match'
    : `live HTTP brand & Nigerian real-estate match (${matchedDistinctive.join(', ') || brandSlug})`;

  return {
    matched: true,
    reason: matchBasis,
    instagramUrl,
    facebookUrl,
  };
}

/**
 * Zero-cost multi-layer website probe:
 * 1. Inspects corporate email domains, email brand handles, and plain-text domains from directory records.
 * 2. Generates prioritized Nigerian real-estate domain permutations (.com, .com.ng, .ng) and runs fast parallel DNS.
 * 3. Fetches live HTML of resolved hosts and verifies Nigerian real-estate & company identity before accepting.
 */
export async function probeCompanyWebsiteFree(params: {
  business_name: string;
  state: string;
  city: string;
  phone: string | null;
  rawHtmlSnippets?: string[];
  corporateEmailDomains?: string[];
  brandEmailHandles?: string[];
  textDomainHints?: string[];
}): Promise<VerifiedDomainMatch | null> {
  const emailHints =
    params.rawHtmlSnippets && params.rawHtmlSnippets.length > 0
      ? extractEmailHintsFromHtml(params.rawHtmlSnippets.join('\n'))
      : { corporateEmailDomains: [], brandEmailHandles: [] };

  const textHints =
    params.rawHtmlSnippets && params.rawHtmlSnippets.length > 0
      ? extractTextDomainsFromSnippet(params.rawHtmlSnippets.join('\n'))
      : [];

  const candidates = generateDomainCandidates({
    businessName: params.business_name,
    corporateEmailDomains: [
      ...(params.corporateEmailDomains ?? []),
      ...emailHints.corporateEmailDomains,
    ],
    brandEmailHandles: [
      ...(params.brandEmailHandles ?? []),
      ...emailHints.brandEmailHandles,
    ],
    textDomainHints: [...(params.textDomainHints ?? []), ...textHints],
  });

  if (candidates.length === 0) return null;

  const dnsChecks = await Promise.all(
    candidates.map(async (c) => ({
      candidate: c,
      resolved: await resolveHostDns(c.domainOrUrl, 1800),
    }))
  );

  const resolvedHits = dnsChecks.filter((d) => d.resolved).map((d) => d.candidate);
  if (resolvedHits.length === 0) {
    return null;
  }

  // Verify top up to 6 DNS-resolved domains via HTTP HTML check in parallel
  const toFetch = resolvedHits.slice(0, 6);
  const fetched = await Promise.all(
    toFetch.map(async (cand) => ({
      candidate: cand,
      response: await fetchCandidateHtml(cand.domainOrUrl, 7500),
    }))
  );

  for (const item of fetched) {
    const res = item.response;
    if (!res) continue;

    if (res.wafBlocked && item.candidate.strongIdentity) {
      return {
        websiteUrl: res.finalUrl,
        matchedHost: item.candidate.domainOrUrl,
        matchReason: `HTTP ${res.status} WAF challenge on exact corporate/brand domain`,
        sourceUrls: [res.finalUrl],
        discoveredInstagramUrl: null,
        discoveredFacebookUrl: null,
        checkedHostsCount: candidates.length,
        dnsResolvedCount: resolvedHits.length,
        factualNote: `Checked ${candidates.length} domain clues/permutations via DNS (${resolvedHits.length} resolved) and found active WAF-protected corporate domain ${res.finalUrl}.`,
      };
    }

    if (res.status >= 400 || !res.html) {
      continue;
    }

    const check = verifyHtmlBelongsToBusiness({
      html: res.html,
      finalUrl: res.finalUrl,
      candidate: item.candidate,
      businessName: params.business_name,
      state: params.state,
      city: params.city,
      phone: params.phone,
    });

    if (check.matched) {
      return {
        websiteUrl: res.finalUrl,
        matchedHost: item.candidate.domainOrUrl,
        matchReason: check.reason,
        sourceUrls: [res.finalUrl],
        discoveredInstagramUrl: check.instagramUrl,
        discoveredFacebookUrl: check.facebookUrl,
        checkedHostsCount: candidates.length,
        dnsResolvedCount: resolvedHits.length,
        factualNote: `Directory URL was blank; verified official website ${res.finalUrl} via ${check.reason} (${candidates.length} domain permutations checked).`,
      };
    }
  }

  return null;
}

export function buildNoWebsiteProbeSummary(businessName: string, hadEmailHints: boolean): string {
  const count = generateDomainCandidates({ businessName }).length;
  return `Checked directory URL${hadEmailHints ? ', email/description clues,' : ''} and ${count} Nigerian domain permutations (.com/.com.ng/.ng) via DNS+HTTP — no active official domain verified.`;
}
