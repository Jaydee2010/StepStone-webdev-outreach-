import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  MapPin,
  Menu,
  MessageSquareReply,
  Package,
  Search,
  Send,
  X,
} from 'lucide-react';
import { DiscoveryView } from './components/DiscoveryView.tsx';
import { OutreachPreviewView } from './components/OutreachPreviewView.tsx';
import { PackagesView } from './components/PackagesView.tsx';
import { ReplyHandlerView } from './components/ReplyHandlerView.tsx';
import {
  ALL_STATES_OPTION,
  NIGERIAN_STATES,
  type AgencyPackagesConfig,
  type DiscoveryResponse,
  type EngineMode,
  type LeadLifecycleStatus,
  type LeadRecord,
  type LocationSelection,
} from './types/stepstone.ts';
import { getNextMockupPresetId, resolveMockupPreset } from './utils/mockupDesigns.ts';

type WorkspaceTab = 'discovery' | 'outreach' | 'replies' | 'packages';

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'discovery', label: 'Lead Discovery', icon: Building2 },
  { id: 'outreach', label: 'Outreach & Mockups', icon: Send },
  { id: 'replies', label: 'Reply Handler', icon: MessageSquareReply },
  { id: 'packages', label: 'Packages', icon: Package },
];

const LS_LEADS_KEY = 'stepstone_leads_v1';
const LS_PACKAGES_KEY = 'stepstone_packages_v1';
const LS_ENGINE_KEY = 'stepstone_engine_mode_v1';

