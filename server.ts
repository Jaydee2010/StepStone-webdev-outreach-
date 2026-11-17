import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  discoverBusinessesWithSearch,
  generateOutreachForLead,
  generateProspectReply,
  inspectAndQualifyCandidate,
  type RawDiscoveredCompany,
} from './server/gemini.ts';
import {
  findDuplicateLead,
  readDb,
  writeDb,
} from './server/storage.ts';
import {
  ALL_STATES_OPTION,
  NIGERIAN_STATES,
  type AgencyPackagesConfig,
  type LeadLifecycleStatus,
  type LeadRecord,
  type SearchLog,
} from './src/types/stepstone.ts';

const PORT = Number(process.env.PORT) || 3000;

function isValidLocation(loc: string): boolean {
  if (loc === ALL_STATES_OPTION) return true;
  return (NIGERIAN_STATES as readonly string[]).includes(loc);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(runners);
  return results;
}

function extractApiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : 'Internal server error';
  if (/API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return {
      status: 403,
      message:
        'Gemini API key is missing or invalid. Please verify it in the Settings > Secrets panel.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return {
      status: 429,
      message:
        'Gemini API rate limit reached. Please wait briefly and try again.',
    };
  }
  return { status: 500, message: msg };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Get full persisted workspace state
  app.get('/api/state', (_req, res) => {
    const db = readDb();
    res.json(db);
  });

  // Mode A: State-locked Business Discovery + Website Investigation + Qualification
  app.post('/api/discover', async (req, res) => {
    try {
      const { selectedState, customKeywords, maxResults } = req.body as {
        selectedState?: string;
        customKeywords?: string[];
        maxResults?: number;
      };

      const targetState = selectedState || 'FCT (Abuja)';
      if (!isValidLocation(targetState)) {
        return res.status(400).json({
          error: `Invalid Nigerian location "${targetState}". Please select one of the 36 states, FCT (Abuja), or All Nigerian States.`,
        });
      }

      const db = readDb();
      const existingNames = db.leads.map((l) => l.business_name);

      const discovery = await discoverBusinessesWithSearch({
        selectedState: targetState,
        customKeywords: Array.isArray(customKeywords)
          ? customKeywords.filter((k) => typeof k === 'string' && k.trim().length > 0)
          : undefined,
        existingBusinessNames: existingNames,
        maxResults: typeof maxResults === 'number' ? maxResults : 5,
      });

      const uniqueCandidates: RawDiscoveredCompany[] = [];
      let duplicatesSkipped = 0;

      for (const candidate of discovery.candidates) {
        const dupInDb = findDuplicateLead(db.leads, candidate);
        const dupInBatch = uniqueCandidates.some(
          (u) =>
            u.business_name.toLowerCase() === candidate.business_name.toLowerCase() &&
            u.state.toLowerCase() === candidate.state.toLowerCase()
        );
        if (dupInDb || dupInBatch) {
          duplicatesSkipped++;
        } else {
          uniqueCandidates.push(candidate);
        }
      }

      const verifiedLeads = await mapWithConcurrency(
        uniqueCandidates,
        3,
        (candidate) => inspectAndQualifyCandidate(candidate)
      );

      db.leads = [...verifiedLeads, ...db.leads];

      const searchLog: SearchLog = {
        id: `search-${Date.now()}`,
        timestamp: new Date().toISOString(),
        selectedState: targetState,
        keywords: discovery.keywordsUsed,
        discoveredCount: verifiedLeads.length,
        duplicatesSkipped,
        notes: discovery.honestNote,
      };
      db.searches = [searchLog, ...db.searches].slice(0, 30);
      writeDb(db);

      res.json({
        leads: verifiedLeads,
        newlyAddedCount: verifiedLeads.length,
        duplicatesSkipped,
        searchLog,
        honestStatusNote: discovery.honestNote,
      });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Manual single-business lookup + live website inspection
  app.post('/api/leads/inspect-manual', async (req, res) => {
    try {
      const { business_name, business_category, state, city, website_url, phone, instagram_url } =
        req.body as {
          business_name?: string;
          business_category?: string;
          state?: string;
          city?: string;
          website_url?: string | null;
          phone?: string | null;
          instagram_url?: string | null;
        };

      if (!business_name || !business_name.trim()) {
        return res.status(400).json({ error: 'Company name is required.' });
      }
      const targetState = state && isValidLocation(state) && state !== ALL_STATES_OPTION
        ? state
        : 'FCT (Abuja)';

      const db = readDb();
      const duplicate = findDuplicateLead(db.leads, {
        business_name: business_name.trim(),
        state: targetState,
        website_url: website_url ?? null,
        phone: phone ?? null,
      });
      if (duplicate) {
        return res.status(409).json({
          error: `"${duplicate.business_name}" already exists in ${duplicate.state}. Open it from the leads list to re-inspect.`,
          existingLead: duplicate,
        });
      }

      const lead = await inspectAndQualifyCandidate({
        business_name: business_name.trim(),
        business_category: (business_category || 'Real Estate Company').trim(),
        state: targetState,
        city: (city || '').trim(),
        phone: phone?.trim() || null,
        website_url: website_url?.trim() || null,
        instagram_url: instagram_url?.trim() || null,
        facebook_url: null,
        google_business_profile_url: null,
        source_urls: [],
        discovery_notes: 'Added manually for website investigation.',
      });

      db.leads = [lead, ...db.leads];
      writeDb(db);
      res.json({ lead });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Re-inspect an existing lead's website (and optionally update its URL first)
  app.post('/api/leads/:id/inspect', async (req, res) => {
    try {
      const { id } = req.params;
      const { website_url } = (req.body || {}) as { website_url?: string | null };
      const db = readDb();
      const idx = db.leads.findIndex((l) => l.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Lead not found.' });
      }
      const existing = db.leads[idx];
      const updatedLead = await inspectAndQualifyCandidate({
        business_name: existing.business_name,
        business_category: existing.business_category,
        state: existing.state,
        city: existing.city,
        phone: existing.phone,
        website_url: website_url !== undefined ? website_url : existing.website_url,
        instagram_url: existing.instagram_url,
        facebook_url: existing.facebook_url,
        google_business_profile_url: existing.google_business_profile_url,
        source_urls: existing.source_urls,
        discovery_notes: existing.inspection_evidence,
      });

      const merged: LeadRecord = {
        ...updatedLead,
        id: existing.id,
        discovered_at: existing.discovered_at,
        search_state: existing.search_state,
        lead_lifecycle: existing.lead_lifecycle,
        outreach: updatedLead.skip ? null : existing.outreach,
      };
      db.leads[idx] = merged;
      writeDb(db);
      res.json({ lead: merged });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Mode B: Generate outreach & homepage preview brief for a qualified lead
  app.post('/api/leads/:id/outreach', async (req, res) => {
    try {
      const { id } = req.params;
      const db = readDb();
      const idx = db.leads.findIndex((l) => l.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Lead not found.' });
      }
      const lead = db.leads[idx];
      if (lead.skip || lead.opportunity_score <= 2) {
        return res.status(400).json({
          error:
            'Outreach cannot be generated for skipped businesses (opportunity score 1 or 2).',
        });
      }

      const outreach = await generateOutreachForLead(lead, db.packages);
      db.leads[idx] = {
        ...lead,
        outreach,
        lead_lifecycle: lead.lead_lifecycle === 'new' ? 'outreach_ready' : lead.lead_lifecycle,
      };
      writeDb(db);
      res.json({ lead: db.leads[idx], outreach });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Update lead lifecycle or editable contact fields
  app.patch('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    const { lead_lifecycle, phone, instagram_url, facebook_url } = req.body as {
      lead_lifecycle?: LeadLifecycleStatus;
      phone?: string | null;
      instagram_url?: string | null;
      facebook_url?: string | null;
    };
    const db = readDb();
    const idx = db.leads.findIndex((l) => l.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    const current = db.leads[idx];
    db.leads[idx] = {
      ...current,
      lead_lifecycle: lead_lifecycle ?? current.lead_lifecycle,
      phone: phone !== undefined ? phone : current.phone,
      instagram_url: instagram_url !== undefined ? instagram_url : current.instagram_url,
      facebook_url: facebook_url !== undefined ? facebook_url : current.facebook_url,
    };
    writeDb(db);
    res.json({ lead: db.leads[idx] });
  });

  app.delete('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    db.leads = db.leads.filter((l) => l.id !== id);
    writeDb(db);
    res.json({ ok: true });
  });

  // Reply Handling endpoint (returns { reply } + optional lead closure)
  app.post('/api/reply', async (req, res) => {
    try {
      const { leadId, prospectMessage } = req.body as {
        leadId?: string | null;
        prospectMessage?: string;
      };
      if (!prospectMessage || !prospectMessage.trim()) {
        return res.status(400).json({ error: 'Prospect message is required.' });
      }
      const db = readDb();
      const leadIdx = leadId ? db.leads.findIndex((l) => l.id === leadId) : -1;
      const lead = leadIdx >= 0 ? db.leads[leadIdx] : null;

      const result = await generateProspectReply({
        lead,
        prospectMessage: prospectMessage.trim(),
        packages: db.packages,
      });

      let updatedLead: LeadRecord | null = lead;
      if (leadIdx >= 0 && db.leads[leadIdx]) {
        db.leads[leadIdx] = {
          ...db.leads[leadIdx],
          lead_lifecycle: result.shouldMarkClosed ? 'closed' : 'replied',
        };
        updatedLead = db.leads[leadIdx];
        writeDb(db);
      }

      res.json({
        reply: result.reply,
        shouldMarkClosed: result.shouldMarkClosed,
        lead: updatedLead,
      });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Update editable packages & authorization settings
  app.put('/api/packages', (req, res) => {
    const body = req.body as AgencyPackagesConfig;
    if (!body || !Array.isArray(body.tiers) || body.tiers.length !== 3) {
      return res.status(400).json({ error: 'Valid 3-tier package configuration is required.' });
    }
    const db = readDb();
    db.packages = {
      deliveryTimeline: body.deliveryTimeline || 'Approximately 7 days',
      authorizePaymentSplit: Boolean(body.authorizePaymentSplit),
      tiers: body.tiers.map((t) => ({
        ...t,
        priceNaira: Math.max(0, Number(t.priceNaira) || 0),
        features: Array.isArray(t.features)
          ? t.features.map((f) => String(f).trim()).filter(Boolean)
          : [],
      })),
    };
    writeDb(db);
    res.json({ packages: db.packages });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stepstone Web Agency Brain running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
