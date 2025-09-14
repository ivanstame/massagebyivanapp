import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { AuthContext } from '../AuthContext';
import { Calendar, MapPin, Clock, Phone, MessageSquare, AlertTriangle, X, Trash2 } from 'lucide-react';

const ProviderAppointments = () => {
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [pastAppointments, setPastAppointments] = useState([]);
  const [showPastAppointments, setShowPastAppointments] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      setIsLoading(true);
      console.log('=== PROVIDER APPOINTMENTS DEBUG ===');
      console.log('Current user:', user);
      console.log('User ID:', user._id);
      console.log('Account type:', user.accountType);
      
      const response = await axios.get('/api/bookings', {
        withCredentials: true
      });

      console.log('API Response:', response);
      console.log('Response data:', response.data);
      console.log('Response data type:', typeof response.data);
      console.log('Is array?', Array.isArray(response.data));

      if (Array.isArray(response.data)) {
        console.log('Total bookings received:', response.data.length);
        
        // Log the first few bookings to see their structure
        if (response.data.length > 0) {
          console.log('First booking:', response.data[0]);
          console.log('Provider ID in first booking:', response.data[0].provider);
          console.log('Provider type:', typeof response.data[0].provider);
        }

        const now = moment().utc();
        console.log('Current time (UTC):', now.format());
        
        // Filter appointments by provider - fix the comparison
        const providerAppointments = response.data.filter(appointment => {
          // Convert both to strings for comparison
          const appointmentProviderId = appointment.provider?._id || appointment.provider;
          const userProviderId = user._id;
          
          console.log(`Comparing: appointment.provider="${appointmentProviderId}" with user._id="${userProviderId}"`);
          
          // Handle both ObjectId and string comparisons
          const isMatch = String(appointmentProviderId) === String(userProviderId);
          console.log('Match result:', isMatch);
          
          return isMatch;
        });

        console.log('Filtered provider appointments:', providerAppointments.length);
        
        if (providerAppointments.length > 0) {
          console.log('Sample provider appointment:', providerAppointments[0]);
        }

        const upcoming = providerAppointments
          .filter(appointment => {
            const appointmentEnd = moment.utc(appointment.date)
              .set('hour', parseInt(appointment.endTime.split(':')[0]))
              .set('minute', parseInt(appointment.endTime.split(':')[1]));
            const isUpcoming = appointmentEnd.isAfter(now);
            console.log(`Appointment ${appointment._id}: endTime=${appointment.endTime}, isUpcoming=${isUpcoming}`);
            return isUpcoming;
          })
          .sort((a, b) => moment.utc(a.date).diff(moment.utc(b.date)));

        const past = providerAppointments
          .filter(appointment => {
            const appointmentEnd = moment.utc(appointment.date)
              .set('hour', parseInt(appointment.endTime.split(':')[0]))
              .set('minute', parseInt(appointment.endTime.split(':')[1]));
            return appointmentEnd.isSameOrBefore(now);
          })
          .sort((a, b) => moment.utc(b.date).diff(moment.utc(a.date)));

        console.log('Upcoming appointments:', upcoming.length);
        console.log('Past appointments:', past.length);

        setUpcomingAppointments(upcoming);
        setPastAppointments(past);
      } else {
        console.error('Response data is not an array:', response.data);
        setError('Invalid data format received from server');
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
      
      if (error.response) {
        console.error('Error status:', error.response.status);
        console.error('Error data:', error.response.data);
        setError(`Server error: ${error.response.status} - ${error.response.data?.message || error.message}`);
      } else if (error.request) {
        console.error('No response received:', error.request);
        setError('No response from server');
      } else {
        setError(`Error: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment? This action cannot be undone.')) {
      return;
    }

    try {
      console.log('Cancelling appointment:', appointmentId);
      
      const response = await axios.delete(`/api/bookings/${appointmentId}`, {
        withCredentials: true
      });
      
      console.log('Cancel response:', response.data);
      
      // Refresh the appointments list
      await fetchAppointments();
      
      // Show success message (you could add a toast notification here)
      alert('Appointment cancelled successfully');
      
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      
      if (error.response) {
        alert(`Failed to cancel appointment: ${error.response.data?.message || 'Unknown error'}`);
      } else {
        alert('Failed to cancel appointment. Please try again.');
      }
    }
  };

  const renderAppointment = (appointment) => (
    <div
      key={appointment._id}
      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden
        transition duration-200 ease-in-out hover:shadow-md mb-4"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-medium text-slate-900">
              {appointment.client?.profile?.fullName || appointment.client?.email || 'Unknown Client'}
            </h3>
            <div className="mt-2 space-y-2">
              <div className="flex items-center text-slate-600">
                <Calendar className="w-4 h-4 mr-2" />
                <span>{moment(appointment.date).format('dddd, MMMM D, YYYY')}</span>
              </div>
              <div className="flex items-center text-slate-600">
                <Clock className="w-4 h-4 mr-2" />
                <span>
                  {moment(appointment.startTime, 'HH:mm').format('h:mm A')} - 
                  {moment(appointment.endTime, 'HH:mm').format('h:mm A')}
                </span>
              </div>
              <div className="flex items-center text-slate-600">
                <MapPin className="w-4 h-4 mr-2" />
                <span>{appointment.location?.address || 'No address provided'}</span>
              </div>
            </div>
          </div>
          <div className="ml-4">
            <button
              onClick={() => handleCancelAppointment(appointment._id)}
              className="inline-flex items-center px-3 py-2 bg-red-50 border border-red-200
                text-sm font-medium rounded-md text-red-700 hover:bg-red-100 hover:border-red-300
                transition-colors duration-200"
              title="Cancel appointment"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Cancel
            </button>
          </div>
        </div>

        {appointment.client?.profile?.phoneNumber && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
            <button 
              className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50"
              onClick={() => window.location.href = `tel:${appointment.client.profile.phoneNumber}`}
            >
              <Phone className="w-4 h-4 mr-1.5" />
              Call Client
            </button>

            <button 
              className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50"
              onClick={() => window.location.href = `sms:${appointment.client.profile.phoneNumber}`}
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Text Client
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Appointments</h1>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-400">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
                  <div>
                    <p className="text-red-700 font-medium">Error Loading Appointments</p>
                    <p className="text-red-600 text-sm mt-1">{error}</p>
                    <button 
                      onClick={fetchAppointments}
                      className="mt-2 text-sm text-red-700 underline hover:text-red-800"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-slate-600">Loading appointments...</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {upcomingAppointments.length > 0 ? (
                    upcomingAppointments.map(renderAppointment)
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-slate-600">No upcoming appointments</p>
                      <p className="text-sm text-slate-500 mt-2">Check the browser console for debugging information</p>
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => setShowPastAppointments(!showPastAppointments)}
                    className="text-[#387c7e] hover:text-[#2c5f60] font-medium"
                  >
                    {showPastAppointments ? 'Hide' : 'Show'} Past Appointments ({pastAppointments.length})
                  </button>

                  {showPastAppointments && (
                    <div className="mt-4 space-y-4">
                      {pastAppointments.length > 0 ? (
                        pastAppointments.map(renderAppointment)
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-slate-600">No past appointments</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderAppointments;