const FALLBACK_PACKAGES: AgencyPackagesConfig = {
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

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(
      `Server returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`
    );
  }
  if (!res.ok) {
    throw new Error(
      (typeof data?.error === 'string' && data.error) || `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('discovery');
  const [selectedState, setSelectedState] = useState<LocationSelection>('FCT (Abuja)');
  const [engineMode, setEngineMode] = useState<EngineMode>(() => {
    const saved = readLocalJson<string>(LS_ENGINE_KEY, 'auto');
    return saved === 'free' || saved === 'ai' ? saved : 'auto';
  });
  const [leads, setLeads] = useState<LeadRecord[]>(() =>
    readLocalJson<LeadRecord[]>(LS_LEADS_KEY, [])
  );
  const [packages, setPackages] = useState<AgencyPackagesConfig | null>(() =>
    readLocalJson<AgencyPackagesConfig | null>(LS_PACKAGES_KEY, null)
  );
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lastDiscovery, setLastDiscovery] = useState<DiscoveryResponse | null>(null);

  const [loadingState, setLoadingState] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    writeLocalJson(LS_LEADS_KEY, leads);
  }, [leads]);

  useEffect(() => {
    writeLocalJson(LS_ENGINE_KEY, engineMode);
  }, [engineMode]);

  useEffect(() => {
    if (packages) {
      writeLocalJson(LS_PACKAGES_KEY, packages);
    }
  }, [packages]);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      const data = await parseApiResponse<{
        leads?: LeadRecord[];
        packages?: AgencyPackagesConfig;
      }>(res);
      const serverLeads = Array.isArray(data.leads) ? data.leads : [];
      if (serverLeads.length > 0) {
        setLeads((prev) => {
          const seen = new Set(serverLeads.map((l) => l.id));
          const merged = [...serverLeads, ...prev.filter((l) => !seen.has(l.id))];
          return merged;
        });
      }
      setPackages((prev) => prev ?? data.packages ?? FALLBACK_PACKAGES);
    } catch (err) {
      setPackages((prev) => prev ?? FALLBACK_PACKAGES);
      setErrorBanner(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialState();
  }, [fetchInitialState]);

  const handleRunDiscovery = async (customKeywords?: string[], maxResults = 5) => {
    if (discovering) return;
    setErrorBanner(null);
    setInfoNotice(null);
    setDiscovering(true);
    setActiveTab('discovery');
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedState,
          customKeywords,
          maxResults,
          existingBusinessNames: leads.map((l) => l.business_name),
          engineMode,
        }),
      });
      const discovery = await parseApiResponse<DiscoveryResponse>(res);
      setLastDiscovery(discovery);
      if (discovery.quotaNotice) {
        setInfoNotice(discovery.quotaNotice);
      }
      setLeads((prev) => [...discovery.leads, ...prev]);
      if (discovery.leads.length > 0) {
        setSelectedLeadId(discovery.leads[0].id);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Discovery failed.');
    } finally {
      setDiscovering(false);
    }
  };

  const handleManualInspect = async (payload: {
    business_name: string;
    business_category: string;
    state: string;
    city: string;
    website_url: string;
    phone: string;
    instagram_url: string;
  }) => {
    setErrorBanner(null);
    setInfoNotice(null);
    try {
      const res = await fetch('/api/leads/inspect-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, engineMode }),
      });
      const data = await parseApiResponse<{ lead: LeadRecord }>(res);
      setLeads((prev) => [data.lead, ...prev]);
      setSelectedLeadId(data.lead.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to inspect company.';
      setErrorBanner(msg);
      throw new Error(msg);
    }
  };

  const handleReinspectLead = async (id: string, websiteUrl?: string | null) => {
    setErrorBanner(null);
    setInfoNotice(null);
    try {
      const targetLead = leads.find((l) => l.id === id);
      const res = await fetch(`/api/leads/${id}/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: websiteUrl, lead: targetLead, engineMode }),
      });
      const data = await parseApiResponse<{ lead: LeadRecord }>(res);
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to re-inspect website.');
    }
  };

  const handleGenerateOutreach = async (id: string) => {
    setErrorBanner(null);
    setInfoNotice(null);
    try {
      const targetLead = leads.find((l) => l.id === id);
      const nextVariantId = targetLead
        ? targetLead.outreach
          ? getNextMockupPresetId(resolveMockupPreset(targetLead).id)
          : resolveMockupPreset(targetLead).id
        : null;
      const res = await fetch(`/api/leads/${id}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: targetLead, packages, engineMode }),
      });
      const data = await parseApiResponse<{
        lead: LeadRecord;
        quotaNotice?: string | null;
      }>(res);
      if (data.quotaNotice) {
        setInfoNotice(data.quotaNotice);
      }
      const updatedWithVariant: LeadRecord = {
        ...data.lead,
        mockup_variant_id: nextVariantId ?? data.lead.mockup_variant_id ?? null,
      };
      setLeads((prev) => prev.map((l) => (l.id === id ? updatedWithVariant : l)));
      if (nextVariantId) {
        void fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mockup_variant_id: nextVariantId,
            lead: updatedWithVariant,
          }),
        });
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to generate outreach.');
    }
  };

  const handleUpdateLifecycle = async (id: string, lifecycle: LeadLifecycleStatus) => {
    setErrorBanner(null);
    const targetLead = leads.find((l) => l.id === id);
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, lead_lifecycle: lifecycle } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_lifecycle: lifecycle, lead: targetLead }),
      });
      const data = await parseApiResponse<{ lead: LeadRecord }>(res);
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update lead stage.');
    }
  };

  const handleUpdateLeadPhone = async (id: string, phone: string | null) => {
    setErrorBanner(null);
    const targetLead = leads.find((l) => l.id === id);
    const cleanedPhone = phone && phone.trim() ? phone.trim() : null;
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, phone: cleanedPhone } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanedPhone, lead: targetLead }),
      });
      const data = await parseApiResponse<{ lead: LeadRecord }>(res);
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update lead phone number.');
    }
  };

  const handleUpdateMockupVariant = async (id: string, variantId: string) => {
    setErrorBanner(null);
    const targetLead = leads.find((l) => l.id === id);
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, mockup_variant_id: variantId } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockup_variant_id: variantId, lead: targetLead }),
      });
      const data = await parseApiResponse<{ lead: LeadRecord }>(res);
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
      }
    } catch {
      // Local design selection already applied
    }
  };

  const handleDeleteLead = async (id: string) => {
    setErrorBanner(null);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (selectedLeadId === id) setSelectedLeadId(null);
    try {
      await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    } catch {
      // Local removal already applied
    }
  };

  const handleGenerateReply = async (leadId: string | null, prospectMessage: string) => {
    setErrorBanner(null);
    setInfoNotice(null);
    try {
      const targetLead = leadId ? leads.find((l) => l.id === leadId) ?? null : null;
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, prospectMessage, lead: targetLead, packages, engineMode }),
      });
      const data = await parseApiResponse<{
        reply: string;
        shouldMarkClosed: boolean;
        lead?: LeadRecord | null;
        quotaNotice?: string | null;
      }>(res);
      if (data.quotaNotice) {
        setInfoNotice(data.quotaNotice);
      }
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === data.lead!.id ? data.lead! : l)));
      }
      return { reply: data.reply, shouldMarkClosed: data.shouldMarkClosed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reply generation failed.';
      setErrorBanner(msg);
      throw new Error(msg);
    }
  };

  const handleSavePackages = async (next: AgencyPackagesConfig) => {
    setErrorBanner(null);
    setPackages(next);
    try {
      const res = await fetch('/api/packages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await parseApiResponse<{ packages: AgencyPackagesConfig }>(res);
      setPackages(data.packages);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save packages to server.');
    }
  };

  const qualifiedCount = leads.filter((l) => !l.skip && l.opportunity_score >= 3).length;
  const outreachReadyCount = leads.filter((l) => l.outreach !== null).length;
  const currentTabTitle = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Lead Discovery';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white lg:flex">
        <div>
          <div className="border-b border-slate-200 px-6 py-5">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Stepstone Agency
            </span>
          </div>

          <nav className="space-y-1 p-3" aria-label="Workspace navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-emerald-800' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quiet Pipeline Numbers */}
        <div className="border-t border-slate-200 p-5 text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span>Stored Leads</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {leads.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Qualified (3–5)</span>
            <span className="font-mono font-semibold text-emerald-800 tabular-nums">
              {qualifiedCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Outreach Drafted</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {outreachReadyCount}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-50 flex w-64 flex-col justify-between bg-white p-4 shadow-xl">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <span className="font-display text-base font-bold text-slate-900">
                  Stepstone Agency
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="mt-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-500 hidden sm:inline">
                Stepstone Web Agency
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-900 whitespace-nowrap">
                {currentTabTitle}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="engine-selector" className="sr-only">
              Discovery & Generation Engine
            </label>
            <select
              id="engine-selector"
              value={engineMode}
              onChange={(e) => setEngineMode(e.target.value as EngineMode)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-700 focus:outline-none"
              title="Choose between Auto fallback, Free Directory & Playbook (0 AI quota), or Gemini AI Only"
            >
              <option value="auto">Auto (AI → Free Fallback)</option>
              <option value="free">Free Directory &amp; Playbook (0 AI Quota)</option>
              <option value="ai">Gemini AI Only</option>
            </select>

            <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-800 shrink-0" />
              <label htmlFor="state-selector" className="sr-only">
                Target Nigerian State
              </label>
              <select
                id="state-selector"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value as LocationSelection)}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              >
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
                <option value={ALL_STATES_OPTION}>{ALL_STATES_OPTION}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleRunDiscovery()}
              disabled={discovering}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{discovering ? 'Searching...' : 'Run Discovery'}</span>
            </button>
          </div>
        </header>

        {/* Transparent Fallback Notice */}
        {infoNotice && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:mx-6">
            <span>{infoNotice}</span>
            <div className="flex items-center gap-2">
              {engineMode !== 'free' && (
                <button
                  type="button"
                  onClick={() => {
                    setEngineMode('free');
                    setInfoNotice(null);
                  }}
                  className="rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                >
                  Always Use Free Mode
                </button>
              )}
              <button
                type="button"
                onClick={() => setInfoNotice(null)}
                className="rounded p-1 text-amber-800 hover:bg-amber-100"
                aria-label="Dismiss notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorBanner && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 sm:mx-6">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="rounded p-1 text-red-700 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Viewport Body */}
        <main className="flex-1 p-4 sm:p-6">
          {loadingState ? (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="h-20 rounded-xl border border-slate-200 bg-white p-5">
                <div className="h-4 w-64 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-96 rounded bg-slate-100" />
              </div>
              <div className="h-96 rounded-xl border border-slate-200 bg-white p-6">
                <div className="h-4 w-48 rounded bg-slate-200" />
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-slate-100" />
                  <div className="h-3 w-5/6 rounded bg-slate-100" />
                  <div className="h-3 w-4/6 rounded bg-slate-100" />
                </div>
              </div>
            </div>
          ) : activeTab === 'discovery' ? (
            <DiscoveryView
              leads={leads}
              selectedState={selectedState}
              discovering={discovering}
              lastDiscovery={lastDiscovery}
              selectedLeadId={selectedLeadId}
              onSelectLead={setSelectedLeadId}
              onRunDiscovery={handleRunDiscovery}
              onManualInspect={handleManualInspect}
              onReinspectLead={handleReinspectLead}
              onGenerateOutreach={handleGenerateOutreach}
              onUpdateLifecycle={handleUpdateLifecycle}
              onDeleteLead={handleDeleteLead}
              onOpenOutreachTab={(id) => {
                setSelectedLeadId(id);
                setActiveTab('outreach');
              }}
            />
          ) : activeTab === 'outreach' ? (
            <OutreachPreviewView
              leads={leads}
              selectedLeadId={selectedLeadId}
              onSelectLead={(id) => setSelectedLeadId(id)}
              onGenerateOutreach={handleGenerateOutreach}
              onUpdateLifecycle={handleUpdateLifecycle}
              onUpdatePhone={handleUpdateLeadPhone}
              onChangeDesignVariant={handleUpdateMockupVariant}
            />
          ) : activeTab === 'replies' && packages ? (
            <ReplyHandlerView
              leads={leads}
              packages={packages}
              onGenerateReply={handleGenerateReply}
            />
          ) : packages ? (
            <PackagesView packages={packages} onSavePackages={handleSavePackages} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
