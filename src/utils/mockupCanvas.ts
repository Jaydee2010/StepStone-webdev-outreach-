import type { LeadRecord } from '../types/stepstone.ts';
import type { MockupCopy, MockupPreset } from './mockupDesigns.ts';

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
  h: number,
  fallbackPrimary = '#1e293b',
  fallbackSecondary = '#064e3b'
) {
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, fallbackPrimary);
    grad.addColorStop(1, fallbackSecondary);
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

function drawDesktopHeader(
  ctx: CanvasRenderingContext2D,
  lead: LeadRecord,
  preset: MockupPreset,
  dx: number,
  dy: number,
  dw: number,
  centered = false
) {
  const p = preset.palette;
  const isDark = p.id === 'navy_gold';

  // Browser chrome strip
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(dx, dy, dw, 44);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(dx, dy + 43, dw, 1);
  ctx.fillStyle = '#334155';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(lead.business_name, dx + 24, dy + 28);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  const tag = `${preset.layoutLabel} · Concept Preview`;
  ctx.fillText(tag, dx + dw - 24 - ctx.measureText(tag).width, dy + 28);

  const navY = dy + 44;
  ctx.fillStyle = p.headerBgHex;
  ctx.fillRect(dx, navY, dw, 64);
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : p.borderHex;
  ctx.fillRect(dx, navY + 63, dw, 1);

  if (centered) {
    ctx.fillStyle = isDark ? '#ffffff' : p.inkHex;
    ctx.font = '700 20px Georgia, Cambria, serif';
    const title = lead.business_name.slice(0, 34);
    ctx.fillText(title, dx + (dw - ctx.measureText(title).width) / 2, navY + 39);
    ctx.fillStyle = isDark ? '#cbd5e1' : p.mutedInkHex;
    ctx.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Properties', dx + 32, navY + 38);
    ctx.fillText('Estates', dx + 116, navY + 38);
    roundedRectPath(ctx, dx + dw - 144, navY + 14, 112, 36, 8);
    ctx.fillStyle = p.accentHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('WhatsApp', dx + dw - 118, navY + 37);
  } else {
    ctx.fillStyle = isDark ? '#ffffff' : p.inkHex;
    ctx.font = '700 19px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(lead.business_name.slice(0, 30), dx + 32, navY + 39);

    ctx.fillStyle = isDark ? '#cbd5e1' : p.mutedInkHex;
    ctx.font = '500 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const links = ['Properties', 'Estates', 'About', 'Contact'];
    let nx = dx + 510;
    for (const l of links) {
      ctx.fillText(l, nx, navY + 38);
      nx += ctx.measureText(l).width + 30;
    }

    roundedRectPath(ctx, dx + dw - 148, navY + 14, 116, 36, 8);
    ctx.fillStyle = isDark ? p.accentHex : p.primaryHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('WhatsApp', dx + dw - 122, navY + 37);
  }

  return navY + 64;
}

