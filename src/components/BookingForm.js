import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import ResponsiveCalendar from './ResponsiveCalendar';
import axios from 'axios';
import AddressForm from './AddressForm';
import SessionConfigWizard from './SessionConfigWizard';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { CheckCircle, Users, HourglassIcon, Clock, MapPin, AlertCircle, Check, Calendar, Info } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';
import ProviderBanner from './BookingFormComponents/ProviderBanner';


// Use LuxonService for time formatting

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Add new provider-related state
  const [provider, setProvider] = useState(null);
  const [useSavedAddr, setUseSavedAddr] = useState(true);

  // Single-session duration
  const [selectedDuration, setSelectedDuration] = useState(null);

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
          // Set default values to allow booking to continue
          const fallbackProvider = {
            _id: user._id, // Use client ID as fallback
            providerProfile: {
              businessName: 'Your Provider'
            }
          };
          setProvider(fallbackProvider);
          return;
        }
        
        try {
          const response = await api.get(`/api/users/provider/${user.providerId}`);
          
          
          if (response.data) {
            setProvider(response.data);
          } else {
            // Set default values
            const fallbackProvider = {
              _id: user.providerId,
              providerProfile: {
                businessName: 'Your Provider'
              }
            };
            setProvider(fallbackProvider);
          }
        } catch (error) {
          
          // Set default values to allow booking to continue
          const fallbackProvider = {
            _id: user.providerId || user._id,
            providerProfile: {
              businessName: 'Your Provider'
            }
          };
          setProvider(fallbackProvider);
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
      useSavedAddr // Corrected state variable name
    ) {
      const { street, unit, city, state, zip } = user.profile.address;
      if (street && city && state && zip) {
        const combinedAddress = `${street}${unit ? ', ' + unit : ''}, ${city}, ${state} ${zip}`;
        setFullAddress(combinedAddress); // Changed to match state setter
  
        // Geocode the saved address immediately
        (async () => {
          try {
            const geo = await api.get('/api/geocode', {
              params: { address: combinedAddress },
            });
            setLocation({ // Changed to match state setter
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
  }, [user, useSavedAddr]); // Corrected dependency
  
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
          setError('Unable to find your provider. Please contact support.');
          setLoading(false);
          setAvailableSlots([]);
          return;
        }
      } else {
        providerId = user._id;
      }
      
      
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
              : JSON.stringify([60]) // Default to a 60 minute session if invalid
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

  const filterSlotByPeriod = (slot, period) => {
    const hour = parseInt(slot.split(':')[0]);
    switch (period) {
      case 'all':
        return true;
      case 'morning':
        return hour >= 6 && hour < 12;
      case 'afternoon':
        return hour >= 12 && hour < 17;
      case 'evening':
        return hour >= 17 && hour < 22;
      default:
        return true;
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
        
        
        const bookingData = {
          date: bookingDateStr,
          time: formattedTime, // Standardized 24-hour HH:mm format
          duration: selectedDuration,
          location: {
            address: fullAddress,
            lat: location.lat,
            lng: location.lng
          }
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
    return (
      selectedDate &&
      fullAddress &&
      selectedTime &&
      (numSessions === 1
        ? selectedDuration // single session needs selectedDuration
        : (sessionDurations.length === numSessions &&
           sessionDurations.every(dur => dur) &&
           sessionNames.every(name => name)))
    );
  };

  // Service area warning removed

  // Inside BookingForm component

const formatDate = (date) => {
  return DateTime.fromJSDate(date)
    .setZone(DEFAULT_TZ)
    .toFormat('cccc, LLLL d, yyyy');
};

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

const renderTimeSlots = () => (
  <div className="space-y-6">
    {/* Morning Section */}
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">Morning</h3>
      <div className="grid grid-cols-4 gap-2">
        {(!selectedDuration && sessionDurations.length === 0) ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : !availableSlots.length ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : (
          availableSlots
            .filter(slot => formatPeriod(slot.iso) === 'morning')
            .map(slot => (
              <button
                key={slot.iso}
                onClick={() => setSelectedTime(slot)}
                className={`p-2 text-center rounded border transition-all ${
                  selectedTime?.iso === slot.iso
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <span className="local-time">{slot.local}</span>
                <div className="text-xs text-gray-500">{DateTime.fromISO(slot.iso).toFormat('ZZ')}</div>
              </button>
            ))
        )}
      </div>
    </div>

    {/* Afternoon Section */}
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">Afternoon</h3>
      <div className="grid grid-cols-4 gap-2">
        {(!selectedDuration && sessionDurations.length === 0) ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : !availableSlots.length ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : (
          availableSlots
            .filter(slot => formatPeriod(slot.iso) === 'afternoon')
            .map(slot => (
              <button
                key={slot.iso}
                onClick={() => setSelectedTime(slot)}
                className={`p-2 text-center rounded border transition-all ${
                  selectedTime?.iso === slot.iso
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <span className="local-time">{slot.local}</span>
                <div className="text-xs text-gray-500">{DateTime.fromISO(slot.iso).toFormat('ZZ')}</div>
              </button>
            ))
        )}
      </div>
    </div>

    {/* Evening Section */}
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">Evening</h3>
      <div className="grid grid-cols-4 gap-2">
        {(!selectedDuration && sessionDurations.length === 0) ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : !availableSlots.length ? (
          Array(4).fill(null).map((_, idx) => (
            <div key={idx} className="p-2 border rounded text-center text-gray-400 bg-gray-50" />
          ))
        ) : (
          availableSlots
            .filter(slot => formatPeriod(slot.iso) === 'evening')
            .map(slot => (
              <button
                key={slot.iso}
                onClick={() => setSelectedTime(slot)}
                className={`p-2 text-center rounded border transition-all ${
                  selectedTime?.iso === slot.iso
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <span className="local-time">{slot.local}</span>
                <div className="text-xs text-gray-500">{DateTime.fromISO(slot.iso).toFormat('ZZ')}</div>
              </button>
            ))
        )}
      </div>
    </div>
  </div>
);

// Confirmation modal formatting
const renderBookingConfirmation = () => (
  <div className="text-sm text-gray-500 mb-6">
    {numSessions === 1 ? (
      `Your session is scheduled at ${selectedTime?.local} (UTC${DateTime.fromISO(selectedTime?.iso).toFormat("ZZ")}) on
      ${formatDate(selectedDate)}, address: ${fullAddress}.`
    ) : (
      <>
        <div>
          {`Your ${numSessions} back-to-back sessions have been scheduled for
          ${formatDate(selectedDate)} at ${selectedTime?.local} (UTC${DateTime.fromISO(selectedTime?.iso).toFormat("ZZ")}).`}
        </div>
        <div className="mt-2 text-left">
          {sessionDurations.map((dur, i) => (
            <div key={i} className="mt-1 pl-4 border-l-2 border-blue-200">
              <div className="font-medium">
                {`Session ${i + 1}: ${sessionNames[i] || 'No Name'} (${dur} minutes)`}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          {`Address: ${fullAddress}`}
        </div>
      </>
    )}
  </div>
);

  return (
    <div className="pt-16">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Provider Banner */}
        {provider ? (
          <ProviderBanner provider={provider} />
        ) : (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg mb-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <div>
                <h3 className="font-medium text-red-800">Provider Information Missing</h3>
                <p className="text-sm text-red-700 mt-1">
                  We couldn't find your provider information. The system will use default values, but some features may be limited.
                </p>
              </div>
            </div>
          </div>
        )}


        {/* Calendar */}
        <div className={`bg-white rounded-lg shadow-sm relative ${
          !fullAddress ? 'opacity-50 pointer-events-none' : ''
        } relative`}>
          <CheckCircle className={`absolute top-2 right-2 w-6 h-6 ${
            selectedDate ? 'text-green-500' : 'text-slate-300'
          }`} />
          <ResponsiveCalendar
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            events={availableSlots.map(slot => ({
              date: selectedDate,
              time: slot
            }))}
          />
          {!fullAddress && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
              <p className="text-slate-500">Complete location first</p>
            </div>
          )}
        </div>


        {/* 3-column layout: 1) Session or Wizard, 2) Address, 3) Single Duration if needed */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* (1) If isConfiguringDurations, show wizard. Otherwise, show the "Number of Sessions" dropdown or summary */}
          {!isConfiguringDurations ? (
            <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 relative">
              <CheckCircle className={`absolute top-2 right-2 w-6 h-6 ${
                numSessions > 0 && (numSessions === 1 || sessionDurations.length === numSessions) 
                  ? 'text-green-500' 
                  : 'text-slate-300'
              }`} />
              <div className="flex items-center mb-3 border-b pb-2">
                <Users className="w-5 h-5 text-blue-500 mr-2" />
                <h2 className="font-medium">Number of Sessions</h2>
              </div>
              
              {numSessions > 1 ? (
                // Multi-session summary
                <div>
                  <div className="p-3 bg-blue-50 rounded-md text-sm text-blue-700 mb-3">
                    <div className="font-medium mb-1">Multi-Session Confirmed:</div>
                    {sessionDurations.map((dur, idx) => (
                      <div key={idx} className="text-blue-800 mb-1">
                        {`Session ${idx + 1}: ${sessionNames[idx] || 'Unknown'} - ${dur} minutes`}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setIsConfiguringDurations(true);
                      setWizardStep(0);
                    }}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-cyan-900 transition-colors"
                  >
                    Edit Sessions
                  </button>
                </div>
              ) : (
                // Single session dropdown
                <select
                  value={numSessions}
                  onChange={(e) => handleSessionTypeChange(Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded-md hover:border-slate-300 transition-colors"
                >
                  {[1, 2, 3, 4].map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'Session' : 'Sessions'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <SessionConfigWizard
              numSessions={numSessions}
              setNumSessions={setNumSessions}
              sessionDurations={sessionDurations}
              setSessionDurations={setSessionDurations}
              sessionNames={sessionNames}
              setSessionNames={setSessionNames}
              wizardStep={wizardStep}
              setWizardStep={setWizardStep}
              isConfiguringDurations={isConfiguringDurations}
              setIsConfiguringDurations={setIsConfiguringDurations}
              durations={durations}
            />
          )}

          {/* (2) Address Card (traditional) */}
{/* (2) Address Card (traditional) */}
{!fullAddress && (
  <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg mb-4">
    <div className="flex items-center">
      <Info className="w-5 h-5 text-blue-400 mr-2" />
      <div>
        <h3 className="font-medium text-blue-800">Required First Step</h3>
        <p className="text-sm text-blue-700 mt-1">
          Please confirm your service location before viewing availability
        </p>
      </div>
    </div>
  </div>
)}
<div className="bg-white p-4 border relative">
  <CheckCircle className={`absolute top-2 right-2 w-6 h-6 ${
    (useSavedAddr && fullAddress) || (!useSavedAddr && location) 
      ? 'text-green-500' 
      : 'text-slate-300'
  }`} />
  {/* The heading we want to show for ANY address option */}
  <div className="flex items-center mb-3 border-b pb-2">
    <MapPin className="w-5 h-5 text-blue-500 mr-2" />
    <h2 className="font-medium">Service Location</h2>
  </div>

  {/* The radio buttons to choose how we pick an address */}
  <div className="mb-4">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        checked={useSavedAddr}
        onChange={() => setUseSavedAddr(true)}
      />
      <span className="text-sm">Use my saved address</span>
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        checked={!useSavedAddr}
        onChange={() => setUseSavedAddr(false)}
      />
      <span className="text-sm">Enter a different address</span>
    </label>
  </div>

  {/* Display user’s saved address OR the address form, based on radio toggle */}
  {useSavedAddr ? (
    <div className="p-2 bg-gray-50 rounded">
      <p className="text-sm mb-2">Current Address:</p>
      {fullAddress ? (
        <p className="text-sm">{fullAddress}</p>
      ) : (
        <p className="italic text-sm">
          No address found in profile or still loading...
        </p>
      )}
    </div>
  ) : (
    <AddressForm
      onAddressConfirmed={handleAddressConfirmed}
      googleMapsLoaded={googleMapsLoaded}
    />
  )}
</div>

          {/* (3) Single-session Duration if numSessions === 1 */}
          {numSessions === 1 && (
            <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 relative">
              <CheckCircle className={`absolute top-2 right-2 w-6 h-6 ${
                selectedDuration ? 'text-green-500' : 'text-slate-300'
              }`} />
              <div className="flex items-center gap-2 mb-3 border-b pb-2">
                <HourglassIcon className="w-5 h-5 text-blue-500" />
                <h2 className="font-medium">Session Duration</h2>
              </div>
              <div className="space-y-2">
                {durations.map(duration => (
                  <button
                    key={duration.minutes}
                    onClick={() => setSelectedDuration(duration.minutes)}
                    className={`w-full p-2 rounded-md text-left transition-all ${
                      selectedDuration === duration.minutes
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'border border-slate-200 hover:border-blue-200'
                    }`}
                  >
                    <div className="text-center">{duration.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

{/* Time Period / Available Slots */}
<div className="space-y-4">
  <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
    <div className="flex items-center mb-3 border-b pb-2">
      <Clock className="w-5 h-5 text-blue-500 mr-2" />
      <h2 className="font-medium">Available Times</h2>
      {!selectedTime && availableSlots.length > 0 && (
        <span className="ml-2 text-sm text-blue-600">(Select a time to continue)</span>
      )}
    </div>

    {renderTimeSlots()}
  </div>
</div>

{/* BOOKING SUCCESS MODAL */}
{bookingSuccess && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Booking Confirmed!</h3>
        {renderBookingConfirmation()}
                <p className="text-sm text-gray-500 mb-6">
                  {numSessions === 1 ? (
                    `Your session is scheduled at ${selectedTime?.local} (UTC${DateTime.fromISO(selectedTime?.iso).toFormat("ZZ")}) on
                    ${selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}, address: ${fullAddress}.`
                  ) : (
                    <>
                      <div>
                        {`Your ${numSessions} back-to-back sessions have been scheduled for
                        ${selectedDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })} at ${selectedTime?.local} (UTC${DateTime.fromISO(selectedTime?.iso).toFormat("ZZ")}).`}
                      </div>
                      <div className="mt-2 text-left">
                        {sessionDurations.map((dur, i) => (
                          <div key={i} className="mt-1 pl-4 border-l-2 border-blue-200">
                            <div className="font-medium">
                              {`Session ${i + 1}: ${sessionNames[i] || 'No Name'} (${dur} minutes)`}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        {`Address: ${fullAddress}`}
                      </div>
                    </>
                  )}
                </p>

                {/* Next Actions */}
                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/my-bookings')}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-cyan-900 transition-colors"
                  >
                    View My Bookings
                  </button>
                  <button
                    onClick={() => navigate('/admin')}
                    className="w-full bg-slate-100 text-slate-700 py-2 px-4 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Return to Dashboard
                  </button>
                  <button
                    onClick={() => {
                      // Reset everything
                      setSelectedDate(new Date());
                      setSelectedTime(null);
                      setFullAddress('');
                      setLocation(null);
                      setSelectedDuration(null);
                      setNumSessions(1);
                      setSessionDurations([]);
                      setSessionNames([]);
                      setWizardStep(0);
                      setIsConfiguringDurations(false);
                      setBookingSuccess(false);
                      window.scrollTo(0, 0);
                    }}
                    className="w-full border border-slate-200 text-slate-600 py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Book Another Session
                  </button>
                </div>

                <div className="mt-6 text-xs text-slate-500">
                  A confirmation email has been sent to your inbox.
                  <br />
                  {`Booking Reference: #${newBookingId?.slice(-6)}`}
                </div>
              </div>
            </div>
          </div>
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
