import React, { useState, useRef, useEffect, useContext } from 'react';
import MonthCalendar from './MonthCalendar';
import { Calendar } from 'lucide-react';
import { DateTime } from "luxon";
import { AuthContext } from '../AuthContext';



const MobileDatePicker = ({ selectedDate, onDateChange, events, refreshKey = 0 }) => {
  const { user } = useContext(AuthContext);
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

  // Auto-scroll to today's temporal coordinates
  useEffect(() => {
    if (scrollRef.current) {
      const today = new Date().getDate();
      const selectedElement = scrollRef.current.children[today - 1];
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'center' 
        });
      }
    }
  }, [month]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const hasAvailability = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return availabilityData.some(block => {
      const blockDateStr = new Date(block.date).toISOString().split('T')[0];
      return blockDateStr === dateStr;
    });
  };
  

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-1 border border-line">
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
            <h2 className="text-base font-medium text-slate-900">
              {monthNames[month]} {year}
            </h2>
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
              const hasSlots = !isLoading && hasAvailability(date);

              return (
<button
  key={date.toISOString()}
  onClick={() => !isPast && onDateChange(date)}
  disabled={isPast}
  title={isPast ? "Past dates cannot be selected" : !hasSlots ? "No availability set" : ""}
  className={`
    relative flex flex-col items-center justify-center
    min-w-[4rem] py-2 px-3 rounded-lg
    transition-all duration-200 ease-in-out
    border
    ${isPast ? 'text-slate-300 line-through cursor-not-allowed border-line-soft' : 
      hasSlots ? 'hover:bg-[#FBF7EF] hover:border-[#B07A4E] border-line' :
      'text-slate-400 hover:bg-paper-deep border-line-soft'}
    ${isSelected ?
      'bg-[#FBF7EF] border-[#B07A4E] text-[#8A5D36] shadow-md ring-2 ring-[#B07A4E] ring-opacity-50' : ''}
  `}
>
  <span className={`text-xs font-medium mb-1 
    ${isSelected ? 'text-[#8A5D36]' : 'text-slate-500'}`}>
    {dayNames[date.getDay()]}
  </span>
  <div className="relative flex flex-col items-center gap-1">
    <span className={`text-lg font-semibold
      ${isToday ? 'text-[#8A5D36]' : ''}`}>
      {date.getDate()}
    </span>
    {!isPast && hasSlots && (
      <div className="w-1.5 h-1.5 bg-green-500 rounded-full z-20" 
        style={{ filter: isSelected ? 'brightness(1.2)' : '' }}
      />
    )}
  </div>
</button>
              );
            })}
          </div>
        </div>
      </div>
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
