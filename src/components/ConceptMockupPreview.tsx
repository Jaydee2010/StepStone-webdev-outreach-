import React, { useState } from 'react';
import { Building2, Download, MapPin, MessageCircle, Phone, Smartphone } from 'lucide-react';
import type { LeadRecord } from '../types/stepstone.ts';
import heroPropertyImg from '../assets/images/abuja_luxury_estate_hero_1794939921294.jpg';
import secondaryPropertyImg from '../assets/images/lagos_modern_residences_1794939921771.jpg';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.trim().split(/\s+/);
  let line = '';
  let currentY = y;
  let linesDrawn = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      linesDrawn++;
      if (linesDrawn >= maxLines) {
        let truncated = line;
        while (
          truncated.length > 3 &&
          ctx.measureText(`${truncated}…`).width > maxWidth
        ) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(`${truncated}…`, x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function triggerPngDownload(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'stepstone-prospect'
  );
}

async function renderDesktopAndMobilePng(lead: LeadRecord) {
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  const [heroImg, secondaryImg] = await Promise.all([
    loadImage(heroPropertyImg),
    loadImage(secondaryPropertyImg),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  // Background
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header caption
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Concept Homepage Preview — ${lead.business_name}`, 48, 46);
  ctx.fillStyle = '#64748b';
  ctx.font = '400 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(
    `Illustrative design concept by Stepstone Web Agency · ${locationLabel}`,
    48,
    70
  );

  // --- DESKTOP BROWSER CARD ---
  const dx = 48;
  const dy = 96;
  const dw = 1020;
  const dh = 816;

  ctx.save();
  roundedRectPath(ctx, dx, dy, dw, dh, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.clip();

  // Browser bar
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(dx, dy, dw, 46);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(dx, dy + 45, dw, 1);

  ctx.fillStyle = '#334155';
  ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(lead.business_name, dx + 24, dy + 29);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  const badgeText = 'Concept Preview';
  ctx.fillText(badgeText, dx + dw - 24 - ctx.measureText(badgeText).width, dy + 29);

  // Site navbar
  const navY = dy + 46;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(dx, navY, dw, 66);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(dx, navY + 65, dw, 1);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(lead.business_name.slice(0, 32), dx + 32, navY + 40);

  ctx.fillStyle = '#475569';
  ctx.font = '500 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const navLinks = ['Properties', 'Estates', 'About', 'Contact'];
  let nx = dx + 520;
  for (const link of navLinks) {
    ctx.fillText(link, nx, navY + 39);
    nx += ctx.measureText(link).width + 32;
  }

  // WhatsApp button
  roundedRectPath(ctx, dx + dw - 148, navY + 15, 116, 36, 8);
  ctx.fillStyle = '#065f46';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('WhatsApp', dx + dw - 122, navY + 38);

  // Hero section
  const heroY = navY + 66;
  const heroH = 355;
  drawCoverImage(ctx, heroImg, dx, heroY, dw, heroH);
  const heroGrad = ctx.createLinearGradient(0, heroY, 0, heroY + heroH);
  heroGrad.addColorStop(0, 'rgba(2, 6, 23, 0.15)');
  heroGrad.addColorStop(0.55, 'rgba(2, 6, 23, 0.55)');
  heroGrad.addColorStop(1, 'rgba(2, 6, 23, 0.90)');
  ctx.fillStyle = heroGrad;
  ctx.fillRect(dx, heroY, dw, heroH);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`${lead.business_category} · ${locationLabel}`, dx + 36, heroY + 195);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(
    ctx,
    `Verified Properties & Developments in ${locationLabel}`,
    dx + 36,
    heroY + 238,
    720,
    40,
    2
  );

  // Hero CTAs
  roundedRectPath(ctx, dx + 36, heroY + 292, 162, 42, 8);
  ctx.fillStyle = '#047857';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Explore Listings', dx + 58, heroY + 318);

  roundedRectPath(ctx, dx + 214, heroY + 292, 168, 42, 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Book Inspection', dx + 240, heroY + 318);

  // Bottom 2 cards
  const gridY = heroY + heroH + 28;
  const cardW = (dw - 64 - 24) / 2;
  const cardH = 290;

  // Left Property Card
  const c1x = dx + 32;
  ctx.save();
  roundedRectPath(ctx, c1x, gridY, cardW, cardH, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();
  drawCoverImage(ctx, secondaryImg, c1x, gridY, cardW, 180);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Featured Residential Portfolio', c1x + 20, gridY + 216);
  ctx.fillStyle = '#64748b';
  ctx.font = '400 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(
    ctx,
    `Direct inquiry & inspection scheduling · ${locationLabel}`,
    c1x + 20,
    gridY + 244,
    cardW - 40,
    20,
    2
  );
  ctx.restore();

  // Right Inquiry Card
  const c2x = c1x + cardW + 24;
  roundedRectPath(ctx, c2x, gridY, cardW, cardH, 12);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Direct Buyer Inquiry Channel', c2x + 24, gridY + 44);
  ctx.fillStyle = '#475569';
  ctx.font = '400 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(
    ctx,
    'Give prospective buyers a dedicated place to browse properties, verify office details, and send instant WhatsApp inquiries.',
    c2x + 24,
    gridY + 78,
    cardW - 48,
    24,
    4
  );
  ctx.fillStyle = '#065f46';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Location: ${locationLabel}`, c2x + 24, gridY + 225);
  if (lead.phone) {
    ctx.fillStyle = '#334155';
    ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`Tel: ${lead.phone}`, c2x + 24, gridY + 252);
  }
  ctx.restore();

  // --- MOBILE PORTRAIT FRAME ---
  drawMobileFrame(ctx, lead, heroImg, 1112, 96, 440, 816);

  triggerPngDownload(canvas, `${slugifyName(lead.business_name)}-concept-mockup.png`);
}

function drawMobileFrame(
  ctx: CanvasRenderingContext2D,
  lead: LeadRecord,
  heroImg: HTMLImageElement | null,
  mx: number,
  my: number,
  mw: number,
  mh: number
) {
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  ctx.save();
  roundedRectPath(ctx, mx, my, mw, mh, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();
  ctx.clip();

  // Mobile header
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx, my, mw, 60);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(mx, my + 59, mw, 1);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(lead.business_name.slice(0, 24), mx + 24, my + 38);
  ctx.fillStyle = '#065f46';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Menu', mx + mw - 64, my + 38);

  // Mobile hero
  const mHeroY = my + 60;
  const mHeroH = 310;
  drawCoverImage(ctx, heroImg, mx, mHeroY, mw, mHeroH);
  const grad = ctx.createLinearGradient(0, mHeroY, 0, mHeroY + mHeroH);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.15)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(mx, mHeroY, mw, mHeroH);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(locationLabel, mx + 24, mHeroY + 205);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(
    ctx,
    `Trusted Real Estate in ${lead.state}`,
    mx + 24,
    mHeroY + 240,
    mw - 48,
    30,
    2
  );

  // Mobile body cards
  const bodyY = mHeroY + mHeroH + 24;
  roundedRectPath(ctx, mx + 24, bodyY, mw - 48, 128, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Property Showcase', mx + 44, bodyY + 38);
  ctx.fillStyle = '#64748b';
  ctx.font = '400 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(
    ctx,
    'Clean mobile browsing for plots, terraces, and residential estates with instant inspection booking.',
    mx + 44,
    bodyY + 68,
    mw - 88,
    22,
    3
  );

  if (lead.phone) {
    ctx.fillStyle = '#334155';
    ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`Office Line: ${lead.phone}`, mx + 24, bodyY + 170);
  }

  // WhatsApp button
  const btnY = my + mh - 118;
  roundedRectPath(ctx, mx + 24, btnY, mw - 48, 54, 10);
  ctx.fillStyle = '#065f46';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const waLabel = 'Chat on WhatsApp';
  ctx.fillText(waLabel, mx + (mw - ctx.measureText(waLabel).width) / 2, btnY + 33);

  // Footer caption
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  const foot = 'Concept Preview · Stepstone Web Agency';
  ctx.fillText(foot, mx + (mw - ctx.measureText(foot).width) / 2, my + mh - 28);
  ctx.restore();
}

