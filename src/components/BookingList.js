import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { Calendar, MapPin, Clock, AlertCircle, Phone, MessageSquare, Tag, DollarSign } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';
import { getMassageTypeName } from '../shared/constants/massageOptions';


const BookingList = () => {
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [showPastBookings, setShowPastBookings] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useContext(AuthContext);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    const fetchProviderInfo = async () => {
      if (user.accountType === 'CLIENT' && user.providerId) {
        try {
          const response = await axios.get(`/api/users/provider/${user.providerId}`);
          setProvider(response.data);
        } catch (error) {
          console.error('Error fetching provider info:', error);
        }
      }
    };

    fetchProviderInfo();
    fetchBookings();
  }, [user]);

  const fetchBookings = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/bookings', { withCredentials: true });
  
      if (Array.isArray(response.data)) {
        // Use LA timezone for all comparisons
        const now = DateTime.now().setZone(DEFAULT_TZ);
        
        const upcoming = response.data
          .filter(booking => {
            const bookingEnd = DateTime.fromISO(booking.date)
              .setZone(DEFAULT_TZ)
              .set({
                hour: parseInt(booking.endTime.split(':')[0]),
                minute: parseInt(booking.endTime.split(':')[1])
              });
            return bookingEnd > now;
          })
          .sort((a, b) => 
            DateTime.fromISO(a.date).diff(DateTime.fromISO(b.date)).milliseconds
          );

        const past = response.data
          .filter(booking => {
            const bookingEnd = DateTime.fromISO(booking.date)
              .setZone(DEFAULT_TZ)
              .set({
                hour: parseInt(booking.endTime.split(':')[0]),
                minute: parseInt(booking.endTime.split(':')[1])
              });
            return bookingEnd <= now;
          })
          .sort((a, b) => 
            DateTime.fromISO(b.date).diff(DateTime.fromISO(a.date)).milliseconds
          );
  
        setUpcomingBookings(upcoming);
        setPastBookings(past);
      } else {
        setError('Unexpected response format');
      }
    } catch (error) {
      setError('Error fetching bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (window.confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
      try {
        await axios.delete(`/api/bookings/${bookingId}`, {
          withCredentials: true
        });
        
        setUpcomingBookings(prev => prev.filter(book => book._id !== bookingId));
        setPastBookings(prev => prev.filter(book => book._id !== bookingId));
        
        alert('Booking cancelled successfully.');
      } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Failed to cancel booking. Please try again.');
      }
    }
  };

  const formatDate = (dateString) => {
    return DateTime
      .fromISO(dateString)
      .setZone(DEFAULT_TZ)
      .toFormat('cccc, LLLL d, yyyy');
  };

  const formatTime = (timeString) => {
    // Create a full datetime to properly handle timezone
    const now = DateTime.now().setZone(DEFAULT_TZ);
    const [hours, minutes] = timeString.split(':').map(Number);
    
    return now
      .set({ hour: hours, minute: minutes })
      .toFormat('h:mm a');
  };

  const handleAddToCalendar = (booking) => {
    const startTime = DateTime.fromISO(booking.date)
      .setZone(DEFAULT_TZ)
      .set({
        hour: parseInt(booking.startTime.split(':')[0]),
        minute: parseInt(booking.startTime.split(':')[1])
      });
      
    const endTime = DateTime.fromISO(booking.date)
      .setZone(DEFAULT_TZ)
      .set({
        hour: parseInt(booking.endTime.split(':')[0]),
        minute: parseInt(booking.endTime.split(':')[1])
      });

    const title = 'Massage Appointment';
    const location = booking.location?.address;

    // Format for Google Calendar
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${
      encodeURIComponent(title)}&dates=${
      startTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
    }/${
      endTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
    }&location=${
      encodeURIComponent(location)}`;
    
    window.open(googleUrl, '_blank');
  };

  const renderBooking = (booking) => (
    <div
      key={booking._id}
      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden
        transition duration-200 ease-in-out hover:shadow-md mb-4"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            {user.accountType === 'CLIENT' && provider && (
              <div className="mb-2 text-sm text-slate-500">
                {provider.providerProfile.businessName}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center text-slate-900">
                <Calendar className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {formatDate(booking.date)}
                </span>
              </div>
              <div className="flex items-center text-slate-600">
                <Clock className="w-4 h-4 mr-2" />
                <span>
                  {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                </span>
              </div>
              <div className="flex items-center text-slate-600">
                <MapPin className="w-4 h-4 mr-2" />
                <span>{booking.location?.address || 'Unknown'}</span>
              </div>
              
              {/* Display massage type if available */}
              {booking.massageType && (
                <div className="flex items-center text-slate-600">
                  <Tag className="w-4 h-4 mr-2" />
                  <span>{booking.massageType.name || getMassageTypeName(booking.massageType.id)}</span>
                </div>
              )}
              
              {/* Display add-ons if available */}
              {booking.addons && booking.addons.length > 0 && (
                <div className="flex items-start text-slate-600">
                  <div className="flex-shrink-0 mt-1">
                    <Tag className="w-4 h-4 mr-2" />
                  </div>
                  <div>
                    <span className="font-medium">Add-ons:</span>
                    <ul className="list-disc list-inside pl-2 text-sm">
                      {booking.addons.map(addon => (
                        <li key={addon.id}>{addon.name} (+${addon.price})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
              {/* Display pricing if available */}
              {booking.pricing && (
                <div className="flex items-center text-slate-600 font-medium">
                  <DollarSign className="w-4 h-4 mr-2" />
                  <span>Total: ${booking.pricing.totalPrice}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              DateTime.fromISO(booking.date)
                .setZone(DEFAULT_TZ)
                .plus({ minutes: booking.duration }) > DateTime.now().setZone(DEFAULT_TZ)
                ? 'bg-green-100 text-green-800' 
                : 'bg-slate-100 text-slate-800'}`}
            >
              {DateTime.fromISO(booking.date)
                .setZone(DEFAULT_TZ)
                .plus({ minutes: booking.duration }) > DateTime.now().setZone(DEFAULT_TZ)
                ? 'Upcoming' : 'Past'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
          {user.accountType === 'CLIENT' && provider && (
            <>
              <button
                className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                  text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50"
                onClick={() => window.location.href = `tel:${provider.profile?.phoneNumber}`}
              >
                <Phone className="w-4 h-4 mr-1.5" />
                Call Provider
              </button>
              <button
                className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                  text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50"
                onClick={() => window.location.href = `sms:${provider.profile?.phoneNumber}`}
              >
                <MessageSquare className="w-4 h-4 mr-1.5" />
                Text Provider
              </button>
            </>
          )}

          <button
            onClick={() => handleAddToCalendar(booking)}
            className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
              text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50"
          >
            <Calendar className="w-4 h-4 mr-1.5" />
            Add to Calendar
          </button>

          <button 
            onClick={() => handleCancelBooking(booking._id)}
            className="inline-flex items-center px-3 py-1.5 bg-white border border-red-300
              text-sm font-medium rounded-md text-red-700 hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16"> 
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="p-6">
            <h1 className="text-[40px] leading-tight text-slate-900 mb-6">
              My Bookings
            </h1>

            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-slate-700">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading bookings...
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-900 mb-4">Upcoming Bookings</h2>
                  {upcomingBookings.length > 0 ? (
                    <div className="space-y-4">
                      {upcomingBookings.map(renderBooking)}
                    </div>
                  ) : (
                    <p className="text-slate-500">No upcoming bookings.</p>
                  )}
                  
                  <button
                    onClick={() => setShowPastBookings(!showPastBookings)}
                    className="mt-6 text-slate-500 hover:text-slate-700 text-sm font-medium italic"
                  >
                    {showPastBookings ? 'Hide past bookings' : 'View past bookings'}
                  </button>
                </div>

                {showPastBookings && (
                  <div>
                    <h2 className="text-lg font-medium text-slate-900 mb-4">Past Bookings</h2>
                    {pastBookings.length > 0 ? (
                      <div className="space-y-4">
                        {pastBookings.map(renderBooking)}
                      </div>
                    ) : (
                      <p className="text-slate-500">No past bookings.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingList;
