// Shared UI for granting and viewing provider-gifted bonus time on a
// package. Used in both the per-client packages section
// (ProviderClientDetails) and the master Sold Packages list
// (ProviderServices). Same look + behavior in both places.

import React, { useState } from 'react';
import { DateTime } from 'luxon';
import { Gift, Loader2 } from 'lucide-react';

// Renders the inline composer + a button to expand it. `onSubmit` is
// called with `{ minutes, reason }` for minutes-mode pkgs or
// `{ sessions, reason }` for sessions-mode.
export const BonusComposer = ({ pkg, onSubmit, busy }) => {
  const [open, setOpen] = useState(false);
  const isMinutes = pkg.kind === 'minutes';
  const [amount, setAmount] = useState(isMinutes ? '30' : '1');
  const [reason, setReason] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const payload = isMinutes
      ? { minutes: Math.round(n), reason }
      : { sessions: Math.round(n), reason };
    await onSubmit(payload);
    setReason('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#B07A4E] hover:text-[#8A5D36] px-2 py-1 rounded border border-[#B07A4E]/30 hover:bg-[#B07A4E]/5"
      >
        <Gift className="w-3.5 h-3.5" /> Comp time
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 p-3 bg-[#B07A4E]/5 border border-[#B07A4E]/20 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-[#B07A4E]" />
        <span className="text-sm font-medium text-slate-900">
          Add {isMinutes ? 'minutes' : 'sessions'} as a thank-you
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="1"
          max={isMinutes ? 600 : 20}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 px-2 py-1.5 text-sm border border-line rounded focus:outline-none focus:ring-2 focus:ring-[#B07A4E]/40"
        />
        <span className="text-xs text-slate-500">{isMinutes ? 'min' : 'session(s)'}</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional, e.g. last-minute cancellation)"
          maxLength={200}
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-line rounded focus:outline-none focus:ring-2 focus:ring-[#B07A4E]/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !amount}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#B07A4E] text-white rounded hover:bg-[#8A5D36] disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
          Add
        </button>
      </div>
    </form>
  );
};

// Renders the package's history of provider-gifted bonuses. Returns
// null when the package has no bonuses, so callers can drop it in
// unconditionally without empty-state handling.
export const BonusHistory = ({ pkg }) => {
  const bonuses = pkg.bonuses || [];
  if (bonuses.length === 0) return null;
  const isMinutes = pkg.kind === 'minutes';
  return (
    <div className="mt-3">
      <h4 className="text-xs uppercase tracking-wide font-medium text-slate-500 mb-2">
        Bonus time gifted ({bonuses.length})
      </h4>
      <ul className="space-y-1.5">
        {[...bonuses]
          .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
          .map(b => (
            <li key={b._id} className="flex items-start gap-2 p-2 rounded bg-[#B07A4E]/5">
              <Gift className="w-3.5 h-3.5 text-[#B07A4E] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                <div className="text-slate-900">
                  +{isMinutes ? `${b.minutes} min` : `${b.sessions} session${b.sessions === 1 ? '' : 's'}`}
                  {b.reason && <span className="text-slate-600 font-normal"> — {b.reason}</span>}
                </div>
                <div className="text-[11px] text-slate-400">
                  {DateTime.fromISO(b.addedAt).toFormat('MMM d, yyyy h:mm a')}
                  {b.addedBy && ` · by ${b.addedBy}`}
                </div>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
};
