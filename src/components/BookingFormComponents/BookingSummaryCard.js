import React from 'react';
import { Calendar, Clock, MapPin, DollarSign, User, Info, Sparkles } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';
import { 
  MASSAGE_TYPES, 
  MASSAGE_ADDONS, 
  calculateBasePrice, 
  calculateAddonsPrice, 
  calculateTotalPrice 
} from '../../shared/constants/massageOptions';

const BookingSummaryCard = ({
  selectedMassageType,
  selectedDuration,
  selectedDate,
  selectedTime,
  fullAddress,
  selectedAddons = [],
  recipientType,
  recipientInfo
}) => {
  // Format date for display
  const formattedDate = selectedDate 
    ? DateTime.fromJSDate(selectedDate)
        .setZone(DEFAULT_TZ)
        .toFormat('cccc, MMMM d, yyyy')
    : null;

  // Get massage type name
  const massageType = MASSAGE_TYPES.find(type => type.id === selectedMassageType);
  const massageTypeName = massageType ? massageType.name : 'Standard';

  // Get formatted time
  const formattedTime = selectedTime?.display || selectedTime?.local;

  // Convert selectedDuration from string to number for price calculations
  const durationMinutes = selectedDuration ? parseInt(selectedDuration, 10) : 0;
  
  // Calculate prices
  const basePrice = calculateBasePrice(durationMinutes);
  const addonsPrice = calculateAddonsPrice(selectedAddons);
  const totalPrice = calculateTotalPrice(durationMinutes, selectedAddons);

  // Calculate total duration including add-on time
  const extraTime = selectedAddons.includes('stretching') ? 30 : 0;
  const totalDuration = durationMinutes + extraTime;

  // Get add-ons with details
  const addonsWithDetails = selectedAddons.map(addonId => {
    return MASSAGE_ADDONS.find(addon => addon.id === addonId);
  }).filter(Boolean);

  // Show placeholder if no selections made yet
  const hasSelections = selectedDate || selectedTime || fullAddress || selectedDuration;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Sparkles className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Booking Summary</h3>
            <p className="text-sm text-slate-600 mt-1">Review your appointment details</p>
          </div>
        </div>
      </div>

      {!hasSelections ? (
        <div className="text-center py-8">
          <Info className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Your booking details will appear here as you make selections</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Date & Time */}
          {(selectedDate || selectedTime) && (
            <div className="pb-4 border-b border-slate-100">
              {selectedDate && (
                <div className="flex items-start space-x-3 mb-3">
                  <Calendar className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600">Date</p>
                    <p className="text-base text-slate-900">{formattedDate}</p>
                  </div>
                </div>
              )}
              
              {selectedTime && (
                <div className="flex items-start space-x-3">
                  <Clock className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600">Time</p>
                    <p className="text-base text-slate-900">{formattedTime}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Service Details */}
          {selectedDuration && (
            <div className="pb-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Duration</p>
                <p className="text-base text-slate-900">
                  {totalDuration} minutes
                  {extraTime > 0 && (
                    <span className="text-sm text-teal-600 ml-2">
                      (includes {extraTime}min add-on time)
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Recipient & Location */}
          {(recipientType || fullAddress) && (
            <div className="pb-4 border-b border-slate-100">
              {recipientType && (
                <div className="flex items-start space-x-3 mb-3">
                  <User className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600">Recipient</p>
                    <p className="text-base text-slate-900">
                      {recipientType === 'self' ? 'Myself' : recipientInfo?.name || 'Someone else'}
                    </p>
                    {recipientType === 'other' && recipientInfo?.phone && (
                      <p className="text-sm text-slate-600 mt-1">{recipientInfo.phone}</p>
                    )}
                  </div>
                </div>
              )}

              {fullAddress && (
                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600">Location</p>
                    <p className="text-sm text-slate-900">{fullAddress}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add-ons */}
          {addonsWithDetails.length > 0 && (
            <div className="pb-4 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-600 mb-2">Enhancements</p>
              <div className="space-y-2">
                {addonsWithDetails.map(addon => (
                  <div key={addon.id} className="flex justify-between items-center">
                    <span className="text-sm text-slate-700">{addon.name}</span>
                    <span className="text-sm font-medium text-teal-600">+${addon.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing - Always visible if duration is selected */}
          {selectedDuration && (
            <div className="bg-teal-50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <DollarSign className="w-5 h-5 text-teal-700" />
                <p className="font-medium text-teal-900">Price Breakdown</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-teal-700">Base Service ({durationMinutes} min)</span>
                  <span className="text-sm font-medium text-teal-900">${basePrice}</span>
                </div>
                
                {addonsPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-teal-700">Add-ons</span>
                    <span className="text-sm font-medium text-teal-900">${addonsPrice}</span>
                  </div>
                )}
                
                <div className="pt-2 mt-2 border-t border-teal-200">
                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-teal-900">Total</span>
                    <span className="text-2xl font-bold text-teal-700">${totalPrice}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingSummaryCard;
