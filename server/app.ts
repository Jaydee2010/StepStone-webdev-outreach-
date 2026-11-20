import express from 'express';
import {
  discoverBusinessesWithSearch,
  generateOutreachForLead,
  generateProspectReply,
  inspectAndQualifyBatch,
  inspectAndQualifyCandidate,
  type RawDiscoveredCompany,
} from './gemini.ts';
import {
  findDuplicateLead,
  normalizeCompanyName,
  readDb,
  writeDb,
} from './storage.ts';
import {
  ALL_STATES_OPTION,
  NIGERIAN_STATES,
  type AgencyPackagesConfig,
  type EngineMode,
  type LeadLifecycleStatus,
  type LeadRecord,
  type SearchLog,
} from '../src/types/stepstone.ts';

function normalizeEngineMode(val: unknown): EngineMode {
  return val === 'free' || val === 'ai' ? val : 'auto';
}

function isValidLocation(loc: string): boolean {
  if (loc === ALL_STATES_OPTION) return true;
  return (NIGERIAN_STATES as readonly string[]).includes(loc);
}

function extractApiError(err: unknown): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err ?? 'Internal server error');
  if (/API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMsg)) {
    return {
      status: 403,
      message:
        'Gemini API key is missing or invalid. Please check your GEMINI_API_KEY environment variable or Settings > Secrets panel.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(rawMsg)) {
    let readable = rawMsg;
    let quotaMetrics: string[] = [];
    let retryDelay = '';
    try {
      const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          error?: {
            message?: string;
            details?: Array<{
              retryDelay?: string;
              violations?: Array<{ quotaMetric?: string; quotaId?: string; quotaValue?: string }>;
            }>;
          };
        };
        if (parsed?.error?.message) {
          readable = parsed.error.message;
        }
        for (const d of parsed?.error?.details ?? []) {
          if (d.retryDelay) retryDelay = d.retryDelay;
          for (const v of d.violations ?? []) {
            if (v.quotaMetric || v.quotaId) {
              quotaMetrics.push(
                `${v.quotaId || v.quotaMetric}${v.quotaValue ? ` (limit: ${v.quotaValue})` : ''}`
              );
            }
          }
        }
      }
    } catch {
      // Keep raw message if not JSON
    }

    const isPerMinute = /PerMinute|RPM|TPM/i.test(rawMsg) && !/limit:\s*0\b/i.test(rawMsg);
    const metricsSummary = quotaMetrics.length > 0 ? ` [${quotaMetrics.join(', ')}]` : '';
    const hint = isPerMinute
      ? `Rate limit hit (${retryDelay ? `retry after ${retryDelay}` : 'wait ~60s'}) or upgrade your project to Pay-as-you-go billing in Google AI Studio.`
      : 'Your API key free-tier/daily quota is exhausted or set to 0 for this model/Search Grounding (waiting 60s will not reset this). Open https://aistudio.google.com/apikey -> link a Billing account (Pay-as-you-go) and verify usage at https://ai.dev/usage?tab=rate-limit.';

    return {
      status: 429,
      message: `Gemini API 429 Quota Error${metricsSummary}: ${readable.replace(/\s+/g, ' ').slice(0, 400)} — ${hint}`,
    };
  }
  return { status: 500, message: rawMsg };
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Get full persisted workspace state
  router.get('/state', (_req, res) => {
    const db = readDb();
    res.json(db);
  });

  // Mode A: State-locked Business Discovery + Website Investigation + Qualification
  router.post('/discover', async (req, res) => {
    try {
      const { selectedState, customKeywords, maxResults, existingBusinessNames, engineMode } =
        req.body as {
          selectedState?: string;
          customKeywords?: string[];
          maxResults?: number;
          existingBusinessNames?: string[];
          engineMode?: EngineMode;
        };

      const targetState = selectedState || 'FCT (Abuja)';
      if (!isValidLocation(targetState)) {
        return res.status(400).json({
          error: `Invalid Nigerian location "${targetState}". Please select one of the 36 states, FCT (Abuja), or All Nigerian States.`,
        });
      }

      const mode = normalizeEngineMode(engineMode);
      const db = readDb();
      const clientNames = Array.isArray(existingBusinessNames)
        ? existingBusinessNames.filter((n) => typeof n === 'string' && n.trim().length > 0)
        : [];
      const combinedExistingNames = Array.from(
        new Set([...db.leads.map((l) => l.business_name), ...clientNames])
      );

      const discovery = await discoverBusinessesWithSearch({
        selectedState: targetState,
        customKeywords: Array.isArray(customKeywords)
          ? customKeywords.filter((k) => typeof k === 'string' && k.trim().length > 0)
          : undefined,
        existingBusinessNames: combinedExistingNames,
        maxResults: typeof maxResults === 'number' ? maxResults : 5,
        engineMode: mode,
      });

      const uniqueCandidates: RawDiscoveredCompany[] = [];
      let duplicatesSkipped = 0;

      const normalizedClientSet = new Set(
        clientNames.map((name) => normalizeCompanyName(name)).filter(Boolean)
      );

      for (const candidate of discovery.candidates) {
        const dupInDb = findDuplicateLead(db.leads, candidate);
        const dupInClient = normalizedClientSet.has(
          normalizeCompanyName(candidate.business_name)
        );
        const dupInBatch = uniqueCandidates.some(
          (u) =>
            u.business_name.toLowerCase() === candidate.business_name.toLowerCase() &&
            u.state.toLowerCase() === candidate.state.toLowerCase()
        );
        if (dupInDb || dupInClient || dupInBatch) {
          duplicatesSkipped++;
        } else {
          uniqueCandidates.push(candidate);
        }
      }

      const inspectMode: EngineMode =
        discovery.engineUsed === 'free_directory' && mode !== 'ai' ? 'free' : mode;
      const verifiedLeads = await inspectAndQualifyBatch(uniqueCandidates, inspectMode);
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
        engineUsed: discovery.engineUsed,
        quotaNotice: discovery.quotaNotice,
      });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Manual single-business lookup + live website inspection
  router.post('/leads/inspect-manual', async (req, res) => {
    try {
      const {
        business_name,
        business_category,
        state,
        city,
        website_url,
        phone,
        instagram_url,
        engineMode,
      } = req.body as {
        business_name?: string;
        business_category?: string;
        state?: string;
        city?: string;
        website_url?: string | null;
        phone?: string | null;
        instagram_url?: string | null;
        engineMode?: EngineMode;
      };

      if (!business_name || !business_name.trim()) {
        return res.status(400).json({ error: 'Company name is required.' });
      }
      const targetState =
        state && isValidLocation(state) && state !== ALL_STATES_OPTION
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

      const mode = normalizeEngineMode(engineMode);
      const lead = await inspectAndQualifyCandidate(
        {
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
        },
        mode !== 'free',
        mode
      );

      db.leads = [lead, ...db.leads];
      writeDb(db);
      res.json({ lead });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Re-inspect an existing lead's website (supports serverless fallback lead payload)
  router.post('/leads/:id/inspect', async (req, res) => {
    try {
      const { id } = req.params;
      const { website_url, lead: clientLead, engineMode } = (req.body || {}) as {
        website_url?: string | null;
        lead?: LeadRecord;
        engineMode?: EngineMode;
      };
      const db = readDb();
      const idx = db.leads.findIndex((l) => l.id === id);
      const existing = idx !== -1 ? db.leads[idx] : clientLead;
      if (!existing) {
        return res.status(404).json({ error: 'Lead not found.' });
      }

      const mode = normalizeEngineMode(engineMode);
      const updatedLead = await inspectAndQualifyCandidate(
        {
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
        },
        mode !== 'free',
        mode
      );

      const merged: LeadRecord = {
        ...updatedLead,
        id: existing.id,
        discovered_at: existing.discovered_at,
        search_state: existing.search_state,
        lead_lifecycle: existing.lead_lifecycle,
        outreach: updatedLead.skip ? null : existing.outreach,
      };
      if (idx !== -1) {
        db.leads[idx] = merged;
      } else {
        db.leads = [merged, ...db.leads];
      }
      writeDb(db);
      res.json({ lead: merged });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Mode B: Generate outreach & homepage preview brief for a qualified lead
  router.post('/leads/:id/outreach', async (req, res) => {
    try {
      const { id } = req.params;
      const { lead: clientLead, packages: clientPackages, engineMode } = (req.body || {}) as {
        lead?: LeadRecord;
        packages?: AgencyPackagesConfig;
        engineMode?: EngineMode;
      };
      const db = readDb();
      const idx = db.leads.findIndex((l) => l.id === id);
      const lead = idx !== -1 ? db.leads[idx] : clientLead;
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found.' });
      }
      if (lead.skip || lead.opportunity_score <= 2) {
        return res.status(400).json({
          error:
            'Outreach cannot be generated for skipped businesses (opportunity score 1 or 2).',
        });
      }

      const activePackages = clientPackages ?? db.packages;
      const result = await generateOutreachForLead(
        lead,
        activePackages,
        normalizeEngineMode(engineMode)
      );
      const updatedLead: LeadRecord = {
        ...lead,
        outreach: result.outreach,
        lead_lifecycle: lead.lead_lifecycle === 'new' ? 'outreach_ready' : lead.lead_lifecycle,
      };
      if (idx !== -1) {
        db.leads[idx] = updatedLead;
      } else {
        db.leads = [updatedLead, ...db.leads];
      }
      writeDb(db);
      res.json({
        lead: updatedLead,
        outreach: result.outreach,
        engineUsed: result.engineUsed,
        quotaNotice: result.quotaNotice,
      });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Update lead lifecycle or editable contact fields
  router.patch('/leads/:id', (req, res) => {
    const { id } = req.params;
    const { lead_lifecycle, phone, instagram_url, facebook_url, lead: clientLead } =
      req.body as {
        lead_lifecycle?: LeadLifecycleStatus;
        phone?: string | null;
        instagram_url?: string | null;
        facebook_url?: string | null;
        lead?: LeadRecord;
      };
    const db = readDb();
    const idx = db.leads.findIndex((l) => l.id === id);
    const current = idx !== -1 ? db.leads[idx] : clientLead;
    if (!current) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    const updated: LeadRecord = {
      ...current,
      lead_lifecycle: lead_lifecycle ?? current.lead_lifecycle,
      phone: phone !== undefined ? phone : current.phone,
      instagram_url: instagram_url !== undefined ? instagram_url : current.instagram_url,
      facebook_url: facebook_url !== undefined ? facebook_url : current.facebook_url,
    };
    if (idx !== -1) {
      db.leads[idx] = updated;
    } else {
      db.leads = [updated, ...db.leads];
    }
    writeDb(db);
    res.json({ lead: updated });
  });

  router.delete('/leads/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    db.leads = db.leads.filter((l) => l.id !== id);
    writeDb(db);
    res.json({ ok: true });
  });

  // Reply Handling endpoint (returns { reply } + optional lead closure)
  router.post('/reply', async (req, res) => {
    try {
      const {
        leadId,
        prospectMessage,
        lead: clientLead,
        packages: clientPackages,
        engineMode,
      } = req.body as {
        leadId?: string | null;
        prospectMessage?: string;
        lead?: LeadRecord | null;
        packages?: AgencyPackagesConfig;
        engineMode?: EngineMode;
      };
      if (!prospectMessage || !prospectMessage.trim()) {
        return res.status(400).json({ error: 'Prospect message is required.' });
      }
      const db = readDb();
      const leadIdx = leadId ? db.leads.findIndex((l) => l.id === leadId) : -1;
      const lead = leadIdx >= 0 ? db.leads[leadIdx] : clientLead ?? null;
      const activePackages = clientPackages ?? db.packages;

      const result = await generateProspectReply({
        lead,
        prospectMessage: prospectMessage.trim(),
        packages: activePackages,
        engineMode: normalizeEngineMode(engineMode),
      });

      let updatedLead: LeadRecord | null = lead;
      if (lead) {
        updatedLead = {
          ...lead,
          lead_lifecycle: result.shouldMarkClosed ? 'closed' : 'replied',
        };
        if (leadIdx >= 0) {
          db.leads[leadIdx] = updatedLead;
        } else {
          db.leads = [updatedLead, ...db.leads];
        }
        writeDb(db);
      }

      res.json({
        reply: result.reply,
        shouldMarkClosed: result.shouldMarkClosed,
        lead: updatedLead,
        engineUsed: result.engineUsed,
        quotaNotice: result.quotaNotice,
      });
    } catch (err) {
      const apiErr = extractApiError(err);
      res.status(apiErr.status).json({ error: apiErr.message });
    }
  });

  // Update editable packages & authorization settings
  router.put('/packages', (req, res) => {
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

  return router;
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const router = createApiRouter();
  // Mount at both /api and / so Vercel rewrites work regardless of path stripping
  app.use('/api', router);
  app.use('/', router);
  return app;
}
