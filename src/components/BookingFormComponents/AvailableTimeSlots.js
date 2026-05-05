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

  // Show every slot in the active period. Earlier versions hid off-grid
  // (:15/:45) slots behind a "Show more" toggle to reduce visual density,
  // but users were missing valid times that happened to fall there —
  // dropping the gating so the picker is always exhaustive.

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

  const shown = slotsByPeriod[selectedPeriod] || [];

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
              shown.map(slot => {
                const isStatic = slot.kind === 'static';
                const selected = selectedTime?.iso === slot.iso;
                return (
                  <button
                    key={slot.iso}
                    onClick={() => onTimeSelected(slot)}
                    title={isStatic && slot.location?.name ? `In-studio at ${slot.location.name}` : undefined}
                    className={`
                      min-h-touch p-3 rounded-lg border-2 transition-all duration-200
                      hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                      ${selected
                        ? (isStatic ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-teal-600 bg-teal-50 shadow-md')
                        : (isStatic ? 'border-blue-200 bg-paper-elev hover:border-blue-400' : 'border-line bg-paper-elev hover:border-teal-300')
                      }
                    `}
                  >
                    <div className={`
                      text-lg font-medium
                      ${selected
                        ? (isStatic ? 'text-blue-700' : 'text-teal-700')
                        : 'text-slate-900'}
                    `}>
                      {slot.display || slot.local}
                    </div>
                    {isStatic && (
                      <div className="text-[10px] uppercase tracking-wide font-medium text-blue-700 mt-0.5">
                        In-studio
                      </div>
                    )}
                    {selected && (
                      <Check className={`w-4 h-4 mx-auto mt-1 ${isStatic ? 'text-blue-600' : 'text-teal-600'}`} />
                    )}
                  </button>
                );
              })
            )}
          </div>

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
