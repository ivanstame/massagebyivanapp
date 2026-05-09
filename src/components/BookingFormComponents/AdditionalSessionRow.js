import React from 'react';
import { Trash2, User, Users, Plus, Check } from 'lucide-react';
import { formatPhoneNumber } from '../../utils/phoneUtils';

// One row in the back-to-back chain. The first session uses the main
// booking form (RecipientSection / SimpleDurationSelector / AddOnsSelector);
// each *additional* session is rendered inline via this component.
//
// Times aren't picked here — they cascade automatically from the first
// session's start time + previous sessions' (duration + standard buffer).
// We just display the resulting start/end so the client can see the chain.
//
// Per-session payment method isn't surfaced — the whole chain inherits the
// first session's payment method for v1. Per-session payment is a v2
// nicety; for the canonical couple's-massage case it's a non-issue
// (one payer, one method).
const AdditionalSessionRow = ({
  index,           // 0-based index among additional sessions
  session,         // { recipientType, recipientInfo, duration, addons }
  onChange,        // (next) => void
  onRemove,        // () => void
  durationOptions, // provider.basePricing
  availableAddons, // provider.addons (active only)
  computedStart,   // 'h:mm a' display string
  computedEnd,     // 'h:mm a' display string
}) => {
  const update = (patch) => onChange({ ...session, ...patch });

  const toggleAddon = (name) => {
    const cur = session.addons || [];
    const next = cur.includes(name)
      ? cur.filter(n => n !== name)
      : [...cur, name];
    update({ addons: next });
  };

  return (
    <div className="bg-paper-elev border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">
          Session {index + 2}
          {computedStart && computedEnd && (
            <span className="ml-2 text-xs text-slate-500 font-normal">
              {computedStart} — {computedEnd}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>

      {/* Recipient — usually 'other' for back-to-back, but allow 'self' too
          for the "split my 2-hour into two 60s" case. */}
      <div>
        <p className="text-xs font-medium text-slate-700 mb-1.5">Who is this for?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ recipientType: 'self' })}
            className={`p-2 rounded-lg border-2 text-sm flex items-center gap-2 ${
              session.recipientType === 'self'
                ? 'border-teal-600 bg-teal-50 text-teal-900'
                : 'border-line hover:border-slate-300'
            }`}
          >
            <User className="w-4 h-4" />
            Me
            {session.recipientType === 'self' && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <button
            type="button"
            onClick={() => update({ recipientType: 'other' })}
            className={`p-2 rounded-lg border-2 text-sm flex items-center gap-2 ${
              session.recipientType === 'other'
                ? 'border-teal-600 bg-teal-50 text-teal-900'
                : 'border-line hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Someone else
            {session.recipientType === 'other' && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
        </div>
      </div>

      {session.recipientType === 'other' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={session.recipientInfo?.name || ''}
            onChange={(e) => update({ recipientInfo: { ...session.recipientInfo, name: e.target.value } })}
            placeholder="Their name"
            className="border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={session.recipientInfo?.phone || ''}
            // Run pasted/typed input through formatPhoneNumber on every
            // change — accepts "5551234567" / "555-123-4567" / "(555)1234567"
            // / "555.123.4567" / etc. and normalizes to "(555) 123-4567".
            onChange={(e) => update({
              recipientInfo: {
                ...session.recipientInfo,
                phone: formatPhoneNumber(e.target.value),
              },
            })}
            placeholder="(555) 555-5555 — optional"
            className="border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          />
        </div>
      )}

      {/* Duration */}
      <div>
        <p className="text-xs font-medium text-slate-700 mb-1.5">Duration</p>
        <div className="grid grid-cols-2 gap-2">
          {durationOptions.map(opt => {
            // Match on duration AND label so 60-min Deep Tissue
            // doesn't co-highlight with 60-min Swedish, etc. Same
            // disambiguator as the primary SimpleDurationSelector.
            const isSelected =
              session.duration === opt.duration
              && (session.tierLabel || '') === (opt.label || '');
            return (
              <button
                key={`${opt.duration}-${opt.label || ''}`}
                type="button"
                onClick={() => update({ duration: opt.duration, tierLabel: opt.label || '' })}
                className={`p-2 rounded-lg border-2 text-sm text-left ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-line hover:border-slate-300'
                }`}
              >
                <div className="font-medium">{opt.label || `${opt.duration} min`}</div>
                {opt.price > 0 && (
                  <div className="text-xs text-slate-500">${opt.price}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add-ons (optional) */}
      {availableAddons.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1.5">
            Add-ons <span className="text-slate-500 font-normal">(optional)</span>
          </p>
          <div className="space-y-1.5">
            {availableAddons.map(addon => {
              const checked = (session.addons || []).includes(addon.name);
              return (
                <label key={addon.name} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAddon(addon.name)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-700">{addon.name}</span>
                    {addon.price > 0 && <span className="text-slate-500 ml-1">+${addon.price}</span>}
                    {addon.extraTime > 0 && <span className="text-slate-500 ml-1">(+{addon.extraTime} min)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdditionalSessionRow;
