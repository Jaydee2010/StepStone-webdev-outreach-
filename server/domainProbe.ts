import dns from 'dns/promises';

export interface CandidateDomainHint {
  domainOrUrl: string;
  source:
    | 'email_domain'
    | 'description_text'
    | 'social_handle'
    | 'email_handle'
    | 'name_permutation';
  strongIdentity: boolean;
}

export interface VerifiedDomainMatch {
  websiteUrl: string;
  matchedHost: string;
  matchReason: string;
  wafProtected: boolean;
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
  'companies',
  'associates',
  'partners',
  'nig',
  'nigeria',
  'ventures',
  'enterprises',
  'enterprise',
  'of',
  'the',
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
  'developments',
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
  'holdings',
  'limited',
  'ltd',
  'plc',
  'nigeria',
  'nig',
  'ng',
  'co',
  'company',
  'companies',
  'associates',
  'partners',
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
  /domain is for sale|for sale\s*::|buy this domain|this domain may be for sale|inquire about this domain|make an offer on this domain|contact with domain owner|epik\.com|this domain is parked|domain is parked|available for purchase|get this domain|sedoparking|hugedomains|dan\.com\/buy-domain|afternic|parkingcrew|bodis\.com|domainmarket|godaddy\.com\/domainsearch|cgi-sys\/defaultwebpage|account suspended/i;

const PARKING_MARKETPLACE_HOST_PATTERN =
  /(^|\.)(hugedomains\.com|sedo\.com|sedoparking\.com|afternic\.com|dan\.com|godaddy\.com|namecheap\.com|bodis\.com|parkingcrew\.net|domainmarket\.com|buydomains\.com|atom\.com|squadhelp\.com|dynadot\.com|sav\.com|porkbun\.com|epik\.com|undeveloped\.com|uniregistry\.com)$/i;

const REAL_ESTATE_CONTEXT_PATTERN =
  /\b(real estate|property|properties|estate|estates|homes|housing|realtor|realtors|developer|developers|apartments|duplex|terrace|bungalow|plots|mortgage|facility management)\b/gi;

const NON_RE_TITLE_PATTERN =
  /\b(rave of technology|software company|it solutions|web design|logistics|fintech|fashion|clinic|hospital|church|school|restaurant)\b/i;

const SOCIAL_HOST_IGNORE =
  /finelib\.com|instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|linktr\.ee|twitter\.com|x\.com|linkedin\.com|tiktok\.com|youtube\.com|google\.com|goo\.gl/i;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, ' ');
}

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

export function extractSocialHandlesFromUrls(urls: Array<string | null | undefined>): string[] {
  const handles = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const seg = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
      const clean = seg.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        clean.length >= 5 &&
        !['p', 'reel', 'explore', 'share', 'sharer', 'pages', 'profile'].includes(clean)
      ) {
        handles.add(clean);
        const withoutOfficial = clean.replace(/(official|ng|limited|ltd)$/g, '');
        if (withoutOfficial.length >= 5) {
          handles.add(withoutOfficial);
        }
      }
    } catch {
      // Ignore malformed social URL
    }
  }
  return Array.from(handles);
}

