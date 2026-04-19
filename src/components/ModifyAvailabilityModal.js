import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';

const ModifyAvailabilityModal = ({ block, onModify, onClose, onBlockOff }) => {
  const [startTime, setStartTime] = useState('09:00 AM');
  const [endTime, setEndTime] = useState('05:00 PM');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Convert 24h to 12h format for initial values
    const convert24to12 = (time24) => {
      const [hours, minutes] = time24.split(':');
      const hour = parseInt(hours);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour.toString().padStart(2, '0')}:${minutes} ${period}`;
    };

    if (block) {
      setStartTime(convert24to12(block.start));
      setEndTime(convert24to12(block.end));
    }
  }, [block]);

  const formatTime = (hour, minute) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 7; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = formatTime(hour, minute);
        options.push(<option key={time} value={time}>{time}</option>);
      }
    }
    return options;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Convert back to 24-hour format for backend
    const to24Hour = (time) => {
      const [timePart, period] = time.split(' ');
      let [hours, minutes] = timePart.split(':');
      hours = parseInt(hours);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

    const start24 = to24Hour(startTime);
    const end24 = to24Hour(endTime);

    // Validate times before submitting
    const startHour = parseInt(start24.split(':')[0]);
    const startMin = parseInt(start24.split(':')[1]);
    const endHour = parseInt(end24.split(':')[0]);
    const endMin = parseInt(end24.split(':')[1]);
    
    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;
    
    if (endTotalMinutes <= startTotalMinutes) {
      setError('End time must be after start time');
      setIsSubmitting(false);
      return;
    }

    try {
      await onModify({
        ...block,
        start: start24,
        end: end24
      });
      // Success handled by parent component
    } catch (err) {
      // Error is handled by parent component, but we stop the loading state
      console.error('Modification error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full 
      flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-slate-900">Modify Availability</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 mb-1">
              Start Time
            </label>
            <select
              id="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border rounded-lg p-2 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {generateTimeOptions()}
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
              className="w-full border rounded-lg p-2 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {generateTimeOptions()}
            </select>
          </div>


          {onBlockOff && (
            <div className="pt-4 border-t border-slate-200">
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

          <div className="flex justify-end space-x-3 pt-4">
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
