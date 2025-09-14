import React, { useState, useMemo } from 'react';
import { Clock, Check, AlertCircle, Sunrise, Sun, Sunset } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';

const AvailableTimeSlots = ({ 
  availableSlots, 
  selectedTime, 
  onTimeSelected,
  hasValidDuration = false,
  isComplete = false,
  selectedDate
}) => {
  // Internal function to determine time period (morning, afternoon, evening)
  const formatPeriod = (isoTime) => {
    try {
      const slotDT = DateTime.fromISO(isoTime, { zone: DEFAULT_TZ });
      if (!slotDT.isValid) return 'unavailable';
      
      const hour = slotDT.hour;
      
      if (isNaN(hour)) {
        return 'unavailable';
      }
      
      if (hour >= 6 && hour < 12) return 'Morning';
      if (hour >= 12 && hour < 17) return 'Afternoon';
      return 'Evening';
    } catch (err) {
      console.error('Error determining time period:', isoTime, err);
      return 'unavailable';
    }
  };
  
  // Time period tabs
  const timeTabs = ['Morning', 'Afternoon', 'Evening'];
  
  // Calculate slot counts and determine initial tab
  const { initialTab, slotsByPeriod } = useMemo(() => {
    let bestTab = 'Evening';
    const slotMap = {
      'Morning': [],
      'Afternoon': [],
      'Evening': []
    };
    
    if (availableSlots && availableSlots.length > 0) {
      // Group slots by period
      availableSlots.forEach(slot => {
        const period = formatPeriod(slot.iso);
        if (period !== 'unavailable' && slotMap[period]) {
          slotMap[period].push(slot);
        }
      });
      
      // Find period with most slots
      const morningCount = slotMap['Morning'].length;
      const afternoonCount = slotMap['Afternoon'].length;
      const eveningCount = slotMap['Evening'].length;
      
      if (morningCount >= afternoonCount && morningCount >= eveningCount && morningCount > 0) {
        bestTab = 'Morning';
      } else if (afternoonCount >= morningCount && afternoonCount >= eveningCount && afternoonCount > 0) {
        bestTab = 'Afternoon';
      } else if (eveningCount > 0) {
        bestTab = 'Evening';
      }
    }
    
    return { initialTab: bestTab, slotsByPeriod: slotMap };
  }, [availableSlots]);
  
  // State for the selected tab
  const [selectedTimeTab, setSelectedTimeTab] = useState(initialTab);

  // Tab icons
  const tabIcons = {
    'Morning': Sunrise,
    'Afternoon': Sun,
    'Evening': Sunset
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    return DateTime.fromJSDate(date)
      .setZone(DEFAULT_TZ)
      .toFormat('cccc, MMMM d');
  };

  if (!hasValidDuration) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="font-medium text-amber-900">Duration Required</h3>
            <p className="text-sm text-amber-700 mt-1">
              Please select a massage duration to see available appointment times
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      {/* Header with completion indicator */}
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

      {availableSlots.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">No available times for this date</p>
          <p className="text-sm text-slate-400 mt-2">Please try selecting a different date</p>
        </div>
      ) : (
        <>
          {/* Time period tabs */}
          <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-lg overflow-hidden">
            {timeTabs.map(tab => {
              const Icon = tabIcons[tab];
              const slotCount = slotsByPeriod[tab].length;
              const isActive = selectedTimeTab === tab;
              
              return (
                <button
                  key={tab}
                  onClick={() => setSelectedTimeTab(tab)}
                  disabled={slotCount === 0}
                  className={`
                    flex-1 flex items-center justify-center space-x-1 sm:space-x-2 
                    py-2 sm:py-3 px-2 sm:px-4 rounded-md
                    transition-all duration-200 font-medium text-sm sm:text-base
                    min-w-0 overflow-hidden
                    ${isActive 
                      ? 'bg-white text-teal-700 shadow-sm' 
                      : slotCount === 0
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-slate-600 hover:text-teal-600'
                    }
                  `}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="truncate">{tab}</span>
                  {slotCount > 0 && (
                    <span className={`
                      text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0
                      ${isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'}
                    `}>
                      {slotCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Time slots grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {slotsByPeriod[selectedTimeTab].length === 0 ? (
              <div className="col-span-full text-center py-8">
                <p className="text-slate-500">No available times in this period</p>
              </div>
            ) : (
              slotsByPeriod[selectedTimeTab].map(slot => (
                <button
                  key={slot.iso}
                  onClick={() => onTimeSelected(slot)}
                  className={`
                    min-h-touch p-3 rounded-lg border-2 transition-all duration-200
                    hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                    ${selectedTime?.iso === slot.iso
                      ? 'border-teal-600 bg-teal-50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-teal-300'
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

          {/* Selected time confirmation */}
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
