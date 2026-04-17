import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../utils/timeConstants';

const BlockOffTimeModal = ({ block, availabilityBlocks, date, onBlock, onClose }) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parseTime = (isoOrHHmm) => {
    if (typeof isoOrHHmm === 'string' && isoOrHHmm.includes('T')) {
      return DateTime.fromISO(isoOrHHmm).setZone(DEFAULT_TZ);
    }
    const [h, m] = isoOrHHmm.split(':').map(Number);
    return DateTime.now().setZone(DEFAULT_TZ).set({ hour: h, minute: m });
  };

  // Determine the time range — either from a specific block or from all availability blocks
  let rangeStartDT = null;
  let rangeEndDT = null;

  if (block) {
    rangeStartDT = parseTime(block.start);
    rangeEndDT = parseTime(block.end);
  } else if (availabilityBlocks && availabilityBlocks.length > 0) {
    // Use the earliest start and latest end across all blocks
    const starts = availabilityBlocks.map(b => parseTime(b.start));
    const ends = availabilityBlocks.map(b => parseTime(b.end));
    rangeStartDT = starts.reduce((min, dt) => dt < min ? dt : min, starts[0]);
    rangeEndDT = ends.reduce((max, dt) => dt > max ? dt : max, ends[0]);
  }

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

  useEffect(() => {
    if (rangeStartDT && rangeEndDT) {
      const defaultStart = rangeStartDT;
      const defaultEnd = defaultStart.plus({ minutes: 30 });
      setStartTime(formatFor12h(defaultStart.hour, defaultStart.minute));
      const actualEnd = defaultEnd <= rangeEndDT ? defaultEnd : rangeEndDT;
      setEndTime(formatFor12h(actualEnd.hour, actualEnd.minute));
    }
  }, [block, availabilityBlocks]); // eslint-disable-line

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

    const startMins = toMinutes(startTime);
    const endMins = toMinutes(endTime);

    if (endMins <= startMins) {
      setError('End time must be after start time');
      return;
    }

    setIsSubmitting(true);

    try {
      let localDate;
      if (block) {
        localDate = (rangeStartDT).toFormat('yyyy-MM-dd');
      } else if (date) {
        localDate = DateTime.fromJSDate(date).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
      }

      await onBlock({
        date: localDate,
        start: to24Hour(startTime),
        end: to24Hour(endTime)
      });
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to block off time');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const rangeLabel = rangeStartDT && rangeEndDT
    ? `${rangeStartDT.toFormat('h:mm a')} - ${rangeEndDT.toFormat('h:mm a')}`
    : '';

  const noAvailability = !rangeStartDT || !rangeEndDT;

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Block Off Time</h2>
          {rangeLabel && (
            <p className="text-sm text-slate-500 mt-1">
              Available: {rangeLabel}
            </p>
          )}
        </div>

        {noAvailability ? (
          <div className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-400 text-amber-700">
            <p className="text-sm">No availability blocks for this day. Add availability first.</p>
          </div>
        ) : null}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!noAvailability && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="blockStartTime" className="block text-sm font-medium text-slate-700 mb-1">
                Start Time
              </label>
              <select
                id="blockStartTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-slate-500 focus:border-slate-500"
              >
                {generateTimeOptions()}
              </select>
            </div>

            <div>
              <label htmlFor="blockEndTime" className="block text-sm font-medium text-slate-700 mb-1">
                End Time
              </label>
              <select
                id="blockEndTime"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-slate-500 focus:border-slate-500"
              >
                {generateTimeOptions()}
              </select>
            </div>

            <p className="text-xs text-slate-400">
              Clients won't be able to book during this time.
            </p>

            <div className="flex justify-end space-x-3 pt-4">
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
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Blocking...
                  </>
                ) : (
                  'Block Time'
                )}
              </button>
            </div>
          </form>
        )}

        {noAvailability && (
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockOffTimeModal;
