// Reschedule an existing booking. The server-side endpoint
// (PUT /api/bookings/:id/reschedule) re-runs the same slot generator
// the booking flow uses, so any conflicts (overlaps, drive-time,
// blocked windows, lack of availability that day) come back as a 400
// from the server. This UI just collects a new date+time, validates
// against the same /api/availability/available endpoint to surface
// open slots, and posts.

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import { X, AlertCircle, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { tzOf } from '../utils/timeConstants';

const RescheduleModal = ({ booking, onSuccess, onClose }) => {
  // Default the date picker to the booking's current date so the user
  // sees the cohort of slots near their existing one. "Today" falls back
  // to the booking's TZ (matches the provider's wall clock).
  const bookingTz = tzOf(booking);
  const initialDate = useMemo(() => {
    if (!booking?.localDate) return DateTime.now().setZone(bookingTz).toFormat('yyyy-MM-dd');
    return booking.localDate;
  }, [booking?.localDate, bookingTz]);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null); // 24h "HH:mm"
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const providerId = booking?.provider?._id || booking?.provider;
  const duration = booking?.duration;
  const location = booking?.location;

  useEffect(() => {
    if (!selectedDate || !providerId || !duration || !location?.lat || !location?.lng) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSlots(true);
        setError(null);
        const res = await axios.get(`/api/availability/available/${selectedDate}`, {
          params: {
            providerId,
            duration,
            lat: location.lat,
            lng: location.lng,
          },
          withCredentials: true,
        });
        if (cancelled) return;
        // Slot endpoint returns { time, kind, location?, ... } objects.
        // For reschedule we only need the time. Filter out the booking's
        // current start time (it's "available" because the validator
        // excludes the current booking from its conflict check, but
        // showing it as a pickable option is misleading).
        const formatted = (res.data || []).map(s => {
          const iso = typeof s === 'string' ? s : s.time;
          const dt = DateTime.fromISO(iso, { zone: DEFAULT_TZ });
          return {
            iso,
            display: dt.toFormat('h:mm a'),
            local: dt.toFormat('HH:mm'),
            kind: typeof s === 'object' ? s.kind : 'mobile',
          };
        }).filter(s => !(selectedDate === booking.localDate && s.local === booking.startTime));
        setSlots(formatted);
        setSelectedTime(null);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load available times');
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, providerId, duration, location?.lat, location?.lng, booking?.localDate, booking?.startTime]);

  const handleSubmit = async () => {
    if (!selectedTime) {
      setError('Pick a new time first');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await axios.put(
        `/api/bookings/${booking._id}/reschedule`,
        { date: selectedDate, time: selectedTime },
        { withCredentials: true }
      );
      onSuccess && onSuccess(res.data);
      onClose && onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reschedule');
      setSubmitting(false);
    }
  };

  const currentLabel = booking?.localDate && booking?.startTime
    ? `${DateTime.fromFormat(booking.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d')} at ${DateTime.fromFormat(booking.startTime, 'HH:mm').toFormat('h:mm a')}`
    : '';

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-paper-elev rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Reschedule appointment</h2>
            {currentLabel && (
              <p className="text-xs text-slate-500 mt-0.5">
                Currently: {currentLabel} ({duration} min)
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start gap-2 rounded">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={DateTime.now().setZone(bookingTz).toFormat('yyyy-MM-dd')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Available times</label>
              {loadingSlots && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" /> loading
                </span>
              )}
            </div>
            {!loadingSlots && slots.length === 0 ? (
              <div className="text-center py-6 bg-paper-deep rounded-lg border border-dashed border-slate-300">
                <CalendarIcon className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                <p className="text-sm text-slate-500">No openings on this day for a {duration}-min slot</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {slots.map(s => {
                  const selected = selectedTime === s.local;
                  return (
                    <button
                      key={s.iso}
                      type="button"
                      onClick={() => setSelectedTime(s.local)}
                      className={`p-2 rounded-lg border text-sm font-medium transition-colors
                        ${selected
                          ? 'border-[#B07A4E] bg-[#B07A4E]/10 text-[#B07A4E]'
                          : 'border-line bg-paper-elev text-slate-900 hover:border-[#B07A4E]/50'}
                      `}
                    >
                      {s.display}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-line bg-paper-deep flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedTime}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:bg-slate-400 disabled:cursor-not-allowed font-medium"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Rescheduling…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RescheduleModal;
