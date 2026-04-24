import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';
import { ArrowLeft, ArrowRight, User as UserIcon } from 'lucide-react';

// Import the new components
import CalendarSection from './BookingFormComponents/CalendarSection';
import RecipientSection from './BookingFormComponents/RecipientSection';
import AddressSection from './BookingFormComponents/AddressSection';
import SimpleDurationSelector from './BookingFormComponents/SimpleDurationSelector';
import AddOnsSelector from './BookingFormComponents/AddOnsSelector';
import BookingSummaryCard from './BookingFormComponents/BookingSummaryCard';
import AvailableTimeSlots from './BookingFormComponents/AvailableTimeSlots';
import BookingConfirmationModal from './BookingFormComponents/BookingConfirmationModal';
import PaymentMethodSelector from './BookingFormComponents/PaymentMethodSelector';
import StripeCheckout from './BookingFormComponents/StripeCheckout';
import ClientPickerModal from './ClientPickerModal';

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useContext(AuthContext);
  const isProviderBooking = user?.accountType === 'PROVIDER';

  // Provider state
  const [provider, setProvider] = useState(null);

  // Target client — when a provider books on behalf of someone. For regular
  // client self-bookings this stays null and the form falls back to `user`.
  const [targetClient, setTargetClient] = useState(null);
  const [targetClientLoading, setTargetClientLoading] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);

  // Provider services (fetched from API)
  const [durationOptions, setDurationOptions] = useState([]);
  const [availableAddons, setAvailableAddons] = useState([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState(['cash']);
  const [venmoHandle, setVenmoHandle] = useState(null);

  // Booking flow state with sensible defaults
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [recipientType, setRecipientType] = useState('self');
  const [recipientInfo, setRecipientInfo] = useState({ name: '', phone: '', email: '' });
  const [fullAddress, setFullAddress] = useState('');
  const [location, setLocation] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  // Identifier stored alongside the booking; name comes from the selected package's label.
  const [selectedServiceType] = useState('package');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  // Set when client picks "Use package credit" — sent as packagePurchaseId
  // in the booking payload so the server can atomically reserve the credit.
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [redeemablePackages, setRedeemablePackages] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [newBookingId, setNewBookingId] = useState(null);
  const [showStripeCheckout, setShowStripeCheckout] = useState(false);
  const [pendingBookingPrice, setPendingBookingPrice] = useState(null);

  // Get provider info and services
  useEffect(() => {
    const fetchProviderInfo = async () => {
      let providerId = null;

      if (user.accountType === 'PROVIDER') {
        setProvider(user);
        providerId = user._id;
      } else if (user.accountType === 'CLIENT' && user.providerId) {
        try {
          const response = await api.get(`/api/users/provider/${user.providerId}`);
          setProvider(response.data || {
            _id: user.providerId,
            providerProfile: { businessName: 'Your Provider' }
          });
          providerId = user.providerId;
        } catch (error) {
          console.error('Error fetching provider info:', error);
          setProvider({
            _id: user.providerId || user._id,
            providerProfile: { businessName: 'Your Provider' }
          });
          providerId = user.providerId;
        }
      }

      // Fetch provider's services (pricing + addons)
      if (providerId) {
        try {
          const servicesRes = await api.get(`/api/users/provider/${providerId}/services`);
          const {
            basePricing,
            addons,
            acceptedPaymentMethods: providerMethods,
            venmoHandle: providerVenmoHandle
          } = servicesRes.data;

          if (providerVenmoHandle) {
            setVenmoHandle(providerVenmoHandle);
          }

          if (providerMethods && providerMethods.length > 0) {
            setAcceptedPaymentMethods(providerMethods);
            setSelectedPaymentMethod(providerMethods[0]);
          }

          if (basePricing && basePricing.length > 0) {
            setDurationOptions(basePricing);
            // Auto-select first package if none selected
            setSelectedDuration(basePricing[0].duration);
          }

          if (addons && addons.length > 0) {
            setAvailableAddons(addons);
          }
        } catch (err) {
          console.error('Error fetching provider services:', err);
        }
      }
    };

    if (user) {
      fetchProviderInfo();
    }
  }, [user]);

  // Load the target client whenever ?clientId= changes (provider booking path).
  // For CLIENT-self bookings this effect is a no-op.
  useEffect(() => {
    if (!isProviderBooking) return;

    const clientId = searchParams.get('clientId');
    if (!clientId) {
      setTargetClient(null);
      setShowClientPicker(true); // force a choice before the provider can book
      return;
    }

    setShowClientPicker(false);
    setTargetClientLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/users/provider/clients/${clientId}`);
        setTargetClient(res.data);
      } catch (err) {
        console.error('Failed to load target client:', err);
        setError('Could not load the selected client. Pick another.');
        setTargetClient(null);
        setShowClientPicker(true);
      } finally {
        setTargetClientLoading(false);
      }
    })();
  }, [isProviderBooking, searchParams]);

  // When a client is picked inline, swap the URL so reloads land in the same
  // context. Address/preferences reload via the targetClient effect below;
  // date/duration/add-ons already chosen are preserved.
  const handleClientPicked = (client) => {
    setShowClientPicker(false);
    setSelectedTime(null);
    setAvailableSlots([]);
    setSearchParams({ clientId: client._id }, { replace: true });
  };

  // Handle address confirmation
  const handleAddressConfirmed = async (addressData) => {
    setLocation(addressData);
    setFullAddress(addressData.fullAddress);
  };

  // Load saved address. For client self-bookings this reads user.profile.address;
  // for provider-on-behalf bookings this reads the target client's address so
  // the booking defaults to where the *recipient* is, not the provider.
  useEffect(() => {
    const source = isProviderBooking ? targetClient : user;
    if (!source || source.accountType !== 'CLIENT' || !source.profile?.address) {
      return;
    }

    const addr = source.profile.address;
    const combinedAddress = (addr.street && addr.city && addr.state && addr.zip)
      ? `${addr.street}${addr.unit ? ', ' + addr.unit : ''}, ${addr.city}, ${addr.state} ${addr.zip}`
      : addr.formatted || null;

    if (!combinedAddress) return;

    setFullAddress(combinedAddress);
    (async () => {
      try {
        const geo = await api.get('/api/geocode', {
          params: { address: combinedAddress },
        });
        setLocation({
          lat: geo.data.lat,
          lng: geo.data.lng,
          fullAddress: combinedAddress,
        });
      } catch (err) {
        console.error('Auto-geocode failed', err);
      }
    })();
  }, [user, targetClient, isProviderBooking]);

  // Fetch the client's redeemable packages so the payment-method step can
  // offer "Use package credit" when one matches the selected duration.
  // For provider-on-behalf bookings, this is left empty for now (the
  // provider won't see package options); Phase 6 introduces a provider-side
  // endpoint to fetch the target client's packages.
  useEffect(() => {
    if (!user || isProviderBooking) {
      setRedeemablePackages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/packages/mine');
        if (cancelled) return;
        // Only show packages that are paid, not cancelled, and have credits left.
        const eligible = (res.data || []).filter(p =>
          p.paymentStatus === 'paid' && !p.cancelledAt && (p.sessionsRemaining || 0) > 0
        );
        setRedeemablePackages(eligible);
      } catch (err) {
        // Non-fatal — booking still works without packages.
        console.error('Failed to load packages for booking form:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isProviderBooking]);

  // Filter redeemable packages to those matching the currently-selected
  // duration. If the client switches duration after picking a package,
  // we clear the selection so they don't accidentally submit a mismatch
  // (the server would reject it anyway, but front-end clarity matters).
  const matchingPackages = redeemablePackages.filter(
    p => p.sessionDuration === selectedDuration
  );
  useEffect(() => {
    if (selectedPackageId) {
      const stillValid = matchingPackages.some(p => p._id === selectedPackageId);
      if (!stillValid) {
        setSelectedPackageId(null);
        if (selectedPaymentMethod === 'package') {
          setSelectedPaymentMethod(acceptedPaymentMethods[0] || 'cash');
        }
      }
    }
  }, [selectedDuration, matchingPackages, selectedPackageId, selectedPaymentMethod, acceptedPaymentMethods]);

  // Fetch available time slots
  const fetchAvailableSlots = async () => {
    const providerId = user.accountType === 'PROVIDER' ? user._id : user.providerId;
    if (!providerId) return;

    const dateLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ);
    const formattedDate = dateLA.toFormat('yyyy-MM-dd');

    // Calculate total duration including add-on extra time
    const extraTime = selectedAddons.reduce((sum, name) => {
      const addon = availableAddons.find(a => a.name === name);
      return sum + (addon?.extraTime || 0);
    }, 0);
    const totalDuration = selectedDuration + extraTime;

    try {
      const response = await api.get(`/api/availability/available/${formattedDate}`, {
        params: {
          providerId,
          duration: totalDuration,
          lat: location?.lat,
          lng: location?.lng
        }
      });
      // Transform ISO strings and filter out slots without enough lead time
      // Need at least 60 minutes from now to realistically book
      const cutoff = DateTime.now().setZone(DEFAULT_TZ).plus({ minutes: 60 });
      const slots = (response.data || [])
        .filter(iso => {
          const dt = DateTime.fromISO(iso, { zone: DEFAULT_TZ });
          return dt > cutoff;
        })
        .map(iso => {
          const dt = DateTime.fromISO(iso, { zone: DEFAULT_TZ });
          return {
            iso,
            display: dt.toFormat('h:mm a'),
            local: dt.toFormat('HH:mm')
          };
        });
      setAvailableSlots(slots);
    } catch (err) {
      console.error('Error fetching slots:', err);
      setAvailableSlots([]);
    }
  };

  // Re-fetch slots when dependencies change
  useEffect(() => {
    if (fullAddress && selectedDuration && selectedDate && (provider || user?.accountType === 'PROVIDER')) {
      fetchAvailableSlots();
    }
  }, [fullAddress, selectedDuration, selectedAddons, selectedDate, provider, location]);

  // Handle booking submission
  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      if (!selectedDate || !selectedTime || !fullAddress || !location || !selectedDuration) {
        throw new Error('Please complete all required fields');
      }

      const bookingDateLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ);
      const bookingDateStr = bookingDateLA.toFormat('yyyy-MM-dd');

      const formattedTime = LuxonService.formatISOToDisplay(selectedTime.iso, TIME_FORMATS.TIME_24H);
      if (!formattedTime) {
        throw new Error('Failed to format time correctly');
      }

      // Calculate pricing from provider data
      const pricingTier = durationOptions.find(p => p.duration === selectedDuration);
      const basePrice = pricingTier?.price || 0;
      const packageName = (pricingTier?.label && pricingTier.label.trim())
        || `${selectedDuration} min service`;

      const selectedAddonDetails = selectedAddons.map(name =>
        availableAddons.find(a => a.name === name)
      ).filter(Boolean);

      const addonsPrice = selectedAddonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
      const extraTime = selectedAddonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);

      // Provider-on-behalf bookings: the target client IS the recipient, and
      // we pass clientId so the backend records it against their account
      // rather than the provider's. Registered clients hit the existing
      // self/other recipient logic unchanged.
      const isOnBehalf = isProviderBooking && targetClient?._id;
      if (isOnBehalf === false && isProviderBooking) {
        throw new Error('Please pick a client before booking.');
      }

      const bookingData = {
        date: bookingDateStr,
        time: formattedTime,
        duration: selectedDuration + extraTime,
        location: {
          address: fullAddress,
          lat: location.lat,
          lng: location.lng
        },
        serviceType: {
          id: selectedServiceType,
          name: packageName
        },
        addons: selectedAddonDetails.map(addon => ({
          id: addon.name.toLowerCase().replace(/\s+/g, '-'),
          name: addon.name,
          price: addon.price,
          extraTime: addon.extraTime || 0
        })),
        pricing: {
          basePrice,
          addonsPrice,
          totalPrice: basePrice + addonsPrice
        },
        paymentMethod: selectedPaymentMethod,
        // When paying via a package credit, send the package id so the
        // server can atomically reserve the credit. The server enforces
        // ownership / paid-status / duration-match server-side; the client
        // value is just an intent signal.
        ...(selectedPaymentMethod === 'package' && selectedPackageId && {
          packagePurchaseId: selectedPackageId,
        }),
        ...(isOnBehalf
          ? {
              clientId: targetClient._id,
              recipientType: 'self',
            }
          : {
              recipientType,
              ...(recipientType === 'other' && {
                recipientInfo: {
                  name: recipientInfo.name,
                  phone: recipientInfo.phone,
                  email: recipientInfo.email || ''
                }
              })
            }),
      };

      const response = await bookingService.createBooking(bookingData);
      if (!response || !response._id) {
        throw new Error('Invalid booking response');
      }

      setNewBookingId(response._id);

      // If card or venmo payment, show Stripe checkout (Venmo is handled via Stripe)
      // Route to Stripe for cards, and for Venmo only when the provider hasn't
      // configured a direct handle. Venmo-with-handle falls through to the
      // success screen where the client sees a "Pay on Venmo" deep link.
      const stripeRouted =
        selectedPaymentMethod === 'card' ||
        (selectedPaymentMethod === 'venmo' && !venmoHandle);

      if (stripeRouted) {
        setPendingBookingPrice(bookingData.pricing.totalPrice);
        setShowStripeCheckout(true);
      } else {
        setBookingSuccess(true);
      }
    } catch (err) {
      console.error('Error creating booking:', err);
      setError(err.message || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  const isBookingComplete = () => {
    const isOnBehalf = isProviderBooking && targetClient?._id;
    const isRecipientComplete = isOnBehalf
      ? true
      : recipientType === 'self' ||
        (recipientType === 'other' && recipientInfo.name && recipientInfo.phone);

    return (
      selectedDate &&
      fullAddress &&
      selectedTime &&
      selectedDuration &&
      isRecipientComplete &&
      (!isProviderBooking || !!targetClient?._id)
    );
  };

  const resetForm = () => {
    setSelectedDate(new Date());
    setSelectedTime(null);
    setFullAddress('');
    setLocation(null);
    setSelectedDuration(durationOptions.length > 0 ? durationOptions[0].duration : 60);
    setSelectedAddons([]);
    setSelectedPaymentMethod(acceptedPaymentMethods[0] || 'cash');
    setRecipientType('self');
    setRecipientInfo({ name: '', phone: '', email: '' });
    setBookingSuccess(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="av-paper pt-16">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
        <div className="text-center mb-8 relative">
          <div className="av-meta mb-2">The booking</div>
          <h1 className="font-display" style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Choose a{' '}
            <em style={{ color: '#B07A4E' }}>
              {DateTime.now().setZone(DEFAULT_TZ).hour < 12 ? 'morning' : 'afternoon'}
            </em>
            {' '}or evening.
          </h1>
          {provider?.providerProfile?.businessName && (
            <p className="mt-2 text-sm text-ink-2">
              With {provider.providerProfile.businessName}
            </p>
          )}
        </div>

        <div className="space-y-6">
          {/* Provider-on-behalf banner — shown instead of the recipient selector
              when a provider is booking for one of their clients. The "Change"
              link re-opens the client picker so they can switch mid-flow. */}
          {isProviderBooking && (
            <div className="bg-paper-elev border border-line rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5 text-[#B07A4E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">Booking for</p>
                <p className="text-base font-medium text-slate-900 truncate flex items-center gap-2">
                  {targetClientLoading
                    ? 'Loading…'
                    : targetClient?.profile?.fullName || 'Pick a client'}
                  {targetClient?.isManaged && (
                    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      Managed
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClientPicker(true)}
                className="text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36] px-3 py-1.5 rounded-lg hover:bg-[#B07A4E]/10"
              >
                Change
              </button>
            </div>
          )}

          {/* 1. Calendar */}
          <CalendarSection
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            isComplete={selectedDate !== null}
          />

          {/* 2. Recipient — only for client self-bookings. When a provider
              books on behalf, the target client IS the recipient, shown in
              the banner above. */}
          {!isProviderBooking && (
            <RecipientSection
              recipientType={recipientType}
              recipientInfo={recipientInfo}
              onRecipientTypeChange={setRecipientType}
              onRecipientInfoChange={setRecipientInfo}
              isComplete={recipientType === 'self' || (recipientInfo.name && recipientInfo.phone)}
            />
          )}

          {/* 3. Address — saved-address comes from the target client when a
              provider is booking on their behalf, otherwise from the logged-in user. */}
          <AddressSection
            savedAddress={(() => {
              const addrSource = isProviderBooking ? targetClient : user;
              const addr = addrSource?.profile?.address;
              if (!addr) return null;
              const fullAddr = addr.formatted ||
                (addr.street ? `${addr.street}${addr.unit ? ', ' + addr.unit : ''}, ${addr.city}, ${addr.state} ${addr.zip}` : null);
              if (!fullAddr) return null;
              return { fullAddress: fullAddr };
            })()}
            currentAddress={location}
            onAddressChange={handleAddressConfirmed}
            isComplete={fullAddress !== ''}
          />

          {/* 4. Duration — from provider's pricing */}
          <SimpleDurationSelector
            selectedDuration={selectedDuration}
            onDurationChange={setSelectedDuration}
            isComplete={selectedDuration !== null}
            durationOptions={durationOptions}
          />

          {/* 5. Add-ons — from provider's services */}
          <AddOnsSelector
            selectedAddons={selectedAddons}
            onAddonsChange={setSelectedAddons}
            isComplete={true}
            availableAddons={availableAddons}
          />

          {/* 6. Payment Method (incl. package-credit options when eligible) */}
          <PaymentMethodSelector
            selectedMethod={selectedPaymentMethod}
            onMethodChange={setSelectedPaymentMethod}
            acceptedMethods={acceptedPaymentMethods}
            isComplete={selectedPaymentMethod !== null}
            redeemablePackages={matchingPackages}
            selectedPackageId={selectedPackageId}
            onPackageSelect={setSelectedPackageId}
          />

          {/* 7. Booking Summary */}
          <BookingSummaryCard
            selectedDuration={selectedDuration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            fullAddress={location?.fullAddress || fullAddress}
            selectedAddons={selectedAddons}
            recipientType={recipientType}
            recipientInfo={recipientInfo}
            durationOptions={durationOptions}
            availableAddons={availableAddons}
            selectedPaymentMethod={selectedPaymentMethod}
          />

          {/* 7. Available Time Slots */}
          <AvailableTimeSlots
            availableSlots={availableSlots}
            selectedTime={selectedTime}
            onTimeSelected={setSelectedTime}
            hasValidDuration={selectedDuration !== null}
            isComplete={selectedTime !== null}
            selectedDate={selectedDate}
          />

          {/* Error display */}
          {error && (
            <div className="p-4 border border-red-200 rounded-card flex items-start gap-2"
              style={{ background: 'rgba(165,70,65,0.08)' }}>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <button
              onClick={() => navigate('/')}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2
                px-5 py-3 rounded-btn border border-line bg-transparent text-ink
                hover:bg-paper-deep transition text-[14px] font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!isBookingComplete() || loading}
              className={`flex-1 inline-flex items-center justify-center gap-2
                px-6 py-3.5 rounded-btn text-[15px] font-medium transition
                ${isBookingComplete()
                  ? 'bg-accent text-white hover:bg-accent-ink'
                  : 'bg-paper-deep text-ink-3 cursor-not-allowed'
                }`}
              style={isBookingComplete() ? { boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : {}}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>Confirm booking</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Client picker — providers must choose a client before booking.
            Auto-opens when /book is visited without ?clientId=, and can be
            reopened via the "Change" link in the banner above. */}
        {showClientPicker && isProviderBooking && (
          <ClientPickerModal
            currentClientId={targetClient?._id}
            onSelect={handleClientPicked}
            onClose={() => setShowClientPicker(false)}
            canDismiss={!!targetClient?._id}
          />
        )}

        {/* Stripe Checkout Modal (shown after booking created with card payment) */}
        {showStripeCheckout && newBookingId && (
          <StripeCheckout
            bookingId={newBookingId}
            totalPrice={pendingBookingPrice}
            onSuccess={() => {
              setShowStripeCheckout(false);
              setBookingSuccess(true);
            }}
            onClose={() => {
              // Close checkout — booking still exists but unpaid
              setShowStripeCheckout(false);
              setBookingSuccess(true);
            }}
          />
        )}

        {/* Booking Confirmation Modal */}
        <BookingConfirmationModal
          isVisible={bookingSuccess}
          bookingDetails={(() => {
            const tier = durationOptions.find(p => p.duration === selectedDuration);
            const packageName = (tier?.label && tier.label.trim())
              || (selectedDuration ? `${selectedDuration} min service` : 'Service');
            const basePrice = tier?.price || 0;
            const selectedAddonDetails = selectedAddons
              .map(name => availableAddons.find(a => a.name === name))
              .filter(Boolean);
            const addonsPrice = selectedAddonDetails.reduce((s, a) => s + (a.price || 0), 0);
            const extraTime = selectedAddonDetails.reduce((s, a) => s + (a.extraTime || 0), 0);
            return {
              selectedTime,
              selectedDate,
              fullAddress,
              numSessions: 1,
              bookingId: newBookingId,
              selectedDuration,
              selectedAddons,
              selectedServiceType,
              serviceTypes: [{ id: selectedServiceType, name: packageName }],
              addons: availableAddons.map(a => ({ id: a.name, name: a.name, price: a.price })),
              pricing: { basePrice, addonsPrice, totalPrice: basePrice + addonsPrice, extraTime },
              recipientType,
              recipientInfo,
              paymentMethod: selectedPaymentMethod,
              venmoHandle,
              providerName: provider?.providerProfile?.businessName || null,
              packageName
            };
          })()}
          onViewBookings={() => navigate('/my-bookings')}
          onReturnToDashboard={() => navigate('/admin')}
          onBookAnother={resetForm}
        />
      </div>
    </div>
  );
};

export default BookingForm;
