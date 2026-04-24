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
          Comp a package
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
  const total = pkg.sessionsTotal;
  const used = pkg.sessionsUsed ?? (pkg.redemptions || []).filter(r => !r.returnedAt).length;
  const remaining = pkg.sessionsRemaining ?? (total - used);
  const consumedRedemptions = (pkg.redemptions || []).filter(r => !r.returnedAt);
  const isCancelled = !!pkg.cancelledAt;
  const isPending = pkg.paymentStatus === 'pending';

  const statusBadge = isCancelled ? (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Cancelled</span>
  ) : isPending ? (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
  ) : remaining === 0 ? (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Used up</span>
  ) : pkg.paymentMethod === 'comped' ? (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-[#B07A4E]/10 text-[#8A5D36]">Comped</span>
  ) : null;

  return (
    <div className={`p-3 rounded-lg border ${isCancelled ? 'bg-paper-deep border-line-soft opacity-70' : 'bg-paper-elev border-line'}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 truncate">{pkg.name}</p>
            {statusBadge}
          </div>
          <p className="text-xs text-slate-500">
            {pkg.sessionsTotal} × {pkg.sessionDuration} min &middot;{' '}
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
          <span><span className="font-semibold text-slate-900">{remaining}</span> of {total} remaining</span>
          {used > 0 && <span className="text-slate-400">{used} consumed</span>}
        </div>
      )}

      {/* Consumed redemptions are listed below for the provider to optionally
          reinstate. Only show this UI when there's actually something to act on. */}
      {consumedRedemptions.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
            Redemption history ({consumedRedemptions.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {consumedRedemptions.map(r => (
              <li key={r._id} className="flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Used {DateTime.fromISO(r.redeemedAt).toFormat('MMM d, yyyy h:mm a')}
                </span>
                {!isCancelled && (
                  <button
                    onClick={() => onReinstate(r._id)}
                    disabled={working === `${pkg._id}:${r._id}`}
                    className="text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1 disabled:opacity-50"
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
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const CompForm = ({ firstName, templates, submitting, onSubmit, onCancel }) => {
  const [mode, setMode] = useState(templates.length > 0 ? 'template' : 'custom');
  const [templateId, setTemplateId] = useState(templates[0]?._id || '');
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState(1);
  const [duration, setDuration] = useState(60);

  const submit = () => {
    if (mode === 'template') {
      if (!templateId) return;
      onSubmit({ templateId });
    } else {
      onSubmit({
        name: name.trim() || `Comped ${sessions}-pack`,
        sessionsTotal: Number(sessions),
        sessionDuration: Number(duration),
      });
    }
  };

  return (
    <div className="mb-3 p-4 bg-paper-deep rounded-lg border border-line space-y-3">
      <p className="text-sm text-slate-700">
        Grant {firstName} a free package. They&rsquo;ll see the credits ready to use immediately.
      </p>

      {templates.length > 0 && (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`px-3 py-1 rounded-full border ${
              mode === 'template'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Use a template
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1 rounded-full border ${
              mode === 'custom'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Custom
          </button>
        </div>
      )}

      {mode === 'template' ? (
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
        >
          {templates.map(t => (
            <option key={t._id} value={t._id}>
              {t.name} — {t.sessionsTotal} × {t.sessionDuration} min
            </option>
          ))}
        </select>
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
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Granting…</>
          ) : (
            <><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Grant package</>
          )}
        </button>
      </div>
    </div>
  );
};

export default ClientPackagesSection;
