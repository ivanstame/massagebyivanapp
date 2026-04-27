import React, { useState, useMemo } from 'react';
import { Clock, Check, AlertCircle, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';

// Period bins. Times are LA hour-of-day. Boundaries chosen for natural
// mental cohesion ("morning" ends at noon, "late" starts at 9 PM).
const PERIODS = [
  { key: 'Morning',   icon: Sunrise, startHour: 5,  endHour: 12 },
  { key: 'Afternoon', icon: Sun,     startHour: 12, endHour: 17 },
  { key: 'Evening',   icon: Sunset,  startHour: 17, endHour: 21 },
  { key: 'Late',      icon: Moon,    startHour: 21, endHour: 30 }, // up to 6 AM next day
];

// Adaptive density threshold. When a period has more than this many slots,
// hide the off-grid (`:15`/`:45`) ones by default and surface them via a
// "Show all times" toggle. Below the threshold, show everything — there's
// no clutter risk to manage.
const DENSITY_THRESHOLD = 5;

// A slot is "on-grid" if its minute is on the canonical :00 or :30 marks.
// Off-grid (:15, :45) slots only exist when the day's bookings have shifted
// the available start times off the half-hour cadence.
const isOnGrid = (slot) => {
  const m = DateTime.fromISO(slot.iso, { zone: DEFAULT_TZ }).minute;
  return m === 0 || m === 30;
};

const AvailableTimeSlots = ({
  availableSlots,
  selectedTime,
  onTimeSelected,
  hasValidDuration = false,
  selectedDate,
}) => {
  // Bin slots into the four period buckets. Unmatched slots (shouldn't
  // happen with valid availability) get dropped silently.
  const slotsByPeriod = useMemo(() => {
    const buckets = Object.fromEntries(PERIODS.map(p => [p.key, []]));
    if (!availableSlots) return buckets;
    for (const slot of availableSlots) {
      const dt = DateTime.fromISO(slot.iso, { zone: DEFAULT_TZ });
      if (!dt.isValid) continue;
      const hour = dt.hour;
      // Late bucket also catches early-morning hours (0–5) since those
      // are conceptually "still last night's late slots."
      const period = PERIODS.find(p => {
        if (p.key === 'Late') return hour >= 21 || hour < 5;
        return hour >= p.startHour && hour < p.endHour;
      });
      if (period) buckets[period.key].push(slot);
    }
    return buckets;
  }, [availableSlots]);

  // Default to the period with the most slots that day — usually whichever
  // chunk of the day the provider is most available in.
  const defaultPeriod = useMemo(() => {
    let best = null;
    let bestCount = 0;
    for (const p of PERIODS) {
      const count = slotsByPeriod[p.key].length;
      if (count > bestCount) {
        best = p.key;
        bestCount = count;
      }
    }
    return best || 'Afternoon';
  }, [slotsByPeriod]);

  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  // Reset to a non-empty period when availability changes (e.g. switching dates).
  React.useEffect(() => {
    if (slotsByPeriod[selectedPeriod]?.length === 0) {
      setSelectedPeriod(defaultPeriod);
    }
  }, [defaultPeriod, slotsByPeriod, selectedPeriod]);

  // "Show all times" toggle, per period — densifies the visible grid when
  // the user wants finer-grained control.
  const [expandedPeriods, setExpandedPeriods] = useState({});
  const isExpanded = (period) => !!expandedPeriods[period];
  const toggleExpanded = (period) =>
    setExpandedPeriods(prev => ({ ...prev, [period]: !prev[period] }));

  // For the active period, decide which slots to show.
  // - If total slots ≤ threshold, show everything (no clutter risk).
  // - If on-grid slots exist and total > threshold, default to on-grid only;
  //   user can expand to see off-grid via the toggle.
  // - If no on-grid slots exist (off-grid fallback), show whatever's available
  //   so the user never gets a false "no times" impression.
  const visibleSlotsFor = (period) => {
    const all = slotsByPeriod[period];
    if (!all || all.length === 0) return { shown: [], hidden: [] };
    const onGrid = all.filter(isOnGrid);
    const offGrid = all.filter(s => !isOnGrid(s));

    if (all.length <= DENSITY_THRESHOLD) {
      return { shown: all, hidden: [] };
    }
    if (onGrid.length === 0) {
      // Pure off-grid fallback: bookings shifted the day, only :15/:45
      // options exist. Show them — never hide the only options.
      return { shown: offGrid, hidden: [] };
    }
    if (isExpanded(period)) {
      return { shown: all, hidden: [] };
    }
    return { shown: onGrid, hidden: offGrid };
  };

  const formatDate = (date) => {
    if (!date) return '';
    return DateTime.fromJSDate(date).setZone(DEFAULT_TZ).toFormat('cccc, MMMM d');
  };

  if (!hasValidDuration) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="font-medium text-amber-900">Duration Required</h3>
            <p className="text-sm text-amber-700 mt-1">
              Please select a service to see available appointment times
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { shown, hidden } = visibleSlotsFor(selectedPeriod);

  // Render the period tabs. Suppress the "Late" tab when there are no late
  // slots — it would just be dead UI for the typical evening-only provider.
  const periodsToShow = PERIODS.filter(p =>
    p.key !== 'Late' || slotsByPeriod['Late'].length > 0
  );

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Clock className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Select Appointment Time</h3>
            <p className="text-sm text-slate-600 mt-1">
              {selectedDate ? formatDate(selectedDate) : 'Choose an available time slot'}
            </p>
          </div>
        </div>
      </div>

      {(!availableSlots || availableSlots.length === 0) ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">No available times for this date</p>
          <p className="text-sm text-slate-400 mt-2">Please try selecting a different date</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-1 mb-6 bg-slate-100 p-1 rounded-lg">
            {periodsToShow.map(({ key, icon: Icon }) => {
              const slotCount = slotsByPeriod[key].length;
              const isActive = selectedPeriod === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPeriod(key)}
                  disabled={slotCount === 0}
                  className={`
                    flex-1 flex items-center justify-between sm:justify-center
                    space-x-2 py-3 px-4 rounded-lg
                    transition-all duration-200 font-medium text-base
                    ${isActive
                      ? 'bg-paper-elev text-teal-700 shadow-sm'
                      : slotCount === 0
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-slate-600 hover:text-teal-600'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="w-5 h-5" />
                    <span>{key}</span>
                  </div>
                  {slotCount > 0 && (
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'}
                    `}>
                      {slotCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {shown.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <p className="text-slate-500">No available times in this period</p>
              </div>
            ) : (
              shown.map(slot => (
                <button
                  key={slot.iso}
                  onClick={() => onTimeSelected(slot)}
                  className={`
                    min-h-touch p-3 rounded-lg border-2 transition-all duration-200
                    hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                    ${selectedTime?.iso === slot.iso
                      ? 'border-teal-600 bg-teal-50 shadow-md'
                      : 'border-line bg-paper-elev hover:border-teal-300'
                    }
                  `}
                >
                  <div className={`
                    text-lg font-medium
                    ${selectedTime?.iso === slot.iso ? 'text-teal-700' : 'text-slate-900'}
                  `}>
                    {slot.display || slot.local}
                  </div>
                  {selectedTime?.iso === slot.iso && (
                    <Check className="w-4 h-4 text-teal-600 mx-auto mt-1" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Density toggle: only render when there are off-grid slots
              actually being held back. Quiet otherwise. */}
          {hidden.length > 0 && (
            <button
              type="button"
              onClick={() => toggleExpanded(selectedPeriod)}
              className="mt-4 text-sm text-teal-700 hover:text-teal-800 font-medium inline-flex items-center gap-1"
            >
              {isExpanded(selectedPeriod)
                ? 'Show fewer times'
                : `Show ${hidden.length} more time${hidden.length === 1 ? '' : 's'}`}
            </button>
          )}

          {selectedTime && selectedDate && (
            <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
              <div className="flex items-center space-x-2">
                <Check className="w-5 h-5 text-teal-600" />
                <p className="text-teal-900 font-medium">
                  Selected: {selectedTime.display || selectedTime.local} on {formatDate(selectedDate)}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AvailableTimeSlots;
