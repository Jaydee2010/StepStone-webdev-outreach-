import React, { useState } from 'react';
import { Check, Code2, Copy, MessageSquareReply } from 'lucide-react';
import type { AgencyPackagesConfig, LeadRecord } from '../types/stepstone.ts';

interface ReplyHandlerViewProps {
  leads: LeadRecord[];
  packages: AgencyPackagesConfig;
  onGenerateReply: (
    leadId: string | null,
    prospectMessage: string
  ) => Promise<{ reply: string; shouldMarkClosed: boolean }>;
}

const SAMPLE_PROSPECT_REPLIES = [
  'How much do you charge for a real estate website?',
  'What is the difference between Basic and Standard?',
  'How will having a website actually get us property buyers?',
  'We already get inquiries on Instagram, why do we need a site?',
  '₦85,000 is above our budget right now.',
  'Thank you, we will get back to you next week.',
  'Not interested right now, please stop messaging.',
];

export function ReplyHandlerView({
  leads,
  packages,
  onGenerateReply,
}: ReplyHandlerViewProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [prospectMessage, setProspectMessage] = useState('');
  const [replyResult, setReplyResult] = useState<{
    reply: string;
    shouldMarkClosed: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectMessage.trim() || loading) return;
    setLoading(true);
    try {
      const res = await onGenerateReply(
        selectedLeadId || null,
        prospectMessage.trim()
      );
      setReplyResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!replyResult) return;
    await navigator.clipboard.writeText(
      showJson ? JSON.stringify({ reply: replyResult.reply }, null, 2) : replyResult.reply
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="font-display text-xl font-semibold text-slate-900">
          Prospect Reply Handler
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Answers the prospect's actual question first using honest marketing principles, recommends Standard for established firms, respects Jaydee's payment-split authorization ({packages.authorizePaymentSplit ? 'Authorized' : 'Not Authorized'}), and closes politely if they ask to stop.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Link to Prospect Lead (Optional)
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-700 focus:outline-none"
              >
                <option value="">General Nigerian Real Estate Prospect</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.business_name} ({l.state})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-xs text-slate-500">
                Active Packages:{' '}
                {packages.tiers
                  .map((t) => `${t.name} ₦${t.priceNaira.toLocaleString('en-NG')}`)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Prospect's Reply
            </label>
            <textarea
              rows={3}
              required
              value={prospectMessage}
              onChange={(e) => setProspectMessage(e.target.value)}
              placeholder="Paste what the prospect replied on WhatsApp or Instagram..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_PROSPECT_REPLIES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setProspectMessage(sample)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!prospectMessage.trim() || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
            >
              <MessageSquareReply className="h-4 w-4" />
              <span>{loading ? 'Drafting Reply...' : 'Draft Honest Reply'}</span>
            </button>
          </div>
        </form>
      </div>

      {replyResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Recommended Response
              </h2>
              {replyResult.shouldMarkClosed && (
                <p className="mt-0.5 text-xs font-medium text-amber-700">
                  Prospect declined or asked to stop — lead status updated to Closed.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>{showJson ? 'Text View' : 'JSON View'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showJson ? (
            <pre className="mt-4 overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100">
              {JSON.stringify({ reply: replyResult.reply }, null, 2)}
            </pre>
          ) : (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
              {replyResult.reply}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
