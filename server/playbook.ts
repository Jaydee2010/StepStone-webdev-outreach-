import type {
  AgencyPackagesConfig,
  LeadRecord,
  ModeBOutreachRecord,
  OutreachAngle,
} from '../src/types/stepstone.ts';

function resolveAngle(lead: LeadRecord): OutreachAngle {
  switch (lead.website_status) {
    case 'instagram_only':
      return 'instagram_only';
    case 'social_only':
      return 'social_only';
    case 'broken_website':
      return 'broken_website';
    case 'weak_website':
      return 'weak_website';
    default:
      return 'no_website';
  }
}

export function buildPlaybookOutreachForLead(
  lead: LeadRecord,
  packages: AgencyPackagesConfig
): ModeBOutreachRecord {
  if (lead.skip || lead.opportunity_score <= 2) {
    throw new Error(
      `Outreach is blocked for "${lead.business_name}" because it is marked skip (score ${lead.opportunity_score}/5).`
    );
  }

  const angle = resolveAngle(lead);
  const locationLabel = lead.city ? `${lead.city}, ${lead.state}` : lead.state;

  let observation = `I noticed ${lead.business_name} does not appear to have a standalone website yet.`;
  let igObservation = `noticed you don't have an official website yet.`;

  if (angle === 'instagram_only') {
    observation = `I noticed ${lead.business_name} relies mainly on Instagram without a dedicated property site.`;
    igObservation = `love your page here, though a dedicated site would support your listings well.`;
  } else if (angle === 'social_only') {
    observation = `I noticed ${lead.business_name} currently points buyers only to social pages.`;
    igObservation = `noticed your firm mainly uses social pages without a standalone site.`;
  } else if (angle === 'broken_website') {
    observation = `I checked your listed website link and it is not loading properly right now.`;
    igObservation = `noticed your listed website link appears down right now.`;
  } else if (angle === 'weak_website') {
    observation = `I checked your website and saw ways to make property inquiries and WhatsApp contact smoother.`;
    igObservation = `checked your site and saw a quick way to improve mobile inquiries.`;
  }

  const whatsapp_message =
    `Hello ${lead.business_name} — Jaydee from Stepstone Web Agency. ` +
    `${observation} ` +
    `I'd love to design a free homepage preview using your firm's name before you pay anything (${packages.deliveryTimeline.toLowerCase()} delivery if you proceed). ` +
    `Can I send it? 👋`;

  const instagram_message =
    `Hi ${lead.business_name}, Jaydee at Stepstone Web Agency — ${igObservation} ` +
    `May I send a free homepage concept preview with your firm's name first?`;

  const followup_1 =
    `Hi ${lead.business_name}, quick follow-up from Jaydee. A clean site gives Instagram and Google buyers one trusted place to view your estates and message you on WhatsApp. Want to see the free preview?`;

  const followup_2 =
    `Hello ${lead.business_name}, final check-in on the free homepage concept for ${locationLabel}. No pressure at all — reply anytime if you'd like to review it later.`;

  const preview_brief =
    `Create a Concept Homepage Preview presentation (desktop browser + mobile frame side-by-side) for "${lead.business_name}", a real estate firm in ${locationLabel}, Nigeria. ` +
    `Header: place "${lead.business_name}" cleanly as logo text alongside concise navigation links (Home, Estates, Listings, About, Contact) — do not invent unrelated brand colors or logos; use clean dark slate, warm ivory, and deep forest green accents with natural Nigerian residential estate photography. ` +
    `Hero section: clear headline tailored to ${lead.business_category} in ${lead.state}, brief trust subheading, and a prominent green WhatsApp Consultation button plus a View Properties button. ` +
    `Lower showcase: 3 clean placeholder estate listing cards labeled as Concept Layout Samples (without inventing fake past projects or sales claims), plus a simple buyer inspection inquiry strip. Clearly label top corner: "Concept Homepage Preview by Stepstone Web Agency".`;

  return {
    score: lead.opportunity_score,
    reason: lead.qualification_reason,
    skip: false,
    angle,
    whatsapp_message,
    instagram_message,
    followup_1,
    followup_2,
    preview_brief,
  };
}

