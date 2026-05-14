import React, { useState, useRef, useEffect, useContext } from 'react';
import MonthCalendar from './MonthCalendar';
import { Calendar } from 'lucide-react';
import { DateTime } from "luxon";
import { AuthContext } from '../AuthContext';
import { tzOf } from '../utils/timeConstants';



const MobileDatePicker = ({ selectedDate, onDateChange, events, refreshKey = 0 }) => {
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);
  const scrollRef = useRef(null);
  const [month, setMonth] = useState(selectedDate.getMonth());
  const [year, setYear] = useState(selectedDate.getFullYear());
  const [availabilityData, setAvailabilityData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Same provider scoping as MonthCalendar — see comment there.
  const providerId = user?.accountType === 'PROVIDER'
    ? user._id
    : user?.providerId || null;

  // Temporal reality check - what days exist in our chosen slice of time?
  const getDaysInMonth = (year, month) => {
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dates = getDaysInMonth(year, month);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    const fetchMonthAvailability = async () => {
      try {
        setIsLoading(true);
        const url = providerId
          ? `/api/availability/month/${year}/${month + 1}?providerId=${providerId}`
          : `/api/availability/month/${year}/${month + 1}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch availability');
        const data = await response.json();
        setAvailabilityData(data);
      } catch (error) {
        console.error('Failed to fetch availability:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMonthAvailability();
    // refreshKey lets the parent force a re-fetch after mutations
    // (delete a block, add availability, etc.) without scrubbing away.
  }, [month, year, providerId, refreshKey]);

  // Auto-scroll the strip on month change. Today's number when looking
  // at the current month (so today is centered on first paint); day 1
  // for any other month (so a fresh nav lands on the start, not on
  // wherever the previous selectedDate happened to fall).
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayLA = DateTime.now().setZone(viewerTz);
    const isCurrentMonth = todayLA.year === year && (todayLA.month - 1) === month;
    const targetDayIdx = isCurrentMonth ? todayLA.day - 1 : 0;
    const el = scrollRef.current.children[targetDayIdx];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [month, year]);

  // When the user navigates months via the arrows, also tell the parent
  // about it — selectedDate moves to day 1 of the new month so the rest
  // of the app (slot fetcher, day view, refreshes) is in sync. Without
  // this, the strip just changed which month it *displays* while the
  // parent still thought you were on the old day, and the auto-scroll
  // would land you on the same day-of-month in the new month rather
  // than on the 1st.
  const handlePrevMonth = () => {
    let newMonth, newYear;
    if (month === 0) { newMonth = 11; newYear = year - 1; }
    else { newMonth = month - 1; newYear = year; }
    setMonth(newMonth);
    setYear(newYear);
    onDateChange(DateTime.fromObject(
      { year: newYear, month: newMonth + 1, day: 1, hour: 0 },
      { zone: viewerTz }
    ).toJSDate());
  };

  const handleNextMonth = () => {
    let newMonth, newYear;
    if (month === 11) { newMonth = 0; newYear = year + 1; }
    else { newMonth = month + 1; newYear = year; }
    setMonth(newMonth);
    setYear(newYear);
    onDateChange(DateTime.fromObject(
      { year: newYear, month: newMonth + 1, day: 1, hour: 0 },
      { zone: viewerTz }
    ).toJSDate());
  };

  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Set of availability kinds for `date` — empty if nothing available.
  // Drives the date-pill shading: emerald = mobile, sky = static, both
  // when the day has windows of each kind.
  const getKindsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    const kinds = new Set();
    for (const block of availabilityData) {
      const blockDateStr = new Date(block.date).toISOString().split('T')[0];
      if (blockDateStr !== dateStr) continue;
      if (Array.isArray(block.kinds)) {
        for (const k of block.kinds) kinds.add(k);
      } else if (block.kind) {
        kinds.add(block.kind);
      } else {
        kinds.add('mobile');
      }
    }
    return kinds;
  };
  

  // 6-month grid the user can pop open by tapping the month name.
  // Mirrors the desktop MonthCalendar's picker — current + next 5.
  // Build cells from LA so labels and equality checks match the way
  // the rest of the app reasons about time.
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const todayLA = DateTime.now().setZone(viewerTz);
  const sixMonths = [];
  for (let i = 0; i < 6; i++) {
    const dt = todayLA.startOf('month').plus({ months: i });
    sixMonths.push({ year: dt.year, month0: dt.month - 1 });
  }
  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-1 border border-line relative">
      <div className="bg-paper-elev rounded-lg overflow-hidden">
        <div className="p-2 border-b border-line">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevMonth}
              className="text-slate-600 hover:text-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowMonthPicker(v => !v)}
              className="text-base font-medium text-slate-900 hover:text-[#B07A4E] transition-colors px-2 py-0.5"
              title="Pick another month"
            >
              {monthNames[month]} {year}
            </button>
            <button
              onClick={handleNextMonth}
              className="text-slate-600 hover:text-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto scrollbar-hide py-2 px-1">
          <div
            ref={scrollRef}
            className="flex space-x-1 min-w-full px-1"
          >
            {dates.map((date) => {
              const isPast = isPastDate(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const kinds = isLoading ? new Set() : getKindsForDate(date);
              // Flexible blocks contribute to BOTH signals — the day
              // offers either-or, which the gradient communicates.
              const hasFlexible = kinds.has('flexible');
              const hasMobile = kinds.has('mobile') || hasFlexible;
              const hasStatic = kinds.has('static') || hasFlexible;
              const hasSlots = hasMobile || hasStatic;

              // Always paint the kind tint when a date has availability,
              // even when selected — the user needs to still see WHAT
              // kind of day it is after picking it. The copper ring +
              // shadow do the selection signaling. Smooth gradients
              // read as solid emerald at small pill widths, so "both"
              // gets a hard 50/50 diagonal split via inline style.
              let kindBg = '';
              let kindBorder = '';
              let kindStyle = undefined;
              if (!isPast && hasSlots) {
                if (hasMobile && hasStatic) {
                  kindStyle = { background: 'linear-gradient(135deg, #d1fae5 0%, #d1fae5 50%, #bae6fd 50%, #bae6fd 100%)' };
                  kindBorder = 'border-emerald-300';
                } else if (hasMobile) {
                  kindBg = 'bg-emerald-100';
                  kindBorder = 'border-emerald-300';
                } else {
                  kindBg = 'bg-sky-100';
                  kindBorder = 'border-sky-300';
                }
              }

              // Background priority for the className branch:
              // 1) past → greyed
              // 2) selected w/ no kind tint → copper cream (so the
              //    selection is visible at all on dead/no-availability
              //    dates the user can still tap on)
              // 3) has kind → kind classes (style takes over for "both")
              // 4) plain → paper
              const baseClasses = isPast
                ? 'text-slate-300 line-through cursor-not-allowed border-line-soft'
                : hasSlots
                  ? `text-slate-800 ${kindBg} ${kindBorder} hover:brightness-95`
                  : isSelected
                    ? 'bg-[#FBF7EF] text-[#8A5D36] border-[#B07A4E]'
                    : 'text-slate-500 hover:bg-paper-deep border-line-soft';

              return (
<button
  key={date.toISOString()}
  onClick={() => !isPast && onDateChange(date)}
  disabled={isPast}
  style={kindStyle}
  title={isPast ? "Past dates cannot be selected" : !hasSlots ? "No availability set" : ""}
  className={`
    relative flex flex-col items-center justify-center
    min-w-[4rem] py-2 px-3 rounded-lg
    transition-all duration-200 ease-in-out
    border
    ${baseClasses}
    ${isSelected ? 'shadow-md ring-2 ring-[#B07A4E] ring-opacity-70 ring-offset-1' : ''}
  `}
>
  <span className={`text-xs font-medium mb-1
    ${isSelected ? 'text-[#8A5D36]' : 'text-slate-500'}`}>
    {dayNames[date.getDay()]}
  </span>
  <div className="relative flex flex-col items-center">
    <span className={`text-lg font-semibold
      ${isSelected ? 'text-[#8A5D36]' : (isToday ? 'text-[#8A5D36]' : '')}`}>
      {date.getDate()}
    </span>
  </div>
</button>
              );
            })}
          </div>
        </div>
      </div>

      {showMonthPicker && (
        <div
          className="absolute inset-0 bg-black/30 z-30 flex items-start justify-center pt-10"
          onClick={() => setShowMonthPicker(false)}
        >
          <div
            className="bg-paper-elev rounded-lg shadow-xl border border-line p-3 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {sixMonths.map(({ year: y, month0 }, idx) => {
                const sel = y === year && month0 === month;
                const cur = y === todayLA.year && month0 === (todayLA.month - 1);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMonth(month0);
                      setYear(y);
                      setShowMonthPicker(false);
                    }}
                    className={`p-2 rounded-lg border text-sm font-medium transition-colors
                      ${sel
                        ? 'border-[#B07A4E] bg-[#B07A4E]/10 text-[#B07A4E]'
                        : 'border-line bg-paper-elev text-slate-700 hover:border-[#B07A4E]/50'}
                    `}
                  >
                    <div>{monthShort[month0]}</div>
                    <div className="text-xs text-slate-500">{y}</div>
                    {cur && (
                      <div className="text-[10px] uppercase tracking-wide text-[#B07A4E] mt-0.5">Today</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// The grand unifier of temporal visualization
const ResponsiveCalendar = ({ selectedDate, onDateChange, events, refreshKey = 0 }) => {
  return (
    <>
      <div className="md:hidden">
        <MobileDatePicker
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          events={events}
          refreshKey={refreshKey}
        />
      </div>

      <div className="hidden md:block">
        <MonthCalendar
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          events={events}
          refreshKey={refreshKey}
        />
      </div>
    </>
  );
};

export default ResponsiveCalendar;
