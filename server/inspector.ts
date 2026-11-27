export interface HttpInspectionReport {
  requested_url: string;
  final_destination_url: string | null;
  redirect_chain: string[];
  redirected_to_social: boolean;
  social_platform: 'instagram' | 'facebook' | 'whatsapp' | 'other_social' | null;
  reachable: boolean;
  http_status: number | null;
  access_restricted: boolean;
  is_https: boolean;
  attempts: number;
  error_message: string | null;
  inspection_date: string;
  signals: {
    page_title: string | null;
    has_viewport_meta: boolean;
    has_nav: boolean;
    has_form: boolean;
    has_whatsapp_link: boolean;
    has_contact_info: boolean;
    html_length: number;
  } | null;
  factual_summary: string;
}

const SOCIAL_DOMAINS: Array<{
  pattern: RegExp;
  platform: 'instagram' | 'facebook' | 'whatsapp' | 'other_social';
}> = [
  { pattern: /(^|\.)instagram\.com$/i, platform: 'instagram' },
  { pattern: /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/i, platform: 'facebook' },
  { pattern: /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i, platform: 'whatsapp' },
  {
    pattern:
      /(^|\.)linktr\.ee$|(^|\.)bio\.link$|(^|\.)beacons\.ai$|(^|\.)tiktok\.com$|(^|\.)linkedin\.com$|(^|\.)twitter\.com$|(^|\.)x\.com$/i,
    platform: 'other_social',
  },
];

