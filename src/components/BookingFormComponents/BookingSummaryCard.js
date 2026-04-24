import React from 'react';
import { Calendar, Clock, MapPin, DollarSign, User, Info, Sparkles, Banknote } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';

const BookingSummaryCard = ({
  selectedDuration,
  selectedDate,
  selectedTime,
  fullAddress,
  selectedAddons = [],
  recipientType,
  recipientInfo,
  durationOptions = [],
  availableAddons = [],
  selectedPaymentMethod = null
}) => {
  const paymentMethodLabels = {
    cash: 'Cash',
    zelle: 'Zelle',
    venmo: 'Venmo',
    card: 'Card',
    package: 'Package credit',
  };
  const formattedDate = selectedDate
    ? DateTime.fromJSDate(selectedDate)
        .setZone(DEFAULT_TZ)
        .toFormat('cccc, MMMM d, yyyy')
    : null;

  const formattedTime = selectedTime?.display || selectedTime?.local;
  const durationMinutes = selectedDuration ? parseInt(selectedDuration, 10) : 0;

  // Calculate base price from provider pricing
  const pricingTier = durationOptions.find(p => p.duration === durationMinutes);
  const basePrice = pricingTier?.price || 0;

  // Calculate addon pricing from provider addons
  const selectedAddonDetails = selectedAddons.map(name =>
    availableAddons.find(a => a.name === name)
  ).filter(Boolean);

  const addonsPrice = selectedAddonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
  const extraTime = selectedAddonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);
  const totalPrice = basePrice + addonsPrice;
  const totalDuration = durationMinutes + extraTime;

  const hasSelections = selectedDate || selectedTime || fullAddress || selectedDuration;

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
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

          {/* Service */}
          {selectedDuration && (
            <div className="pb-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Service</p>
                <p className="text-base text-slate-900">
                  {pricingTier?.label?.trim() || `${durationMinutes} min`}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {totalDuration} min
                  {extraTime > 0 && (
                    <span className="text-teal-600 ml-2">
                      (includes +{extraTime} min from add-ons)
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
          {selectedAddonDetails.length > 0 && (
            <div className="pb-4 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-600 mb-2">Add-ons</p>
              <div className="space-y-2">
                {selectedAddonDetails.map(addon => (
                  <div key={addon.name} className="flex justify-between items-center">
                    <span className="text-sm text-slate-700">{addon.name}</span>
                    <span className="text-sm font-medium text-teal-600">+${addon.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Method */}
          {selectedPaymentMethod && (
            <div className="pb-4 border-b border-slate-100">
              <div className="flex items-start space-x-3">
                <Banknote className="w-5 h-5 text-teal-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-600">Payment Method</p>
                  <p className="text-base text-slate-900">
                    {paymentMethodLabels[selectedPaymentMethod] || selectedPaymentMethod}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pricing */}
          {selectedDuration && basePrice > 0 && (
            <div className="bg-teal-50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <DollarSign className="w-5 h-5 text-teal-700" />
                <p className="font-medium text-teal-900">Price Breakdown</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-teal-700">
                    {pricingTier?.label?.trim() || `${durationMinutes} min`}
                  </span>
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
