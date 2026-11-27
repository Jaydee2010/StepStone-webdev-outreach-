import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_STATES_OPTION,
  NIGERIAN_STATES,
  toModeAJson,
  type DiscoveryResponse,
  type LeadLifecycleStatus,
  type LeadRecord,
  type LocationSelection,
  type WebsiteClassification,
} from '../types/stepstone.ts';

interface DiscoveryViewProps {
  leads: LeadRecord[];
  selectedState: LocationSelection;
  discovering: boolean;
  lastDiscovery: DiscoveryResponse | null;
  selectedLeadId: string | null;
  onSelectLead: (id: string | null) => void;
  onRunDiscovery: (customKeywords?: string[], maxResults?: number) => Promise<void>;
  onManualInspect: (payload: {
    business_name: string;
    business_category: string;
    state: string;
    city: string;
    website_url: string;
    phone: string;
    instagram_url: string;
  }) => Promise<void>;
  onReinspectLead: (id: string, websiteUrl?: string | null) => Promise<void>;
  onReverifyUnverified?: () => Promise<void>;
  onGenerateOutreach: (id: string) => Promise<boolean>;
  onUpdateLifecycle: (id: string, lifecycle: LeadLifecycleStatus) => Promise<void>;
  onDeleteLead: (id: string) => Promise<void>;
  onOpenOutreachTab: (id: string) => void;
}

const STATUS_LABELS: Record<WebsiteClassification, string> = {
  no_website: 'No Website',
  instagram_only: 'Instagram Only',
  social_only: 'Social Only',
  broken_website: 'Broken Website',
  weak_website: 'Weak Website',
  good_website: 'Good Website',
  unknown: 'Unknown',
};

function statusTextClass(status: WebsiteClassification): string {
  switch (status) {
    case 'no_website':
    case 'instagram_only':
    case 'social_only':
      return 'text-emerald-800 font-medium';
    case 'broken_website':
      return 'text-red-700 font-medium';
    case 'weak_website':
      return 'text-amber-700 font-medium';
    case 'good_website':
      return 'text-slate-600';
    default:
      return 'text-slate-500';
  }
}

