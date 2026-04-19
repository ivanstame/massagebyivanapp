import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { AuthContext } from '../AuthContext';
import { Calendar, MapPin, Clock, Phone, MessageSquare, AlertTriangle, Trash2, User as UserIcon, DollarSign, CheckCircle } from 'lucide-react';
import StaticMapPreview from './StaticMapPreview';

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
      const response = await axios.get('/api/bookings', { withCredentials: true });

      if (Array.isArray(response.data)) {
        const now = moment().utc();

        const providerAppointments = response.data.filter(appointment => {
          const appointmentProviderId = appointment.provider?._id || appointment.provider;
          return String(appointmentProviderId) === String(user._id);
        });

        const upcoming = providerAppointments
          .filter(appointment => {
            const appointmentEnd = moment.utc(appointment.date)
              .set('hour', parseInt(appointment.endTime.split(':')[0]))
              .set('minute', parseInt(appointment.endTime.split(':')[1]));
            return appointmentEnd.isAfter(now);
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

        setUpcomingAppointments(upcoming);
        setPastAppointments(past);
      } else {
        setError('Invalid data format received from server');
      }
    } catch (error) {
      if (error.response) {
        setError(`Server error: ${error.response.status} - ${error.response.data?.message || error.message}`);
      } else if (error.request) {
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
      await axios.delete(`/api/bookings/${appointmentId}`, { withCredentials: true });
      await fetchAppointments();
    } catch (error) {
      if (error.response) {
        alert(`Failed to cancel appointment: ${error.response.data?.message || 'Unknown error'}`);
      } else {
        alert('Failed to cancel appointment. Please try again.');
      }
    }
  };

  const handleStatusUpdate = async (appointmentId, newStatus) => {
    try {
      await axios.patch(`/api/bookings/${appointmentId}/status`,
        { status: newStatus },
        { withCredentials: true }
      );
      await fetchAppointments();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleTogglePayment = async (appointmentId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
      await axios.patch(`/api/bookings/${appointmentId}/payment-status`,
        { paymentStatus: newStatus },
        { withCredentials: true }
      );
      await fetchAppointments();
    } catch (error) {
      alert('Failed to update payment status. Please try again.');
    }
  };

  const paymentMethodLabel = (method) => {
    const labels = { cash: 'Cash', zelle: 'Zelle', venmo: 'Venmo', card: 'Card' };
    return labels[method] || method || 'Cash';
  };

  // Get the display name for who's actually receiving the massage
  const getRecipientName = (appointment) => {
    if (appointment.recipientType === 'other' && appointment.recipientInfo?.name) {
      return appointment.recipientInfo.name;
    }
    return appointment.client?.profile?.fullName || appointment.client?.email || 'Unknown Client';
  };

  // Get the booker name (the account holder)
  const getBookerName = (appointment) => {
    // Use bookedBy if available (new bookings), fall back to client profile (old bookings)
    return appointment.bookedBy?.name || appointment.client?.profile?.fullName || appointment.client?.email || '';
  };

  const isBookedForOther = (appointment) => {
    return appointment.recipientType === 'other' && appointment.recipientInfo?.name;
  };

  const renderAppointment = (appointment) => (
    <div
      key={appointment._id}
      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden
        transition-shadow duration-200 ease-in-out hover:shadow-md mb-4"
    >
      <div className="p-4 sm:p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            {/* Recipient name */}
            <div className="flex items-center gap-2 mb-1">
              <UserIcon className="w-4 h-4 text-[#B07A4E]" />
              <span className="text-sm text-slate-500">Massage Recipient</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-medium text-slate-900">
                {getRecipientName(appointment)}
              </h3>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                appointment.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                appointment.status === 'completed' ? 'bg-green-50 text-green-700' :
                appointment.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                appointment.status === 'in-progress' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {appointment.status === 'in-progress' ? 'In Progress' :
                 appointment.status?.charAt(0).toUpperCase() + appointment.status?.slice(1)}
              </span>
            </div>

            {/* Booked by (only shown when booked for someone else) */}
            {isBookedForOther(appointment) && (
              <p className="text-sm text-slate-500 mb-2">
                Booked by: <span className="text-slate-700">{getBookerName(appointment)}</span>
              </p>
            )}

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
              {appointment.location?.lat && appointment.location?.lng && (
                <StaticMapPreview
                  lat={appointment.location.lat}
                  lng={appointment.location.lng}
                  width={280}
                  height={120}
                  className="mt-2"
                />
              )}

              {/* Payment info */}
              {appointment.pricing?.totalPrice > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">
                    ${appointment.pricing.totalPrice.toFixed(2)} — {paymentMethodLabel(appointment.paymentMethod)}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    appointment.paymentStatus === 'paid'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {appointment.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="ml-4 flex flex-col gap-2">
            {/* Status action buttons */}
            {appointment.status === 'pending' && (
              <button
                onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                className="inline-flex items-center px-3 py-2 bg-[#B07A4E] text-white text-sm font-medium rounded-xl hover:bg-[#8A5D36] transition-all duration-200"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Confirm
              </button>
            )}
            {(appointment.status === 'confirmed' || appointment.status === 'in-progress') && (
              <button
                onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                className="inline-flex items-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-all duration-200"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Complete
              </button>
            )}
            {/* Payment toggle */}
            <button
              onClick={() => handleTogglePayment(appointment._id, appointment.paymentStatus)}
              className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-xl transition-all duration-200 ${
                appointment.paymentStatus === 'paid'
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
              title={appointment.paymentStatus === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              {appointment.paymentStatus === 'paid' ? 'Paid' : 'Mark Paid'}
            </button>
            {/* Cancel — only if not already completed/cancelled */}
            {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
              <button
                onClick={() => handleCancelAppointment(appointment._id)}
                className="inline-flex items-center px-3 py-2 bg-red-50 border border-red-200
                  text-sm font-medium rounded-xl text-red-700 hover:bg-red-100 hover:border-red-300
                  transition-all duration-200"
                title="Cancel appointment"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Cancel
              </button>
            )}
          </div>
        </div>

        {appointment.client?.profile?.phoneNumber && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
            <button
              className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                text-sm font-medium rounded-xl text-slate-700 hover:bg-slate-50 transition-all duration-200"
              onClick={() => window.location.href = `tel:${appointment.client.profile.phoneNumber}`}
            >
              <Phone className="w-4 h-4 mr-1.5" />
              Call Client
            </button>

            <button
              className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                text-sm font-medium rounded-xl text-slate-700 hover:bg-slate-50 transition-all duration-200"
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
        <div className="bg-white shadow-sm rounded-xl overflow-hidden">
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
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => setShowPastAppointments(!showPastAppointments)}
                    className="text-[#B07A4E] hover:text-[#8A5D36] font-medium"
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
