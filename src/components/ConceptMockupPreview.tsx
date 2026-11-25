import React, { useEffect, useState } from 'react';
import {
  Building2,
  Download,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Shuffle,
  Smartphone,
} from 'lucide-react';
import type { LeadRecord } from '../types/stepstone.ts';
import {
  getDomainTailoredCopy,
  getNextMockupPresetId,
  resolveMockupPreset,
} from '../utils/mockupDesigns.ts';
import {
  exportDesktopAndMobileMockupPng,
  exportMobileOnlyMockupPng,
} from '../utils/mockupCanvas.ts';

interface ConceptMockupPreviewProps {
  lead: LeadRecord;
  onChangeDesignVariant?: (id: string, variantId: string) => Promise<void> | void;
}

export function ConceptMockupPreview({
  lead,
  onChangeDesignVariant,
}: ConceptMockupPreviewProps) {
  const [heroError, setHeroError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);
  const [tertiaryError, setTertiaryError] = useState(false);
  const [downloading, setDownloading] = useState<'full' | 'mobile' | null>(null);

  const preset = resolveMockupPreset(lead);
  const copy = getDomainTailoredCopy(lead, preset.layout);
  const p = preset.palette;
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  const isDarkHeader = p.id === 'navy_gold';

  useEffect(() => {
    setHeroError(false);
    setSecondaryError(false);
    setTertiaryError(false);
  }, [lead.id, preset.id]);

  const handleCycleDesign = async () => {
    if (!onChangeDesignVariant) return;
    const nextId = getNextMockupPresetId(preset.id);
    await onChangeDesignVariant(lead.id, nextId);
  };

  const handleDownloadFull = async () => {
    if (downloading) return;
    setDownloading('full');
    try {
      await exportDesktopAndMobileMockupPng(lead, preset, copy);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadMobile = async () => {
    if (downloading) return;
    setDownloading('mobile');
    try {
      await exportMobileOnlyMockupPng(lead, preset, copy);
    } finally {
      setDownloading(null);
    }
  };

  const renderHeader = (centered = false) => (
    <div
      className={`flex items-center justify-between border-b px-6 py-3.5 ${p.headerBgClass} ${
        isDarkHeader ? 'border-white/10' : p.borderClass
      }`}
    >
      {centered ? (
        <>
          <div className={`hidden sm:flex items-center gap-4 text-xs font-medium ${isDarkHeader ? 'text-slate-300' : p.mutedInkClass}`}>
            <span>Properties</span>
            <span>Estates</span>
          </div>
          <span className={`font-serif text-base font-bold tracking-tight ${isDarkHeader ? 'text-white' : p.inkClass}`}>
            {lead.business_name}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium ${p.btnPrimaryClass}`}>
            <MessageCircle className="h-3 w-3" />
            <span>WhatsApp</span>
          </span>
        </>
      ) : (
        <>
          <span className={`font-display text-sm font-bold tracking-tight ${isDarkHeader ? 'text-white' : p.inkClass}`}>
            {lead.business_name}
          </span>
          <div className={`hidden sm:flex items-center gap-5 text-xs font-medium ${isDarkHeader ? 'text-slate-300' : p.mutedInkClass}`}>
            <span>Properties</span>
            <span>Estates</span>
            <span>About</span>
            <span>Contact</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium ${p.btnPrimaryClass}`}>
            <MessageCircle className="h-3 w-3" />
            <span>WhatsApp</span>
          </span>
        </>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-900">
            Concept Homepage Preview — {lead.business_name}
          </p>
          <p className="text-xs text-slate-500">
            Style: <strong className="font-medium text-slate-700">{preset.layoutLabel}</strong> ({p.label}) · Illustrative concept only, not a live site.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onChangeDesignVariant && (
            <button
              type="button"
              onClick={handleCycleDesign}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Try Another Design</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadMobile}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>{downloading === 'mobile' ? 'Exporting...' : 'Download Mobile PNG'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadFull}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloading === 'full' ? 'Exporting...' : 'Download Mockup PNG'}</span>
          </button>
        </div>
      </div>

      {/* Desktop + Mobile Presentation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Desktop Browser Frame */}
        <div className={`lg:col-span-8 overflow-hidden rounded-lg border border-slate-300 shadow-sm ${p.surfaceClass}`}>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700 truncate">{lead.business_name}</span>
            <span className="font-mono text-[11px] text-slate-400">
              {preset.layoutLabel} · Concept Preview
            </span>
          </div>

          {preset.layout === 'executive_sidebar' ? (
            <div className="grid grid-cols-1 sm:grid-cols-12">
              {/* Left Architectural Sidebar */}
              <div className={`sm:col-span-4 flex flex-col justify-between p-5 text-white ${p.bandBgClass}`}>
                <div>
                  <p className="font-display text-base font-bold leading-snug">
                    {lead.business_name}
                  </p>
                  <p className={`mt-1 text-[11px] font-medium ${p.softAccentTextClass}`}>
                    {locationLabel}
                  </p>
                  <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                    <li className="font-semibold text-white">Overview</li>
                    <li>Featured Estates</li>
                    <li>Property Search</li>
                    <li>Book Inspection</li>
                    <li>Office Contact</li>
                  </ul>
                </div>
                <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                  <span className={`flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium ${p.btnPrimaryClass}`}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp Desk</span>
                  </span>
                  {lead.phone && (
                    <p className="font-mono text-[10px] text-slate-300">{lead.phone}</p>
                  )}
                </div>
              </div>

              {/* Right Main Showcase */}
              <div className="sm:col-span-8">
                <div className="relative h-56 w-full overflow-hidden bg-slate-900">
                  {!heroError ? (
                    <img
                      src={preset.heroImg}
                      alt={`Property showcase for ${lead.business_name}`}
                      referrerPolicy="no-referrer"
                      onError={() => setHeroError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <Building2 className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <p className={`text-[11px] font-medium ${p.softAccentTextClass}`}>
                      {copy.eyebrow}
                    </p>
                    <h4 className="mt-1 font-display text-lg font-semibold leading-snug">
                      {copy.headline}
                    </h4>
                    <div className="mt-3">
                      <span className={`inline-block rounded-md px-3 py-1.5 text-xs font-medium ${p.btnPrimaryClass}`}>
                        {copy.primaryCta}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                  {[
                    {
                      img: preset.secondaryImg,
                      err: secondaryError,
                      onErr: () => setSecondaryError(true),
                      title: copy.cardOneTitle,
                      desc: copy.cardOneDesc,
                    },
                    {
                      img: preset.tertiaryImg,
                      err: tertiaryError,
                      onErr: () => setTertiaryError(true),
                      title: copy.cardTwoTitle,
                      desc: copy.cardTwoDesc,
                    },
                  ].map((c, idx) => (
                    <div key={idx} className={`overflow-hidden rounded-lg border bg-white ${p.borderClass}`}>
                      <div className="h-24 bg-slate-200">
                        {!c.err ? (
                          <img
                            src={c.img}
                            alt={c.title}
                            referrerPolicy="no-referrer"
                            onError={c.onErr}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <Building2 className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className={`text-xs font-semibold ${p.inkClass}`}>{c.title}</p>
                        <p className={`mt-0.5 text-[11px] ${p.mutedInkClass}`}>{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {renderHeader(preset.layout === 'minimal_framed')}

              {preset.layout === 'editorial_split' && (
                <>
                  <div className="grid grid-cols-1 gap-5 bg-white p-6 sm:grid-cols-12 items-center">
                    <div className="sm:col-span-6 space-y-3">
                      <p className={`text-[11px] font-semibold ${p.accentTextClass}`}>
                        {copy.eyebrow}
                      </p>
                      <h4 className={`font-serif text-xl font-bold leading-snug ${p.inkClass}`}>
                        {copy.headline}
                      </h4>
                      <p className={`text-xs leading-relaxed ${p.mutedInkClass}`}>
                        {copy.subheadline}
                      </p>
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <span className={`rounded-md px-3.5 py-1.5 text-xs font-medium ${p.btnPrimaryClass}`}>
                          {copy.primaryCta}
                        </span>
                        <span className={`rounded-md px-3.5 py-1.5 text-xs font-medium ${p.btnSecondaryClass}`}>
                          {copy.secondaryCta}
                        </span>
                      </div>
                    </div>
                    <div className="sm:col-span-6 h-52 overflow-hidden rounded-xl bg-slate-200">
                      {!heroError ? (
                        <img
                          src={preset.heroImg}
                          alt={`Editorial property concept for ${lead.business_name}`}
                          referrerPolicy="no-referrer"
                          onError={() => setHeroError(true)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-400">
                          <Building2 className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-3">
                    <div className={`overflow-hidden rounded-lg border bg-white ${p.borderClass}`}>
                      <div className="h-24 bg-slate-200">
                        {!secondaryError && (
                          <img
                            src={preset.secondaryImg}
                            alt={copy.cardOneTitle}
                            referrerPolicy="no-referrer"
                            onError={() => setSecondaryError(true)}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-3">
                        <p className={`text-xs font-semibold ${p.inkClass}`}>{copy.cardOneTitle}</p>
                        <p className={`mt-0.5 text-[11px] ${p.mutedInkClass}`}>{copy.cardOneDesc}</p>
                      </div>
                    </div>

                    <div className={`overflow-hidden rounded-lg border bg-white ${p.borderClass}`}>
                      <div className="h-24 bg-slate-200">
                        {!tertiaryError && (
                          <img
                            src={preset.tertiaryImg}
                            alt={copy.cardTwoTitle}
                            referrerPolicy="no-referrer"
                            onError={() => setTertiaryError(true)}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-3">
                        <p className={`text-xs font-semibold ${p.inkClass}`}>{copy.cardTwoTitle}</p>
                        <p className={`mt-0.5 text-[11px] ${p.mutedInkClass}`}>{copy.cardTwoDesc}</p>
                      </div>
                    </div>

                    <div className={`flex flex-col justify-between rounded-lg p-4 text-white ${p.bandBgClass}`}>
                      <div>
                        <p className={`text-[10px] font-medium ${p.softAccentTextClass}`}>
                          {locationLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold">{copy.cardThreeTitle}</p>
                        <p className="mt-1 text-[11px] text-slate-300">{copy.cardThreeDesc}</p>
                      </div>
                      {lead.phone && (
                        <p className="mt-3 font-mono text-[11px] text-white">Tel: {lead.phone}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {preset.layout === 'minimal_framed' && (
                <div className="p-5 space-y-4">
                  <div className="relative h-56 overflow-hidden rounded-xl bg-slate-900">
                    {!heroError ? (
                      <img
                        src={preset.heroImg}
                        alt={`Minimal framed residence for ${lead.business_name}`}
                        referrerPolicy="no-referrer"
                        onError={() => setHeroError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <Building2 className="h-10 w-10" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
                    <div className="absolute inset-x-4 bottom-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                      <div className="max-w-md rounded-lg bg-white/95 p-3.5 shadow-sm backdrop-blur-sm">
                        <p className={`text-[10px] font-semibold ${p.accentTextClass}`}>
                          {copy.eyebrow}
                        </p>
                        <h4 className={`mt-0.5 font-serif text-base font-bold leading-snug ${p.inkClass}`}>
                          {copy.headline}
                        </h4>
                      </div>
                      <span className={`inline-block rounded-md px-3.5 py-2 text-xs font-medium shrink-0 ${p.btnPrimaryClass}`}>
                        {copy.primaryCta}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      {
                        img: preset.secondaryImg,
                        err: secondaryError,
                        onErr: () => setSecondaryError(true),
                        title: copy.cardOneTitle,
                        desc: copy.cardOneDesc,
                      },
                      {
                        img: preset.tertiaryImg,
                        err: tertiaryError,
                        onErr: () => setTertiaryError(true),
                        title: copy.cardTwoTitle,
                        desc: copy.cardTwoDesc,
                      },
                    ].map((c, idx) => (
                      <div
                        key={idx}
                        className={`flex overflow-hidden rounded-lg border bg-white ${p.borderClass}`}
                      >
                        <div className="w-28 shrink-0 bg-slate-200">
                          {!c.err && (
                            <img
                              src={c.img}
                              alt={c.title}
                              referrerPolicy="no-referrer"
                              onError={c.onErr}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="p-3 flex flex-col justify-between">
                          <div>
                            <p className={`font-serif text-xs font-bold ${p.inkClass}`}>{c.title}</p>
                            <p className={`mt-1 text-[11px] ${p.mutedInkClass}`}>{c.desc}</p>
                          </div>
                          {lead.phone && (
                            <p className={`mt-2 font-mono text-[10px] ${p.accentTextClass}`}>
                              {lead.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preset.layout === 'search_grid_portal' && (
                <div>
                  <div className={`flex flex-wrap items-center gap-2 border-b bg-white px-5 py-3 text-xs ${p.borderClass}`}>
                    <div className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-1.5 ${p.surfaceClass} ${p.borderClass}`}>
                      <MapPin className={`h-3.5 w-3.5 ${p.accentTextClass}`} />
                      <span className={p.inkClass}>Location: {locationLabel}</span>
                    </div>
                    <div className={`hidden sm:flex items-center gap-2 rounded-md border px-3 py-1.5 ${p.surfaceClass} ${p.borderClass}`}>
                      <span className={p.mutedInkClass}>Residential &amp; Estates</span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium ${p.btnPrimaryClass}`}>
                      <Search className="h-3 w-3" />
                      <span>Browse</span>
                    </span>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="relative h-44 overflow-hidden rounded-xl bg-slate-900">
                      {!heroError && (
                        <img
                          src={preset.heroImg}
                          alt={`Property portal showcase for ${lead.business_name}`}
                          referrerPolicy="no-referrer"
                          onError={() => setHeroError(true)}
                          className="h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-transparent" />
                      <div className="absolute inset-y-0 left-0 flex flex-col justify-center p-5 text-white max-w-md">
                        <p className={`text-[11px] font-medium ${p.softAccentTextClass}`}>
                          {copy.eyebrow}
                        </p>
                        <h4 className="mt-1 font-display text-lg font-semibold leading-snug">
                          {copy.headline}
                        </h4>
                        <div className="mt-3">
                          <span className={`inline-block rounded-md px-3 py-1.5 text-xs font-medium ${p.btnPrimaryClass}`}>
                            {copy.secondaryCta}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { img: preset.secondaryImg, title: copy.cardOneTitle, desc: copy.cardOneDesc },
                        { img: preset.tertiaryImg, title: copy.cardTwoTitle, desc: copy.cardTwoDesc },
                        { img: preset.heroImg, title: copy.cardThreeTitle, desc: copy.cardThreeDesc },
                      ].map((c, idx) => (
                        <div key={idx} className={`overflow-hidden rounded-lg border bg-white ${p.borderClass}`}>
                          <div className="h-24 bg-slate-200">
                            <img
                              src={c.img}
                              alt={c.title}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="p-2.5">
                            <p className={`text-xs font-semibold ${p.inkClass}`}>{c.title}</p>
                            <p className={`mt-0.5 text-[11px] ${p.mutedInkClass}`}>{c.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {preset.layout === 'full_bleed_hero' && (
                <>
                  <div className="relative h-60 w-full overflow-hidden bg-slate-900">
                    {!heroError ? (
                      <img
                        src={preset.heroImg}
                        alt={`Nigerian residential property concept for ${lead.business_name}`}
                        referrerPolicy="no-referrer"
                        onError={() => setHeroError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-300">
                        <Building2 className="h-10 w-10" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                      <p className={`text-[11px] font-medium ${p.softAccentTextClass}`}>
                        {copy.eyebrow}
                      </p>
                      <h4 className="mt-1 max-w-lg font-display text-xl font-semibold leading-snug">
                        {copy.headline}
                      </h4>
                      <div className="mt-3 flex items-center gap-3">
                        <span className={`rounded-md px-3.5 py-1.5 text-xs font-medium ${p.btnPrimaryClass}`}>
                          {copy.primaryCta}
                        </span>
                        <span className="rounded-md border border-white/40 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                          {copy.secondaryCta}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                    <div className={`overflow-hidden rounded-lg border bg-white ${p.borderClass}`}>
                      <div className="h-28 w-full bg-slate-200">
                        {!secondaryError ? (
                          <img
                            src={preset.secondaryImg}
                            alt={copy.cardOneTitle}
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
                        <p className={`text-xs font-semibold ${p.inkClass}`}>{copy.cardOneTitle}</p>
                        <p className={`mt-0.5 text-[11px] ${p.mutedInkClass}`}>{copy.cardOneDesc}</p>
                      </div>
                    </div>

                    <div className={`flex flex-col justify-between rounded-lg border bg-white p-4 ${p.borderClass}`}>
                      <div>
                        <p className={`text-xs font-semibold ${p.inkClass}`}>{copy.cardThreeTitle}</p>
                        <p className={`mt-1 text-[11px] leading-relaxed ${p.mutedInkClass}`}>
                          {copy.subheadline}
                        </p>
                      </div>
                      <div className={`mt-3 flex flex-wrap items-center gap-3 text-[11px] ${p.mutedInkClass}`}>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className={`h-3 w-3 ${p.accentTextClass}`} />
                          {locationLabel}
                        </span>
                        {lead.phone && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className={`h-3 w-3 ${p.accentTextClass}`} />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile Portrait Frame */}
        <div className="lg:col-span-4 mx-auto w-full max-w-[270px] overflow-hidden rounded-2xl border-4 border-slate-800 bg-white shadow-sm">
          <div
            className={`flex items-center justify-between border-b px-4 py-2.5 ${
              isDarkHeader || preset.layout === 'executive_sidebar'
                ? `${p.bandBgClass} border-white/10 text-white`
                : `${p.headerBgClass} ${p.borderClass} ${p.inkClass}`
            }`}
          >
            <span className="truncate font-display text-xs font-bold">
              {lead.business_name}
            </span>
            <span
              className={`text-[10px] font-medium ${
                isDarkHeader || preset.layout === 'executive_sidebar'
                  ? p.softAccentTextClass
                  : p.accentTextClass
              }`}
            >
              Menu
            </span>
          </div>

          {preset.layout === 'editorial_split' || preset.layout === 'minimal_framed' ? (
            <div className={`p-3.5 space-y-3 ${p.surfaceClass}`}>
              <div>
                <p className={`text-[10px] font-semibold ${p.accentTextClass}`}>{locationLabel}</p>
                <p className={`mt-0.5 font-serif text-sm font-bold leading-snug ${p.inkClass}`}>
                  {copy.mobileHeadline}
                </p>
              </div>
              <div className="h-32 overflow-hidden rounded-lg bg-slate-200">
                {!heroError && (
                  <img
                    src={preset.heroImg}
                    alt={`Mobile property preview for ${lead.business_name}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="relative h-44 bg-slate-900">
              {!heroError ? (
                <img
                  src={preset.heroImg}
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
                <p className={`text-[10px] ${p.softAccentTextClass}`}>{locationLabel}</p>
                <p className="mt-0.5 font-display text-sm font-semibold leading-snug">
                  {copy.mobileHeadline}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3 p-3.5">
            <div className={`rounded-md border p-2.5 ${p.borderClass}`}>
              <p className={`text-[11px] font-semibold ${p.inkClass}`}>{copy.cardOneTitle}</p>
              <p className={`mt-0.5 text-[10px] ${p.mutedInkClass}`}>{copy.cardOneDesc}</p>
            </div>
            <div className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium ${p.btnPrimaryClass}`}>
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
