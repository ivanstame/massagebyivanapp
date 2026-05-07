import React from 'react';
import { Calendar, Check, Info } from 'lucide-react';
import ResponsiveCalendar from '../ResponsiveCalendar';

const CalendarSection = ({ selectedDate, setSelectedDate, onDateChange, availableSlots = [], isDisabled, isComplete, refreshKey = 0 }) => {
  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      {/* Color legend — explains the date-cell shading the calendar
          paints to indicate kind of availability that day. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Availability:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-emerald-100 border border-emerald-300" />
          Mobile (provider travels to you)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-sky-100 border border-sky-300" />
          In-studio (you go to provider)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-gradient-to-br from-emerald-100 to-sky-100 border border-emerald-300" />
          Both available
        </span>
      </div>

      {/* Calendar wrapper with improved styling */}
      <div className={`
        relative rounded-lg overflow-hidden
        ${isDisabled ? 'opacity-50' : ''}
      `}>
        <ResponsiveCalendar
          selectedDate={selectedDate}
          onDateChange={onDateChange || setSelectedDate}
          events={availableSlots.map(slot => ({
            date: selectedDate,
            time: slot
          }))}
          refreshKey={refreshKey}
        />

        {isDisabled && (
          <div className="absolute inset-0 bg-paper-elev/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-paper-elev p-4 rounded-lg shadow-lg border border-sage-200">
              <div className="flex items-center space-x-2">
                <Info className="w-5 h-5 text-[#B07A4E]" />
                <p className="text-base font-medium text-slate-700">
                  Please complete recipient and address sections first
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-friendly date display */}
      {selectedDate && (
        <div className="mt-4 p-3 bg-[#FBF7EF] rounded-lg border border-[#B07A4E]">
          <p className="text-sm font-medium text-[#8A5D36]">
            Selected: {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
      )}
    </div>
  );
};

export default CalendarSection;
