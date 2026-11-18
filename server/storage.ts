import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  AgencyPackagesConfig,
  LeadRecord,
  SearchLog,
} from '../src/types/stepstone.ts';

export interface StepstoneDatabase {
  leads: LeadRecord[];
  packages: AgencyPackagesConfig;
  searches: SearchLog[];
}

const LOCAL_DATA_DIR = path.resolve(process.cwd(), 'data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'stepstone-data');

let memoryDb: StepstoneDatabase | null = null;

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

function getDbFilePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dir = isServerless ? TMP_DATA_DIR : LOCAL_DATA_DIR;
  return path.join(dir, 'stepstone-db.json');
}

function createInitialDb(): StepstoneDatabase {
  return {
    leads: [],
    packages: DEFAULT_PACKAGES,
    searches: [],
  };
}

export function readDb(): StepstoneDatabase {
  const dbPath = getDbFilePath();
  const dir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dbPath)) {
      const initial = memoryDb ?? createInitialDb();
      fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), 'utf-8');
      memoryDb = initial;
      return initial;
    }
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StepstoneDatabase>;
    const db: StepstoneDatabase = {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      packages: parsed.packages ?? DEFAULT_PACKAGES,
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
    };
    memoryDb = db;
    return db;
  } catch {
    if (!memoryDb) {
      memoryDb = createInitialDb();
    }
    return memoryDb;
  }
}

export function writeDb(db: StepstoneDatabase): void {
  memoryDb = db;
  const dbPath = getDbFilePath();
  const dir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  } catch {
    // Fallback cleanly to in-memory store if filesystem is read-only
  }
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