export function buildPlaybookReply(params: {
  lead: LeadRecord | null;
  prospectMessage: string;
  packages: AgencyPackagesConfig;
}): { reply: string; shouldMarkClosed: boolean } {
  const msg = params.prospectMessage.trim();
  const lower = msg.toLowerCase();
  const companyGreeting = params.lead ? `${params.lead.business_name} team` : 'there';

  const basic = params.packages.tiers.find((t) => t.id === 'basic') ?? params.packages.tiers[0];
  const standard =
    params.packages.tiers.find((t) => t.id === 'standard') ?? params.packages.tiers[1];
  const premium =
    params.packages.tiers.find((t) => t.id === 'premium') ?? params.packages.tiers[2];

  const fmt = (n: number) => `₦${n.toLocaleString('en-NG')}`;

  if (/\b(stop|not interested|no thanks|unsubscribe|don't message|dont message|remove us)\b/i.test(lower)) {
    return {
      reply: `Understood, thank you for letting me know, ${companyGreeting}. I won't send any further follow-ups. Wishing your team continued success!`,
      shouldMarkClosed: true,
    };
  }

  if (/\b(get back|next week|later|busy right now|discuss internally|talk to my partner)\b/i.test(lower)) {
    return {
      reply: `No problem at all, ${companyGreeting}. Take your time reviewing with your team, and feel free to reach out whenever it's convenient if you'd like to see a free homepage preview.`,
      shouldMarkClosed: false,
    };
  }

  if (/\b(expensive|above our budget|too much|can't afford|budget|discount|cheaper|reduce|installment|split)\b/i.test(lower)) {
    if (params.packages.authorizePaymentSplit) {
      return {
        reply:
          `Completely understand budget planning, ${companyGreeting}. Our Basic 1-page package starts at ${fmt(basic.priceNaira)} (delivered in ${params.packages.deliveryTimeline.toLowerCase()}), and if needed we can also arrange a 50/50 payment split — half to begin after you approve the free preview and half on completion. Would starting with Basic or a split on Standard (${fmt(standard.priceNaira)}) work better?`,
        shouldMarkClosed: false,
      };
    }
    return {
      reply:
        `I understand completely, ${companyGreeting}. If ${fmt(standard.priceNaira)} is above your current budget, our Basic package is ${fmt(basic.priceNaira)} for a clean, mobile-friendly 1-page site with WhatsApp integration and Google Business Profile setup — and you still get to inspect the free homepage preview first before deciding. Would you like to see how Basic looks?`,
      shouldMarkClosed: false,
    };
  }

  if (/\b(difference|compare|between basic|between standard|between premium)\b/i.test(lower)) {
    return {
      reply:
        `Great question, ${companyGreeting}. Basic (${fmt(basic.priceNaira)}, ${basic.pagesLabel}) gives you a clean mobile-friendly landing page with direct WhatsApp contact. Standard (${fmt(standard.priceNaira)}, ${standard.pagesLabel}) is what we recommend for established real estate firms — it adds separate Home, About, Estates, Listings, and Contact pages, property gallery, inquiry form logged to Google Sheets, and Google Maps. Premium (${fmt(premium.priceNaira)}, ${premium.pagesLabel}) adds property search filters, inspection booking, and 1 month of listing updates. Delivery is ${params.packages.deliveryTimeline.toLowerCase()}. Which fits your current stage best?`,
      shouldMarkClosed: false,
    };
  }

  if (/\b(how much|price|cost|pricing|package|fee|rate|charge)\b/i.test(lower)) {
    return {
      reply:
        `Thanks for asking, ${companyGreeting}. We have three transparent packages delivered in ${params.packages.deliveryTimeline.toLowerCase()}:\n` +
        `• Basic (${fmt(basic.priceNaira)}) — ${basic.pagesLabel}, mobile design, WhatsApp CTA & Google Business setup.\n` +
        `• Standard (${fmt(standard.priceNaira)}) — ${standard.pagesLabel}, property gallery, buyer inquiry form, Google Maps & Sheets logging (recommended for established firms).\n` +
        `• Premium (${fmt(premium.priceNaira)}) — ${premium.pagesLabel}, search filters, inspection booking & 1 month listing updates.\n` +
        `Before you pay anything, I can put together a free homepage preview using your firm's name. Would you like to see that first?`,
      shouldMarkClosed: false,
    };
  }

  if (/\b(clients|buyers|sales|instagram|why do we need|already get inquiries|get us|convert)\b/i.test(lower)) {
    return {
      reply:
        `Fair question, ${companyGreeting}. A website doesn't guarantee a fixed number of sales on its own, but it gives serious buyers from Instagram, WhatsApp links, and Google one structured place to verify your company, browse estates clearly without scrolling old posts, and reach you directly via WhatsApp or an inquiry form. It also makes any social ads you run look more credible. Would you like a free homepage preview with your company name so you can judge if it helps your positioning?`,
      shouldMarkClosed: false,
    };
  }

  return {
    reply:
      `Thank you for replying, ${companyGreeting}. I'd be happy to share a free homepage concept preview built around ${params.lead ? params.lead.business_name : 'your real estate firm'} so you can see how your estates and WhatsApp inquiry flow would look online (delivered in ${params.packages.deliveryTimeline.toLowerCase()} if you decide to proceed). Shall I put the preview together for you?`,
    shouldMarkClosed: false,
  };
}
