// MonthCalendar.js
import React, { useState, useEffect, useContext } from 'react';
import { format } from 'date-fns';
import { DateTime } from 'luxon';
import { AuthContext } from '../AuthContext';


const MonthCalendar = ({ selectedDate, onDateChange, events }) => {
  const { user } = useContext(AuthContext);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, [selectedDate, providerId]);

  const handlePrevMonth = () => {
    onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
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

      <div className="bg-paper-elev rounded-lg shadow-md overflow-hidden">
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
            <h2 className="text-xl font-semibold">
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </h2>
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
                        'text-slate-400 hover:bg-paper-deep'
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
      </div>
    </div>
  );
};

export default MonthCalendar;