async function renderMobileOnlyPng(lead: LeadRecord) {
  const heroImg = await loadImage(heroPropertyImg);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 1040;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#334155';
  ctx.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const title = `Concept Preview — ${lead.business_name}`;
  ctx.fillText(title.slice(0, 48), 64, 48);

  drawMobileFrame(ctx, lead, heroImg, 64, 72, 512, 910);
  triggerPngDownload(canvas, `${slugifyName(lead.business_name)}-mobile-concept.png`);
}

export function ConceptMockupPreview({ lead }: { lead: LeadRecord }) {
  const [heroError, setHeroError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);
  const [downloading, setDownloading] = useState<'full' | 'mobile' | null>(null);

  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;

  const handleDownloadFull = async () => {
    if (downloading) return;
    setDownloading('full');
    try {
      await renderDesktopAndMobilePng(lead);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadMobile = async () => {
    if (downloading) return;
    setDownloading('mobile');
    try {
      await renderMobileOnlyPng(lead);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold text-slate-900">
            Concept Homepage Preview — {lead.business_name}
          </p>
          <p className="text-xs text-slate-500">
            Presented strictly as an illustrative design concept for {lead.business_name}, not an existing live website.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                src={heroPropertyImg}
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
                    src={secondaryPropertyImg}
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
                src={heroPropertyImg}
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
