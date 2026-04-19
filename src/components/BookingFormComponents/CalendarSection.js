import React from 'react';
import { Calendar, Check, Info } from 'lucide-react';
import ResponsiveCalendar from '../ResponsiveCalendar';

const CalendarSection = ({ selectedDate, setSelectedDate, onDateChange, availableSlots = [], isDisabled, isComplete }) => {
  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
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

      {/* Helper text */}
      <div className="mt-4 text-sm text-slate-600">
        <p>Dates with available appointments are marked in green</p>
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
