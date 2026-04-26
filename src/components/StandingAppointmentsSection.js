import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import {
  Repeat, Plus, AlertCircle, CheckCircle, Loader2, XCircle, Trash2, Users,
} from 'lucide-react';
import { DEFAULT_TZ } from '../utils/timeConstants';

// Provider-side panel for creating + managing standing appointments for
// a single client. Lives on /provider/clients/:id between the packages
// section and notes. Mirrors the create-flow defaults of a one-off
// booking so providers don't have to re-pick everything they've already
// configured (service, payment, location).

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every week' },
  { value: 2, label: 'Every 2 weeks' },
  { value: 4, label: 'Every 4 weeks' },
];

const StandingAppointmentsSection = ({ client, clientId }) => {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [providerServices, setProviderServices] = useState(null);
  const [working, setWorking] = useState(null);
  const [successFlash, setSuccessFlash] = useState(null);

  const fetchSeries = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/recurring-series?clientId=${clientId}`, { withCredentials: true });
      setSeries(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load standing appointments');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Provider services (basePricing + addons + accepted payment methods +
  // venmoHandle) — needed to power the create-form defaults.
  const fetchProviderServices = useCallback(async () => {
    if (!client?.providerId) return;
    try {
      const res = await axios.get(`/api/users/provider/${client.providerId}/services`);
      setProviderServices(res.data);
    } catch (err) {
      console.error('Could not load provider services:', err);
    }
  }, [client?.providerId]);

  useEffect(() => { fetchSeries(); }, [fetchSeries]);
  useEffect(() => { fetchProviderServices(); }, [fetchProviderServices]);

  const handleCreated = (createdResp) => {
    setShowCreate(false);
    if (createdResp.conflicts && createdResp.conflicts.length > 0) {
      setSuccessFlash({
        kind: 'partial',
        message: `Created with ${createdResp.occurrencesCreated} occurrences. ${createdResp.conflicts.length} skipped due to existing bookings.`,
      });
    } else {
      setSuccessFlash({
        kind: 'ok',
        message: `Standing appointment created — ${createdResp.occurrencesCreated} occurrences scheduled.`,
      });
    }
    setTimeout(() => setSuccessFlash(null), 5000);
    fetchSeries();
  };

  const handleCancelSeries = async (s) => {
    if (!window.confirm(
      'Cancel this standing appointment?\n\n' +
      'All upcoming occurrences will be cancelled. Past appointments stay on the books as history.'
    )) return;
    try {
      setWorking(s._id);
      await axios.delete(`/api/recurring-series/${s._id}`, { withCredentials: true });
      await fetchSeries();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-5 h-5 text-[#B07A4E]" />
          <h2 className="text-lg font-medium text-slate-900">Standing appointments</h2>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 text-sm text-[#B07A4E] hover:text-[#8A5D36] font-medium"
          >
            <Plus className="w-4 h-4" />
            Set one up
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {successFlash && (
        <div className={`mb-3 p-3 rounded-lg flex items-start gap-2 ${
          successFlash.kind === 'partial'
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-sm flex-1">{successFlash.message}</p>
        </div>
      )}

      {showCreate && (
        <CreateStandingForm
          client={client}
          providerServices={providerServices}
          onCreated={handleCreated}
          onCancel={() => { setShowCreate(false); setError(null); }}
          onError={setError}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : series.length === 0 && !showCreate ? (
        <p className="text-sm text-slate-500">No standing appointments yet.</p>
      ) : (
        <div className="space-y-2 mt-3">
          {series.map(s => (
            <SeriesRow
              key={s._id}
              series={s}
              onCancel={() => handleCancelSeries(s)}
              working={working === s._id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SeriesRow = ({ series, onCancel, working }) => {
  const isCancelled = series.status === 'cancelled';
  const intervalLabel = INTERVAL_OPTIONS.find(o => o.value === series.intervalWeeks)?.label
    || `Every ${series.intervalWeeks} week${series.intervalWeeks > 1 ? 's' : ''}`;
  const dayLabel = DAY_LABELS[series.dayOfWeek];
  const timeLabel = DateTime.fromFormat(series.startTime, 'HH:mm').toFormat('h:mm a');
  const nextLabel = series.nextOccurrence
    ? DateTime.fromFormat(series.nextOccurrence.date, 'yyyy-MM-dd').toFormat('EEE, MMM d')
    : null;
  const chainCount = (series.additionalSessions?.length || 0) + 1;

  return (
    <div className={`p-3 rounded-lg border ${isCancelled ? 'bg-paper-deep border-line-soft opacity-70' : 'bg-paper-elev border-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 truncate">
              {dayLabel}s at {timeLabel}
            </p>
            {isCancelled && (
              <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Cancelled</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {intervalLabel} · {series.duration} min
            {chainCount > 1 && (
              <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-paper-deep border border-line text-[10px] font-medium text-slate-700">
                <Users className="w-3 h-3" /> {chainCount} sessions
              </span>
            )}
            {series.endDate && ` · until ${DateTime.fromFormat(series.endDate, 'yyyy-MM-dd').toFormat('MMM d, yyyy')}`}
            {series.occurrenceLimit && ` · ${series.occurrenceLimit} occurrences`}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {series.totalOccurrences || 0} on the books
            {nextLabel && ` · next: ${nextLabel}`}
          </p>
        </div>
        {!isCancelled && (
          <button
            onClick={onCancel}
            disabled={working}
            className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50 flex-shrink-0 inline-flex items-center gap-0.5"
          >
            {working ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            Cancel series
          </button>
        )}
      </div>
    </div>
  );
};

const CreateStandingForm = ({ client, providerServices, onCreated, onCancel, onError }) => {
  // Today (LA) gives us a sensible default startDate.
  const todayStr = DateTime.now().setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');

  // Default service / pricing from the provider's first basePricing tier.
  const firstTier = providerServices?.basePricing?.[0];
  const defaultDuration = firstTier?.duration || 60;
  const defaultPrice = firstTier?.price || 0;
  const defaultPaymentMethod = providerServices?.acceptedPaymentMethods?.[0] || 'cash';

  // Default location: client's saved address if any.
  const clientAddress = client?.profile?.address;
  const defaultAddress = clientAddress?.formatted
    || (clientAddress?.street ? `${clientAddress.street}${clientAddress.unit ? ', ' + clientAddress.unit : ''}, ${clientAddress.city}, ${clientAddress.state} ${clientAddress.zip}` : '');

  const [startDate, setStartDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState(defaultDuration);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endMode, setEndMode] = useState('open');
  const [endDate, setEndDate] = useState('');
  const [occurrenceLimit, setOccurrenceLimit] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod);
  const [submitting, setSubmitting] = useState(false);
  // Back-to-back chain — each entry is another session that runs after
  // the primary at the same address (couple's-massage standing).
  const [additionalSessions, setAdditionalSessions] = useState([]);

  // Re-default when provider services arrive (initial mount race).
  useEffect(() => {
    if (firstTier) {
      setDuration(firstTier.duration);
    }
    if (providerServices?.acceptedPaymentMethods?.length) {
      setPaymentMethod(providerServices.acceptedPaymentMethods[0]);
    }
  }, [providerServices, firstTier]);

  const durationsAvailable = providerServices?.basePricing?.map(p => ({
    duration: p.duration,
    label: p.label || `${p.duration} min`,
    price: p.price,
  })) || [{ duration: 60, label: '60 min', price: 0 }];

  // Time options every 30 min, full day. Same as ModifyAvailabilityModal.
  const timeOptions = [];
  {
    let cur = DateTime.fromObject({ hour: 0, minute: 0 }, { zone: DEFAULT_TZ });
    const last = DateTime.fromObject({ hour: 23, minute: 30 }, { zone: DEFAULT_TZ });
    while (cur <= last) {
      timeOptions.push({ value: cur.toFormat('HH:mm'), label: cur.toFormat('h:mm a') });
      cur = cur.plus({ minutes: 30 });
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    onError(null);

    if (!defaultAddress) {
      onError('This client has no saved address. Add one on their profile first, or book one-off.');
      return;
    }
    if (endMode === 'date' && !endDate) {
      onError('Pick an end date or switch the end mode.');
      return;
    }

    // Geocode the saved address to attach lat/lng (the server requires
    // both). Use the existing /api/geocode endpoint.
    let lat = null, lng = null;
    try {
      const geoRes = await axios.get('/api/geocode', { params: { address: defaultAddress } });
      lat = geoRes.data.lat;
      lng = geoRes.data.lng;
    } catch (geoErr) {
      onError(`Couldn't verify the client's address. Update it on their profile and try again.`);
      return;
    }

    const tier = durationsAvailable.find(d => d.duration === Number(duration)) || durationsAvailable[0];

    // Sanity-check additional sessions before sending.
    for (let i = 0; i < additionalSessions.length; i++) {
      const s = additionalSessions[i];
      if (!s.recipientName?.trim()) {
        onError(`Recipient name is required for additional session ${i + 1}.`);
        return;
      }
    }

    const payload = {
      clientId: client._id,
      startDate,
      startTime,
      duration: Number(duration),
      intervalWeeks: Number(intervalWeeks),
      endDate: endMode === 'date' ? endDate : null,
      occurrenceLimit: endMode === 'count' ? Number(occurrenceLimit) : null,
      location: { address: defaultAddress, lat, lng },
      serviceType: { id: 'package', name: tier.label },
      addons: [],
      pricing: { basePrice: tier.price, addonsPrice: 0, totalPrice: tier.price },
      paymentMethod,
      recipientType: 'self',
      additionalSessions: additionalSessions.map(s => {
        const t = durationsAvailable.find(d => d.duration === Number(s.duration)) || durationsAvailable[0];
        return {
          duration: Number(s.duration),
          serviceType: { id: 'package', name: t.label },
          addons: [],
          pricing: { basePrice: t.price, addonsPrice: 0, totalPrice: t.price },
          paymentMethod,
          recipientType: 'other',
          recipientInfo: {
            name: s.recipientName.trim(),
            phone: s.recipientPhone?.trim() || '',
          },
        };
      }),
    };

    setSubmitting(true);
    try {
      const res = await axios.post('/api/recurring-series', payload, { withCredentials: true });
      onCreated(res.data);
    } catch (err) {
      onError(err.response?.data?.message || 'Failed to create standing appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-3 p-4 bg-paper-deep rounded-lg border border-line">
      <p className="text-sm text-slate-700 mb-3">
        Set up a recurring appointment with {client?.profile?.fullName?.split(' ')[0] || 'this client'}.
        Bookings will materialize automatically up to 90 days out.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">First date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={todayStr}
              required
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Start time</label>
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {timeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {durationsAvailable.map(d => (
                <option key={d.duration} value={d.duration}>{d.label} (${d.price})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Cadence</label>
            <select
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {INTERVAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Run until</label>
          <div className="flex gap-2 text-xs mb-2">
            <button
              type="button"
              onClick={() => setEndMode('open')}
              className={`px-3 py-1 rounded-full border ${endMode === 'open' ? 'bg-[#B07A4E] text-white border-[#B07A4E]' : 'bg-paper-elev text-slate-700 border-line'}`}
            >
              Until cancelled
            </button>
            <button
              type="button"
              onClick={() => setEndMode('date')}
              className={`px-3 py-1 rounded-full border ${endMode === 'date' ? 'bg-[#B07A4E] text-white border-[#B07A4E]' : 'bg-paper-elev text-slate-700 border-line'}`}
            >
              Specific date
            </button>
            <button
              type="button"
              onClick={() => setEndMode('count')}
              className={`px-3 py-1 rounded-full border ${endMode === 'count' ? 'bg-[#B07A4E] text-white border-[#B07A4E]' : 'bg-paper-elev text-slate-700 border-line'}`}
            >
              Number of times
            </button>
          </div>
          {endMode === 'date' && (
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          )}
          {endMode === 'count' && (
            <input
              type="number"
              min="1"
              max="100"
              value={occurrenceLimit}
              onChange={(e) => setOccurrenceLimit(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Default payment method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          >
            {(providerServices?.acceptedPaymentMethods || ['cash']).map(m => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Each occurrence inherits this. They can each be marked paid individually after the visit.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-700 inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              Back-to-back at this address
            </label>
            <button
              type="button"
              onClick={() => setAdditionalSessions(prev => [
                ...prev,
                { duration: defaultDuration, recipientName: '', recipientPhone: '' },
              ])}
              className="text-xs text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" />
              Add session
            </button>
          </div>
          {additionalSessions.length === 0 ? (
            <p className="text-xs text-slate-400">
              Optional. Add another session if this is a couple's massage or multi-recipient standing.
            </p>
          ) : (
            <div className="space-y-2">
              {additionalSessions.map((s, idx) => (
                <div key={idx} className="p-2 bg-paper-elev rounded border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-700">Session {idx + 2}</p>
                    <button
                      type="button"
                      onClick={() => setAdditionalSessions(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Duration</label>
                      <select
                        value={s.duration}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setAdditionalSessions(prev => prev.map((x, i) => i === idx ? { ...x, duration: v } : x));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      >
                        {durationsAvailable.map(d => (
                          <option key={d.duration} value={d.duration}>{d.label} (${d.price})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Recipient name</label>
                      <input
                        type="text"
                        value={s.recipientName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAdditionalSessions(prev => prev.map((x, i) => i === idx ? { ...x, recipientName: v } : x));
                        }}
                        placeholder="e.g. Spouse"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Recipient phone (optional)</label>
                    <input
                      type="tel"
                      value={s.recipientPhone}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAdditionalSessions(prev => prev.map((x, i) => i === idx ? { ...x, recipientPhone: v } : x));
                      }}
                      placeholder="(optional)"
                      className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                Each session runs back-to-back with a 15-min settle buffer between. The whole chain repeats on the same cadence.
              </p>
            </div>
          )}
        </div>

        {!defaultAddress && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
            This client has no saved address. Add one on their profile first.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={submitting} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !defaultAddress}
            className="inline-flex items-center px-4 py-1.5 text-sm bg-[#B07A4E] text-white rounded hover:bg-[#8A5D36] disabled:opacity-50 font-medium"
          >
            {submitting ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating…</>
            ) : (
              <><Repeat className="w-3.5 h-3.5 mr-1.5" /> Create standing appointment</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StandingAppointmentsSection;
