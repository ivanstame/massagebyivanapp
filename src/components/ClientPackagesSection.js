import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Layers, Plus, Loader2, AlertCircle, CheckCircle, RotateCcw,
  XCircle, Calendar,
} from 'lucide-react';
import { DateTime } from 'luxon';

// Provider-facing view of one client's packages. Lives on the
// ProviderClientDetails page. Lets the provider:
//   - Comp a free package (from a template, or arbitrary).
//   - Cancel/freeze a package after issuing a Stripe refund out-of-band.
//   - Reinstate a consumed credit (e.g. after a late-cancellation that
//     the provider chooses to forgive).
const ClientPackagesSection = ({ clientId, clientName }) => {
  const [packages, setPackages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showComp, setShowComp] = useState(false);
  const [compSubmitting, setCompSubmitting] = useState(false);
  const [working, setWorking] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [pkgRes, tmplRes] = await Promise.all([
        axios.get(`/api/packages/client/${clientId}`, { withCredentials: true }),
        axios.get('/api/packages/templates', { withCredentials: true }),
      ]);
      setPackages(pkgRes.data || []);
      setTemplates((tmplRes.data || []).filter(t => t.isActive));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleComp = async (payload) => {
    try {
      setCompSubmitting(true);
      setError(null);
      await axios.post('/api/packages/comp', { clientId, ...payload }, { withCredentials: true });
      await fetchAll();
      setShowComp(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to comp package');
    } finally {
      setCompSubmitting(false);
    }
  };

  const handleCancel = async (pkg) => {
    if (!window.confirm(
      `Cancel "${pkg.name}"?\n\n` +
      'This freezes any remaining credits. If money changed hands, ' +
      'remember to issue the refund in your Stripe dashboard.'
    )) return;
    try {
      setWorking(pkg._id);
      await axios.patch(`/api/packages/${pkg._id}/cancel`, {}, { withCredentials: true });
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel package');
    } finally {
      setWorking(null);
    }
  };

  const handleReinstate = async (pkg, redemptionId) => {
    if (!window.confirm('Reinstate this credit? The client will get the session back to use.')) return;
    try {
      setWorking(`${pkg._id}:${redemptionId}`);
      await axios.patch(
        `/api/packages/${pkg._id}/redemptions/${redemptionId}/reinstate`,
        {},
        { withCredentials: true }
      );
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reinstate credit');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#B07A4E]" />
          <h2 className="text-lg font-medium text-slate-900">Packages</h2>
        </div>
        <button
          onClick={() => setShowComp(true)}
          className="inline-flex items-center gap-1 text-sm text-[#B07A4E] hover:text-[#8A5D36] font-medium"
        >
          <Plus className="w-4 h-4" />
          Add a package
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {showComp && (
        <CompForm
          firstName={clientName?.split(' ')[0] || 'them'}
          templates={templates}
          submitting={compSubmitting}
          onSubmit={handleComp}
          onCancel={() => { setShowComp(false); setError(null); }}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : packages.length === 0 && !showComp ? (
        <p className="text-sm text-slate-500">No packages yet.</p>
      ) : (
        <div className="space-y-2 mt-3">
          {packages.map(pkg => (
            <PackageRow
              key={pkg._id}
              pkg={pkg}
              onCancel={() => handleCancel(pkg)}
              onReinstate={(redemptionId) => handleReinstate(pkg, redemptionId)}
              working={working}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PackageRow = ({ pkg, onCancel, onReinstate, working }) => {
  const isMinutes = pkg.kind === 'minutes';
  const total = isMinutes ? (pkg.minutesTotal || 0) : (pkg.sessionsTotal || 0);
  const liveRedemptions = (pkg.redemptions || []).filter(r => !r.returnedAt);
  const liveUsed = isMinutes
    ? liveRedemptions.reduce((sum, r) => sum + (r.minutesConsumed || 0), 0)
    : liveRedemptions.length;
  const used = isMinutes
    ? (pkg.minutesUsed ?? (liveUsed + (pkg.preConsumedMinutes || 0)))
    : (pkg.sessionsUsed ?? (liveUsed + (pkg.preConsumedSessions || 0)));
  const remaining = isMinutes
    ? (pkg.minutesRemaining ?? (total - used))
    : (pkg.sessionsRemaining ?? (total - used));
  const isCancelled = !!pkg.cancelledAt;
  const isPending = pkg.paymentStatus === 'pending';

  // Status takes priority over payment-method label.
  let statusBadge = null;
  if (isCancelled) {
    statusBadge = <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Cancelled</span>;
  } else if (isPending) {
    statusBadge = <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Pending</span>;
  } else if (remaining === 0) {
    statusBadge = <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Used up</span>;
  } else if (pkg.paymentMethod === 'comped') {
    statusBadge = <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-[#B07A4E]/10 text-[#8A5D36]">Comped</span>;
  } else if (pkg.paymentMethod === 'cash') {
    statusBadge = <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Cash</span>;
  }

  const summary = isMinutes
    ? `${pkg.minutesTotal} min pool`
    : `${pkg.sessionsTotal} × ${pkg.sessionDuration} min`;

  const unit = isMinutes ? 'min' : '';

  return (
    <div className={`p-3 rounded-lg border ${isCancelled ? 'bg-paper-deep border-line-soft opacity-70' : 'bg-paper-elev border-line'}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 truncate">{pkg.name}</p>
            {statusBadge}
          </div>
          <p className="text-xs text-slate-500">
            {summary} &middot;{' '}
            {pkg.price > 0 ? `$${pkg.price}` : 'Comped'}
            {pkg.purchasedAt && <> &middot; {DateTime.fromISO(pkg.purchasedAt).toFormat('MMM d, yyyy')}</>}
          </p>
        </div>
        {!isCancelled && (
          <button
            onClick={onCancel}
            disabled={working === pkg._id}
            className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50 flex-shrink-0"
          >
            <XCircle className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
            Cancel
          </button>
        )}
      </div>

      {!isCancelled && pkg.paymentStatus === 'paid' && (
        <div className="mt-1 flex items-baseline gap-3 text-xs">
          <span>
            <span className="font-semibold text-slate-900">{remaining}</span>{' '}
            of {total} {unit} remaining
          </span>
          {used > 0 && <span className="text-slate-400">{used} {unit} used</span>}
        </div>
      )}

      {/* Pre-consumed history note (backfill context). */}
      {(pkg.preConsumedMinutes > 0 || pkg.preConsumedSessions > 0) && (
        <p className="mt-1 text-[11px] text-slate-400 italic">
          Includes {isMinutes ? `${pkg.preConsumedMinutes} min` : `${pkg.preConsumedSessions} session(s)`} backfilled from before tracking
          {pkg.preConsumedNote ? ` — ${pkg.preConsumedNote}` : '.'}
        </p>
      )}

      {/* Consumed redemptions are listed below for the provider to optionally
          reinstate. Only show this UI when there's actually something to act on. */}
      {liveRedemptions.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
            Redemption history ({liveRedemptions.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {liveRedemptions.map(r => {
              // r.booking is populated server-side now — show the
              // appointment's date/time/status so the math reconciles
              // (pending appointments count against remaining capacity).
              const b = r.booking && typeof r.booking === 'object' ? r.booking : null;
              const apptLabel = b
                ? `${DateTime.fromFormat(b.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d')} at ${DateTime.fromFormat(b.startTime, 'HH:mm').toFormat('h:mm a')}`
                : `Used ${DateTime.fromISO(r.redeemedAt).toFormat('MMM d, yyyy h:mm a')}`;
              const status = b?.status || null;
              const statusColors = {
                pending: 'bg-amber-50 text-amber-700 border-amber-200',
                confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
                completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
              };
              return (
                <li key={r._id} className="flex items-start justify-between gap-2 text-xs text-slate-600">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-900">{apptLabel}</span>
                      {isMinutes && r.minutesConsumed > 0 && (
                        <span className="text-slate-500">({r.minutesConsumed} min)</span>
                      )}
                      {status && (
                        <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${statusColors[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {status}
                        </span>
                      )}
                    </div>
                    {b && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Redeemed {DateTime.fromISO(r.redeemedAt).toFormat('MMM d, h:mm a')}
                      </div>
                    )}
                  </div>
                  {!isCancelled && (
                    <button
                      onClick={() => onReinstate(r._id)}
                      disabled={working === `${pkg._id}:${r._id}`}
                      className="text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
                    >
                      {working === `${pkg._id}:${r._id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Reinstate
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
};

const CompForm = ({ firstName, templates, submitting, onSubmit, onCancel }) => {
  // Three modes:
  //   'template' — pick from this provider's existing PackageTemplates.
  //   'custom'   — enter sessions×duration ad-hoc.
  //   'minutes'  — minutes-based pool (variable-duration, common for cash sales).
  const [mode, setMode] = useState(templates.length > 0 ? 'template' : 'custom');
  const [templateId, setTemplateId] = useState(templates[0]?._id || '');
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState(1);
  const [duration, setDuration] = useState(60);
  const [minutesTotal, setMinutesTotal] = useState(300);

  // Money / payment context.
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash | comped
  const [price, setPrice] = useState('');
  // YYYY-MM-DD; default to today. Provider can backdate to actual cash transaction.
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 10));

  // Backfill: how much of the package has already been used outside the app.
  const [preConsumedSessions, setPreConsumedSessions] = useState(0);
  const [preConsumedMinutes, setPreConsumedMinutes] = useState(0);
  const [preConsumedNote, setPreConsumedNote] = useState('');

  const isMinutesMode = mode === 'minutes';
  const isFreeOnly = paymentMethod === 'comped';

  const submit = () => {
    const base = {
      paymentMethod,
      price: isFreeOnly ? 0 : Number(price) || 0,
      purchasedAt,
      preConsumedNote: preConsumedNote.trim(),
    };

    if (mode === 'template') {
      if (!templateId) return;
      onSubmit({ ...base, templateId, ...templateBackfillFor(templates.find(t => t._id === templateId)) });
      return;
    }

    if (isMinutesMode) {
      onSubmit({
        ...base,
        kind: 'minutes',
        name: name.trim() || `${minutesTotal}-min pack`,
        minutesTotal: Number(minutesTotal),
        preConsumedMinutes: Number(preConsumedMinutes) || 0,
      });
      return;
    }

    onSubmit({
      ...base,
      kind: 'sessions',
      name: name.trim() || `${sessions}-pack`,
      sessionsTotal: Number(sessions),
      sessionDuration: Number(duration),
      preConsumedSessions: Number(preConsumedSessions) || 0,
    });
  };

  // When comping from a template, attach the right backfill fields based
  // on the template's kind so the user's pre-consumed inputs get sent.
  const templateBackfillFor = (tmpl) => {
    if (!tmpl) return {};
    if (tmpl.kind === 'minutes') {
      return { preConsumedMinutes: Number(preConsumedMinutes) || 0 };
    }
    return { preConsumedSessions: Number(preConsumedSessions) || 0 };
  };

  // For the template-mode "pre-consumed" UI we need to know which template
  // is selected to render the right input.
  const selectedTemplate = templates.find(t => t._id === templateId);
  const templateIsMinutes = selectedTemplate?.kind === 'minutes';

  return (
    <div className="mb-3 p-4 bg-paper-deep rounded-lg border border-line space-y-3">
      <p className="text-sm text-slate-700">
        Add a package to {firstName}&rsquo;s account. Use this for cash sales, comps,
        or to record packages they bought before you started tracking in the app.
      </p>

      {/* Mode picker. */}
      <div className="flex flex-wrap gap-2 text-xs">
        {templates.length > 0 && (
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`px-3 py-1 rounded-full border ${
              mode === 'template'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            From template
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`px-3 py-1 rounded-full border ${
            mode === 'custom'
              ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
              : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
          }`}
        >
          Custom (sessions)
        </button>
        <button
          type="button"
          onClick={() => setMode('minutes')}
          className={`px-3 py-1 rounded-full border ${
            mode === 'minutes'
              ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
              : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
          }`}
        >
          Custom (minutes pool)
        </button>
      </div>

      {/* Mode-specific package shape. */}
      {mode === 'template' ? (
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
        >
          {templates.map(t => (
            <option key={t._id} value={t._id}>
              {t.name} — {t.kind === 'minutes' ? `${t.minutesTotal} min pool` : `${t.sessionsTotal} × ${t.sessionDuration} min`}
            </option>
          ))}
        </select>
      ) : isMinutesMode ? (
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Package name (e.g. 4-Pack 75-min — paid cash)"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Total minutes</label>
            <input
              type="number"
              min="30"
              max="6000"
              step="15"
              value={minutesTotal}
              onChange={(e) => setMinutesTotal(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
            {minutesTotal > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">
                = {(minutesTotal / 60).toFixed(minutesTotal % 60 ? 1 : 0)} hours. Client can spend at any duration you offer.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Package name (e.g. Loyalty 3-pack)"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sessions</label>
              <input
                type="number"
                min="1"
                max="100"
                value={sessions}
                onChange={(e) => setSessions(Number(e.target.value) || 1)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Duration (min)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              >
                {[30, 45, 60, 75, 90, 105, 120, 150, 180].map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Payment context. */}
      <div className="border-t border-line pt-3">
        <div className="flex gap-2 text-xs mb-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('cash')}
            className={`px-3 py-1 rounded-full border ${
              paymentMethod === 'cash'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Paid cash
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('comped')}
            className={`px-3 py-1 rounded-full border ${
              paymentMethod === 'comped'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Comped (free)
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {paymentMethod === 'cash' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Price paid ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />
            </div>
          )}
          <div className={paymentMethod === 'cash' ? '' : 'col-span-2'}>
            <label className="block text-xs text-slate-500 mb-1">
              Purchase date {paymentMethod === 'cash' && <span className="text-slate-400">(when cash changed hands)</span>}
            </label>
            <input
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
        </div>
      </div>

      {/* Backfill — pre-consumed amount that already happened off-app. */}
      <div className="border-t border-line pt-3">
        <p className="text-xs font-medium text-slate-700 mb-2">
          Already used? <span className="font-normal text-slate-500">(optional — for backfilling history)</span>
        </p>
        {(isMinutesMode || (mode === 'template' && templateIsMinutes)) ? (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Minutes already used</label>
            <input
              type="number"
              min="0"
              step="15"
              value={preConsumedMinutes}
              onChange={(e) => setPreConsumedMinutes(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sessions already used</label>
            <input
              type="number"
              min="0"
              value={preConsumedSessions}
              onChange={(e) => setPreConsumedSessions(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
        )}
        <input
          type="text"
          value={preConsumedNote}
          onChange={(e) => setPreConsumedNote(e.target.value)}
          placeholder="Note (e.g. used 1 session on 4/12 before adding to app)"
          className="mt-2 w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-[#B07A4E] focus:border-[#B07A4E]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center px-4 py-1.5 text-sm bg-[#B07A4E] text-white rounded hover:bg-[#8A5D36] disabled:opacity-50 font-medium"
        >
          {submitting ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding…</>
          ) : (
            <><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Add package</>
          )}
        </button>
      </div>
    </div>
  );
};

export default ClientPackagesSection;
