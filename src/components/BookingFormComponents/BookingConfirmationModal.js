import React from 'react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';

const BookingConfirmationModal = ({
  isVisible,
  bookingDetails,
  onViewBookings,
  onReturnToDashboard,
  onBookAnother
}) => {
  // Destructure booking details for easier access
  const {
    selectedTime,
    selectedDate,
    fullAddress,
    numSessions,
    sessionDurations,
    sessionNames,
    bookingId,
    // New fields for massage session configuration
    selectedDuration,
    selectedAddons = [],
    selectedMassageType,
    massageTypes = [],
    addons = [],
    // Recipient information
    recipientType,
    recipientInfo
  } = bookingDetails || {};
  const formatDate = (date) => {
    return DateTime.fromJSDate(date)
      .setZone(DEFAULT_TZ)
      .toFormat('cccc, LLLL d, yyyy');
  };

  // Helper function to get massage type name
  const getMassageTypeName = () => {
    if (!selectedMassageType || !massageTypes.length) return 'Standard';
    const massageType = massageTypes.find(type => type.id === selectedMassageType);
    return massageType ? massageType.name : 'Standard';
  };

  // Helper function to calculate total price
  const calculateTotalPrice = () => {
    // Base price based on duration
    const getBasePrice = () => {
      switch (selectedDuration) {
        case 60: return 100;
        case 90: return 150;
        case 120: return 200;
        default: return 100;
      }
    };

    // Add-ons price
    const getAddonsPrice = () => {
      return selectedAddons.reduce((total, addonId) => {
        const addon = addons.find(a => a.id === addonId);
        return total + (addon ? addon.price : 0);
      }, 0);
    };

    return getBasePrice() + getAddonsPrice();
  };

  // Render booking details
  const renderBookingDetails = () => {
    if (!selectedDate || !selectedTime || !fullAddress) {
      return <p className="text-sm text-slate-500 mb-6">Booking details not available.</p>;
    }
    
    return (
      <div className="text-sm text-slate-600 mb-6">
        {numSessions === 1 ? (
          <>
            <div className="bg-blue-50 p-4 rounded-lg mb-4 text-left">
              <p className="font-medium text-blue-800 mb-2">
                Your session is scheduled for {formatDate(selectedDate)} at {selectedTime.display || selectedTime.local}.
              </p>
              
              {/* Massage Type & Duration */}
              <div className="mb-2">
                <span className="font-medium">Type:</span> {getMassageTypeName()}
                <br />
                <span className="font-medium">Duration:</span> {selectedDuration} minutes
                {selectedAddons.includes('stretching') && ' + 30 minutes stretching'}
              </div>
              
              {/* Add-ons if any */}
              {selectedAddons.length > 0 && (
                <div className="mb-2">
                  <span className="font-medium">Add-ons:</span>
                  <ul className="list-disc list-inside pl-2">
                    {selectedAddons.map(addonId => {
                      const addon = addons.find(a => a.id === addonId);
                      return addon ? (
                        <li key={addon.id}>
                          {addon.name} (+${addon.price})
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
              
              {/* Price */}
              <div className="mt-3 pt-2 border-t border-blue-200">
                <span className="font-medium">Total Price:</span> ${calculateTotalPrice()}
              </div>
              
              {/* Recipient Information */}
              <div className="mt-3 pt-2 border-t border-blue-200">
                <span className="font-medium">Recipient:</span> {recipientType === 'self' ? 'You' : recipientInfo?.name}
                {recipientType === 'other' && recipientInfo && (
                  <div className="mt-1 pl-2">
                    <div>{recipientInfo.phone}</div>
                    {recipientInfo.email && <div>{recipientInfo.email}</div>}
                  </div>
                )}
              </div>
              
              {/* Address */}
              <div className="mt-3 pt-2 border-t border-blue-200">
                <span className="font-medium">Address:</span> {fullAddress}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-blue-50 p-4 rounded-lg mb-4 text-left">
              <p className="font-medium text-blue-800 mb-2">
                Your {numSessions} back-to-back sessions have been scheduled for
                {' '}{formatDate(selectedDate)} at {selectedTime.display || selectedTime.local}.
              </p>
              
              <div className="mt-2">
                {sessionDurations.map((dur, i) => (
                  <div key={i} className="mt-1 pl-4 border-l-2 border-blue-200">
                    <div className="font-medium">
                      Session {i + 1}: {sessionNames[i] || 'No Name'} ({dur} minutes)
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Address */}
              <div className="mt-3 pt-2 border-t border-blue-200">
                <span className="font-medium">Address:</span> {fullAddress}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-paper-elev rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Booking Confirmed!</h3>
          {renderBookingDetails()}

          {/* Next Actions */}
          <div className="space-y-3">
            <button
              onClick={onViewBookings}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-cyan-900 transition-colors"
            >
              View My Bookings
            </button>
            <button
              onClick={onReturnToDashboard}
              className="w-full bg-slate-100 text-slate-700 py-2 px-4 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Return to Dashboard
            </button>
            <button
              onClick={onBookAnother}
              className="w-full border border-line text-slate-600 py-2 px-4 rounded-lg hover:bg-paper-deep transition-colors"
            >
              Book Another Session
            </button>
          </div>

          <div className="mt-6 text-xs text-slate-500">
            A confirmation email has been sent to your inbox.
            <br />
            {`Booking Reference: #${bookingId?.slice(-6)}`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmationModal;
