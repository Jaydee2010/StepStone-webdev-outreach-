import React, { useState } from 'react';
import { Building2, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { LeadRecord } from '../types/stepstone.ts';

const HERO_IMG = '/src/assets/images/abuja_luxury_estate_hero_1794939921294.jpg';
const SECONDARY_IMG = '/src/assets/images/lagos_modern_residences_1794939921771.jpg';

export function ConceptMockupPreview({ lead }: { lead: LeadRecord }) {
  const [heroError, setHeroError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);

  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-900">
            Concept Homepage Preview — {lead.business_name}
          </p>
          <p className="text-xs text-slate-500">
            Presented strictly as an illustrative design concept for {lead.business_name}, not an existing live website.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500">
          Desktop + Mobile Portrait Concept
        </span>
      </div>

      {/* Desktop + Mobile Presentation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Desktop Browser Frame */}
        <div className="lg:col-span-8 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700 truncate">{lead.business_name}</span>
            <span className="font-mono text-[11px] text-slate-400">Concept Preview</span>
          </div>

          {/* Concept Navbar */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3.5">
            <span className="font-display text-sm font-bold tracking-tight text-slate-900">
              {lead.business_name}
            </span>
            <div className="hidden sm:flex items-center gap-5 text-xs font-medium text-slate-600">
              <span>Properties</span>
              <span>Estates</span>
              <span>About</span>
              <span>Contact</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-[11px] font-medium text-white">
              <MessageCircle className="h-3 w-3" />
              <span>WhatsApp</span>
            </span>
          </div>

          {/* Concept Hero */}
          <div className="relative h-60 w-full overflow-hidden bg-slate-900">
            {!heroError ? (
              <img
                src={HERO_IMG}
                alt={`Nigerian residential property concept for ${lead.business_name}`}
                referrerPolicy="no-referrer"
                onError={() => setHeroError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-emerald-950 text-slate-300">
                <Building2 className="h-10 w-10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="text-[11px] font-medium text-emerald-300">
                {lead.business_category} · {locationLabel}
              </p>
              <h4 className="mt-1 max-w-lg font-display text-xl font-semibold leading-snug">
                Verified Properties & Developments in {locationLabel}
              </h4>
              <div className="mt-3 flex items-center gap-3">
                <span className="rounded-md bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white">
                  Explore Listings
                </span>
                <span className="rounded-md border border-white/40 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  Book Inspection
                </span>
              </div>
            </div>
          </div>

          {/* Concept Property Showcase Section */}
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="h-28 w-full bg-slate-200">
                {!secondaryError ? (
                  <img
                    src={SECONDARY_IMG}
                    alt="Contemporary Nigerian residence showcase"
                    referrerPolicy="no-referrer"
                    onError={() => setSecondaryError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold text-slate-900">
                  Featured Residential Portfolio
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Direct inquiry & inspection scheduling · {locationLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Direct Buyer Inquiry Channel
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  Give prospective buyers a dedicated place to browse properties, verify office details, and send instant WhatsApp inquiries.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-emerald-700" />
                  {locationLabel}
                </span>
                {lead.phone && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Phone className="h-3 w-3 text-emerald-700" />
                    {lead.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Portrait Frame */}
        <div className="lg:col-span-4 mx-auto w-full max-w-[270px] overflow-hidden rounded-2xl border-4 border-slate-800 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="truncate font-display text-xs font-bold text-slate-900">
              {lead.business_name}
            </span>
            <span className="text-[10px] font-medium text-emerald-800">Menu</span>
          </div>
          <div className="relative h-44 bg-slate-900">
            {!heroError ? (
              <img
                src={HERO_IMG}
                alt={`Mobile property preview for ${lead.business_name}`}
                referrerPolicy="no-referrer"
                onError={() => setHeroError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-slate-800 text-slate-300">
                <Building2 className="h-8 w-8" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
              <p className="text-[10px] text-emerald-300">{locationLabel}</p>
              <p className="mt-0.5 font-display text-sm font-semibold leading-snug">
                Trusted Real Estate in {lead.state}
              </p>
            </div>
          </div>
          <div className="space-y-3 p-3.5">
            <div className="rounded-md border border-slate-200 p-2.5">
              <p className="text-[11px] font-semibold text-slate-900">Property Showcase</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Clean mobile browsing for plots, terraces, and estates.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-800 py-2 text-xs font-medium text-white">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Chat on WhatsApp</span>
            </div>
            <p className="text-center font-mono text-[9px] text-slate-400">
              Concept Preview · Stepstone Web Agency
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
