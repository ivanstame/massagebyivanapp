import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';

// Import the extracted components
import ProviderInformationCard from './BookingFormComponents/ProviderInformationCard';
import CalendarSection from './BookingFormComponents/CalendarSection';
import RecipientSection from './BookingFormComponents/RecipientSection';
import AddressSection from './BookingFormComponents/AddressSection';
import SessionConfigurationPanel from './BookingFormComponents/SessionConfigurationPanel';
import AvailableTimeSlots from './BookingFormComponents/AvailableTimeSlots';
import BookingSummaryCard from './BookingFormComponents/BookingSummaryCard';
import BookingConfirmationModal from './BookingFormComponents/BookingConfirmationModal';

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Add new provider-related state
  const [provider, setProvider] = useState(null);
  const [useSavedAddr, setUseSavedAddr] = useState(true);

  // Recipient information
  const [recipientType, setRecipientType] = useState('self');
  const [recipientInfo, setRecipientInfo] = useState({ name: '', phone: '', email: '' });

  // Single-session configuration
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [selectedMassageType, setSelectedMassageType] = useState('focused');

  // Multi-session wizard
  const [numSessions, setNumSessions] = useState(1);
  const [sessionDurations, setSessionDurations] = useState([]);
  const [sessionNames, setSessionNames] = useState([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [isConfiguringDurations, setIsConfiguringDurations] = useState(false);

  // Address
  const [fullAddress, setFullAddress] = useState('');
  const [location, setLocation] = useState(null); // store address object if needed

  // Calendar and time slot selection
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Booking success
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [newBookingId, setNewBookingId] = useState(null);
  const [groupId, setGroupId] = useState(null);

  // Session durations
  const durations = [
    { minutes: 60, label: '60 Minutes' },
    { minutes: 90, label: '90 Minutes' },
    { minutes: 120, label: '120 Minutes' }
  ];

  // Get provider info if client, or set as provider if provider
  useEffect(() => {
    const fetchProviderInfo = async () => {
      // For PROVIDER users, use their own data
      if (user.accountType === 'PROVIDER') {
        setProvider(user);
        return;
      }
      
      // For CLIENT users, fetch their provider's data if providerId exists
      if (user.accountType === 'CLIENT') {
        // Check if providerId exists and is valid
        if (!user.providerId) {
          console.warn('Client user has no providerId assigned');
          // Set default values to allow booking to continue
          setProvider({
            _id: user._id, // Use client ID as fallback
            providerProfile: {
              businessName: 'Your Provider'
            }
          });
          return;
        }
        
        try {
          console.log(`Fetching provider info for providerId: ${user.providerId}`);
          const response = await api.get(`/api/users/provider/${user.providerId}`);
          
          if (response.data) {
            setProvider(response.data);
          } else {
            console.warn('Provider data is empty or invalid');
            // Set default values
            setProvider({
              _id: user.providerId,
              providerProfile: {
                businessName: 'Your Provider'
              }
            });
          }
        } catch (error) {
          console.error('Error fetching provider info:', error);
          console.error('Provider ID that caused error:', user.providerId);
          
          // Set default values to allow booking to continue
          setProvider({
            _id: user.providerId || user._id,
            providerProfile: {
              businessName: 'Your Provider'
            }
          });
        }
      }
    };

    if (user) {
      fetchProviderInfo();
    }
  }, [user]);

  // Multi-session wizard
  const handleSessionTypeChange = (num) => {
    setNumSessions(num);
    if (num === 1) {
      setSessionDurations([]);
      setSessionNames([]);
      setIsConfiguringDurations(false);
      setSelectedDuration(null);
    } else {
      setSessionDurations(Array(num).fill(null));
      setSessionNames(Array(num).fill(''));
      setIsConfiguringDurations(true);
      setWizardStep(0);
    }
  };

  // Handle address confirmation
  const handleAddressConfirmed = async (addressData) => {
    setLocation(addressData);
    setFullAddress(addressData.fullAddress);
  };

  useEffect(() => {
    if (
      user &&
      user.accountType === 'CLIENT' &&
      user.profile?.address &&
      useSavedAddr
    ) {
      const { street, unit, city, state, zip } = user.profile.address;
      if (street && city && state && zip) {
        const combinedAddress = `${street}${unit ? ', ' + unit : ''}, ${city}, ${state} ${zip}`;
        setFullAddress(combinedAddress);
  
        // Geocode the saved address immediately
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
  }, [user, useSavedAddr]);
  
  // Fetch available slots from the server
  const fetchAvailableSlots = async () => {
    if (!googleMapsLoaded) {
      setError('Google Maps integration required - please refresh the page');
      setAvailableSlots([]);
      return;
    }
  
    if (!fullAddress || (!selectedDuration && !sessionDurations.length)) {
      setAvailableSlots([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Get providerId with fallback to ensure we always have a value
      let providerId;
      if (user.accountType === 'CLIENT') {
        providerId = user.providerId || (provider && provider._id);
        
        // If we still don't have a providerId, show an error
        if (!providerId) {
          console.error('No valid providerId found for client');
          setError('Unable to find your provider. Please contact support.');
          setLoading(false);
          setAvailableSlots([]);
          return;
        }
      } else {
        providerId = user._id;
      }
      
      console.log(`Using providerId for availability: ${providerId}`);
      
      // First get coordinates from address
      let lat, lng;
      try {
        const geocodeResponse = await api.get('/api/geocode', {
          params: { address: fullAddress }
        });
        
        lat = geocodeResponse.data.lat;
        lng = geocodeResponse.data.lng;
      } catch (geoError) {
        console.error('Error geocoding address:', geoError);
        // Use default coordinates as fallback
        lat = 34.0522; // Los Angeles
        lng = -118.2437;
      }
  
      // Convert selected date to LA timezone for API
      const laDate = DateTime.fromJSDate(selectedDate)
        .setZone(DEFAULT_TZ)
        .toFormat('yyyy-MM-dd');
      
      // Calculate duration with validation
      const calculatedDuration = sessionDurations.length && sessionDurations.every(d => d !== null && d > 0)
        ? sessionDurations.reduce((sum, d) => sum + d, 0)
        : (selectedDuration || 60); // Default to 60 minutes if no valid duration
      
      // Prepare add-ons data if any
      const addonsParam = selectedAddons && selectedAddons.length > 0 
        ? JSON.stringify(selectedAddons.map(addonId => {
            // Find the add-on details
            const addon = addons.find(a => a.id === addonId);
            return addon ? {
              id: addon.id,
              extraTime: addon.extraTime || 0
            } : null;
          }).filter(Boolean))
        : null;
  
      // Then fetch available slots with provider context
      const response = await api.get(
        `/api/availability/available/${laDate}`,
        {
          params: {
            providerId,
            duration: calculatedDuration,
            lat,
            lng,
            isMultiSession: sessionDurations.length > 0 && sessionDurations.every(d => d !== null && d > 0),
            sessionDurations: sessionDurations.length && sessionDurations.every(d => d !== null && d > 0)
              ? JSON.stringify(sessionDurations)
              : JSON.stringify([60]), // Default to a 60 minute session if invalid
            addons: addonsParam
          }
        }
      );
  
      // All slots coming from the server are in ISO-8601 format
      const formattedSlots = response.data.map(isoTime => {
        try {
          // Use our centralized utility to format the ISO string
          const localTime = LuxonService.formatISOToDisplay(isoTime, TIME_FORMATS.TIME_24H);
          
          if (!localTime) {
            console.warn('Failed to format time:', isoTime);
            return null;
          }
          
          // Return both the original ISO string and the formatted local time
          return {
            iso: isoTime,
            local: localTime,
            // Add 12-hour format for display if needed
            display: LuxonService.formatISOToDisplay(isoTime, TIME_FORMATS.TIME_12H)
          };
        } catch (err) {
          console.error('Error formatting time slot:', isoTime, err);
          return null;
        }
      }).filter(Boolean); // Remove any null values
  
      setAvailableSlots(formattedSlots);
      setError(null);
    } catch (err) {
      setError('Could not fetch available times');
      console.error('Error fetching slots:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Re-fetch slots if address or selectedDuration changes, etc.
  useEffect(() => {
    const loadSlots = async () => {
      try {
        // Add a check for multi-session scenario
        if (fullAddress && (selectedDuration || sessionDurations.length > 0)) {
          await fetchAvailableSlots();
        }
      } catch (err) {
        console.error('Error in useEffect:', err);
        setError('Failed to load available times');
      }
    };
    
    // Only load slots if we have a provider (or we're a provider)
    if (provider || (user && user.accountType === 'PROVIDER')) {
      loadSlots();
    }
  }, [fullAddress, selectedDuration, sessionDurations, selectedDate, provider]);

  const formatPeriod = (isoTime) => {
    try {
      const slotDT = DateTime.fromISO(isoTime, { zone: DEFAULT_TZ });
      if (!slotDT.isValid) return 'unavailable';
      
      const hour = slotDT.hour;
      
      if (isNaN(hour)) {
        return 'unavailable';
      }
      
      if (hour >= 6 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      return 'evening';
    } catch (err) {
      console.error('Error determining time period:', isoTime, err);
      return 'unavailable';
    }
  };

  // Handle Submit Booking
  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      // Validate required fields
      if (!selectedDate) throw new Error('Selected date is missing');
      if (!selectedTime) throw new Error('Selected time is missing');
      if (!fullAddress) throw new Error('Full address is missing');
      if (!location || location.lat == null || location.lng == null)
        throw new Error('Location data is incomplete');
      
      // Ensure we have a provider
      if (user.accountType === 'CLIENT' && !provider) {
        throw new Error('Provider information is missing. Please try again or contact support.');
      }
  
      const bookingDateLA = DateTime.fromJSDate(selectedDate)
        .setZone(DEFAULT_TZ);
      const bookingDateStr = bookingDateLA.toFormat('yyyy-MM-dd');
  
      if (numSessions === 1) {
        if (!selectedDuration) throw new Error('Selected duration is missing');
  
        // Extract time from ISO format and ensure it's in 24-hour format
        const slotDT = DateTime.fromISO(selectedTime.iso);
        if (!slotDT.isValid) {
          throw new Error('Invalid ISO time format');
        }
        
        // Use our centralized utility to format the time
        const formattedTime = LuxonService.formatISOToDisplay(selectedTime.iso, TIME_FORMATS.TIME_24H);
        if (!formattedTime) {
          throw new Error('Failed to format time correctly');
        }
        
        console.log('Submitting booking with ISO time:', selectedTime.iso, 'formatted as:', formattedTime);
        
        // Define massage types and add-ons for reference
        const massageTypes = [
          {
            id: 'focused',
            name: 'Focused Therapeutic'
          },
          {
            id: 'deep',
            name: 'General Deep Tissue'
          },
          {
            id: 'relaxation',
            name: 'Relaxation Flow'
          }
        ];
        
        const addons = [
          { id: 'theragun', name: 'TheraGun', price: 10 },
          { id: 'hotstone', name: 'Hot Stone', price: 20 },
          { id: 'bamboo', name: 'Warm Bamboo', price: 30 },
          { id: 'stretching', name: 'Dynamic Stretching', price: 25, extraTime: 30 }
        ];
        
        // Calculate extra time from add-ons
        const extraTime = selectedAddons.includes('stretching') ? 30 : 0;
        
        // Calculate total price
        const getBasePrice = () => {
          const durationObj = durations.find(d => d.minutes === selectedDuration);
          return durationObj ? durationObj.price : 0;
        };
        
        const getAddonsPrice = () => {
          return selectedAddons.reduce((total, addonId) => {
            const addon = addons.find(a => a.id === addonId);
            return total + (addon ? addon.price : 0);
          }, 0);
        };
        
        const bookingData = {
          date: bookingDateStr,
          time: formattedTime, // Standardized 24-hour HH:mm format
          duration: selectedDuration + extraTime,
          location: {
            address: fullAddress,
            lat: location.lat,
            lng: location.lng
          },
          massageType: {
            id: selectedMassageType,
            name: massageTypes.find(type => type.id === selectedMassageType)?.name || 'Unknown'
          },
          addons: selectedAddons.map(addonId => {
            const addon = addons.find(a => a.id === addonId);
            return addon ? {
              id: addon.id,
              name: addon.name,
              price: addon.price,
              extraTime: addon.extraTime || 0
            } : null;
          }).filter(Boolean),
          pricing: {
            basePrice: getBasePrice(),
            addonsPrice: getAddonsPrice(),
            totalPrice: getBasePrice() + getAddonsPrice()
          },
          // Add recipient information
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
          throw new Error('Invalid booking response: ' + JSON.stringify(response));
        }
        setNewBookingId(response._id);
        setBookingSuccess(true);
      } else {
        if (sessionDurations.length !== numSessions)
          throw new Error('Session durations count mismatch');
        if (sessionNames.length !== numSessions)
          throw new Error('Session names count mismatch');
  
        // Extract time from ISO format for multi-session and ensure it's in 24-hour format
        const slotDT = DateTime.fromISO(selectedTime.iso);
        if (!slotDT.isValid) {
          throw new Error('Invalid ISO time format for multi-session booking');
        }
        
        // Use our centralized utility to format the time
        const formattedTime = LuxonService.formatISOToDisplay(selectedTime.iso, TIME_FORMATS.TIME_24H);
        if (!formattedTime) {
          throw new Error('Failed to format time correctly for multi-session booking');
        }
        
        console.log('Starting multi-session booking with ISO time:', selectedTime.iso, 'formatted as:', formattedTime);
        
        let currentSessionStart = formattedTime;
        const bookingDataArray = sessionDurations.map((dur, i) => {
          const startDT = DateTime.fromFormat(
            `${bookingDateStr} ${currentSessionStart}`, 
            'yyyy-MM-dd HH:mm',
            { zone: DEFAULT_TZ }
          );
  
          if (!startDT.isValid)
            throw new Error(`Session ${i + 1} start time is invalid: ${currentSessionStart}`);
  
          const bookingData = {
            date: bookingDateStr,
            time: currentSessionStart, // Already in 24h format from the previous conversion
            occupantName: sessionNames[i],
            duration: dur,
            location: {
              address: fullAddress,
              lat: location.lat,
              lng: location.lng
            }
          };
  
          // Calculate next session start time
          const nextStartDT = startDT.plus({ minutes: dur });
          currentSessionStart = nextStartDT.toFormat('HH:mm');
  
          return bookingData;
        });
  
        const response = await api.post('/api/bookings/bulk', bookingDataArray);
  
        if (!Array.isArray(response.data) || !response.data[0]?._id) {
          throw new Error('Invalid bulk booking response: ' + JSON.stringify(response.data));
        }
        setNewBookingId(response.data[0]._id);
        setBookingSuccess(true);
      }
    } catch (err) {
      console.error('Error creating booking:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create booking');
      setBookingSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const isBookingComplete = () => {
    // Check if recipient information is complete
    const isRecipientComplete = 
      recipientType === 'self' || 
      (recipientType === 'other' && recipientInfo.name && recipientInfo.phone);
    
    return (
      selectedDate &&
      fullAddress &&
      selectedTime &&
      isRecipientComplete &&
      (numSessions === 1
        ? selectedDuration // single session needs selectedDuration
        : (sessionDurations.length === numSessions &&
           sessionDurations.every(dur => dur) &&
           sessionNames.every(name => name)))
    );
  };

  const resetForm = () => {
    // Reset everything
    setSelectedDate(new Date());
    setSelectedTime(null);
    setFullAddress('');
    setLocation(null);
    setSelectedDuration(null);
    setSelectedAddons([]);
    setSelectedMassageType('focused');
    setNumSessions(1);
    setSessionDurations([]);
    setSessionNames([]);
    setWizardStep(0);
    setIsConfiguringDurations(false);
    setRecipientType('self');
    setRecipientInfo({ name: '', phone: '', email: '' });
    setBookingSuccess(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="pt-16">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Provider Information Card */}
        <ProviderInformationCard 
          provider={provider} 
          isComplete={selectedTime !== null} 
        />

        {/* Calendar */}
        <CalendarSection 
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          availableSlots={availableSlots}
          isDisabled={!fullAddress}
          isComplete={selectedDate !== null}
        />

        {/* Recipient Section */}
        <RecipientSection
          recipientType={recipientType}
          setRecipientType={setRecipientType}
          recipientInfo={recipientInfo}
          setRecipientInfo={setRecipientInfo}
          isComplete={recipientType === 'self' || (recipientType === 'other' && recipientInfo.name && recipientInfo.phone)}
        />

        {/* Session Configuration and Address Sections */}
        <div className="space-y-6">
          {/* Session Configuration Panel - Now includes the summary card */}
          <SessionConfigurationPanel 
            onSessionConfigChange={(config) => {
              setNumSessions(config.numSessions);
              setSelectedDuration(config.selectedDuration);
              setSessionDurations(config.sessionDurations);
              setSessionNames(config.sessionNames);
            }}
            availableDurations={durations}
            selectedAddons={selectedAddons}
            setSelectedAddons={setSelectedAddons}
            selectedMassageType={selectedMassageType}
            setSelectedMassageType={setSelectedMassageType}
            isComplete={
              numSessions === 1 
                ? selectedDuration !== null 
                : sessionDurations.length === numSessions && 
                  sessionDurations.every(d => d) && 
                  sessionNames.every(n => n)
            }
          />

          {/* Address Section */}
          <AddressSection 
            savedAddress={user?.profile?.address ? {
              fullAddress: `${user.profile.address.street}${user.profile.address.unit ? ', ' + user.profile.address.unit : ''}, ${user.profile.address.city}, ${user.profile.address.state} ${user.profile.address.zip}`,
              lat: location?.lat,
              lng: location?.lng
            } : null}
            currentAddress={location}
            onAddressChange={handleAddressConfirmed}
            googleMapsLoaded={googleMapsLoaded}
            isComplete={fullAddress !== ''}
          />
        </div>

        {/* Available Time Slots */}
        <AvailableTimeSlots 
          availableSlots={availableSlots}
          selectedTime={selectedTime}
          onTimeSelected={setSelectedTime}
          hasValidDuration={selectedDuration !== null || (sessionDurations.length > 0 && sessionDurations.every(d => d))}
          isComplete={selectedTime !== null}
          selectedDate={selectedDate}
        />

        {/* Booking Confirmation Modal */}
        <BookingConfirmationModal 
          isVisible={bookingSuccess}
          bookingDetails={{
            selectedTime,
            selectedDate,
            fullAddress,
            numSessions,
            sessionDurations,
            sessionNames,
            bookingId: newBookingId,
            // Add massage type and add-ons for single sessions
            ...(numSessions === 1 && {
              selectedDuration,
              selectedAddons,
              selectedMassageType,
              // Define massage types for reference in the modal
              massageTypes: [
                { id: 'focused', name: 'Focused Therapeutic' },
                { id: 'deep', name: 'General Deep Tissue' },
                { id: 'relaxation', name: 'Relaxation Flow' }
              ],
              // Define add-ons for reference in the modal
              addons: [
                { id: 'theragun', name: 'TheraGun', price: 10 },
                { id: 'hotstone', name: 'Hot Stone', price: 20 },
                { id: 'bamboo', name: 'Warm Bamboo', price: 30 },
                { id: 'stretching', name: 'Dynamic Stretching', price: 25, extraTime: 30 }
              ]
            }),
            // Add recipient information
            recipientType,
            recipientInfo
          }}
          onViewBookings={() => navigate('/my-bookings')}
          onReturnToDashboard={() => navigate('/admin')}
          onBookAnother={resetForm}
        />

        {/* Booking Summary Card - Only show when all required fields are filled */}
        {isBookingComplete() && numSessions === 1 && (
          <BookingSummaryCard
            selectedMassageType={selectedMassageType}
            selectedDuration={selectedDuration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            fullAddress={fullAddress}
            selectedAddons={selectedAddons}
            recipientType={recipientType}
            recipientInfo={recipientInfo}
          />
        )}

        {/* Confirm Booking Button */}
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={!isBookingComplete() || loading}
            className={`w-full py-3 px-4 rounded-lg text-lg font-medium shadow-sm ${
              isBookingComplete() 
                ? 'bg-green-600 text-white hover:bg-green-700 transition-colors'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              'Processing...'
            ) : isBookingComplete() ? (
              'Confirm Booking'
            ) : (
              'Complete all fields to confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingForm;
