import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { LeadLifecycleStatus, LeadRecord } from '../types/stepstone.ts';
import { buildWhatsAppChatUrl, formatNigerianWhatsAppDigits } from '../utils/whatsapp.ts';
import { ConceptMockupPreview } from './ConceptMockupPreview.tsx';

interface OutreachPreviewViewProps {
  leads: LeadRecord[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  onGenerateOutreach: (id: string) => Promise<boolean | void>;
  onUpdateLifecycle: (id: string, lifecycle: LeadLifecycleStatus) => Promise<void>;
  onUpdatePhone?: (id: string, phone: string | null) => Promise<void>;
  onChangeDesignVariant?: (id: string, variantId: string) => Promise<void>;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function OutreachPreviewView({
  leads,
  selectedLeadId,
  onSelectLead,
  onGenerateOutreach,
  onUpdateLifecycle,
  onUpdatePhone,
  onChangeDesignVariant,
}: OutreachPreviewViewProps) {
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showModeBJson, setShowModeBJson] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const qualifiedLeads = useMemo(
    () => leads.filter((l) => !l.skip && l.opportunity_score >= 3),
    [leads]
  );

  const activeLead = useMemo(() => {
    const matched = qualifiedLeads.find((l) => l.id === selectedLeadId);
    return matched ?? qualifiedLeads[0] ?? null;
  }, [qualifiedLeads, selectedLeadId]);

  useEffect(() => {
    setPhoneInput(activeLead?.phone ?? '');
    setEditingPhone(false);
  }, [activeLead?.id, activeLead?.phone]);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || !onUpdatePhone || savingPhone) return;
    setSavingPhone(true);
    try {
      await onUpdatePhone(activeLead.id, phoneInput.trim() || null);
      setEditingPhone(false);
    } finally {
      setSavingPhone(false);
    }
  };

  const activeWhatsAppDigits = formatNigerianWhatsAppDigits(activeLead?.phone);

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleGenerate = async () => {
    if (!activeLead || generating) return;
    setGenerating(true);
    try {
      await onGenerateOutreach(activeLead.id);
    } finally {
      setGenerating(false);
    }
  };

  if (qualifiedLeads.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          No Qualified Prospects Ready for Outreach
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Run a discovery search first. Prospects scoring 3 to 5 out of 5 appear here automatically for Mode B outreach and homepage preview brief generation. Skipped prospects (1–2) never receive outreach.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
      {/* Left Qualified Prospect Selector */}
      <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Qualified Prospects ({qualifiedLeads.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Select a prospect to draft messages & preview mockup.
          </p>
        </div>
        <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
          {qualifiedLeads.map((lead) => {
            const isSelected = activeLead?.id === lead.id;
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => onSelectLead(lead.id)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-slate-900 truncate">
                    {lead.business_name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-emerald-800 tabular-nums shrink-0">
                    {lead.opportunity_score}/5
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">
                    {lead.state} · {lead.website_status.replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0">
                    {lead.outreach ? 'Ready' : 'Not drafted'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Mode B Outreach & Concept Mockup Workspace */}
      {activeLead && (
        <div className="lg:col-span-8 space-y-5">
          {/* Header Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{activeLead.state}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeLead.business_category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Score {activeLead.opportunity_score}/5
                  </span>
                </div>
                <h1 className="mt-1 font-display text-xl font-semibold text-slate-900">
                  {activeLead.business_name}
                </h1>
                <p className="mt-1 text-xs text-slate-600">
                  Verified observation: {activeLead.inspection_evidence}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {activeLead.outreach && (
                  <button
                    type="button"
                    onClick={() => setShowModeBJson((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>Mode B JSON</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                  <span>
                    {generating
                      ? 'Generating...'
                      : activeLead.outreach
                      ? 'Regenerate Outreach'
                      : 'Generate Mode B Outreach'}
                  </span>
                </button>
              </div>
            </div>

            {/* WhatsApp Target Number & Quick Edit */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-600">
                <Phone className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                <span>WhatsApp Target:</span>
                {activeWhatsAppDigits ? (
                  <span className="font-mono font-medium text-slate-900">
                    +{activeWhatsAppDigits}
                  </span>
                ) : (
                  <span className="text-amber-700">
                    No phone saved (links open WhatsApp to pick contact)
                  </span>
                )}
                {onUpdatePhone && !editingPhone && (
                  <button
                    type="button"
                    onClick={() => setEditingPhone(true)}
                    className="ml-1 text-emerald-800 underline decoration-emerald-700/40 hover:text-emerald-900"
                  >
                    {activeLead.phone ? 'Edit phone' : 'Add phone'}
                  </button>
                )}
              </div>

              {editingPhone && (
                <form onSubmit={handleSavePhone} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="e.g. 0803 944 8950"
                    className="w-44 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-mono text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingPhone}
                    className="rounded-md bg-emerald-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                  >
                    {savingPhone ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput(activeLead.phone ?? '');
                      setEditingPhone(false);
                    }}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>

            {activeLead.outreach && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                <div className="text-slate-600">
                  Outreach Angle:{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                    {activeLead.outreach.angle}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Manual send status:</span>
                  <button
                    type="button"
                    onClick={() => onUpdateLifecycle(activeLead.id, 'contacted')}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeLead.lead_lifecycle === 'contacted'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Send className="h-3 w-3" />
                    <span>
                      {activeLead.lead_lifecycle === 'contacted'
                        ? 'Marked Contacted'
                        : 'Mark as Contacted'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {showModeBJson && activeLead.outreach && (
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-slate-100">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">Mode B Structured Output</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy('modeb-json', JSON.stringify(activeLead.outreach, null, 2))
                  }
                  className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                >
                  {copiedKey === 'modeb-json' ? (
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
              <pre className="max-h-72 overflow-auto font-mono text-[11px] leading-relaxed">
                {JSON.stringify(activeLead.outreach, null, 2)}
              </pre>
            </div>
          )}

          {/* 4 Outreach Messages */}
          {activeLead.outreach ? (
            <>
              {/* 4 Outreach Messages */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(
                  [
                    {
                      key: 'whatsapp',
                      title: 'First WhatsApp Message',
                      limitNote: 'Under 60 words · Max 1 emoji · No prices',
                      text: activeLead.outreach.whatsapp_message,
                      channel: 'whatsapp' as const,
                    },
                    {
                      key: 'instagram',
                      title: 'Instagram DM',
                      limitNote: 'Max 40 words · Concise & natural',
                      text: activeLead.outreach.instagram_message,
                      channel: 'instagram' as const,
                    },
                    {
                      key: 'followup1',
                      title: 'Follow-up 1 — Day 2',
                      limitNote: 'Under 40 words · Helpful insight/question',
                      text: activeLead.outreach.followup_1,
                      channel: 'whatsapp' as const,
                    },
                    {
                      key: 'followup2',
                      title: 'Follow-up 2 — Day 5',
                      limitNote: 'Under 40 words · Polite no-pressure close',
                      text: activeLead.outreach.followup_2,
                      channel: 'whatsapp' as const,
                    },
                  ] as const
                ).map((item) => {
                  const whatsappHref =
                    item.channel === 'whatsapp'
                      ? buildWhatsAppChatUrl(activeLead.phone, item.text)
                      : null;

                  return (
                    <div
                      key={item.key}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display text-sm font-semibold text-slate-900">
                            {item.title}
                          </h3>
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {wordCount(item.text)} words
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">{item.limitNote}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {item.text}
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => handleCopy(item.key, item.text)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          {copiedKey === item.key ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-700" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Message</span>
                            </>
                          )}
                        </button>

                        {whatsappHref && (
                          <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 whitespace-nowrap"
                            title={
                              activeWhatsAppDigits
                                ? `Open WhatsApp chat with +${activeWhatsAppDigits} with this message prefilled`
                                : 'Open WhatsApp with this message prefilled to pick a contact'
                            }
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>Open in WhatsApp</span>
                          </a>
                        )}

                        {item.channel === 'instagram' && activeLead.instagram_url && (
                          <a
                            href={activeLead.instagram_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Open Instagram</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Image-Generation Brief */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Homepage Mockup Image-Generation Brief
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Grounded in {activeLead.business_name}'s verified identity — zero invented portfolio claims.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('brief', activeLead.outreach!.preview_brief)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copiedKey === 'brief' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Copied Brief</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Brief</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                  {activeLead.outreach.preview_brief}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                Click <strong>Generate Mode B Outreach</strong> above to create personalized WhatsApp, Instagram, Day 2, Day 5 messages and the homepage mockup brief for <strong>{activeLead.business_name}</strong>.
              </p>
            </div>
          )}

          {/* Always render the live interactive Concept Mockup Preview for the active qualified lead */}
          <ConceptMockupPreview
            lead={activeLead}
            onChangeDesignVariant={onChangeDesignVariant}
          />
        </div>
      )}
    </div>
  );
}
