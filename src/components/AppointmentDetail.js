import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { DateTime } from 'luxon';
import {
  ArrowLeft, Calendar, Clock, MapPin, User, Phone,
  DollarSign, Trash2, AlertCircle, Tag, Plus, Banknote, CheckCircle,
  PlayCircle, CircleCheck, Loader2, CalendarClock
} from 'lucide-react';
import StaticMapPreview from './StaticMapPreview';
import NavigateButton from './NavigateButton';
import RescheduleModal from './RescheduleModal';
import { buildVenmoPayUrl } from '../utils/venmo';
import { buildStandingRequestSmsLink } from '../utils/standingAppointmentRequest';

const AppointmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // For series bookings, the cancel confirm UI offers three scopes:
  //   'one'        → just this occurrence
  //   'following'  → this + every later occurrence on the series
  //   'all'        → also cancel the series rule itself
  const [cancelScope, setCancelScope] = useState('one');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  // Provider's private session note. Free-form, optional, capped at
  // 5000 chars by the schema. Local edit state keeps the textarea
  // responsive; commit on blur or explicit save.
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedFlash, setNoteSavedFlash] = useState(false);
  const [noteError, setNoteError] = useState(null);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const res = await axios.get(`/api/bookings/${id}`, { withCredentials: true });
        setBooking(res.data);
        setNoteDraft(res.data?.providerNote || '');
      } catch (err) {
        console.error('Error fetching booking:', err);
        setError(err.response?.data?.message || 'Failed to load appointment');
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  const handleSaveNote = async () => {
    setNoteSaving(true);
    setNoteError(null);
    try {
      const next = noteDraft.trim() || null;
      const res = await axios.patch(
        `/api/bookings/${id}/note`,
        { providerNote: next },
        { withCredentials: true }
      );
      setBooking(prev => prev ? { ...prev, providerNote: res.data.providerNote } : prev);
      setNoteSavedFlash(true);
      setTimeout(() => setNoteSavedFlash(false), 2500);
    } catch (err) {
      setNoteError(err.response?.data?.message || 'Failed to save note');
    } finally {
      setNoteSaving(false);
    }
  };

  const noteIsDirty = booking
    ? (noteDraft.trim() || null) !== ((booking.providerNote || '').trim() || null)
    : false;

  const handleCancel = async () => {
    try {
      setCancelling(true);
      const url = booking?.series && cancelScope !== 'one'
        ? `/api/bookings/${id}?scope=${cancelScope}`
        : `/api/bookings/${id}`;
      await axios.delete(url, { withCredentials: true });
      navigate(-1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel appointment');
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      setUpdatingStatus(true);
      const res = await axios.patch(`/api/bookings/${id}/status`,
        { status: newStatus },
        { withCredentials: true }
      );
      setBooking(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
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
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink transition mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header — date eyebrow + serif time headline */}
        <div className="mb-6">
          <div className="av-eyebrow mb-2">
            {booking.localDate
              ? DateTime.fromISO(booking.localDate).toFormat('cccc, LLLL d').toLowerCase()
              : 'Appointment'}
          </div>
          <div className="flex justify-between items-start">
            <h1 className="font-display" style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {booking.startTime ? (() => {
                const t = formatTime(booking.startTime);
                const parts = t.split(' ');
                return <>{parts[0]} <em style={{ color: '#B07A4E' }}>{(parts[1] || '').toLowerCase()}</em></>;
              })() : 'Appointment'}
            </h1>
            <span className={`av-meta px-2.5 py-1 rounded-full border border-line text-ink-2 ${statusColor(booking.status)}`}
              style={{ fontSize: 10 }}>
              {(() => {
                // Schema-level enum is still "pending"; the user-facing
                // label reads "Tentative" since "pending" is ambiguous
                // ("pending what — payment? approval?").
                const label = booking.status === 'pending' ? 'tentative' : booking.status;
                return label.charAt(0).toUpperCase() + label.slice(1);
              })()}
            </span>
          </div>
          <div className="text-sm text-ink-2 mt-1">
            {booking.duration} minutes{booking.serviceType?.name ? ` · ${booking.serviceType.name.toLowerCase()}` : ''}
          </div>
        </div>

        {/* Card */}
        <div className="bg-paper-elev rounded-xl border border-line shadow-sm divide-y divide-line-soft">
          {/* Date & Time */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#B07A4E]" />
              <div>
                <p className="text-sm text-slate-500">Date</p>
                <p className="font-medium text-slate-900">{formatDate(booking.localDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-[#B07A4E]" />
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
                  <User className="w-5 h-5 text-[#B07A4E]" />
                  <div>
                    <p className="text-sm text-slate-500">Massage Recipient</p>
                    <p className="font-medium text-slate-900">{booking.recipientInfo.name}</p>
                  </div>
                </div>
                {booking.recipientInfo.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-[#B07A4E]" />
                    <div>
                      <p className="text-sm text-slate-500">Recipient Phone</p>
                      <a href={`tel:${booking.recipientInfo.phone}`} className="font-medium text-[#B07A4E] hover:underline">
                        {booking.recipientInfo.phone}
                      </a>
                    </div>
                  </div>
                )}
                <div className="ml-8 p-2 bg-paper-deep rounded-lg text-sm">
                  <p className="text-slate-500">
                    Booked by: <span className="text-slate-700 font-medium">
                      {booking.bookedBy?.name || otherParty?.profile?.fullName || otherParty?.email}
                    </span>
                  </p>
                  {otherParty?.profile?.phoneNumber && (
                    <p className="text-slate-500 mt-0.5">
                      Account holder phone: <a href={`tel:${otherParty.profile.phoneNumber}`} className="text-[#B07A4E] hover:underline">{otherParty.profile.phoneNumber}</a>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-[#B07A4E]" />
                  <div>
                    <p className="text-sm text-slate-500">{isProvider ? 'Massage Recipient' : otherPartyLabel}</p>
                    <p className="font-medium text-slate-900">
                      {otherParty?.profile?.fullName || otherParty?.email || 'Unknown'}
                    </p>
                  </div>
                </div>
                {otherParty?.profile?.phoneNumber && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-[#B07A4E]" />
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <a
                        href={`tel:${otherParty.profile.phoneNumber}`}
                        className="font-medium text-[#B07A4E] hover:underline"
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
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <MapPin className="w-5 h-5 text-[#B07A4E] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">Location</p>
                  <p className="font-medium text-slate-900">{booking.location?.address || 'No address'}</p>
                </div>
              </div>
              <NavigateButton location={booking.location} />
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

          {/* Service details */}
          {(booking.serviceType || (booking.addons && booking.addons.length > 0)) && (
            <div className="p-4 space-y-3">
              {booking.serviceType && (
                <div className="flex items-center gap-3">
                  <Tag className="w-5 h-5 text-[#B07A4E]" />
                  <div>
                    <p className="text-sm text-slate-500">Service</p>
                    <p className="font-medium text-slate-900">{booking.serviceType.name}</p>
                  </div>
                </div>
              )}
              {booking.addons && booking.addons.length > 0 && (
                <div className="flex items-start gap-3">
                  <Plus className="w-5 h-5 text-[#B07A4E] mt-0.5" />
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
                <DollarSign className="w-5 h-5 text-[#B07A4E]" />
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
              <Banknote className="w-5 h-5 text-[#B07A4E]" />
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
                    className={`ml-2 px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      booking.paymentStatus === 'paid'
                        ? 'border-line text-slate-600 hover:bg-paper-deep'
                        : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    {booking.paymentStatus === 'paid' ? 'Mark Unpaid' : 'Mark as Paid'}
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const providerVenmoHandle = booking.provider?.providerProfile?.venmoHandle;
              if (
                booking.paymentMethod !== 'venmo' ||
                booking.paymentStatus === 'paid' ||
                booking.status === 'cancelled' ||
                !providerVenmoHandle ||
                isProvider
              ) return null;

              const total = booking.pricing?.totalPrice || 0;
              const serviceLabel = booking.serviceType?.name || `${booking.duration} min service`;
              const providerName = booking.provider?.providerProfile?.businessName;
              const dateLabel = booking.localDate || '';
              const note = [serviceLabel, dateLabel, providerName ? `w/ ${providerName}` : null]
                .filter(Boolean).join(' · ');
              const venmoUrl = buildVenmoPayUrl(providerVenmoHandle, total, note);
              if (!venmoUrl) return null;

              return (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Before paying, confirm <span className="font-semibold">@{providerVenmoHandle}</span>
                    {' '}matches your provider&rsquo;s actual Venmo profile. We can&rsquo;t verify
                    Venmo accounts on our end.
                  </p>
                  <a
                    href={venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full bg-[#3D95CE] text-white py-2.5 px-4 rounded-lg hover:bg-[#2C7FB3] font-medium text-sm transition-colors"
                  >
                    Pay ${total} to @{providerVenmoHandle} on Venmo &rarr;
                  </a>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Session notes — provider only. Free-form, optional. The
            provider can write whatever format they prefer (SOAP,
            narrative, bullets, nothing); shows up in this client's
            session timeline at /provider/clients/:id. Save is explicit
            so an in-progress edit doesn't post on every keystroke. */}
        {isProvider && (
          <div className="mt-6 bg-paper-elev border border-line rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-800">Session notes</h3>
              <span className="text-xs text-slate-400">
                {noteDraft.length}/5000 · private to you
              </span>
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, 5000))}
              placeholder="What you want to remember about this session — pressure, focus areas, follow-up notes, whatever helps. Free-form. Only you can see this."
              rows={5}
              className="w-full p-3 border border-line rounded text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs">
                {noteError && <span className="text-red-600">{noteError}</span>}
                {noteSavedFlash && <span className="text-green-700">Saved.</span>}
              </div>
              <button
                onClick={handleSaveNote}
                disabled={!noteIsDirty || noteSaving}
                className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                  noteIsDirty && !noteSaving
                    ? 'bg-[#B07A4E] text-white hover:bg-[#8A5D36]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {noteSaving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        )}

        {/* "Make this recurring?" prompt — client only, on a live
            non-series booking. Opens an SMS to the provider with a
            pre-filled proposal based on this booking's day/time/
            duration. The conversation happens in the SMS thread; the
            provider sets up the standing appointment in Avayble when
            they're ready. Hidden when the provider has no phone or
            this booking is already part of a series. */}
        {!isProvider && booking.status !== 'cancelled' && !booking.series && (() => {
          const link = buildStandingRequestSmsLink({
            providerPhone: booking.provider?.profile?.phoneNumber,
            providerName: booking.provider?.providerProfile?.businessName
              || booking.provider?.profile?.fullName,
            clientName: booking.client?.profile?.fullName || user?.profile?.fullName,
            date: booking.localDate,
            time: booking.startTime,
            duration: booking.duration,
          });
          if (!link) return null;
          const providerFirst = (booking.provider?.providerProfile?.businessName
            || booking.provider?.profile?.fullName || 'your provider').split(' ')[0];
          return (
            <div className="mt-6 p-4 bg-paper-deep border border-line-soft rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-1">
                Want this on a regular schedule?
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Send {providerFirst} a quick text — they'll set it up on their end.
              </p>
              <a
                href={link}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36]"
              >
                <CalendarClock className="w-4 h-4" />
                Ask about a standing appointment →
              </a>
            </div>
          );
        })()}

        {/* Status Actions — Provider only */}
        {isProvider && booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="mt-6 flex gap-3">
            {booking.status === 'pending' && (
              <button
                onClick={() => handleStatusUpdate('confirmed')}
                disabled={updatingStatus}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#B07A4E] text-white rounded-lg font-medium hover:bg-[#8A5D36] disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirm
              </button>
            )}
            {booking.status === 'confirmed' && (
              <>
                <button
                  onClick={() => handleStatusUpdate('in-progress')}
                  disabled={updatingStatus}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Start Session
                </button>
                <button
                  onClick={() => handleStatusUpdate('completed')}
                  disabled={updatingStatus}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
                  Complete
                </button>
              </>
            )}
            {booking.status === 'in-progress' && (
              <button
                onClick={() => handleStatusUpdate('completed')}
                disabled={updatingStatus}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
                Mark Completed
              </button>
            )}
          </div>
        )}

        {/* Reschedule button — only when the appointment is still in
            pending/confirmed status. The server endpoint enforces this
            too; we hide the affordance to avoid a dead-click. */}
        {['pending', 'confirmed'].includes(booking.status) && (
          <div className="mt-6">
            <button
              onClick={() => setShowReschedule(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-[#B07A4E]/40 text-[#B07A4E] rounded-lg hover:bg-[#B07A4E]/5 transition-colors font-medium"
            >
              <CalendarClock className="w-4 h-4" />
              Reschedule
            </button>
          </div>
        )}

        {/* Cancel button */}
        {booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="mt-6">
            {showCancelConfirm ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 mb-3">
                  Are you sure you want to cancel this appointment? This cannot be undone.
                </p>

                {/* Chain disclosure — if this booking is part of a back-
                    to-back chain (couple's massage / multi-recipient),
                    same-time siblings always cancel together. The server
                    enforces this; we just surface it so the user knows. */}
                {booking.groupId && (
                  <div className="mb-3 p-2 bg-paper-deep border border-line rounded text-xs text-slate-700">
                    This is part of a back-to-back chain. The other session{booking.isLastInGroup ? '' : 's'} at this address will be cancelled too.
                  </div>
                )}

                {/* Series-scope picker — only shown when this booking is
                    part of a recurring series. Default 'one' so the
                    behavior matches the old single-cancel flow. */}
                {booking.series && (
                  <div className="mb-3 space-y-1.5">
                    <p className="text-xs font-medium text-red-700 mb-1">This is part of a standing appointment:</p>
                    <label className="flex items-start gap-2 text-sm text-red-800 cursor-pointer">
                      <input
                        type="radio"
                        name="cancelScope"
                        value="one"
                        checked={cancelScope === 'one'}
                        onChange={(e) => setCancelScope(e.target.value)}
                        className="mt-0.5"
                      />
                      <span>Cancel just this occurrence</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-red-800 cursor-pointer">
                      <input
                        type="radio"
                        name="cancelScope"
                        value="following"
                        checked={cancelScope === 'following'}
                        onChange={(e) => setCancelScope(e.target.value)}
                        className="mt-0.5"
                      />
                      <span>Cancel this and all following occurrences</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-red-800 cursor-pointer">
                      <input
                        type="radio"
                        name="cancelScope"
                        value="all"
                        checked={cancelScope === 'all'}
                        onChange={(e) => setCancelScope(e.target.value)}
                        className="mt-0.5"
                      />
                      <span>End the entire series (including this one)</span>
                    </label>
                  </div>
                )}

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
                    className="flex-1 py-2 px-4 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-paper-deep"
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

      {showReschedule && booking && (
        <RescheduleModal
          booking={booking}
          onSuccess={(updated) => {
            // The server returns the rescheduled booking, but it may
            // not have the same populated shape as our initial fetch
            // (provider/client refs deeply populated, etc.). Easiest
            // path: re-fetch by id so the UI shows fresh, fully-
            // populated data.
            setBooking(updated && updated._id ? { ...booking, ...updated } : booking);
            (async () => {
              try {
                const res = await axios.get(`/api/bookings/${id}`, { withCredentials: true });
                setBooking(res.data);
              } catch (e) {
                // Non-fatal — local merge above is good enough.
              }
            })();
          }}
          onClose={() => setShowReschedule(false)}
        />
      )}
    </div>
  );
};

export default AppointmentDetail;
