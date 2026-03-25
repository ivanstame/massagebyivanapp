import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { DateTime } from 'luxon';
import {
  ArrowLeft, Calendar, Clock, MapPin, User, Phone,
  DollarSign, Trash2, AlertCircle, Tag, Plus, Banknote, CheckCircle
} from 'lucide-react';
import StaticMapPreview from './StaticMapPreview';

const AppointmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const res = await axios.get(`/api/bookings/${id}`, { withCredentials: true });
        setBooking(res.data);
      } catch (err) {
        console.error('Error fetching booking:', err);
        setError(err.response?.data?.message || 'Failed to load appointment');
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await axios.delete(`/api/bookings/${id}`, { withCredentials: true });
      navigate(-1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel appointment');
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const handleTogglePayment = async () => {
    try {
      const newStatus = booking.paymentStatus === 'paid' ? 'unpaid' : 'paid';
      const res = await axios.patch(`/api/bookings/${id}/payment-status`,
        { paymentStatus: newStatus },
        { withCredentials: true }
      );
      setBooking(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update payment status');
    }
  };

  const paymentMethodLabel = (method) => {
    const labels = { cash: 'Cash', zelle: 'Zelle', venmo: 'Venmo', card: 'Card' };
    return labels[method] || method || 'Cash';
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const dt = DateTime.now().set({ hour: h, minute: m });
    return dt.toFormat('h:mm a');
  };

  const formatDate = (localDate) => {
    if (!localDate) return '';
    return DateTime.fromISO(localDate).toFormat('cccc, LLLL d, yyyy');
  };

  const statusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'in-progress': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading appointment...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-16 max-w-lg mx-auto p-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 font-medium">{error}</p>
            <button onClick={() => navigate(-1)} className="mt-2 text-sm text-red-600 underline">
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const isProvider = user?.accountType === 'PROVIDER';
  const otherParty = isProvider ? booking.client : booking.provider;
  const otherPartyLabel = isProvider ? 'Client' : 'Therapist';

  return (
    <div className="pt-16">
      <div className="max-w-lg mx-auto p-4">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900">Appointment Details</h1>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColor(booking.status)}`}>
            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {/* Date & Time */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#009ea5]" />
              <div>
                <p className="text-sm text-slate-500">Date</p>
                <p className="font-medium text-slate-900">{formatDate(booking.localDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-[#009ea5]" />
              <div>
                <p className="text-sm text-slate-500">Time</p>
                <p className="font-medium text-slate-900">
                  {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                  <span className="text-sm text-slate-500 ml-2">({booking.duration} min)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Person */}
          <div className="p-4 space-y-3">
            {/* For provider view: show recipient prominently */}
            {isProvider && booking.recipientType === 'other' && booking.recipientInfo ? (
              <>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-[#009ea5]" />
                  <div>
                    <p className="text-sm text-slate-500">Massage Recipient</p>
                    <p className="font-medium text-slate-900">{booking.recipientInfo.name}</p>
                  </div>
                </div>
                {booking.recipientInfo.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-[#009ea5]" />
                    <div>
                      <p className="text-sm text-slate-500">Recipient Phone</p>
                      <a href={`tel:${booking.recipientInfo.phone}`} className="font-medium text-[#009ea5] hover:underline">
                        {booking.recipientInfo.phone}
                      </a>
                    </div>
                  </div>
                )}
                <div className="ml-8 p-2 bg-slate-50 rounded-lg text-sm">
                  <p className="text-slate-500">
                    Booked by: <span className="text-slate-700 font-medium">
                      {booking.bookedBy?.name || otherParty?.profile?.fullName || otherParty?.email}
                    </span>
                  </p>
                  {otherParty?.profile?.phoneNumber && (
                    <p className="text-slate-500 mt-0.5">
                      Account holder phone: <a href={`tel:${otherParty.profile.phoneNumber}`} className="text-[#009ea5] hover:underline">{otherParty.profile.phoneNumber}</a>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-[#009ea5]" />
                  <div>
                    <p className="text-sm text-slate-500">{isProvider ? 'Massage Recipient' : otherPartyLabel}</p>
                    <p className="font-medium text-slate-900">
                      {otherParty?.profile?.fullName || otherParty?.email || 'Unknown'}
                    </p>
                  </div>
                </div>
                {otherParty?.profile?.phoneNumber && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-[#009ea5]" />
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <a
                        href={`tel:${otherParty.profile.phoneNumber}`}
                        className="font-medium text-[#009ea5] hover:underline"
                      >
                        {otherParty.profile.phoneNumber}
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* For client view: still show recipient info if booked for other */}
            {!isProvider && booking.recipientType === 'other' && booking.recipientInfo && (
              <div className="ml-8 p-2 bg-amber-50 rounded-lg text-sm">
                <p className="text-amber-700 font-medium">Booked for:</p>
                <p className="text-amber-800">{booking.recipientInfo.name}</p>
                {booking.recipientInfo.phone && (
                  <p className="text-amber-600">{booking.recipientInfo.phone}</p>
                )}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <MapPin className="w-5 h-5 text-[#009ea5]" />
              <div>
                <p className="text-sm text-slate-500">Location</p>
                <p className="font-medium text-slate-900">{booking.location?.address || 'No address'}</p>
              </div>
            </div>
            {booking.location?.lat && booking.location?.lng && (
              <StaticMapPreview
                lat={booking.location.lat}
                lng={booking.location.lng}
                width={440}
                height={180}
                zoom={15}
                className="w-full"
              />
            )}
          </div>

          {/* Massage details */}
          {(booking.massageType || (booking.addons && booking.addons.length > 0)) && (
            <div className="p-4 space-y-3">
              {booking.massageType && (
                <div className="flex items-center gap-3">
                  <Tag className="w-5 h-5 text-[#009ea5]" />
                  <div>
                    <p className="text-sm text-slate-500">Massage Type</p>
                    <p className="font-medium text-slate-900">{booking.massageType.name}</p>
                  </div>
                </div>
              )}
              {booking.addons && booking.addons.length > 0 && (
                <div className="flex items-start gap-3">
                  <Plus className="w-5 h-5 text-[#009ea5] mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Add-ons</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {booking.addons.map((addon, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full">
                          {addon.name} {addon.price > 0 && `(+$${addon.price})`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pricing */}
          {booking.pricing && booking.pricing.totalPrice > 0 && (
            <div className="p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-[#009ea5]" />
                <div>
                  <p className="text-sm text-slate-500">Total Price</p>
                  <p className="font-medium text-slate-900 text-lg">${booking.pricing.totalPrice.toFixed(2)}</p>
                  {booking.pricing.addonsPrice > 0 && (
                    <p className="text-xs text-slate-500">
                      Base: ${booking.pricing.basePrice.toFixed(2)} + Add-ons: ${booking.pricing.addonsPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Banknote className="w-5 h-5 text-[#009ea5]" />
              <div>
                <p className="text-sm text-slate-500">Payment Method</p>
                <p className="font-medium text-slate-900">{paymentMethodLabel(booking.paymentMethod)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className={`w-5 h-5 ${booking.paymentStatus === 'paid' ? 'text-green-500' : 'text-amber-500'}`} />
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm text-slate-500">Payment Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    booking.paymentStatus === 'paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {booking.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
                {isProvider && booking.status !== 'cancelled' && (
                  <button
                    onClick={handleTogglePayment}
                    className={`ml-2 px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                      booking.paymentStatus === 'paid'
                        ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    {booking.paymentStatus === 'paid' ? 'Mark Unpaid' : 'Mark as Paid'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cancel button */}
        {booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="mt-6">
            {showCancelConfirm ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 mb-3">
                  Are you sure you want to cancel this appointment? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:bg-red-400"
                  >
                    {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="flex-1 py-2 px-4 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                  >
                    Keep It
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Cancel Appointment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentDetail;
