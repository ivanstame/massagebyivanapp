import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Provider state
  const [provider, setProvider] = useState(null);

  // Provider services (fetched from API)
  const [durationOptions, setDurationOptions] = useState([]);
  const [availableAddons, setAvailableAddons] = useState([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState(['cash']);

  // Booking flow state with sensible defaults
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [recipientType, setRecipientType] = useState('self');
  const [recipientInfo, setRecipientInfo] = useState({ name: '', phone: '', email: '' });
  const [fullAddress, setFullAddress] = useState('');
  const [location, setLocation] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [selectedMassageType] = useState('focused');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
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
          const { basePricing, addons, acceptedPaymentMethods: providerMethods } = servicesRes.data;

          if (providerMethods && providerMethods.length > 0) {
            setAcceptedPaymentMethods(providerMethods);
            setSelectedPaymentMethod(providerMethods[0]);
          }

          if (basePricing && basePricing.length > 0) {
            setDurationOptions(basePricing);
            // Auto-select first duration if none selected
            setSelectedDuration(basePricing[0].duration);
          } else {
            // Fallback defaults
            const defaults = [
              { duration: 60, price: 125, label: '60 Minutes' },
              { duration: 90, price: 180, label: '90 Minutes' },
              { duration: 120, price: 250, label: '120 Minutes' },
            ];
            setDurationOptions(defaults);
            setSelectedDuration(60);
          }

          if (addons && addons.length > 0) {
            setAvailableAddons(addons);
          }
        } catch (err) {
          console.error('Error fetching provider services:', err);
          // Fallback defaults
          const defaults = [
            { duration: 60, price: 125, label: '60 Minutes' },
            { duration: 90, price: 180, label: '90 Minutes' },
            { duration: 120, price: 250, label: '120 Minutes' },
          ];
          setDurationOptions(defaults);
          setSelectedDuration(60);
        }
      }
    };

    if (user) {
      fetchProviderInfo();
    }
  }, [user]);

  // Handle address confirmation
  const handleAddressConfirmed = async (addressData) => {
    setLocation(addressData);
    setFullAddress(addressData.fullAddress);
  };

  // Load saved address for clients
  useEffect(() => {
    if (user && user.accountType === 'CLIENT' && user.profile?.address) {
      const addr = user.profile.address;
      const combinedAddress = (addr.street && addr.city && addr.state && addr.zip)
        ? `${addr.street}${addr.unit ? ', ' + addr.unit : ''}, ${addr.city}, ${addr.state} ${addr.zip}`
        : addr.formatted || null;

      if (combinedAddress) {
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
      }
    }
  }, [user]);

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
      // Transform ISO strings and filter out past times for today
      const now = DateTime.now().setZone(DEFAULT_TZ);
      const slots = (response.data || [])
        .filter(iso => {
          const dt = DateTime.fromISO(iso, { zone: DEFAULT_TZ });
          return dt > now;
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

      const selectedAddonDetails = selectedAddons.map(name =>
        availableAddons.find(a => a.name === name)
      ).filter(Boolean);

      const addonsPrice = selectedAddonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
      const extraTime = selectedAddonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);

      const bookingData = {
        date: bookingDateStr,
        time: formattedTime,
        duration: selectedDuration + extraTime,
        location: {
          address: fullAddress,
          lat: location.lat,
          lng: location.lng
        },
        massageType: {
          id: selectedMassageType,
          name: 'Focused Therapeutic'
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
        recipientType,
        ...(recipientType === 'other' && {
          recipientInfo: {
            name: recipientInfo.name,
            phone: recipientInfo.phone,
            email: recipientInfo.email || ''
          }
        })
      };

      const response = await bookingService.createBooking(bookingData);
      if (!response || !response._id) {
        throw new Error('Invalid booking response');
      }

      setNewBookingId(response._id);

      // If card or venmo payment, show Stripe checkout (Venmo is handled via Stripe)
      if (selectedPaymentMethod === 'card' || selectedPaymentMethod === 'venmo') {
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
    const isRecipientComplete =
      recipientType === 'self' ||
      (recipientType === 'other' && recipientInfo.name && recipientInfo.phone);

    return (
      selectedDate &&
      fullAddress &&
      selectedTime &&
      selectedDuration &&
      isRecipientComplete
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 mt-20">
        <div className="text-center mb-6 pt-16">
          <h1 className="text-2xl font-bold text-gray-900">
            {provider?.providerProfile?.businessName
              ? `You are booking with ${provider.providerProfile.businessName}`
              : 'Book Your Massage'}
          </h1>
        </div>

        <div className="space-y-6">
          {/* 1. Calendar */}
          <CalendarSection
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            isComplete={selectedDate !== null}
          />

          {/* 2. Recipient */}
          <RecipientSection
            recipientType={recipientType}
            recipientInfo={recipientInfo}
            onRecipientTypeChange={setRecipientType}
            onRecipientInfoChange={setRecipientInfo}
            isComplete={recipientType === 'self' || (recipientInfo.name && recipientInfo.phone)}
          />

          {/* 3. Address */}
          <AddressSection
            savedAddress={(() => {
              const addr = user?.profile?.address;
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

          {/* 6. Payment Method */}
          <PaymentMethodSelector
            selectedMethod={selectedPaymentMethod}
            onMethodChange={setSelectedPaymentMethod}
            acceptedMethods={acceptedPaymentMethods}
            isComplete={selectedPaymentMethod !== null}
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
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-6">
            <button
              onClick={() => navigate('/')}
              className="flex-1 sm:flex-initial px-6 py-3 border-2 border-teal-600 text-teal-700 rounded-lg font-medium
                         hover:bg-teal-50 transition-colors flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Go Back</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!isBookingComplete() || loading}
              className={`flex-1 px-6 py-3 rounded-lg text-lg font-medium shadow-sm transition-all
                         flex items-center justify-center space-x-2
                ${isBookingComplete()
                  ? 'bg-teal-600 text-white hover:bg-cyan-900'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>Book Appointment</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>

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
          bookingDetails={{
            selectedTime,
            selectedDate,
            fullAddress,
            numSessions: 1,
            bookingId: newBookingId,
            selectedDuration,
            selectedAddons,
            selectedMassageType,
            massageTypes: [
              { id: 'focused', name: 'Focused Therapeutic' }
            ],
            addons: availableAddons.map(a => ({ id: a.name, name: a.name, price: a.price })),
            recipientType,
            recipientInfo
          }}
          onViewBookings={() => navigate('/my-bookings')}
          onReturnToDashboard={() => navigate('/admin')}
          onBookAnother={resetForm}
        />
      </div>
    </div>
  );
};

export default BookingForm;