function drawDesktopContent(
  ctx: CanvasRenderingContext2D,
  lead: LeadRecord,
  preset: MockupPreset,
  copy: MockupCopy,
  heroImg: HTMLImageElement | null,
  secImg: HTMLImageElement | null,
  terImg: HTMLImageElement | null,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const p = preset.palette;
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;

  ctx.save();
  roundedRectPath(ctx, dx, dy, dw, dh, 16);
  ctx.fillStyle = p.surfaceHex;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.clip();

  if (preset.layout === 'executive_sidebar') {
    // Browser chrome strip only
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(dx, dy, dw, 44);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(dx, dy + 43, dw, 1);
    ctx.fillStyle = '#334155';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(lead.business_name, dx + 24, dy + 28);

    const topY = dy + 44;
    const sideW = 260;
    const bodyH = dh - 44;

    // Dark left architectural sidebar
    ctx.fillStyle = p.bandBgHex;
    ctx.fillRect(dx, topY, sideW, bodyH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 19px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, lead.business_name, dx + 26, topY + 46, sideW - 52, 26, 2);

    ctx.fillStyle = p.softAccentHex;
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(locationLabel, dx + 26, topY + 112);

    const sideNav = ['Overview', 'Featured Estates', 'Property Search', 'Book Inspection', 'Office Contact'];
    ctx.font = '500 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    sideNav.forEach((item, i) => {
      ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.72)';
      ctx.fillText(item, dx + 26, topY + 178 + i * 38);
    });

    roundedRectPath(ctx, dx + 26, topY + bodyH - 126, sideW - 52, 42, 8);
    ctx.fillStyle = p.accentHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('WhatsApp Desk', dx + 68, topY + bodyH - 100);

    if (lead.phone) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(lead.phone, dx + 26, topY + bodyH - 42);
    }

    // Right main showcase
    const rx = dx + sideW;
    const rw = dw - sideW;
    drawCoverImage(ctx, heroImg, rx, topY, rw, 355, p.bandBgHex, p.primaryHex);
    const grad = ctx.createLinearGradient(0, topY, 0, topY + 355);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.12)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(rx, topY, rw, 355);

    ctx.fillStyle = p.softAccentHex;
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.eyebrow, rx + 32, topY + 190);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.headline, rx + 32, topY + 230, rw - 64, 34, 2);

    roundedRectPath(ctx, rx + 32, topY + 294, 160, 38, 8);
    ctx.fillStyle = p.accentHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.primaryCta, rx + 50, topY + 318);

    // Bottom 2 cards
    const cy = topY + 382;
    const cw = (rw - 80) / 2;
    const ch = 350;
    [
      { img: secImg, title: copy.cardOneTitle, desc: copy.cardOneDesc, x: rx + 28 },
      { img: terImg, title: copy.cardTwoTitle, desc: copy.cardTwoDesc, x: rx + 28 + cw + 24 },
    ].forEach((c) => {
      ctx.save();
      roundedRectPath(ctx, c.x, cy, cw, ch, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = p.borderHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      drawCoverImage(ctx, c.img, c.x, cy, cw, 200);
      ctx.fillStyle = p.inkHex;
      ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(c.title, c.x + 18, cy + 236);
      ctx.fillStyle = p.mutedInkHex;
      ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      drawWrappedText(ctx, c.desc, c.x + 18, cy + 264, cw - 36, 20, 3);
      ctx.restore();
    });

    ctx.restore();
    return;
  }

  const contentY = drawDesktopHeader(
    ctx,
    lead,
    preset,
    dx,
    dy,
    dw,
    preset.layout === 'minimal_framed'
  );

  if (preset.layout === 'editorial_split') {
    const heroH = 380;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(dx, contentY, dw, heroH);

    // Left text block
    ctx.fillStyle = p.accentHex;
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.eyebrow, dx + 36, contentY + 62);

    ctx.fillStyle = p.inkHex;
    ctx.font = '700 30px Georgia, Cambria, serif';
    const nextY = drawWrappedText(ctx, copy.headline, dx + 36, contentY + 104, 440, 38, 3);

    ctx.fillStyle = p.mutedInkHex;
    ctx.font = '400 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.subheadline, dx + 36, nextY + 10, 430, 21, 3);

    roundedRectPath(ctx, dx + 36, contentY + 298, 160, 42, 8);
    ctx.fillStyle = p.primaryHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.primaryCta, dx + 56, contentY + 324);

    roundedRectPath(ctx, dx + 210, contentY + 298, 174, 42, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = p.inkHex;
    ctx.fillText(copy.secondaryCta, dx + 226, contentY + 324);

    // Right framed photo
    ctx.save();
    roundedRectPath(ctx, dx + 506, contentY + 28, 480, 324, 14);
    ctx.clip();
    drawCoverImage(ctx, heroImg, dx + 506, contentY + 28, 480, 324);
    ctx.restore();

    // Bottom 3 cards
    const cy = contentY + heroH + 24;
    const cw = (dw - 64 - 36) / 3;
    const ch = 276;
    [
      { img: secImg, title: copy.cardOneTitle, desc: copy.cardOneDesc, x: dx + 32 },
      { img: terImg, title: copy.cardTwoTitle, desc: copy.cardTwoDesc, x: dx + 32 + cw + 18 },
      { img: null, title: copy.cardThreeTitle, desc: copy.cardThreeDesc, x: dx + 32 + (cw + 18) * 2 },
    ].forEach((c, idx) => {
      ctx.save();
      roundedRectPath(ctx, c.x, cy, cw, ch, 12);
      ctx.fillStyle = idx === 2 ? p.bandBgHex : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = p.borderHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();

      if (c.img) {
        drawCoverImage(ctx, c.img, c.x, cy, cw, 150);
        ctx.fillStyle = p.inkHex;
        ctx.font = '700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillText(c.title, c.x + 16, cy + 184);
        ctx.fillStyle = p.mutedInkHex;
        ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        drawWrappedText(ctx, c.desc, c.x + 16, cy + 210, cw - 32, 19, 3);
      } else {
        ctx.fillStyle = p.softAccentHex;
        ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillText(locationLabel, c.x + 20, cy + 44);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        drawWrappedText(ctx, c.title, c.x + 20, cy + 78, cw - 40, 24, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        drawWrappedText(ctx, c.desc, c.x + 20, cy + 136, cw - 40, 20, 3);
        if (lead.phone) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText(`Tel: ${lead.phone}`, c.x + 20, cy + 236);
        }
      }
      ctx.restore();
    });
  } else if (preset.layout === 'minimal_framed') {
    const frameX = dx + 36;
    const frameY = contentY + 24;
    const frameW = dw - 72;
    const frameH = 385;

    ctx.save();
    roundedRectPath(ctx, frameX, frameY, frameW, frameH, 16);
    ctx.clip();
    drawCoverImage(ctx, heroImg, frameX, frameY, frameW, frameH);
    const grad = ctx.createLinearGradient(0, frameY, 0, frameY + frameH);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.08)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(frameX, frameY, frameW, frameH);
    ctx.restore();

    // Floating crisp white editorial card inside inset frame
    roundedRectPath(ctx, frameX + 28, frameY + 205, 560, 152, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.fillStyle = p.accentHex;
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.eyebrow, frameX + 52, frameY + 236);
    ctx.fillStyle = p.inkHex;
    ctx.font = '700 22px Georgia, Cambria, serif';
    drawWrappedText(ctx, copy.headline, frameX + 52, frameY + 268, 512, 28, 2);

    roundedRectPath(ctx, frameX + 616, frameY + 286, 170, 44, 8);
    ctx.fillStyle = p.primaryHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.primaryCta, frameX + 642, frameY + 313);

    // Clean 2-column horizontal strip below
    const cy = frameY + frameH + 24;
    const cw = (dw - 72 - 24) / 2;
    const ch = 248;
    [
      { img: secImg, title: copy.cardOneTitle, desc: copy.cardOneDesc, x: frameX },
      { img: terImg, title: copy.cardTwoTitle, desc: copy.cardTwoDesc, x: frameX + cw + 24 },
    ].forEach((c) => {
      ctx.save();
      roundedRectPath(ctx, c.x, cy, cw, ch, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = p.borderHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      drawCoverImage(ctx, c.img, c.x, cy, 185, ch);
      ctx.fillStyle = p.inkHex;
      ctx.font = '700 16px Georgia, Cambria, serif';
      drawWrappedText(ctx, c.title, c.x + 205, cy + 48, cw - 225, 22, 2);
      ctx.fillStyle = p.mutedInkHex;
      ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      drawWrappedText(ctx, c.desc, c.x + 205, cy + 104, cw - 225, 20, 4);
      if (lead.phone) {
        ctx.fillStyle = p.accentHex;
        ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(lead.phone, c.x + 205, cy + 215);
      }
      ctx.restore();
    });
  } else if (preset.layout === 'search_grid_portal') {
    // Search/Filter Bar
    const barY = contentY;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(dx, barY, dw, 68);
    ctx.fillStyle = p.borderHex;
    ctx.fillRect(dx, barY + 67, dw, 1);

    roundedRectPath(ctx, dx + 32, barY + 14, 300, 40, 8);
    ctx.fillStyle = p.surfaceHex;
    ctx.fill();
    ctx.strokeStyle = p.borderHex;
    ctx.stroke();
    ctx.fillStyle = p.inkHex;
    ctx.font = '500 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(`Location: ${locationLabel}`, dx + 48, barY + 39);

    roundedRectPath(ctx, dx + 348, barY + 14, 280, 40, 8);
    ctx.fillStyle = p.surfaceHex;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.mutedInkHex;
    ctx.fillText('Category: Residential & Estates', dx + 364, barY + 39);

    roundedRectPath(ctx, dx + 644, barY + 14, 180, 40, 8);
    ctx.fillStyle = p.primaryHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Browse Listings', dx + 682, barY + 39);

    // Compact spotlight banner
    const spotY = barY + 86;
    const spotX = dx + 32;
    const spotW = dw - 64;
    const spotH = 260;
    ctx.save();
    roundedRectPath(ctx, spotX, spotY, spotW, spotH, 12);
    ctx.clip();
    drawCoverImage(ctx, heroImg, spotX, spotY, spotW, spotH);
    const grad = ctx.createLinearGradient(spotX, 0, spotX + spotW, 0);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.90)');
    grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.50)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(spotX, spotY, spotW, spotH);
    ctx.restore();

    ctx.fillStyle = p.softAccentHex;
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.eyebrow, spotX + 28, spotY + 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.headline, spotX + 28, spotY + 96, 520, 34, 2);
    roundedRectPath(ctx, spotX + 28, spotY + 188, 174, 40, 8);
    ctx.fillStyle = p.accentHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.secondaryCta, spotX + 46, spotY + 213);

    // 3 Property Cards
    const cy = spotY + spotH + 22;
    const cw = (spotW - 36) / 3;
    const ch = 315;
    [
      { img: secImg, title: copy.cardOneTitle, desc: copy.cardOneDesc, x: spotX },
      { img: terImg, title: copy.cardTwoTitle, desc: copy.cardTwoDesc, x: spotX + cw + 18 },
      { img: heroImg, title: copy.cardThreeTitle, desc: copy.cardThreeDesc, x: spotX + (cw + 18) * 2 },
    ].forEach((c) => {
      ctx.save();
      roundedRectPath(ctx, c.x, cy, cw, ch, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = p.borderHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      drawCoverImage(ctx, c.img, c.x, cy, cw, 175);
      ctx.fillStyle = p.inkHex;
      ctx.font = '700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(c.title, c.x + 16, cy + 208);
      ctx.fillStyle = p.mutedInkHex;
      ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      drawWrappedText(ctx, c.desc, c.x + 16, cy + 234, cw - 32, 19, 3);
      ctx.restore();
    });
  } else {
    // full_bleed_hero
    const heroH = 355;
    drawCoverImage(ctx, heroImg, dx, contentY, dw, heroH, p.bandBgHex, p.primaryHex);
    const heroGrad = ctx.createLinearGradient(0, contentY, 0, contentY + heroH);
    heroGrad.addColorStop(0, 'rgba(2, 6, 23, 0.15)');
    heroGrad.addColorStop(0.55, 'rgba(2, 6, 23, 0.55)');
    heroGrad.addColorStop(1, 'rgba(2, 6, 23, 0.90)');
    ctx.fillStyle = heroGrad;
    ctx.fillRect(dx, contentY, dw, heroH);

    ctx.fillStyle = p.softAccentHex;
    ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.eyebrow, dx + 36, contentY + 190);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.headline, dx + 36, contentY + 234, 720, 40, 2);

    roundedRectPath(ctx, dx + 36, contentY + 292, 166, 42, 8);
    ctx.fillStyle = p.accentHex;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.primaryCta, dx + 56, contentY + 318);

    roundedRectPath(ctx, dx + 216, contentY + 292, 180, 42, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(copy.secondaryCta, dx + 234, contentY + 318);

    // Bottom 2 cards
    const gridY = contentY + heroH + 28;
    const cardW = (dw - 64 - 24) / 2;
    const cardH = 290;

    const c1x = dx + 32;
    ctx.save();
    roundedRectPath(ctx, c1x, gridY, cardW, cardH, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = p.borderHex;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();
    drawCoverImage(ctx, secImg, c1x, gridY, cardW, 180);
    ctx.fillStyle = p.inkHex;
    ctx.font = '700 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.cardOneTitle, c1x + 20, gridY + 216);
    ctx.fillStyle = p.mutedInkHex;
    ctx.font = '400 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.cardOneDesc, c1x + 20, gridY + 244, cardW - 40, 20, 2);
    ctx.restore();

    const c2x = c1x + cardW + 24;
    roundedRectPath(ctx, c2x, gridY, cardW, cardH, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = p.borderHex;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = p.inkHex;
    ctx.font = '700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(copy.cardThreeTitle, c2x + 24, gridY + 44);
    ctx.fillStyle = p.mutedInkHex;
    ctx.font = '400 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.subheadline, c2x + 24, gridY + 78, cardW - 48, 24, 4);
    ctx.fillStyle = p.primaryHex;
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(`Location: ${locationLabel}`, c2x + 24, gridY + 225);
    if (lead.phone) {
      ctx.fillStyle = p.inkHex;
      ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`Tel: ${lead.phone}`, c2x + 24, gridY + 252);
    }
  }

  ctx.restore();
}

