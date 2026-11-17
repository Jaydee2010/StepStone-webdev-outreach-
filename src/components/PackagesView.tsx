import React, { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import type { AgencyPackagesConfig, PackageTier } from '../types/stepstone.ts';

interface PackagesViewProps {
  packages: AgencyPackagesConfig;
  onSavePackages: (next: AgencyPackagesConfig) => Promise<void>;
}

export function PackagesView({ packages, onSavePackages }: PackagesViewProps) {
  const [draft, setDraft] = useState<AgencyPackagesConfig>(packages);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(packages);
  }, [packages]);

  const updateTier = (index: number, patch: Partial<PackageTier>) => {
    const nextTiers = draft.tiers.map((t, idx) =>
      idx === index ? { ...t, ...patch } : t
    );
    setDraft({ ...draft, tiers: nextTiers });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSavePackages(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Stepstone Web Agency Packages & Pricing Rules
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            All package names, prices (₦), features, and delivery timelines are editable and sync directly with Reply Handling and Brain Chat.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {savedNotice ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          <span>{saving ? 'Saving...' : savedNotice ? 'Saved' : 'Save Packages'}</span>
        </button>
      </div>

      {/* Delivery & Payment Split Authorization */}
      <div className="grid grid-cols-1 gap-5 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Standard Delivery Timeline
          </label>
          <input
            type="text"
            value={draft.deliveryTimeline}
            onChange={(e) => setDraft({ ...draft, deliveryTimeline: e.target.value })}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </div>
        <div className="flex items-start gap-3 pt-1">
          <input
            id="auth-split"
            type="checkbox"
            checked={draft.authorizePaymentSplit}
            onChange={(e) =>
              setDraft({ ...draft, authorizePaymentSplit: e.target.checked })
            }
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700"
          />
          <label htmlFor="auth-split" className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">
              Jaydee Authorization: Allow Payment Split on Price Objections
            </span>
            <p className="mt-0.5 text-xs text-slate-500">
              When disabled, Reply Handler never discounts automatically and only presents Basic as a lower-cost option.
            </p>
          </label>
        </div>
      </div>

      {/* 3 Editable Tier Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {draft.tiers.map((tier, idx) => (
          <div
            key={tier.id}
            className={`flex flex-col justify-between rounded-xl border bg-white p-5 ${
              tier.id === 'standard' ? 'border-emerald-700' : 'border-slate-200'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  {tier.targetAudience}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">
                    Package Name
                  </label>
                  <input
                    type="text"
                    value={tier.name}
                    onChange={(e) => updateTier(idx, { name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-display text-sm font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">
                    Pages Scope
                  </label>
                  <input
                    type="text"
                    value={tier.pagesLabel}
                    onChange={(e) => updateTier(idx, { pagesLabel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500">
                  Price (NGN ₦)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={tier.priceNaira}
                  onChange={(e) =>
                    updateTier(idx, { priceNaira: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg font-semibold text-slate-900 tabular-nums focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500">
                  Included Features (one per line)
                </label>
                <textarea
                  rows={6}
                  value={tier.features.join('\n')}
                  onChange={(e) =>
                    updateTier(idx, {
                      features: e.target.value.split('\n'),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}
