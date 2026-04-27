import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../utils/timeConstants';

// Modal for creating a manual block. Two shapes:
//   - All day: midnight-to-midnight LA — single toggle, time pickers hide.
//   - Time range: start/end pickers in 30-min steps spanning the day.
//
// Works whether or not the provider has set availability for the day.
// When availability exists, the time-picker range defaults to that span
// (so it's easy to block "the time I was going to be working"); when no
// availability exists, the picker covers a generic 6 AM – 11 PM range
// that the provider can adjust. Either way, the server doesn't require
// availability to exist — blocks live independently and persistently
// suppress slots if availability gets added later.
const BlockOffTimeModal = ({ block, availabilityBlocks, date, onBlock, onClose }) => {
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parseTime = (isoOrHHmm) => {
    if (typeof isoOrHHmm === 'string' && isoOrHHmm.includes('T')) {
      return DateTime.fromISO(isoOrHHmm).setZone(DEFAULT_TZ);
    }
    const [h, m] = isoOrHHmm.split(':').map(Number);
    return DateTime.now().setZone(DEFAULT_TZ).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  };

  // Range used to populate the time pickers. When the user is blocking
  // within a specific availability slot, narrow to that slot. When using
  // the day-level entry point with availability defined, span the union.
  // Otherwise fall back to a generous 6 AM – 11 PM grid.
  const { rangeStartDT, rangeEndDT, hasAvailability } = useMemo(() => {
    let baseDate;
    if (date) {
      baseDate = DateTime.fromJSDate(date).setZone(DEFAULT_TZ).startOf('day');
    } else if (block) {
      baseDate = parseTime(block.start).startOf('day');
    } else {
      baseDate = DateTime.now().setZone(DEFAULT_TZ).startOf('day');
    }

    if (block) {
      return {
        rangeStartDT: parseTime(block.start),
        rangeEndDT: parseTime(block.end),
        hasAvailability: true,
      };
    }
    if (availabilityBlocks && availabilityBlocks.length > 0) {
      const starts = availabilityBlocks.map(b => parseTime(b.start));
      const ends = availabilityBlocks.map(b => parseTime(b.end));
      return {
        rangeStartDT: starts.reduce((min, dt) => dt < min ? dt : min, starts[0]),
        rangeEndDT: ends.reduce((max, dt) => dt > max ? dt : max, ends[0]),
        hasAvailability: true,
      };
    }
    // No availability — generic working-hours grid the provider can pick within.
    return {
      rangeStartDT: baseDate.set({ hour: 6 }),
      rangeEndDT: baseDate.set({ hour: 23 }),
      hasAvailability: false,
    };
  }, [block, availabilityBlocks, date]);

  const formatFor12h = (hour, minute) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  const to24Hour = (time12) => {
    const [timePart, period] = time12.split(' ');
    let [hours, minutes] = timePart.split(':');
    hours = parseInt(hours);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  };

  const toMinutes = (time12) => {
    const t24 = to24Hour(time12);
    const [h, m] = t24.split(':').map(Number);
    return h * 60 + m;
  };

  // Initialize time picker values once we know the range.
  useEffect(() => {
    if (rangeStartDT && rangeEndDT) {
      const defaultStart = rangeStartDT;
      const defaultEnd = defaultStart.plus({ minutes: 30 });
      setStartTime(formatFor12h(defaultStart.hour, defaultStart.minute));
      const actualEnd = defaultEnd <= rangeEndDT ? defaultEnd : rangeEndDT;
      setEndTime(formatFor12h(actualEnd.hour, actualEnd.minute));
    }
  }, [block, availabilityBlocks, date]); // eslint-disable-next-line

  const generateTimeOptions = () => {
    if (!rangeStartDT || !rangeEndDT) return [];
    const options = [];
    let current = rangeStartDT;
    while (current < rangeEndDT) {
      const label = formatFor12h(current.hour, current.minute);
      options.push(<option key={label} value={label}>{label}</option>);
      current = current.plus({ minutes: 30 });
    }
    const endLabel = formatFor12h(rangeEndDT.hour, rangeEndDT.minute);
    if (!options.some(o => o.key === endLabel)) {
      options.push(<option key={endLabel} value={endLabel}>{endLabel}</option>);
    }
    return options;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    let payload;
    let localDate;
    if (block) {
      localDate = (rangeStartDT).toFormat('yyyy-MM-dd');
    } else if (date) {
      localDate = DateTime.fromJSDate(date).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
    } else {
      localDate = DateTime.now().setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
    }

    if (allDay) {
      payload = {
        date: localDate,
        allDay: true,
        reason: reason.trim(),
      };
    } else {
      const startMins = toMinutes(startTime);
      const endMins = toMinutes(endTime);
      if (endMins <= startMins) {
        setError('End time must be after start time');
        return;
      }
      payload = {
        date: localDate,
        start: to24Hour(startTime),
        end: to24Hour(endTime),
        reason: reason.trim(),
      };
    }

    setIsSubmitting(true);
    try {
      await onBlock(payload);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to block off time');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rangeLabel = rangeStartDT && rangeEndDT && hasAvailability
    ? `${rangeStartDT.toFormat('h:mm a')} - ${rangeEndDT.toFormat('h:mm a')}`
    : '';

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50">
      <div className="bg-paper-elev p-6 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Block off time</h2>
          {rangeLabel && (
            <p className="text-sm text-slate-500 mt-1">Available: {rangeLabel}</p>
          )}
          {!hasAvailability && !block && (
            <p className="text-sm text-slate-500 mt-1">
              No availability set for this day — the block holds anyway and will
              suppress hours if you add availability later.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* All-day toggle. Hides time pickers when on. */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-line bg-paper-deep cursor-pointer hover:border-[#B07A4E]/40 transition-colors">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <Calendar className="w-4 h-4 text-[#B07A4E]" />
                Block the entire day
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Midnight to midnight. Nothing can be booked.
              </p>
            </div>
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="blockStartTime" className="block text-sm font-medium text-slate-700 mb-1">
                  Start
                </label>
                <select
                  id="blockStartTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                >
                  {generateTimeOptions()}
                </select>
              </div>
              <div>
                <label htmlFor="blockEndTime" className="block text-sm font-medium text-slate-700 mb-1">
                  End
                </label>
                <select
                  id="blockEndTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                >
                  {generateTimeOptions()}
                </select>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="blockReason" className="block text-sm font-medium text-slate-700 mb-1">
              Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="blockReason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. doctor appointment, family thing"
              maxLength={200}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>

          <p className="text-xs text-slate-400">
            Clients won't be able to book during this time.
          </p>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center min-w-[120px] font-medium"
            >
              {isSubmitting ? 'Blocking…' : 'Block time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BlockOffTimeModal;