export function DiscoveryView({
  leads,
  selectedState,
  discovering,
  lastDiscovery,
  selectedLeadId,
  onSelectLead,
  onRunDiscovery,
  onManualInspect,
  onReinspectLead,
  onReverifyUnverified,
  onGenerateOutreach,
  onUpdateLifecycle,
  onDeleteLead,
  onOpenOutreachTab,
}: DiscoveryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [qualFilter, setQualFilter] = useState<'all' | 'qualified' | 'skipped'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stateScopeFilter, setStateScopeFilter] = useState<'selected' | 'all'>('selected');
  const [keywordInput, setKeywordInput] = useState('');
  const [batchSize, setBatchSize] = useState<number>(5);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [reinspectingId, setReinspectingId] = useState<string | null>(null);
  const [reverifyingAll, setReverifyingAll] = useState(false);
  const [generatingOutreachId, setGeneratingOutreachId] = useState<string | null>(null);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [showModeAJson, setShowModeAJson] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const unverifiedCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          !l.website_url &&
          (l.website_status === 'no_website' ||
            l.website_status === 'instagram_only' ||
            l.website_status === 'social_only')
      ).length,
    [leads]
  );

  const [manualForm, setManualForm] = useState({
    business_name: '',
    business_category: 'Real Estate Company',
    state: (selectedState === ALL_STATES_OPTION ? 'FCT (Abuja)' : selectedState) as string,
    city: '',
    website_url: '',
    phone: '',
    instagram_url: '',
  });

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (
        stateScopeFilter === 'selected' &&
        selectedState !== ALL_STATES_OPTION &&
        lead.state.toLowerCase() !== selectedState.toLowerCase()
      ) {
        return false;
      }
      if (qualFilter === 'qualified' && (lead.skip || lead.opportunity_score <= 2)) {
        return false;
      }
      if (qualFilter === 'skipped' && !lead.skip && lead.opportunity_score > 2) {
        return false;
      }
      if (statusFilter !== 'all' && lead.website_status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          lead.business_name.toLowerCase().includes(q) ||
          lead.city.toLowerCase().includes(q) ||
          lead.state.toLowerCase().includes(q) ||
          lead.business_category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, stateScopeFilter, selectedState, qualFilter, statusFilter, searchQuery]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

  useEffect(() => {
    setOverrideUrl(selectedLead?.website_url ?? '');
  }, [selectedLead?.id, selectedLead?.website_url]);

  const handleSearchClick = async (e: React.FormEvent) => {
    e.preventDefault();
    const custom = keywordInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await onRunDiscovery(custom.length > 0 ? custom : undefined, batchSize);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.business_name.trim() || manualBusy) return;
    setManualBusy(true);
    try {
      await onManualInspect(manualForm);
      setManualForm({
        business_name: '',
        business_category: 'Real Estate Company',
        state: selectedState === ALL_STATES_OPTION ? 'FCT (Abuja)' : selectedState,
        city: '',
        website_url: '',
        phone: '',
        instagram_url: '',
      });
      setShowManualForm(false);
    } finally {
      setManualBusy(false);
    }
  };

  const handleCopyJson = async (lead: LeadRecord) => {
    await navigator.clipboard.writeText(JSON.stringify(toModeAJson(lead), null, 2));
    setCopiedId(lead.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleExportCsv = () => {
    const headers = [
      'business_name',
      'business_category',
      'state',
      'city',
      'phone',
      'website_url',
      'final_destination_url',
      'instagram_url',
      'facebook_url',
      'website_status',
      'opportunity_score',
      'skip',
      'confidence',
      'inspection_date',
      'qualification_reason',
    ];
    const escapeCell = (val: unknown) => {
      const s = val === null || val === undefined ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filteredLeads.map((l) =>
      [
        l.business_name,
        l.business_category,
        l.state,
        l.city,
        l.phone,
        l.website_url,
        l.final_destination_url,
        l.instagram_url,
        l.facebook_url,
        l.website_status,
        l.opportunity_score,
        l.skip,
        l.confidence,
        l.inspection_date,
        l.qualification_reason,
      ]
        .map(escapeCell)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stepstone-leads-${selectedState.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Discovery Control Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <h1 className="font-display text-xl font-semibold text-slate-900">
              State-Locked Discovery & Website Investigation
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Searching strictly in <strong className="font-semibold text-slate-900">{selectedState}</strong>. Every discovered firm undergoes website discovery, live HTTP redirect & functionality checks, and 1–5 qualification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onReverifyUnverified && unverifiedCount > 0 && (
              <button
                type="button"
                disabled={reverifyingAll}
                onClick={async () => {
                  setReverifyingAll(true);
                  try {
                    await onReverifyUnverified();
                  } finally {
                    setReverifyingAll(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                title="Re-check stored no-website/social-only leads for hidden company domains"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reverifyingAll ? 'animate-spin' : ''}`} />
                <span>
                  {reverifyingAll
                    ? 'Re-verifying...'
                    : `Re-verify Unverified (${unverifiedCount})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Inspect Specific Company</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSearchClick} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={`Optional search keywords (comma-separated) — defaults to multi-angle real estate search in ${selectedState}`}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            aria-label="Results per search"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-700 focus:outline-none"
          >
            <option value={5}>Up to 5 firms</option>
            <option value={8}>Up to 8 firms</option>
          </select>
          <button
            type="submit"
            disabled={discovering}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Search className="h-4 w-4" />
            <span>{discovering ? `Discovering in ${selectedState}...` : `Discover in ${selectedState}`}</span>
          </button>
        </form>

        {/* Manual Inspection Panel */}
        {showManualForm && (
          <form
            onSubmit={handleManualSubmit}
            className="mt-4 border-t border-slate-200 pt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input
              type="text"
              required
              value={manualForm.business_name}
              onChange={(e) => setManualForm({ ...manualForm, business_name: e.target.value })}
              placeholder="Company Name *"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <select
              value={manualForm.state}
              onChange={(e) => setManualForm({ ...manualForm, state: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            >
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={manualForm.city}
              onChange={(e) => setManualForm({ ...manualForm, city: e.target.value })}
              placeholder="City / District (e.g. Wuse II)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <input
              type="text"
              value={manualForm.website_url}
              onChange={(e) => setManualForm({ ...manualForm, website_url: e.target.value })}
              placeholder="Website URL (leave blank to search)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <input
              type="text"
              value={manualForm.business_category}
              onChange={(e) => setManualForm({ ...manualForm, business_category: e.target.value })}
              placeholder="Category (e.g. Property Developer)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <input
              type="text"
              value={manualForm.phone}
              onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
              placeholder="Public Phone (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <input
              type="text"
              value={manualForm.instagram_url}
              onChange={(e) => setManualForm({ ...manualForm, instagram_url: e.target.value })}
              placeholder="Instagram URL (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={manualBusy}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {manualBusy ? 'Inspecting...' : 'Investigate Firm'}
              </button>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close manual form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* Honest Search Result Note */}
        {lastDiscovery && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <p>{lastDiscovery.honestStatusNote}</p>
            <div className="flex items-center gap-2 font-mono tabular-nums text-slate-500">
              <span>+{lastDiscovery.newlyAddedCount} new</span>
              <span aria-hidden="true">·</span>
              <span>{lastDiscovery.duplicatesSkipped} duplicates skipped</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters & Table + Detail Split */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-start">
        <div className={`${selectedLead ? 'xl:col-span-7' : 'xl:col-span-12'} rounded-xl border border-slate-200 bg-white overflow-hidden`}>
          {/* Table Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'qualified', label: 'Qualified (3–5)' },
                    { id: 'skipped', label: 'Skipped (1–2)' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setQualFilter(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      qualFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStateScopeFilter('selected')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    stateScopeFilter === 'selected'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {selectedState}
                </button>
                <button
                  type="button"
                  onClick={() => setStateScopeFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    stateScopeFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Saved ({leads.length})
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter leads..."
                className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by website status"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="all">All Website Statuses</option>
                <option value="no_website">No Website</option>
                <option value="instagram_only">Instagram Only</option>
                <option value="social_only">Social Only</option>
                <option value="broken_website">Broken Website</option>
                <option value="weak_website">Weak Website</option>
                <option value="good_website">Good Website</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          {/* Data Grid */}
          {discovering && filteredLeads.length === 0 ? (
            <div className="divide-y divide-slate-100 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3.5">
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-52 rounded bg-slate-200" />
                    <div className="h-2.5 w-36 rounded bg-slate-100" />
                  </div>
                  <div className="h-3.5 w-24 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-display text-base font-semibold text-slate-900">
                No leads stored for {stateScopeFilter === 'selected' ? selectedState : 'these filters'} yet
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
                Click <strong>Discover in {selectedState}</strong> above to search real Nigerian real estate firms, inspect their websites via live HTTP checks, and score opportunities.
              </p>
              <button
                type="button"
                onClick={() => onRunDiscovery(undefined, batchSize)}
                disabled={discovering}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                <span>Start Discovery in {selectedState}</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pr-3 pl-4">Company</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5">Website Classification</th>
                    <th className="px-3 py-2.5 text-right">Score</th>
                    <th className="py-2.5 pr-4 pl-3 text-right">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => {
                    const isSelected = lead.id === selectedLeadId;
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => {
                          onSelectLead(lead.id);
                          setOverrideUrl(lead.website_url ?? '');
                          setShowModeAJson(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 pr-3 pl-4">
                          <div className="font-medium text-slate-900">{lead.business_name}</div>
                          <div className="text-xs text-slate-500">
                            {lead.business_category}
                            {lead.phone ? ` · ${lead.phone}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                          {lead.city ? `${lead.city}, ` : ''}
                          {lead.state}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          <span className={statusTextClass(lead.website_status)}>
                            {STATUS_LABELS[lead.website_status]}
                          </span>
                          <span className="ml-2 text-slate-400">· {lead.confidence}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">
                          <span
                            className={
                              lead.skip || lead.opportunity_score <= 2
                                ? 'text-slate-400'
                                : 'text-emerald-800'
                            }
                          >
                            {lead.opportunity_score}/5
                          </span>
                          {lead.skip && (
                            <span className="ml-1.5 font-sans font-normal text-slate-400">
                              Skip
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 pl-3 text-right text-xs text-slate-600 capitalize whitespace-nowrap">
                          {lead.lead_lifecycle.replace('_', ' ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Lead Investigation & Mode A Detail Panel */}
        {selectedLead && (
          <div className="xl:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {selectedLead.business_name}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedLead.business_category} ·{' '}
                  {selectedLead.city ? `${selectedLead.city}, ` : ''}
                  {selectedLead.state}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectLead(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close lead details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Key Score & Classification Summary */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-b border-slate-200 pb-4 text-xs">
              <div>
                <span className="text-slate-500">Website Status</span>
                <p className={`mt-1 text-sm ${statusTextClass(selectedLead.website_status)}`}>
                  {STATUS_LABELS[selectedLead.website_status]}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Opportunity Score</span>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {selectedLead.opportunity_score} / 5 {selectedLead.skip ? '(Skip)' : ''}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Inspected</span>
                <p className="mt-1 font-mono text-sm text-slate-800 tabular-nums">
                  {selectedLead.inspection_date}
                </p>
              </div>
            </div>

            {/* Evidence & Qualification */}
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <p className="font-medium text-slate-700">Inspection Evidence ({selectedLead.confidence} Confidence)</p>
                <p className="mt-1 leading-relaxed text-slate-600">
                  {selectedLead.inspection_evidence}
                </p>
              </div>
              <div>
                <p className="font-medium text-slate-700">Qualification Reason</p>
                <p className="mt-1 leading-relaxed text-slate-600">
                  {selectedLead.qualification_reason}
                </p>
              </div>
            </div>

            {/* Live HTTP Telemetry (if website was inspected) */}
            {selectedLead.http_signals && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="font-medium text-slate-800">HTTP Inspection Checks</p>
                <div className="mt-2 grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono text-[11px] text-slate-600">
                  <span>HTTP Status: {selectedLead.http_signals.http_status ?? 'N/A'}</span>
                  <span>Mobile Viewport: {selectedLead.http_signals.has_viewport_meta ? 'Yes' : 'No'}</span>
                  <span>Navigation: {selectedLead.http_signals.has_nav ? 'Yes' : 'No'}</span>
                  <span>Inquiry Form: {selectedLead.http_signals.has_form ? 'Yes' : 'No'}</span>
                  <span>WhatsApp Link: {selectedLead.http_signals.has_whatsapp_link ? 'Yes' : 'No'}</span>
                  <span>Contact Info: {selectedLead.http_signals.has_contact_info ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}

            {/* Verified Contact & Links */}
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Phone</span>
                <span className="font-mono text-slate-800">
                  {selectedLead.phone ?? 'Not discovered (null)'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Website URL</span>
                {selectedLead.website_url ? (
                  <a
                    href={selectedLead.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate max-w-[230px] text-emerald-800 hover:underline"
                  >
                    <span className="truncate">{selectedLead.website_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-slate-400">null</span>
                )}
              </div>
              {selectedLead.final_destination_url &&
                selectedLead.final_destination_url !== selectedLead.website_url && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Final Destination</span>
                    <a
                      href={selectedLead.final_destination_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate max-w-[230px] text-emerald-800 hover:underline"
                    >
                      <span className="truncate">{selectedLead.final_destination_url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Instagram</span>
                {selectedLead.instagram_url ? (
                  <a
                    href={selectedLead.instagram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate max-w-[230px] text-emerald-800 hover:underline"
                  >
                    <span className="truncate">{selectedLead.instagram_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-slate-400">null</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Facebook</span>
                {selectedLead.facebook_url ? (
                  <a
                    href={selectedLead.facebook_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate max-w-[230px] text-emerald-800 hover:underline"
                  >
                    <span className="truncate">{selectedLead.facebook_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-slate-400">null</span>
                )}
              </div>
            </div>

            {/* Sources */}
            {selectedLead.source_urls.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                <p className="font-medium text-slate-700">Verified Discovery Sources</p>
                <ul className="mt-1.5 space-y-1">
                  {selectedLead.source_urls.map((url) => (
                    <li key={url} className="truncate">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-600 underline decoration-slate-300 hover:text-emerald-800"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Re-inspect URL */}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <label className="block text-xs font-medium text-slate-700">
                Re-inspect or Check Website URL
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={overrideUrl}
                  onChange={(e) => setOverrideUrl(e.target.value)}
                  placeholder="https://companydomain.com"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-700 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={reinspectingId === selectedLead.id}
                  onClick={async () => {
                    setReinspectingId(selectedLead.id);
                    try {
                      await onReinspectLead(
                        selectedLead.id,
                        overrideUrl.trim() ? overrideUrl.trim() : null
                      );
                    } finally {
                      setReinspectingId(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{reinspectingId === selectedLead.id ? 'Checking...' : 'Re-inspect'}</span>
                </button>
              </div>
            </div>

            {/* Lifecycle & Primary Actions */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
              <select
                value={selectedLead.lead_lifecycle}
                onChange={(e) =>
                  onUpdateLifecycle(selectedLead.id, e.target.value as LeadLifecycleStatus)
                }
                aria-label="Lead lifecycle stage"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="new">Stage: New</option>
                <option value="outreach_ready">Stage: Outreach Ready</option>
                <option value="contacted">Stage: Contacted</option>
                <option value="replied">Stage: Replied</option>
                <option value="closed">Stage: Closed</option>
              </select>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModeAJson((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>Mode A JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteLead(selectedLead.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  title="Remove lead"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Outreach Action */}
            <div className="mt-3">
              {selectedLead.skip || selectedLead.opportunity_score <= 2 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                  Marked <strong>Skip</strong> (Score {selectedLead.opportunity_score}/5). Outreach generation is disabled for skipped leads per agency qualification rules.
                </div>
              ) : selectedLead.outreach ? (
                <button
                  type="button"
                  onClick={() => onOpenOutreachTab(selectedLead.id)}
                  className="w-full rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
                >
                  View Generated Outreach & Homepage Preview
                </button>
              ) : (
                <button
                  type="button"
                  disabled={generatingOutreachId === selectedLead.id}
                  onClick={async () => {
                    setGeneratingOutreachId(selectedLead.id);
                    try {
                      const generated = await onGenerateOutreach(selectedLead.id);
                      if (generated) {
                        onOpenOutreachTab(selectedLead.id);
                      }
                    } finally {
                      setGeneratingOutreachId(null);
                    }
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {generatingOutreachId === selectedLead.id
                      ? 'Generating Mode B Outreach...'
                      : 'Generate Mode B Outreach & Preview'}
                  </span>
                </button>
              )}
            </div>

            {/* Mode A Structured JSON Inspector */}
            {showModeAJson && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-900 p-3 text-slate-100">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">Mode A Structured Record</span>
                  <button
                    type="button"
                    onClick={() => handleCopyJson(selectedLead)}
                    className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    {copiedId === selectedLead.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(toModeAJson(selectedLead), null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
