import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';

// Modify-availability modal. Mirrors AddAvailabilityModal's time-picker
// pattern: select values are stored as 24-hour "HH:mm" strings (matching
// what the backend expects), and the dropdown labels render as 12-hour
// for human readability. The entire 24-hour day is covered in 30-minute
// increments so any existing block — early-morning or late-night —
// pre-fills correctly.
//
// Earlier version split block.start as if it were already an "HH:MM"
// string, but the API returns it as an ISO timestamp from the Date
// field on Availability — so the modal opened with garbage values for
// every block. Now we parse via Luxon, accepting Date or ISO string.
const ModifyAvailabilityModal = ({ block, onModify, onClose, onBlockOff }) => {
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Coerce whatever the API gave us (Date instance, ISO string, or
  // already-formatted "HH:mm" string) into a 24-hour "HH:mm" string in
  // the LA timezone.
  const toHHmm = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
      return DateTime.fromJSDate(value).setZone(DEFAULT_TZ).toFormat('HH:mm');
    }
    if (typeof value === 'string') {
      if (value.includes('T')) {
        return DateTime.fromISO(value).setZone(DEFAULT_TZ).toFormat('HH:mm');
      }
      // Already in HH:mm form (or close enough for the regex below to catch).
      return /^\d{2}:\d{2}$/.test(value) ? value : null;
    }
    return null;
  };

  useEffect(() => {
    if (!block) return;
    const startHHmm = toHHmm(block.start);
    const endHHmm = toHHmm(block.end);
    if (startHHmm) setStartTime(startHHmm);
    if (endHHmm) setEndTime(endHHmm);
  }, [block]);

  // Generate every 30-min slot from 00:00 to 23:30 — full day coverage so
  // pre-dawn or late-night blocks don't get truncated.
  const timeOptions = [];
  {
    let cur = DateTime.fromObject({ hour: 0, minute: 0 }, { zone: DEFAULT_TZ });
    const end = DateTime.fromObject({ hour: 23, minute: 30 }, { zone: DEFAULT_TZ });
    while (cur <= end) {
      timeOptions.push({
        value: cur.toFormat('HH:mm'),
        label: cur.toFormat(TIME_FORMATS.TIME_12H),
      });
      cur = cur.plus({ minutes: 30 });
    }
  }

  // If the block's exact start/end isn't on a 30-min boundary (rare —
  // shouldn't happen per the Add flow), insert the actual value into the
  // option list so the select doesn't render blank.
  const ensureOption = (val) => {
    if (val && !timeOptions.some(o => o.value === val)) {
      const dt = DateTime.fromFormat(val, 'HH:mm', { zone: DEFAULT_TZ });
      if (dt.isValid) {
        timeOptions.push({ value: val, label: dt.toFormat(TIME_FORMATS.TIME_12H) });
        timeOptions.sort((a, b) => a.value.localeCompare(b.value));
      }
    }
  };
  ensureOption(startTime);
  ensureOption(endTime);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate end-after-start using minute arithmetic — both values are
    // guaranteed "HH:mm" by the option list.
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      setError('End time must be after start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onModify({
        ...block,
        start: startTime,
        end: endTime,
      });
    } catch (err) {
      // Parent re-throws server errors here so we can surface them
      // inline. Without this the modal silently spins back to its
      // resting state and the user has no idea what went wrong —
      // any banner the parent set is hidden behind this modal.
      console.error('Modification error:', err);
      setError(err?.message || 'Failed to modify availability.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50">
      <div className="bg-paper-elev p-6 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-slate-900">Modify Availability</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 mb-1">
                Start Time
              </label>
              <select
                id="startTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-base focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              >
                {timeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-slate-700 mb-1">
                End Time
              </label>
              <select
                id="endTime"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-base focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              >
                {timeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {onBlockOff && (
            <div className="pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBlockOff(block);
                }}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Block off time within this window
              </button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
                flex items-center justify-center min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModifyAvailabilityModal;
