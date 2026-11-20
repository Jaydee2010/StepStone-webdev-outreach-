export const NIGERIAN_STATES = [
  'FCT (Abuja)',
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export const ALL_STATES_OPTION = 'All Nigerian States' as const;

export type LocationSelection = (typeof NIGERIAN_STATES)[number] | typeof ALL_STATES_OPTION;

export type WebsiteClassification =
  | 'no_website'
  | 'instagram_only'
  | 'social_only'
  | 'broken_website'
  | 'weak_website'
  | 'good_website'
  | 'unknown';

export type OutreachAngle =
  | 'no_website'
  | 'instagram_only'
  | 'social_only'
  | 'broken_website'
  | 'weak_website';

export type LeadLifecycleStatus =
  | 'new'
  | 'outreach_ready'
  | 'contacted'
  | 'replied'
  | 'closed';

export interface ModeALeadRecord {
  business_name: string;
  business_category: string;
  state: string;
  city: string;
  phone: string | null;
  website_url: string | null;
  final_destination_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  website_status: WebsiteClassification;
  inspection_evidence: string;
  inspection_date: string;
  confidence: 'High' | 'Medium' | 'Low';
  source_urls: string[];
  opportunity_score: number;
  qualification_reason: string;
  skip: boolean;
}

export interface ModeBOutreachRecord {
  score: number;
  reason: string;
  skip: boolean;
  angle: OutreachAngle;
  whatsapp_message: string;
  instagram_message: string;
  followup_1: string;
  followup_2: string;
  preview_brief: string;
}

export interface LeadRecord extends ModeALeadRecord {
  id: string;
  google_business_profile_url: string | null;
  discovered_at: string;
  search_state: string;
  lead_lifecycle: LeadLifecycleStatus;
  outreach: ModeBOutreachRecord | null;
  http_signals?: {
    reachable: boolean;
    http_status: number | null;
    redirect_chain: string[];
    redirected_to_social: boolean;
    access_restricted: boolean;
    has_viewport_meta: boolean;
    has_nav: boolean;
    has_form: boolean;
    has_whatsapp_link: boolean;
    has_contact_info: boolean;
    page_title: string | null;
  } | null;
}

export interface PackageTier {
  id: 'basic' | 'standard' | 'premium';
  name: string;
  priceNaira: number;
  pagesLabel: string;
  targetAudience: string;
  features: string[];
}

export interface AgencyPackagesConfig {
  deliveryTimeline: string;
  authorizePaymentSplit: boolean;
  tiers: PackageTier[];
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export interface SearchLog {
  id: string;
  timestamp: string;
  selectedState: string;
  keywords: string[];
  discoveredCount: number;
  duplicatesSkipped: number;
  notes: string;
}

export type EngineMode = 'auto' | 'free' | 'ai';

export interface DiscoveryResponse {
  leads: LeadRecord[];
  newlyAddedCount: number;
  duplicatesSkipped: number;
  searchLog: SearchLog;
  honestStatusNote: string;
  engineUsed?: 'gemini_ai' | 'free_directory';
  quotaNotice?: string | null;
}

export function toModeAJson(lead: LeadRecord): ModeALeadRecord {
  return {
    business_name: lead.business_name,
    business_category: lead.business_category,
    state: lead.state,
    city: lead.city,
    phone: lead.phone,
    website_url: lead.website_url,
    final_destination_url: lead.final_destination_url,
    instagram_url: lead.instagram_url,
    facebook_url: lead.facebook_url,
    website_status: lead.website_status,
    inspection_evidence: lead.inspection_evidence,
    inspection_date: lead.inspection_date,
    confidence: lead.confidence,
    source_urls: lead.source_urls,
    opportunity_score: lead.opportunity_score,
    qualification_reason: lead.qualification_reason,
    skip: lead.skip,
  };
}
