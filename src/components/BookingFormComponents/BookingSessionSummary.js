import React, { useMemo } from 'react';
import { 
  calculateExtraTime, 
  calculateTotalPrice, 
  getMassageTypeName, 
  getAddonDetails 
} from '../../shared/constants/massageOptions';

/**
 * BookingSessionSummary Component
 * 
 * A persistent card showing the current booking selections and total cost.
 * Updates in real-time as the user makes selections.
 * 
 * Props:
 * - sessionConfigs: Array of session configurations
 * - activeSessionIndex: Index of the currently active session being configured
 * - onEditSession: Callback function when user clicks to edit a specific session
 */
const BookingSessionSummary = ({ sessionConfigs, activeSessionIndex, onEditSession }) => {
  // Calculate total duration including any extra time from add-ons
  const totalDuration = useMemo(() => 
    sessionConfigs.reduce((total, session) => 
      total + (session.duration || 0) + calculateExtraTime(session.addons || []), 0), 
    [sessionConfigs]
  );
  
  // Calculate total price for all sessions
  const totalPrice = useMemo(() => 
    sessionConfigs.reduce((total, session) => 
      total + calculateTotalPrice(session.duration || 0, session.addons || []), 0),
    [sessionConfigs]
  );

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 sticky top-4">
      <h3 className="font-medium text-lg mb-3">Your Booking</h3>
      
      {/* Total summary */}
      <div className="mb-4 pb-3 border-b">
        <div className="flex justify-between mb-1">
          <span>Total Duration:</span>
          <span className="font-medium">{totalDuration} min</span>
        </div>
        <div className="flex justify-between text-lg">
          <span>Total Price:</span>
          <span className="font-medium text-green-600">${totalPrice}</span>
        </div>
      </div>
      
      {/* Session details */}
      {sessionConfigs.map((session, index) => (
        <div 
          key={index}
          className={`mb-2 p-2 rounded ${index === activeSessionIndex ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}
        >
          <div className="flex justify-between items-center">
            <span className="font-medium">Session {index + 1}</span>
            <button 
              onClick={() => onEditSession(index)}
              className="text-blue-600 text-sm"
            >
              Edit
            </button>
          </div>
          {session.duration && (
            <div className="text-sm">
              <div>{getMassageTypeName(session.massageType)} ({session.duration} min)</div>
              {session.addons?.length > 0 && (
                <div className="text-slate-600">
                  + {session.addons.map(id => getAddonDetails(id)?.name).join(', ')}
                </div>
              )}
              {session.recipient?.type === 'other' && session.recipient.info?.name && (
                <div className="text-slate-600 italic">
                  For: {session.recipient.info.name}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      
      {/* Empty state */}
      {sessionConfigs.length === 0 && (
        <div className="text-center text-slate-500 py-4">
          Select number of sessions to begin
        </div>
      )}
    </div>
  );
};

export default BookingSessionSummary;