export function extractAlternateEntityNames(text: string): string[] {
  const out: string[] = [];
  const matches = text.matchAll(
    /\b([A-Z][A-Za-z0-9&'-]+(?:\s+[A-Z][A-Za-z0-9&'-]+){1,4})\s+(?:Limited|Ltd|Plc|Properties|Homes|Estates|Group|Nigeria)\b/g
  );
  for (const m of matches) {
    const phrase = m[0].trim();
    if (phrase.length >= 8 && phrase.length <= 60 && !out.includes(phrase)) {
      out.push(phrase);
    }
  }
  return out.slice(0, 2);
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
  alternateNames?: string[];
  corporateEmailDomains?: string[];
  brandEmailHandles?: string[];
  socialHandles?: string[];
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
  for (const handle of params.socialHandles ?? []) {
    add(`${handle}.com`, 'social_handle', handle.length >= 7);
    add(`${handle}.com.ng`, 'social_handle', true);
    add(`${handle}.ng`, 'social_handle', true);
  }
  for (const handle of params.brandEmailHandles ?? []) {
    add(`${handle}.com`, 'email_handle', handle.length >= 7);
    add(`${handle}.com.ng`, 'email_handle', true);
    add(`${handle}.ng`, 'email_handle', true);
  }

  const namesToPermute = [params.businessName, ...(params.alternateNames ?? [])];

  for (const name of namesToPermute) {
    const { allWords, nonLegalWords, brandWords } = tokenizeBusinessName(name);
    const allJoined = allWords.join('');
    const nonLegalJoined = nonLegalWords.join('');
    const nonLegalNoAnd = nonLegalWords.filter((w) => w !== 'and').join('');
    const brandJoined = brandWords.join('');
    const firstWord = nonLegalWords[0] ?? '';

    if (nonLegalJoined.length >= 4) {
      add(`${nonLegalJoined}.com`, 'name_permutation', nonLegalJoined.length >= 6);
      add(`${nonLegalJoined}.com.ng`, 'name_permutation', true);
      add(`${nonLegalJoined}.ng`, 'name_permutation', true);
      add(`${nonLegalJoined}.org`, 'name_permutation', nonLegalJoined.length >= 8);
    }

    if (allJoined.length >= 6 && allJoined !== nonLegalJoined) {
      add(`${allJoined}.com`, 'name_permutation', true);
      add(`${allJoined}.com.ng`, 'name_permutation', true);
    }

    if (nonLegalNoAnd.length >= 5 && nonLegalNoAnd !== nonLegalJoined) {
      add(`${nonLegalNoAnd}.com`, 'name_permutation', nonLegalNoAnd.length >= 6);
      add(`${nonLegalNoAnd}.com.ng`, 'name_permutation', true);
      add(`${nonLegalNoAnd}.ng`, 'name_permutation', true);
    }

    if (nonLegalWords.length >= 2 && nonLegalJoined.length >= 5) {
      const hyphenated = nonLegalWords.join('-');
      add(`${hyphenated}.com`, 'name_permutation', nonLegalJoined.length >= 6);
      add(`${hyphenated}.com.ng`, 'name_permutation', true);

      const firstTwo = nonLegalWords.slice(0, 2).join('');
      const firstTwoHyphen = nonLegalWords.slice(0, 2).join('-');
      if (firstTwo.length >= 6 && firstTwo !== nonLegalJoined) {
        add(`${firstTwo}.com`, 'name_permutation', firstTwo.length >= 10);
        add(`${firstTwo}.com.ng`, 'name_permutation', firstTwo.length >= 8);
        add(`${firstTwo}.ng`, 'name_permutation', firstTwo.length >= 8);
        add(`${firstTwoHyphen}.com`, 'name_permutation', false);
      }
    }

    if (brandJoined.length >= 5 && brandJoined !== nonLegalJoined) {
      add(`${brandJoined}.com`, 'name_permutation', false);
      add(`${brandJoined}.com.ng`, 'name_permutation', true);
      add(`${brandJoined}.ng`, 'name_permutation', true);
    }

    const stems = Array.from(
      new Set([brandJoined, firstWord].filter((s) => s.length >= 4))
    );
    const reSuffixes = [
      'nigeria',
      'ng',
      '-ng',
      'homes',
      'properties',
      'property',
      'estates',
      'estate',
      'realestate',
      'realty',
      'realtors',
      'group',
      'africa',
      'housing',
      'developments',
    ];

    for (const stem of stems) {
      for (const sfx of reSuffixes) {
        const domainBase = `${stem}${sfx}`;
        if (domainBase.length < 7 || domainBase === nonLegalJoined) continue;
        const isStrongRe =
          stem.length >= 6 &&
          domainBase.length >= 11 &&
          ['homes', 'properties', 'estates', 'realestate', 'realty', 'realtors', 'nigeria'].includes(
            sfx
          );
        add(`${domainBase}.com`, 'name_permutation', isStrongRe);
        if (['nigeria', 'homes', 'properties', 'estates', 'realestate', 'realty', 'group'].includes(sfx)) {
          add(`${domainBase}.com.ng`, 'name_permutation', stem.length >= 5);
        }
      }
    }

    if (nonLegalJoined.length >= 4 && !nonLegalJoined.includes('nigeria')) {
      add(`${nonLegalJoined}nigeria.com`, 'name_permutation', nonLegalJoined.length >= 6);
      add(`${nonLegalJoined}nigeria.com.ng`, 'name_permutation', true);
      add(`${nonLegalJoined}ng.com`, 'name_permutation', nonLegalJoined.length >= 6);
      add(`${nonLegalJoined}-ng.com`, 'name_permutation', nonLegalJoined.length >= 6);
      add(`${nonLegalJoined}online.com`, 'name_permutation', nonLegalJoined.length >= 6);
    }

    // Acronym patterns for multi-word organizations (e.g., CMB -> cmbnigeria.com)
    if (allWords.length >= 3) {
      const acronym = allWords
        .filter((w) => w !== 'and' && w !== 'of' && w !== 'the')
        .map((w) => w[0])
        .join('');
      if (acronym.length >= 3 && acronym.length <= 6) {
        add(`${acronym}nigeria.com`, 'name_permutation', false);
        add(`${acronym}properties.com`, 'name_permutation', false);
        add(`${acronym}homes.com`, 'name_permutation', false);
        add(`${acronym}group.com`, 'name_permutation', false);
        add(`${acronym}.com.ng`, 'name_permutation', false);
      }
    }
  }

  return out.slice(0, 75);
}

