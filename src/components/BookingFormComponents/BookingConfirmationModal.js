import React from 'react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';
import { buildVenmoPayUrl } from '../../utils/venmo';
import { buildStandingRequestSmsLink } from '../../utils/standingAppointmentRequest';

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
    // Service package details
    selectedDuration,
    selectedAddons = [],
    selectedServiceType,
    serviceTypes = [],
    addons = [],
    pricing = {},
    // Recipient information
    recipientType,
    recipientInfo,
    // Payment
    paymentMethod,
    venmoHandle,
    providerName,
    providerLogoUrl,
    providerPhone,
    clientName,
    packageName,
    packageMinutesApplied = 0,
  } = bookingDetails || {};

  const PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    zelle: 'Zelle',
    venmo: 'Venmo',
    card: 'Card',
    package: 'Package credit',
  };
  const formatDate = (date) => {
    return DateTime.fromJSDate(date)
      .setZone(DEFAULT_TZ)
      .toFormat('cccc, LLLL d, yyyy');
  };

  const getServiceName = () => {
    if (!selectedServiceType || !serviceTypes.length) return 'Service';
    const match = serviceTypes.find(t => t.id === selectedServiceType);
    return match ? match.name : 'Service';
  };

  const totalPrice = typeof pricing.totalPrice === 'number'
    ? pricing.totalPrice
    : (pricing.basePrice || 0) + (pricing.addonsPrice || 0);

  const showVenmoCta = paymentMethod === 'venmo' && !!venmoHandle;
  const venmoNote = showVenmoCta
    ? [
        packageName || getServiceName(),
        selectedDate ? formatDate(selectedDate) : null,
        providerName ? `w/ ${providerName}` : null
      ].filter(Boolean).join(' · ')
    : '';
  const venmoUrl = showVenmoCta ? buildVenmoPayUrl(venmoHandle, totalPrice, venmoNote) : null;

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
              
              {/* Service & Duration */}
              <div className="mb-2">
                <span className="font-medium">Service:</span> {getServiceName()}
                <br />
                <span className="font-medium">Duration:</span> {selectedDuration + (pricing.extraTime || 0)} minutes
                {pricing.extraTime > 0 && ` (includes +${pricing.extraTime} min from add-ons)`}
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
                <span className="font-medium">Total Price:</span> ${totalPrice}
              </div>

              {/* Payment — shows the partial split when a package
                  covered part of the booking, single payment method
                  otherwise. The split is the most surprise-prone part
                  of the partial flow ("wait, I owe how much?"), so
                  surfacing it here at confirmation time matters. */}
              {paymentMethod && (
                <div className="mt-3 pt-2 border-t border-blue-200">
                  {packageMinutesApplied > 0 && packageMinutesApplied < selectedDuration ? (
                    <>
                      <div>
                        <span className="font-medium">Payment:</span>
                        {' '}{packageMinutesApplied} min from package
                        {packageName ? ` (${packageName})` : ''}
                      </div>
                      <div className="text-xs text-blue-700 mt-0.5">
                        + {selectedDuration - packageMinutesApplied} min via{' '}
                        {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}
                        {' '}— ${(totalPrice * (selectedDuration - packageMinutesApplied) / selectedDuration).toFixed(2)}
                        {' '}due at appointment
                      </div>
                    </>
                  ) : (
                    <span>
                      <span className="font-medium">Payment:</span>{' '}
                      {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}
                    </span>
                  )}
                </div>
              )}

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

  // "Make this recurring" SMS link — pre-fills a text to the provider
  // so the conversation happens out-of-band per the design rule.
  // Helper lives in src/utils/standingAppointmentRequest.js so the
  // same prompt fires identically from /my-bookings and from the
  // appointment detail screen.
  const standingSmsLink = buildStandingRequestSmsLink({
    providerPhone,
    providerName,
    clientName,
    date: selectedDate,
    time: selectedTime?.display || selectedTime?.local,
    duration: (selectedDuration || 60) + (pricing.extraTime || 0),
  });

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-paper-elev rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {providerLogoUrl && (
            <img
              src={providerLogoUrl}
              alt={`${providerName || 'Provider'} logo`}
              className="mx-auto h-12 w-auto max-w-[200px] object-contain mb-4"
            />
          )}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Booking Confirmed!</h3>
          {renderBookingDetails()}

          {showVenmoCta && (
            <div className="mb-4 p-3 bg-[#3D95CE]/10 border border-[#3D95CE]/30 rounded-lg text-left">
              <p className="text-sm text-slate-700 mb-2">
                Pay <span className="font-semibold">${totalPrice}</span> to
                {' '}<span className="font-semibold">@{venmoHandle}</span> on Venmo.
                {providerName ? ` ${providerName}` : ' Your provider'} will confirm the payment on their end.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                Before paying, confirm <span className="font-semibold">@{venmoHandle}</span> matches
                your provider&rsquo;s actual Venmo profile. We can&rsquo;t verify Venmo accounts on
                our end.
              </p>
              <a
                href={venmoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full bg-[#3D95CE] text-white py-2.5 px-4 rounded-lg hover:bg-[#2C7FB3] font-medium text-sm transition-colors"
              >
                Pay on Venmo &rarr;
              </a>
            </div>
          )}

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

          {/* Tiny standing-appointment ask. Single-tap SMS to the provider
              with a pre-filled message; provider handles scheduling on
              their end with the existing standing-appointment tools. */}
          {standingSmsLink && numSessions === 1 && (
            <div className="mt-5 pt-4 border-t border-line text-left">
              <p className="text-xs text-slate-500 mb-2">
                Want this on a regular schedule?
              </p>
              <a
                href={standingSmsLink}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36]"
              >
                Ask {providerName ? providerName.split(' ')[0] : 'your provider'} about a standing appointment →
              </a>
            </div>
          )}

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