function detectSocialPlatform(
  urlStr: string
): 'instagram' | 'facebook' | 'whatsapp' | 'other_social' | null {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    for (const entry of SOCIAL_DOMAINS) {
      if (entry.pattern.test(host)) {
        return entry.platform;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }
  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function normalizeUrlInput(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isPrivateOrLocalHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 8500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-NG,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function singleInspectionAttempt(startUrl: string): Promise<HttpInspectionReport> {
  const inspectionDate = new Date().toISOString().slice(0, 10);
  const redirectChain: string[] = [startUrl];
  let currentUrl = startUrl;
  let finalStatus: number | null = null;
  let lastResponse: Response | null = null;

  const startSocial = detectSocialPlatform(startUrl);
  if (startSocial) {
    return {
      requested_url: startUrl,
      final_destination_url: startUrl,
      redirect_chain: redirectChain,
      redirected_to_social: true,
      social_platform: startSocial,
      reachable: true,
      http_status: null,
      access_restricted: false,
      is_https: startUrl.startsWith('https://'),
      attempts: 1,
      error_message: null,
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `URL points directly to ${startSocial} (${startUrl}) rather than an independent company website.`,
    };
  }

  for (let hop = 0; hop < 6; hop++) {
    const res = await fetchWithTimeout(currentUrl);
    finalStatus = res.status;
    lastResponse = res;

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).toString();
      if (isPrivateOrLocalHost(new URL(nextUrl).hostname)) {
        break;
      }
      redirectChain.push(nextUrl);
      currentUrl = nextUrl;

      const socialPlatform = detectSocialPlatform(nextUrl);
      if (socialPlatform) {
        return {
          requested_url: startUrl,
          final_destination_url: nextUrl,
          redirect_chain: redirectChain,
          redirected_to_social: true,
          social_platform: socialPlatform,
          reachable: true,
          http_status: res.status,
          access_restricted: false,
          is_https: nextUrl.startsWith('https://'),
          attempts: 1,
          error_message: null,
          inspection_date: inspectionDate,
          signals: null,
          factual_summary: `Website URL redirected (${redirectChain.length - 1} hop) to ${socialPlatform}: ${nextUrl}.`,
        };
      }
      continue;
    }
    break;
  }

  const isHttps = currentUrl.startsWith('https://');
  if (!lastResponse || finalStatus === null) {
    return {
      requested_url: startUrl,
      final_destination_url: currentUrl,
      redirect_chain: redirectChain,
      redirected_to_social: false,
      social_platform: null,
      reachable: false,
      http_status: null,
      access_restricted: false,
      is_https: isHttps,
      attempts: 1,
      error_message: 'No HTTP response received.',
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Could not obtain an HTTP response from ${startUrl}.`,
    };
  }

  if (finalStatus === 403 || finalStatus === 429) {
    return {
      requested_url: startUrl,
      final_destination_url: currentUrl,
      redirect_chain: redirectChain,
      redirected_to_social: false,
      social_platform: null,
      reachable: true,
      http_status: finalStatus,
      access_restricted: true,
      is_https: isHttps,
      attempts: 1,
      error_message: `HTTP ${finalStatus} access/bot restriction`,
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Server at ${currentUrl} returned HTTP ${finalStatus}, indicating automated access or WAF/bot protection rather than a confirmed broken site.`,
    };
  }

  if (finalStatus >= 400) {
    return {
      requested_url: startUrl,
      final_destination_url: currentUrl,
      redirect_chain: redirectChain,
      redirected_to_social: false,
      social_platform: null,
      reachable: false,
      http_status: finalStatus,
      access_restricted: false,
      is_https: isHttps,
      attempts: 1,
      error_message: `HTTP error status ${finalStatus}`,
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Final destination ${currentUrl} returned HTTP ${finalStatus}.`,
    };
  }

  const html = (await lastResponse.text()).slice(0, 200000);
  const botChallenge =
    /cf-browser-verification|just a moment\.\.\.|attention required! \| cloudflare|enable javascript and cookies to continue/i.test(
      html
    );

  if (botChallenge) {
    return {
      requested_url: startUrl,
      final_destination_url: currentUrl,
      redirect_chain: redirectChain,
      redirected_to_social: false,
      social_platform: null,
      reachable: true,
      http_status: finalStatus,
      access_restricted: true,
      is_https: isHttps,
      attempts: 1,
      error_message: 'Bot/WAF challenge page detected',
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Site at ${currentUrl} responded with HTTP ${finalStatus} behind a Cloudflare/WAF browser verification challenge.`,
    };
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 120)
    : null;
  const hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const navMatches = html.match(/<a\b/gi) ?? [];
  const hasNav = /<nav\b/i.test(html) || navMatches.length >= 4;
  const hasForm = /<form\b/i.test(html);
  const hasWhatsappLink =
    /wa\.me\/|api\.whatsapp\.com|whatsapp\.com\/send/i.test(html);
  const hasContactInfo =
    /tel:|mailto:|\+234|\b0[789][01]\d{8}\b|contact/i.test(html);

  const signalNotes: string[] = [
    `HTTP ${finalStatus} at ${currentUrl}`,
    isHttps ? 'HTTPS enabled' : 'No HTTPS (HTTP only)',
    hasViewportMeta ? 'Mobile viewport meta present' : 'Missing mobile viewport meta tag',
    hasNav ? 'Navigation links detected' : 'Minimal or missing navigation markup',
    hasContactInfo ? 'Contact details detected' : 'No obvious tel/email contact found in HTML',
    hasForm ? 'Inquiry form present' : 'No HTML inquiry form detected',
    hasWhatsappLink ? 'WhatsApp link present' : 'No WhatsApp link detected in HTML',
  ];

  return {
    requested_url: startUrl,
    final_destination_url: currentUrl,
    redirect_chain: redirectChain,
    redirected_to_social: false,
    social_platform: null,
    reachable: true,
    http_status: finalStatus,
    access_restricted: false,
    is_https: isHttps,
    attempts: 1,
    error_message: null,
    inspection_date: inspectionDate,
    signals: {
      page_title: pageTitle,
      has_viewport_meta: hasViewportMeta,
      has_nav: hasNav,
      has_form: hasForm,
      has_whatsapp_link: hasWhatsappLink,
      has_contact_info: hasContactInfo,
      html_length: html.length,
    },
    factual_summary: signalNotes.join('; ') + '.',
  };
}

export async function inspectWebsiteUrl(rawUrl: string): Promise<HttpInspectionReport> {
  const inspectionDate = new Date().toISOString().slice(0, 10);
  const normalized = normalizeUrlInput(rawUrl);
  if (!normalized) {
    return {
      requested_url: rawUrl,
      final_destination_url: null,
      redirect_chain: [],
      redirected_to_social: false,
      social_platform: null,
      reachable: false,
      http_status: null,
      access_restricted: false,
      is_https: false,
      attempts: 0,
      error_message: 'Invalid or unsafe URL format.',
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Could not inspect "${rawUrl}" because the URL is invalid.`,
    };
  }

  let lastReport: HttpInspectionReport | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const candidateUrl =
      attempt === 2 && !/^https?:\/\/www\./i.test(normalized)
        ? normalized.replace(/^(https?:\/\/)/i, '$1www.')
        : normalized;
    try {
      const report = await singleInspectionAttempt(candidateUrl);
      report.requested_url = normalized;
      report.attempts = attempt;
      if (report.reachable || (report.http_status && report.http_status < 500)) {
        return report;
      }
      lastReport = report;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out after 8.5s'
            : err.message
          : 'Network error';
      lastReport = {
        requested_url: normalized,
        final_destination_url: null,
        redirect_chain: [normalized],
        redirected_to_social: false,
        social_platform: null,
        reachable: false,
        http_status: null,
        access_restricted: false,
        is_https: normalized.startsWith('https://'),
        attempts: attempt,
        error_message: msg,
        inspection_date: inspectionDate,
        signals: null,
        factual_summary: `Connection attempt ${attempt} to ${normalized} failed (${msg}).`,
      };
    }
  }

  return (
    lastReport ?? {
      requested_url: normalized,
      final_destination_url: null,
      redirect_chain: [normalized],
      redirected_to_social: false,
      social_platform: null,
      reachable: false,
      http_status: null,
      access_restricted: false,
      is_https: normalized.startsWith('https://'),
      attempts: 2,
      error_message: 'Inspection failed after 2 attempts.',
      inspection_date: inspectionDate,
      signals: null,
      factual_summary: `Site at ${normalized} failed to respond across 2 attempts.`,
    }
  );
}
