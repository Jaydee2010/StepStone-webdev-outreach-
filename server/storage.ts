import fs from 'fs';
import path from 'path';
import type {
  AgencyPackagesConfig,
  ChatMessage,
  LeadRecord,
  SearchLog,
} from '../src/types/stepstone.ts';

export interface StepstoneDatabase {
  leads: LeadRecord[];
  packages: AgencyPackagesConfig;
  searches: SearchLog[];
  chatMessages: ChatMessage[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'stepstone-db.json');

export const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  id: 'msg-welcome-identity',
  role: 'assistant',
  timestamp: new Date().toISOString(),
  content: `Welcome, Jaydee. I am the **Stepstone Web Agency Brain** — the central business discovery, website intelligence, and outreach system for **Stepstone Web Agency** in Abuja, Nigeria.

My mandate is to help you locate genuine Nigerian real estate companies (developers, estate firms, property investment and management companies), verify their real online presence with evidence, qualify them accurately, and prepare honest, high-converting outreach.

### Functions I Can Carry Out

1. **State-Locked Business Discovery**
   Search real estate companies, property developers, estate development firms, and property management companies strictly within your selected Nigerian state (defaulting to **FCT (Abuja)** across all 36 states + FCT, or **All Nigerian States** only when you explicitly choose it). I never switch or expand to neighboring states automatically.

2. **Website Discovery & Live Inspection**
   Investigate each company's official website, follow HTTP redirects safely to catch Instagram/Facebook/WhatsApp-only redirects, inspect homepage availability, mobile viewport readiness, navigation, contact details, inquiry forms, and classify each prospect (\`no_website\`, \`instagram_only\`, \`social_only\`, \`broken_website\`, \`weak_website\`, \`good_website\`, or \`unknown\`).

3. **Opportunity Qualification (1–5 Scoring)**
   Score every discovered firm from **1 to 5** based on verified evidence—prioritizing established developers and real estate companies with missing, social-only, broken, or weak websites. Prospects scoring 1 or 2 are automatically marked \`skip\`.

4. **Mode B Outreach & Follow-Up Generation**
   For qualified prospects (score 3–5), draft a friendly Nigerian business English **first WhatsApp message** (under 60 words, max 1 emoji, no pricing), **Instagram DM** (max 40 words), **Day 2 follow-up** (<40 words), and **Day 5 polite closing follow-up** (<40 words) referencing a verified observation and offering a free homepage preview.

5. **Prospect Reply Handling**
   Generate concise, honest replies to prospect questions—explaining how websites drive direct inquiries, presenting your **Basic (₦55,000)**, **Standard (₦85,000)**, and **Premium (₦120,000)** packages, handling price objections without unauthorized discounting, and closing politely when a prospect declines.

6. **Concept Homepage Preview & Image Briefs**
   Build a detailed concept homepage image-generation brief (and interactive preview mockup) tailored to the prospect's real company name, Nigerian property imagery, property showcase, and WhatsApp CTA.

Select a target state in the top bar and click **Run Discovery**, or ask me anything right here to plan prospecting, review leads, or handle a prospect's reply.`,
};

export const DEFAULT_PACKAGES: AgencyPackagesConfig = {
  deliveryTimeline: 'Approximately 7 days',
  authorizePaymentSplit: false,
  tiers: [
    {
      id: 'basic',
      name: 'Basic',
      priceNaira: 55000,
      pagesLabel: '1 page',
      targetAudience: 'Starter presence for emerging agencies',
      features: [
        '1-page responsive layout',
        'WhatsApp direct contact button',
        'Business contact details & location',
        'Mobile-friendly design',
        'Google Business Profile setup',
      ],
    },
    {
      id: 'standard',
      name: 'Standard',
      priceNaira: 85000,
      pagesLabel: '5 pages',
      targetAudience: 'Recommended for established real estate firms',
      features: [
        '5 structured pages (Home, About, Estates, Listings, Contact)',
        'Property showcase gallery',
        'Dedicated buyer inquiry form',
        'Google Maps office & site integration',
        'WhatsApp auto-reply greeting setup',
        'Inquiries automatically logged in Google Sheets',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      priceNaira: 120000,
      pagesLabel: '8 pages',
      targetAudience: 'Full-scale developers & multi-estate portfolios',
      features: [
        '8 pages with estate & investment sections',
        'Interactive property search and filters',
        'Online inspection / viewing booking flow',
        'Custom features tailored to firm workflow',
        'One month of free property listing updates',
      ],
    },
  ],
};

function ensureDbExists(): StepstoneDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial: StepstoneDatabase = {
      leads: [],
      packages: DEFAULT_PACKAGES,
      searches: [],
      chatMessages: [INITIAL_ASSISTANT_MESSAGE],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StepstoneDatabase>;
    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      packages: parsed.packages ?? DEFAULT_PACKAGES,
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
      chatMessages:
        Array.isArray(parsed.chatMessages) && parsed.chatMessages.length > 0
          ? parsed.chatMessages
          : [INITIAL_ASSISTANT_MESSAGE],
    };
  } catch {
    const fallback: StepstoneDatabase = {
      leads: [],
      packages: DEFAULT_PACKAGES,
      searches: [],
      chatMessages: [INITIAL_ASSISTANT_MESSAGE],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

export function readDb(): StepstoneDatabase {
  return ensureDbExists();
}

export function writeDb(db: StepstoneDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|nigeria|nig|plc|inc|llp|company|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function findDuplicateLead(
  existingLeads: LeadRecord[],
  candidate: {
    business_name: string;
    state: string;
    website_url?: string | null;
    phone?: string | null;
  }
): LeadRecord | undefined {
  const normName = normalizeCompanyName(candidate.business_name);
  const normState = candidate.state.toLowerCase().trim();
  const normDomain = normalizeDomain(candidate.website_url);
  const normPhone = candidate.phone ? candidate.phone.replace(/\D/g, '').slice(-10) : null;

  return existingLeads.find((existing) => {
    const existingNormName = normalizeCompanyName(existing.business_name);
    const existingState = existing.state.toLowerCase().trim();
    if (normName && existingNormName === normName && existingState === normState) {
      return true;
    }
    const existingDomain = normalizeDomain(existing.website_url);
    if (
      normDomain &&
      existingDomain &&
      normDomain === existingDomain &&
      !normDomain.includes('instagram.com') &&
      !normDomain.includes('facebook.com') &&
      !normDomain.includes('wa.me')
    ) {
      return true;
    }
    const existingPhone = existing.phone ? existing.phone.replace(/\D/g, '').slice(-10) : null;
    if (normPhone && existingPhone && normPhone.length >= 8 && normPhone === existingPhone) {
      return true;
    }
    return false;
  });
}
