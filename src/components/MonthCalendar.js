// MonthCalendar.js
import React, { useState, useEffect, useContext } from 'react';
import { format } from 'date-fns';
import { DateTime } from 'luxon';
import { AuthContext } from '../AuthContext';
import { DEFAULT_TZ } from '../utils/timeConstants';

// Build a JS Date that represents midnight on day 1 of the given
// month in LA, no matter what the user's local browser timezone is.
// new Date(year, month, 1) builds in *local* time — for users east
// of LA (most of the US) midnight local lands on the previous day
// in LA, which causes the calendar to land on the last of the prior
// month. Anchoring in LA explicitly fixes that.
const firstOfMonthLA = (year, month0Indexed) => {
  return DateTime.fromObject(
    { year, month: month0Indexed + 1, day: 1, hour: 0 },
    { zone: DEFAULT_TZ }
  ).toJSDate();
};

// 6-month grid the provider/client can pop open by tapping the header.
// Shows the current month + next 5. The shortest path most users want
// is "skip ahead one month" — but providers also reference future
// months when scheduling standing-appointment-ish work.
const MonthPickerOverlay = ({ selectedDate, onPick, onClose }) => {
  // Read everything in LA so the cells label the months the way the
  // app reasons about time, not the way the user's browser does.
  const todayLA = DateTime.now().setZone(DEFAULT_TZ);
  const selLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ);
  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const dt = todayLA.startOf('month').plus({ months: i });
    cells.push({ year: dt.year, month0: dt.month - 1 }); // month 0-indexed for display map
  }

  return (
    <div
      className="absolute inset-0 bg-black/30 z-30 flex items-start justify-center pt-12"
      onClick={onClose}
    >
      <div
        className="bg-paper-elev rounded-lg shadow-xl border border-line p-3 w-64"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-3 gap-2">
          {cells.map(({ year, month0 }, idx) => {
            const sel = year === selLA.year && month0 === (selLA.month - 1);
            const cur = year === todayLA.year && month0 === (todayLA.month - 1);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => { onPick(firstOfMonthLA(year, month0)); onClose(); }}
                className={`p-2 rounded-lg border text-sm font-medium transition-colors
                  ${sel
                    ? 'border-[#B07A4E] bg-[#B07A4E]/10 text-[#B07A4E]'
                    : 'border-line bg-paper-elev text-slate-700 hover:border-[#B07A4E]/50'}
                `}
              >
                <div>{monthShort[month0]}</div>
                <div className="text-xs text-slate-500">{year}</div>
                {cur && (
                  <div className="text-[10px] uppercase tracking-wide text-[#B07A4E] mt-0.5">Today</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};


const MonthCalendar = ({ selectedDate, onDateChange, events, refreshKey = 0 }) => {
  const { user } = useContext(AuthContext);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Scope the availability fetch by provider — clients have a single
  // assigned provider, providers see their own. Without this, /month
  // returns every provider's availability mixed together (worked in
  // practice today because each client has exactly one provider, but
  // fragile if that ever changes).
  const providerId = user?.accountType === 'PROVIDER'
    ? user._id
    : user?.providerId || null;

  // The eternal dance of time calculation
  const daysInMonth = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1
  ).getDay();

  // Because typing these out every time is for masochists
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Fetch availability data for the displayed month
  useEffect(() => {
    const fetchMonthAvailability = async () => {
      try {
        setIsLoading(true);
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1;

        const url = providerId
          ? `/api/availability/month/${year}/${month}?providerId=${providerId}`
          : `/api/availability/month/${year}/${month}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load availability');

        const data = await response.json();
        const sanitizedData = data.map(block => ({
          ...block,
          originalDate: block.date,
          date: new Date(block.date).toISOString().split('T')[0]
        }));

        setAvailabilityData(sanitizedData);
      } catch (error) {
        console.error('Failed to fetch month availability:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMonthAvailability();
    // refreshKey lets the parent force a re-fetch after mutations
    // (delete a block, add availability, change weekly hours, etc.)
    // without forcing the user to scrub away and back to the date.
  }, [selectedDate, providerId, refreshKey]);

  const handlePrevMonth = () => {
    onDateChange(firstOfMonthLA(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    onDateChange(firstOfMonthLA(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
  };

  // The truth about whether we can book this shit or not
  const hasAvailability = (day) => {
    // First, let's construct our temporal truth with the purity of Platonic forms
    const targetDate = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Now we're searching for our date in the quantum foam of availability
    return availabilityData.some(block => {
      // Strip away the metaphysical bullshit and get to the raw essence of time
      const blockDate = new Date(block.date).toISOString().split('T')[0];
      return blockDate === targetDate;
    });
  };
  
  
  // Add this utility function to handle our date normalization consistently
  const normalizeDate = (date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };
  
  

  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="space-y-4">
      {/* The "You are here" sign in the temporal map */}
      <div className="text-center">
        <h2 className="text-xl font-medium text-slate-700">
          {format(selectedDate, 'EEEE, MMMM do yyyy')}
        </h2>
      </div>

      <div className="bg-paper-elev rounded-lg shadow-md overflow-hidden relative">
        {/* Calendar Header - The command center of temporal navigation */}
        <div className="bg-[#B07A4E] text-white p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePrevMonth}
              className="text-white hover:text-[#FBF7EF] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowMonthPicker(v => !v)}
              className="text-xl font-semibold hover:text-[#FBF7EF] transition-colors px-3 py-1 rounded"
              title="Pick another month"
            >
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </button>
            <button
              onClick={handleNextMonth}
              className="text-white hover:text-[#FBF7EF] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map(day => (
              <div key={day} className="text-center text-sm font-medium text-[#FBF7EF]">
                {day}
              </div>
            ))}
          </div>
        </div>

        {/* The main event - where time meets possibility */}
        <div className="bg-paper-elev p-4">
          <div className="grid grid-cols-7 gap-1">
            {/* The void before time begins */}
            {Array.from({ length: firstDayOfMonth }).map((_, index) => (
              <div key={`empty-${index}`} className="h-12" />
            ))}

            {/* Where past, present, and future collide */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
              const isPast = isPastDate(date);
              const isToday = day === new Date().getDate() && 
                           selectedDate.getMonth() === new Date().getMonth() &&
                           selectedDate.getFullYear() === new Date().getFullYear();
              const isSelected = day === selectedDate.getDate();
              const hasSlots = !isLoading && hasAvailability(day);

              return (
                  <button
                    key={day}
                    onClick={() => !isPast && onDateChange(date)}

                    disabled={isPast}
                    className={`
                      relative h-12 flex items-center justify-center rounded-lg
                      transition-all duration-200 ease-in-out
                      ${isPast ? 'text-slate-300 line-through bg-paper-deep' : 
                        hasSlots ? 'text-slate-700 hover:bg-[#FBF7EF]' :
                        'text-slate-500 hover:bg-paper-deep'
                      }
                      ${isSelected ? 'ring-2 ring-[#B07A4E] ring-offset-2' : ''}
                      ${hasSlots ? 'border-green-200' : ''}
                    `}
                  >
                  <span className={`
                    ${isToday ? 'font-semibold text-[#8A5D36]' : ''}
                    ${hasSlots ? 'font-medium' : 'font-normal'}
                  `}>
                    {day}
                  </span>
                  {!isPast && hasSlots && (
                    <span className="absolute bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-green-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {showMonthPicker && (
          <MonthPickerOverlay
            selectedDate={selectedDate}
            onPick={(d) => onDateChange(d)}
            onClose={() => setShowMonthPicker(false)}
          />
        )}
      </div>
    </div>
  );
};

export default MonthCalendar;