function drawMobileFrame(
  ctx: CanvasRenderingContext2D,
  lead: LeadRecord,
  preset: MockupPreset,
  copy: MockupCopy,
  heroImg: HTMLImageElement | null,
  mx: number,
  my: number,
  mw: number,
  mh: number
) {
  const p = preset.palette;
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  const isDarkHeader = p.id === 'navy_gold' || preset.layout === 'executive_sidebar';

  ctx.save();
  roundedRectPath(ctx, mx, my, mw, mh, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();
  ctx.clip();

  // Mobile header
  ctx.fillStyle = isDarkHeader ? p.bandBgHex : p.headerBgHex;
  ctx.fillRect(mx, my, mw, 60);
  ctx.fillStyle = isDarkHeader ? 'rgba(255,255,255,0.12)' : p.borderHex;
  ctx.fillRect(mx, my + 59, mw, 1);

  ctx.fillStyle = isDarkHeader ? '#ffffff' : p.inkHex;
  ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(lead.business_name.slice(0, 24), mx + 22, my + 37);
  ctx.fillStyle = isDarkHeader ? p.softAccentHex : p.primaryHex;
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Menu', mx + mw - 62, my + 37);

  if (preset.layout === 'editorial_split' || preset.layout === 'minimal_framed') {
    const textTop = my + 60;
    ctx.fillStyle = p.surfaceHex;
    ctx.fillRect(mx, textTop, mw, 180);

    ctx.fillStyle = p.accentHex;
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(locationLabel, mx + 24, textTop + 34);

    ctx.fillStyle = p.inkHex;
    ctx.font = '700 22px Georgia, Cambria, serif';
    drawWrappedText(ctx, copy.mobileHeadline, mx + 24, textTop + 68, mw - 48, 28, 2);

    ctx.fillStyle = p.mutedInkHex;
    ctx.font = '400 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.cardOneDesc, mx + 24, textTop + 130, mw - 48, 19, 2);

    ctx.save();
    roundedRectPath(ctx, mx + 20, textTop + 188, mw - 40, 225, 14);
    ctx.clip();
    drawCoverImage(ctx, heroImg, mx + 20, textTop + 188, mw - 40, 225);
    ctx.restore();
  } else {
    const mHeroY = my + 60;
    const mHeroH = 310;
    drawCoverImage(ctx, heroImg, mx, mHeroY, mw, mHeroH, p.bandBgHex, p.primaryHex);
    const grad = ctx.createLinearGradient(0, mHeroY, 0, mHeroY + mHeroH);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.15)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(mx, mHeroY, mw, mHeroH);

    ctx.fillStyle = p.softAccentHex;
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(locationLabel, mx + 24, mHeroY + 205);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    drawWrappedText(ctx, copy.mobileHeadline, mx + 24, mHeroY + 240, mw - 48, 30, 2);
  }

  // Mobile body card
  const bodyY =
    preset.layout === 'editorial_split' || preset.layout === 'minimal_framed'
      ? my + 492
      : my + 394;

  roundedRectPath(ctx, mx + 22, bodyY, mw - 44, 128, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = p.borderHex;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = p.inkHex;
  ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(copy.cardOneTitle, mx + 40, bodyY + 36);
  ctx.fillStyle = p.mutedInkHex;
  ctx.font = '400 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  drawWrappedText(ctx, copy.cardOneDesc, mx + 40, bodyY + 64, mw - 80, 21, 3);

  if (lead.phone) {
    ctx.fillStyle = p.inkHex;
    ctx.font = '500 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`Office Line: ${lead.phone}`, mx + 24, bodyY + 158);
  }

  // WhatsApp button
  const btnY = my + mh - 114;
  roundedRectPath(ctx, mx + 24, btnY, mw - 48, 52, 10);
  ctx.fillStyle = p.primaryHex;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const waLabel = 'Chat on WhatsApp';
  ctx.fillText(waLabel, mx + (mw - ctx.measureText(waLabel).width) / 2, btnY + 32);

  // Footer attribution
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  const foot = 'Concept Preview · Stepstone Web Agency';
  ctx.fillText(foot, mx + (mw - ctx.measureText(foot).width) / 2, my + mh - 26);
  ctx.restore();
}

export async function exportDesktopAndMobileMockupPng(
  lead: LeadRecord,
  preset: MockupPreset,
  copy: MockupCopy
) {
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;
  const [heroImg, secImg, terImg] = await Promise.all([
    loadImage(preset.heroImg),
    loadImage(preset.secondaryImg),
    loadImage(preset.tertiaryImg),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Concept Homepage Preview — ${lead.business_name}`, 48, 46);
  ctx.fillStyle = '#64748b';
  ctx.font = '400 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(
    `${preset.layoutLabel} (${preset.palette.label}) · Stepstone Web Agency · ${locationLabel}`,
    48,
    70
  );

  drawDesktopContent(ctx, lead, preset, copy, heroImg, secImg, terImg, 48, 96, 1020, 816);
  drawMobileFrame(ctx, lead, preset, copy, heroImg, 1112, 96, 440, 816);

  triggerPngDownload(
    canvas,
    `${slugifyName(lead.business_name)}-${preset.id}-concept-mockup.png`
  );
}

export async function exportMobileOnlyMockupPng(
  lead: LeadRecord,
  preset: MockupPreset,
  copy: MockupCopy
) {
  const heroImg = await loadImage(preset.heroImg);
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
  ctx.fillText(title.slice(0, 46), 64, 48);

  drawMobileFrame(ctx, lead, preset, copy, heroImg, 64, 72, 512, 910);
  triggerPngDownload(
    canvas,
    `${slugifyName(lead.business_name)}-${preset.id}-mobile-concept.png`
  );
}
