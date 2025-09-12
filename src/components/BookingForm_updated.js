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

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Provider state
  const [provider, setProvider] = useState(null);

  // Booking flow state with sensible defaults
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [recipientType, setRecipientType] = useState('self'); // Default: for myself
  const [recipientInfo, setRecipientInfo] = useState({ name: '', phone: '', email: '' });
  const [fullAddress, setFullAddress] = useState('');
  const [location, setLocation] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(60); // Default: 60 minutes
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [selectedMassageType] = useState('focused'); // Default massage type
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [newBookingId, setNewBookingId] = useState(null);

  // Get provider info
  useEffect(() => {
    const fetchProviderInfo = async () => {
      if (user.accountType === 'PROVIDER') {
        setProvider(user);
        return;
      }
      
      if (user.accountType === 'CLIENT' && user.providerId) {
        try {
          const response = await api.get(`/api/users/provider/${user.providerId}`);
          setProvider(response.data || {
            _id: user.providerId,
            providerProfile: { businessName: 'Your Provider' }
          });
        } catch (error) {
          console.error('Error fetching provider info:', error);
          setProvider({
            _id: user.providerId || user._id,
            providerProfile: { businessName: 'Your Provider' }
          });
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
      const { street, unit, city, state, zip } = user.profile.address;
      if (street && city && state && zip) {
        const combinedAddress = `${street}${unit ? ', ' + unit : ''}, ${city}, ${state} ${zip}`;
        setFullAddress(combinedAddress);
        
        // Geocode the saved address
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

  // Fetch available slots
  const fetchAvailableSlots = async () => {
    if (!googleMapsLoaded || !fullAddress || !selectedDuration) {
      setAvailableSlots([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      let providerId = user.accountType === 'CLIENT' 
        ? (user.providerId || provider?._id)
        : user._id;
        
      if (!providerId) {
        setError('Unable to find your provider. Please contact support.');
        setLoading(false);
        return;
      }
      
      // Get coordinates
      let lat, lng;
      try {
        console.log('Geocoding address for availability calculation:', fullAddress);
        const geocodeResponse = await api.get('/api/geocode', {
          params: { address: fullAddress }
        });
        lat = geocodeResponse.data.lat;
        lng = geocodeResponse.data.lng;
        console.log('Geocoded coordinates:', lat, lng);
      } catch (geoError) {
        console.error('Error geocoding address:', geoError);
        lat = 34.0522;
        lng = -118.2437;
      }

      const laDate = DateTime.fromJSDate(selectedDate)
        .setZone(DEFAULT_TZ)
        .toFormat('yyyy-MM-dd');
      
      // Calculate total duration including add-ons
      const extraTime = selectedAddons.includes('stretching') ? 30 : 0;
      const totalDuration = selectedDuration + extraTime;
      
      const addonsParam = selectedAddons.length > 0 
        ? JSON.stringify(selectedAddons.map(addonId => {
            const extraTime = addonId === 'stretching' ? 30 : 0;
            return { id: addonId, extraTime };
          }))
        : null;

      const response = await api.get(
        `/api/availability/available/${laDate}`,
        {
          params: {
            providerId,
            duration: totalDuration,
            lat,
            lng,
            addons: addonsParam
          }
        }
      );

      const formattedSlots = response.data.map(isoTime => {
        try {
          const localTime = LuxonService.formatISOToDisplay(isoTime, TIME_FORMATS.TIME_24H);
          if (!localTime) return null;
          
          return {
            iso: isoTime,
            local: localTime,
            display: LuxonService.formatISOToDisplay(isoTime, TIME_FORMATS.TIME_12H)
          };
        } catch (err) {
          console.error('Error formatting time slot:', isoTime, err);
          return null;
        }
      }).filter(Boolean);

      setAvailableSlots(formattedSlots);
      setError(null);
    } catch (err) {
      setError('Could not fetch available times');
      console.error('Error fetching slots:', err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch slots when dependencies change
  useEffect(() => {
    if (fullAddress && selectedDuration && selectedDate && (provider || user?.accountType === 'PROVIDER')) {
      fetchAvailableSlots();
    }
  }, [fullAddress, selectedDuration, selectedAddons, selectedDate, provider]);

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

      // Calculate pricing
      const basePrice = selectedDuration === 60 ? 100 : selectedDuration === 90 ? 150 : 200;
      const addonsPrice = selectedAddons.reduce((total, addonId) => {
        const prices = { theragun: 10, hotstone: 20, bamboo: 30, stretching: 25 };
        return total + (prices[addonId] || 0);
      }, 0);

      const bookingData = {
        date: bookingDateStr,
        time: formattedTime,
        duration: selectedDuration + (selectedAddons.includes('stretching') ? 30 : 0),
        location: {
          address: fullAddress,
          lat: location.lat,
          lng: location.lng
        },
        massageType: {
          id: selectedMassageType,
          name: 'Focused Therapeutic'
        },
        addons: selectedAddons.map(addonId => {
          const addonDetails = {
            theragun: { name: 'TheraGun', price: 10, extraTime: 0 },
            hotstone: { name: 'Hot Stone', price: 20, extraTime: 0 },
            bamboo: { name: 'Warm Bamboo', price: 30, extraTime: 0 },
            stretching: { name: 'Dynamic Stretching', price: 25, extraTime: 30 }
          };
          return { id: addonId, ...addonDetails[addonId] };
        }),
        pricing: {
          basePrice,
          addonsPrice,
          totalPrice: basePrice + addonsPrice
        },
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
      setBookingSuccess(true);
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
    setSelectedDuration(60);
    setSelectedAddons([]);
    setRecipientType('self');
    setRecipientInfo({ name: '', phone: '', email: '' });
    setBookingSuccess(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 mt-20"> {/* Significantly increased mt-20 to clear navbar */}
        {/* Simple heading with ample spacing to avoid navbar overlap */}
        <div className="text-center mb-6 pt-16"> {/* Increased pt-16 to ensure clearance */}
          <h1 className="text-2xl font-bold text-gray-900">
            {provider?.providerProfile?.businessName
              ? `You are booking with ${provider.providerProfile.businessName}`
              : provider?.businessName
              ? `You are booking with ${provider.businessName}`
              : 'Booking Appointment'
            }
          </h1>
        </div>


        {/* Main booking form */}
        <div className="space-y-6">
          {/* 1. Calendar */}
          <CalendarSection 
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            availableSlots={availableSlots}
            isDisabled={false}
            isComplete={selectedDate !== null}
          />

          {/* 2. Recipient */}
          <RecipientSection
            recipientType={recipientType}
            setRecipientType={setRecipientType}
            recipientInfo={recipientInfo}
            setRecipientInfo={setRecipientInfo}
            isComplete={recipientType === 'self' || (recipientType === 'other' && recipientInfo.name && recipientInfo.phone)}
          />

          {/* 3. Address */}
          <AddressSection 
            savedAddress={user?.profile?.address ? {
              fullAddress: `${user.profile.address.street}${user.profile.address.unit ? ', ' + user.profile.address.unit : ''}, ${user.profile.address.city}, ${user.profile.address.state} ${user.profile.address.zip}`
              // Note: We don't include lat/lng here because the AddressSection will trigger a geocode
              // when the user selects "Use Saved Address"
            } : null}
            currentAddress={location}
            onAddressChange={handleAddressConfirmed}
            googleMapsLoaded={googleMapsLoaded}
            isComplete={fullAddress !== ''}
          />

          {/* 4. Duration */}
          <SimpleDurationSelector
            selectedDuration={selectedDuration}
            onDurationChange={setSelectedDuration}
            isComplete={selectedDuration !== null}
          />

          {/* 5. Add-ons */}
          <AddOnsSelector
            selectedAddons={selectedAddons}
            onAddonsChange={setSelectedAddons}
            isComplete={true}
          />

          {/* 6. Booking Summary - Always visible */}
          <BookingSummaryCard
            selectedMassageType={selectedMassageType}
            selectedDuration={selectedDuration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            fullAddress={location?.fullAddress || fullAddress}
            selectedAddons={selectedAddons}
            recipientType={recipientType}
            recipientInfo={recipientInfo}
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
              { id: 'focused', name: 'Focused Therapeutic' },
              { id: 'deep', name: 'General Deep Tissue' },
              { id: 'relaxation', name: 'Relaxation Flow' }
            ],
            addons: [
              { id: 'theragun', name: 'TheraGun', price: 10 },
              { id: 'hotstone', name: 'Hot Stone', price: 20 },
              { id: 'bamboo', name: 'Warm Bamboo', price: 30 },
            ],
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