async function resolveHostDns(host: string, timeoutMs = 1800): Promise<boolean> {
  const checkA = async (hostname: string) => {
    try {
      const ips = await Promise.race([
        dns.resolve4(hostname),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error('DNS timeout')), timeoutMs)
        ),
      ]);
      return Array.isArray(ips) && ips.length > 0;
    } catch {
      return false;
    }
  };

  if (await checkA(host)) return true;
  return await checkA(`www.${host}`);
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
  const tryUrl = async (targetUrl: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(targetUrl, {
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
      const html = res.status < 500 ? (await res.text()).slice(0, 400000) : '';
      const isChallenge =
        res.status === 403 ||
        res.status === 429 ||
        res.status === 401 ||
        /cf-browser-verification|just a moment\.\.\.|attention required! \| cloudflare|enable javascript and cookies to continue/i.test(
          html
        );

      return {
        finalUrl: res.url || targetUrl,
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

  // Try apex HTTPS -> www HTTPS -> apex HTTP -> www HTTP to survive TLS SAN quirks
  return (
    (await tryUrl(`https://${host}`)) ??
    (await tryUrl(`https://www.${host}`)) ??
    (await tryUrl(`http://${host}`)) ??
    (await tryUrl(`http://www.${host}`))
  );
}

function verifyHtmlBelongsToBusiness(params: {
  html: string;
  finalUrl: string;
  candidate: CandidateDomainHint;
  businessName: string;
  alternateNames?: string[];
  state: string;
  city: string;
  phone: string | null;
}): {
  matched: boolean;
  reason: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
} {
  const { html, finalUrl, candidate, businessName, alternateNames, state, city, phone } = params;
  const decodedLower = decodeHtmlEntities(html).toLowerCase();

  let parsedHost = '';
  try {
    parsedHost = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    parsedHost = '';
  }

  if (
    PARKED_DOMAIN_PATTERN.test(decodedLower) ||
    (parsedHost && PARKING_MARKETPLACE_HOST_PATTERN.test(parsedHost))
  ) {
    return { matched: false, reason: 'Parked/for-sale domain', instagramUrl: null, facebookUrl: null };
  }

  // Redirect to a social profile (like instagram.com)
  if (parsedHost && SOCIAL_HOST_IGNORE.test(parsedHost)) {
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
  const titleText = decodedLower.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const visibleTextLower = decodedLower
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  if (
    NON_RE_TITLE_PATTERN.test(titleText) &&
    !/real estate|realtor|property|properties|homes|estates/i.test(titleText)
  ) {
    return { matched: false, reason: 'Non-real-estate title mismatch', instagramUrl: null, facebookUrl: null };
  }

  // Check phone tail first (definitive match)
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  const phoneTail = phoneDigits.length >= 7 ? phoneDigits.slice(-7) : null;
  const phoneMatched = Boolean(phoneTail && compactHtml.includes(phoneTail));

  // Real estate & Nigerian location alignment (counted strictly on visible copy, not CSS class names)
  const reMatches = visibleTextLower.match(REAL_ESTATE_CONTEXT_PATTERN) ?? [];
  const stateLower = state.toLowerCase().replace('fct (abuja)', 'abuja').replace(/\s*state$/, '');
  const locationMatched =
    decodedLower.includes('nigeria') ||
    decodedLower.includes(stateLower) ||
    decodedLower.includes('+234') ||
    (city.trim().length >= 3 && decodedLower.includes(city.trim().toLowerCase()));
  const hasStrongReAndNigeria = reMatches.length >= 2 && locationMatched;
  const hasExplicitSourceContext = reMatches.length >= 1 || locationMatched;

  // Evaluate brand alignment across primary + alternate entity names
  let isBrandMatch = false;
  let matchedWordsSummary = '';

  for (const name of [businessName, ...(alternateNames ?? [])]) {
    const { nonLegalWords, brandWords, distinctiveTokens } = tokenizeBusinessName(name);
    const nonLegalSlug = nonLegalWords.join('');
    const brandSlug = brandWords.join('');

    const slugMatched =
      (nonLegalSlug.length >= 6 && compactHtml.includes(nonLegalSlug)) ||
      (brandSlug.length >= 7 && compactHtml.includes(brandSlug));

    const matchedDistinctive = distinctiveTokens.filter((tok) => decodedLower.includes(tok));
    const requiredTokens =
      distinctiveTokens.length <= 2 ? distinctiveTokens.length : Math.max(2, distinctiveTokens.length - 1);
    const tokensMatched = matchedDistinctive.length >= requiredTokens;

    if (slugMatched || tokensMatched) {
      isBrandMatch = true;
      matchedWordsSummary = matchedDistinctive.join(', ') || brandSlug || nonLegalSlug;
      break;
    }
  }

  const isVerified =
    phoneMatched ||
    (isBrandMatch && hasStrongReAndNigeria) ||
    (candidate.source === 'email_domain' && hasExplicitSourceContext) ||
    (candidate.source === 'social_handle' && hasExplicitSourceContext);

  if (!isVerified) {
    return {
      matched: false,
      reason: `Brand/industry check failed (reHits=${reMatches.length}, loc=${locationMatched})`,
      instagramUrl: null,
      facebookUrl: null,
    };
  }

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
    : candidate.source === 'social_handle'
    ? 'social handle domain + live HTTP site match'
    : `live HTTP brand & Nigerian real-estate match (${matchedWordsSummary})`;

  return {
    matched: true,
    reason: matchBasis,
    instagramUrl,
    facebookUrl,
  };
}

/**
 * Zero-cost multi-layer website probe:
 * 1. Inspects corporate email domains, social/email handles, description entity names, and plain-text domains.
 * 2. Generates prioritized Nigerian real-estate domain permutations (.com, .com.ng, .ng) and runs fast parallel DNS.
 * 3. Fetches live HTML (with www/http TLS fallbacks) of resolved hosts and verifies Nigerian real-estate & company identity.
 * 4. Catches Cloudflare/WAF 403 protections on strong brand/corporate domains so they are never mislabeled no_website.
 */
export async function probeCompanyWebsiteFree(params: {
  business_name: string;
  state: string;
  city: string;
  phone: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  discovery_notes?: string;
  rawHtmlSnippets?: string[];
  corporateEmailDomains?: string[];
  brandEmailHandles?: string[];
  textDomainHints?: string[];
  alternateNames?: string[];
}): Promise<VerifiedDomainMatch | null> {
  const emailHints =
    params.rawHtmlSnippets && params.rawHtmlSnippets.length > 0
      ? extractEmailHintsFromHtml(params.rawHtmlSnippets.join('\n'))
      : { corporateEmailDomains: [], brandEmailHandles: [] };

  const textHints =
    params.rawHtmlSnippets && params.rawHtmlSnippets.length > 0
      ? extractTextDomainsFromSnippet(params.rawHtmlSnippets.join('\n'))
      : [];

  const socialHandles = extractSocialHandlesFromUrls([params.instagram_url, params.facebook_url]);
  const descAltNames = params.discovery_notes
    ? extractAlternateEntityNames(params.discovery_notes)
    : [];

  const alternateNames = Array.from(
    new Set([...(params.alternateNames ?? []), ...descAltNames])
  ).filter((n) => n.toLowerCase() !== params.business_name.toLowerCase());

  const candidates = generateDomainCandidates({
    businessName: params.business_name,
    alternateNames,
    corporateEmailDomains: [
      ...(params.corporateEmailDomains ?? []),
      ...emailHints.corporateEmailDomains,
    ],
    brandEmailHandles: [
      ...(params.brandEmailHandles ?? []),
      ...emailHints.brandEmailHandles,
    ],
    socialHandles,
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

  // Verify top up to 10 DNS-resolved domains via HTTP HTML check in parallel
  const toFetch = resolvedHits.slice(0, 10);
  const fetched = await Promise.all(
    toFetch.map(async (cand) => ({
      candidate: cand,
      response: await fetchCandidateHtml(cand.domainOrUrl, 7500),
    }))
  );

  // Prefer verified open HTTP 200 matches first before falling back to WAF-protected hits
  for (const item of fetched) {
    const res = item.response;
    if (!res || res.wafBlocked || res.status >= 400 || !res.html) {
      continue;
    }

    const check = verifyHtmlBelongsToBusiness({
      html: res.html,
      finalUrl: res.finalUrl,
      candidate: item.candidate,
      businessName: params.business_name,
      alternateNames,
      state: params.state,
      city: params.city,
      phone: params.phone,
    });

    if (check.matched) {
      return {
        websiteUrl: res.finalUrl,
        matchedHost: item.candidate.domainOrUrl,
        matchReason: check.reason,
        wafProtected: false,
        sourceUrls: [res.finalUrl],
        discoveredInstagramUrl: check.instagramUrl,
        discoveredFacebookUrl: check.facebookUrl,
        checkedHostsCount: candidates.length,
        dnsResolvedCount: resolvedHits.length,
        factualNote: `Directory URL was blank; verified official website ${res.finalUrl} via ${check.reason} (${candidates.length} domain permutations checked).`,
      };
    }
  }

  // Fallback check: strong identity domain behind Cloudflare / WAF (401/403/429 challenge)
  for (const item of fetched) {
    const res = item.response;
    if (!res) continue;
    let finalHost = '';
    try {
      finalHost = new URL(res.finalUrl).hostname.toLowerCase();
    } catch {
      finalHost = '';
    }
    if (finalHost && PARKING_MARKETPLACE_HOST_PATTERN.test(finalHost)) {
      continue;
    }
    if (res.wafBlocked && item.candidate.strongIdentity) {
      return {
        websiteUrl: res.finalUrl,
        matchedHost: item.candidate.domainOrUrl,
        matchReason: `HTTP ${res.status} WAF/firewall protection on matching brand domain`,
        wafProtected: true,
        sourceUrls: [res.finalUrl],
        discoveredInstagramUrl: null,
        discoveredFacebookUrl: null,
        checkedHostsCount: candidates.length,
        dnsResolvedCount: resolvedHits.length,
        factualNote: `Directory URL was blank; detected active firewall-protected domain ${res.finalUrl} (HTTP ${res.status} WAF challenge across ${candidates.length} domain checks) — open manually before assuming no website.`,
      };
    }
  }

  return null;
}

export function buildNoWebsiteProbeSummary(businessName: string, hadEmailHints: boolean): string {
  const count = generateDomainCandidates({ businessName }).length;
  return `Checked directory URL${hadEmailHints ? ', email/description clues,' : ''} and ${count} Nigerian domain permutations (.com/.com.ng/.ng) via DNS+HTTP — no active official domain verified.`;
}
