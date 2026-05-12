import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { DateTime } from 'luxon';
import {
  ArrowLeft, Calendar, Clock, MapPin, User, Phone, ChevronDown,
  DollarSign, Trash2, AlertCircle, Tag, Plus, Banknote, CheckCircle,
  PlayCircle, CircleCheck, Loader2, CalendarClock
} from 'lucide-react';
import StaticMapPreview from './StaticMapPreview';
import NavigateButton from './NavigateButton';
import RescheduleModal from './RescheduleModal';
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
  // Quick-push: bumps start time by N minutes via the same /reschedule
  // endpoint. Server validates against drive time and adjacent bookings;
  // refusal is surfaced inline as a transient error.
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(null);
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

  // Tip + refund modal state. Both surface inline on the payment card
  // so the provider can record either without leaving the page.
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipInput, setTipInput] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundInput, setRefundInput] = useState('');

  const openTipModal = () => {
    setTipInput(booking?.tipAmount ? String(booking.tipAmount) : '');
    setShowTipModal(true);
  };
  const saveTip = async () => {
    try {
      const amt = parseFloat(tipInput);
      if (!Number.isFinite(amt) || amt < 0) {
        setError('Tip must be a non-negative number');
        return;
      }
      const res = await axios.patch(`/api/bookings/${id}/tip`,
        { tipAmount: amt }, { withCredentials: true });
      setBooking(res.data);
      setShowTipModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save tip');
    }
  };

  const openRefundModal = () => {
    const defaultAmount = (booking?.pricing?.totalPrice || 0) + (booking?.tipAmount || 0);
    setRefundInput(String(defaultAmount));
    setShowRefundModal(true);
  };
  const saveRefund = async () => {
    try {
      const amt = parseFloat(refundInput);
      if (!Number.isFinite(amt) || amt <= 0) {
        setError('Refund amount must be greater than 0');
        return;
      }
      if (!window.confirm(`Record a $${amt.toFixed(2)} refund on this booking? This is a record-keeping action — if it was a card payment, you still need to issue the refund manually in Stripe.`)) return;
      const res = await axios.post(`/api/bookings/${id}/refund`,
        { refundedAmount: amt }, { withCredentials: true });
      setBooking(res.data);
      setShowRefundModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record refund');
    }
  };

  const paymentMethodLabel = (method) => {
    const labels = {
      cash: 'Cash',
      check: 'Check',
      paymentApp: 'Payment app',
      card: 'Card',
      package: 'Package credit',
    };
    return labels[method] || method || 'Cash';
  };

  // ─── Change payment method (provider-only) ───────────────────────
  // Used when the booking was recorded with the wrong method — most
  // commonly cash recorded but the client meant to use their package.
  // The server-side endpoint handles the atomic swap (returning the
  // old credit if applicable, reserving the new one if applicable).
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [eligiblePackages, setEligiblePackages] = useState([]);
  const [eligiblePackagesLoading, setEligiblePackagesLoading] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState('cash');
  const [editPackageId, setEditPackageId] = useState(null);
  const [editPackageMinutes, setEditPackageMinutes] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  // Fetch packages owned by this booking's client when the modal
  // opens. Only paid + non-cancelled + with remaining balance count;
  // sessions-mode packages must match the booking duration exactly.
  useEffect(() => {
    if (!showPaymentMethodModal || !booking?.client?._id) return;
    let cancelled = false;
    (async () => {
      setEligiblePackagesLoading(true);
      try {
        const res = await axios.get(`/api/packages/client/${booking.client._id}`, {
          withCredentials: true,
        });
        if (cancelled) return;
        const eligible = (res.data || []).filter(p => {
          if (p.paymentStatus !== 'paid' || p.cancelledAt) return false;
          if (p.kind === 'minutes') {
            return (p.minutesRemaining || 0) > 0;
          }
          // sessions-mode: must match this booking's duration exactly
          return p.sessionDuration === booking.duration && (p.sessionsRemaining || 0) > 0;
        });
        setEligiblePackages(eligible);
      } catch (err) {
        console.error('Failed to load eligible packages:', err);
        if (!cancelled) setEligiblePackages([]);
      } finally {
        if (!cancelled) setEligiblePackagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showPaymentMethodModal, booking?.client?._id, booking?.duration]);

  const openPaymentMethodModal = () => {
    setEditPaymentMethod(booking?.paymentMethod === 'package' ? 'package' : (booking?.paymentMethod || 'cash'));
    setEditPackageId(booking?.packageRedemption?.packagePurchase || null);
    setEditPackageMinutes(booking?.packageRedemption?.minutesApplied || null);
    setEditError(null);
    setShowPaymentMethodModal(true);
  };

  const submitPaymentMethodChange = async () => {
    setEditSubmitting(true);
    setEditError(null);
    try {
      const body = { paymentMethod: editPaymentMethod };
      if (editPaymentMethod === 'package') {
        if (!editPackageId) {
          throw new Error('Pick a package to redeem against.');
        }
        body.packagePurchaseId = editPackageId;
        if (editPackageMinutes != null) {
          body.packageMinutesApplied = editPackageMinutes;
        }
      }
      const res = await axios.patch(`/api/bookings/${id}/payment-method`, body, {
        withCredentials: true,
      });
      setBooking(res.data);
      setShowPaymentMethodModal(false);
    } catch (err) {
      setEditError(
        err.response?.data?.message
        || err.message
        || 'Failed to change payment method'
      );
    } finally {
      setEditSubmitting(false);
    }
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
      <div className="max-w-lg mx-auto px-3 sm:px-5 py-8">
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
            <h1 className="font-display" style={{ fontSize: "2.25rem", lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {booking.startTime ? (() => {
                const t = formatTime(booking.startTime);
                const parts = t.split(' ');
                return <>{parts[0]} <em style={{ color: '#B07A4E' }}>{(parts[1] || '').toLowerCase()}</em></>;
              })() : 'Appointment'}
            </h1>
            <span className={`av-meta px-2.5 py-1 rounded-full border border-line text-ink-2 ${statusColor(booking.status)}`}
              style={{ fontSize: "0.625rem" }}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
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
              <div className="flex-1">
                <p className="text-sm text-slate-500">Payment Method</p>
                <p className="font-medium text-slate-900">
                  {paymentMethodLabel(booking.paymentMethod)}
                  {booking.packageRedemption?.packagePurchase && booking.packageRedemption?.minutesApplied && (
                    booking.packageRedemption.minutesApplied < booking.duration ? (
                      <span className="ml-2 text-xs text-slate-500">
                        ({booking.packageRedemption.minutesApplied} min from package + remainder via {paymentMethodLabel(booking.paymentMethod)})
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-slate-500">
                        ({booking.packageRedemption.minutesApplied} min from package)
                      </span>
                    )
                  )}
                </p>
                {/* Per-minute breakdown for partial-redemption bookings.
                    Surfaces the math the provider needs to see: how the
                    package portion's value was derived from the original
                    purchase, plus the secondary cash side. Only render
                    when the breakdown carries non-trivial split info
                    (skip for full-package and pure-cash bookings; their
                    payment-method line above already says enough). */}
                {booking.paymentBreakdown
                  && booking.paymentBreakdown.minutesFromPackage > 0
                  && !booking.paymentBreakdown.fullyCoveredByPackage
                  && (
                  <div className="mt-2 p-2.5 bg-paper-deep rounded-md border border-line text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>
                        {booking.paymentBreakdown.minutesFromPackage} min from
                        {booking.paymentBreakdown.packageName ? ` "${booking.paymentBreakdown.packageName}"` : ' package'}
                        {' '}@ ${(booking.paymentBreakdown.perMinuteCents / 100).toFixed(2)}/min
                      </span>
                      <span className="font-medium text-slate-900">
                        ${(booking.paymentBreakdown.fromPackageCents / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>
                        {booking.paymentBreakdown.minutesFromOther} min via {paymentMethodLabel(booking.paymentMethod)}
                      </span>
                      <span className="font-medium text-slate-900">
                        ${(booking.paymentBreakdown.fromOtherCents / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-line text-slate-900 font-semibold">
                      <span>Total</span>
                      <span>${(booking.paymentBreakdown.totalCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
              {isProvider && booking.status !== 'cancelled' && (
                <button
                  onClick={openPaymentMethodModal}
                  className="text-xs font-medium text-[#B07A4E] hover:text-[#8A5D36] px-2 py-1 rounded-lg hover:bg-[#B07A4E]/10"
                >
                  Change
                </button>
              )}
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

            {/* Tip + refund row — provider-only, record-keeping for the
                income reports. Tip counts as separate income on the day
                collected; refund counts as negative income on the day
                issued. */}
            {isProvider && booking.status !== 'cancelled' && (
              <div className="flex items-center gap-3 pt-3 border-t border-line">
                <div className="flex-1">
                  <p className="text-xs text-slate-500">Tip</p>
                  <p className="text-sm font-medium text-slate-900">
                    {booking.tipAmount > 0
                      ? `$${Number(booking.tipAmount).toFixed(2)}`
                      : <span className="text-slate-400 font-normal">None recorded</span>}
                  </p>
                </div>
                <button
                  onClick={openTipModal}
                  className="text-xs font-medium text-[#B07A4E] hover:text-[#8A5D36] px-3 py-1.5 rounded-lg hover:bg-[#B07A4E]/10"
                >
                  {booking.tipAmount > 0 ? 'Edit tip' : 'Record tip'}
                </button>
                {booking.refundedAmount > 0 ? (
                  <div className="text-xs text-red-700 font-medium px-2 py-1 bg-red-50 rounded">
                    Refunded ${Number(booking.refundedAmount).toFixed(2)}
                  </div>
                ) : (
                  <button
                    onClick={openRefundModal}
                    className="text-xs font-medium text-red-700 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50"
                    title="Record a refund (for tax records)"
                  >
                    Refund
                  </button>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Tip modal */}
        {showTipModal && (
          <div className="fixed inset-0 bg-slate-600/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTipModal(false)}>
            <div className="bg-paper-elev rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Record tip</h3>
              <p className="text-xs text-slate-500 mb-3">
                Counted as separate income on the day the booking was paid. Same payment method as the base session.
              </p>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={tipInput}
                onChange={(e) => setTipInput(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent text-lg"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowTipModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
                <button onClick={saveTip} className="px-4 py-2 bg-[#B07A4E] hover:bg-[#8A5D36] text-white rounded-lg text-sm font-medium">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Refund modal */}
        {showRefundModal && (
          <div className="fixed inset-0 bg-slate-600/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRefundModal(false)}>
            <div className="bg-paper-elev rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Record refund</h3>
              <p className="text-xs text-slate-500 mb-3">
                Record-keeping only — if this was a card payment, you'll still need to issue the actual refund through Stripe.
                Counted as negative income on today's date.
              </p>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={refundInput}
                onChange={(e) => setRefundInput(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-lg"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowRefundModal(false)} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
                <button onClick={saveRefund} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium">Record refund</button>
              </div>
            </div>
          </div>
        )}

        {/* Session notes — provider only. Free-form, optional. The
            provider can write whatever format they prefer (SOAP,
            narrative, bullets, nothing); shows up in this client's
            session timeline at /provider/clients/:id. Save is explicit
            so an in-progress edit doesn't post on every keystroke. */}
        {isProvider && (
          <div className="mt-6 bg-paper-elev border border-line rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-800">Session notes</h3>
              <span className="text-xs text-slate-500">
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
                    : 'bg-slate-100 text-slate-500 cursor-not-allowed'
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

        {/* Reschedule + Push — only when the appointment isn't done.
            Server enforces the same gate; this just hides a dead-click. */}
        {!['cancelled', 'completed'].includes(booking.status) && (
          <div className="mt-6 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowReschedule(true)}
                className="flex items-center justify-center gap-2 py-2.5 px-4 border border-[#B07A4E]/40 text-[#B07A4E] rounded-lg hover:bg-[#B07A4E]/5 transition-colors font-medium"
              >
                <CalendarClock className="w-4 h-4" />
                Reschedule
              </button>
              <div className="relative">
                <button
                  onClick={() => setPushMenuOpen(o => !o)}
                  disabled={pushBusy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-[#B07A4E]/40 text-[#B07A4E] rounded-lg hover:bg-[#B07A4E]/5 transition-colors font-medium disabled:opacity-60"
                >
                  {pushBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Push
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {pushMenuOpen && !pushBusy && (
                  <div className="absolute right-0 left-0 top-full mt-1 z-20 bg-paper-elev border border-line rounded-lg shadow-lg py-1">
                    {[15, 30, 45, 60].map(min => (
                      <button
                        key={min}
                        onClick={async () => {
                          setPushMenuOpen(false);
                          setPushBusy(true);
                          setPushError(null);
                          try {
                            const [h, m] = (booking.startTime || '00:00').split(':').map(Number);
                            const total = h * 60 + m + min;
                            if (total >= 24 * 60) throw new Error('Would push past midnight.');
                            const newTime = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
                            const res = await axios.put(
                              `/api/bookings/${booking._id}/reschedule`,
                              { date: booking.localDate, time: newTime },
                              { withCredentials: true }
                            );
                            const refresh = await axios.get(`/api/bookings/${booking._id}`, { withCredentials: true });
                            setBooking(refresh.data || res.data);
                          } catch (err) {
                            setPushError(err.response?.data?.message || err.message || 'Could not push this appointment.');
                            setTimeout(() => setPushError(null), 6000);
                          } finally {
                            setPushBusy(false);
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-paper-deep"
                      >
                        Push by {min === 60 ? '1 hour' : `${min} min`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {pushError && (
              <div className="p-2 bg-red-50 border-l-2 border-red-400 rounded text-xs text-red-700 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{pushError}</span>
              </div>
            )}
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

      {/* Change payment method modal — provider-only. The "Carrie
          paid cash but should've used her package minutes" reconcile
          flow. Edits run through PATCH /:id/payment-method which
          handles atomic redemption swaps server-side. */}
      {showPaymentMethodModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPaymentMethodModal(false)}
        >
          <div className="bg-paper-elev rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-lg font-semibold text-slate-900">Change payment method</h3>
              <p className="text-xs text-slate-500 mt-1">
                For reconciling what the client actually paid vs. what was recorded.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Method picker — card hidden until live Stripe keys */}
              <div className="space-y-2">
                {[
                  { id: 'cash', label: 'Cash' },
                  { id: 'check', label: 'Check' },
                  { id: 'paymentApp', label: 'Payment app' },
                  { id: 'package', label: 'Package credit' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setEditPaymentMethod(opt.id);
                      setEditError(null);
                    }}
                    className={`w-full p-3 rounded-lg border-2 text-left transition-colors
                      ${editPaymentMethod === opt.id
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-line hover:border-teal-300'}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">{opt.label}</div>
                  </button>
                ))}
              </div>

              {/* Package selector — only when 'package' chosen */}
              {editPaymentMethod === 'package' && (
                <div className="border-t border-line pt-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    Available packages
                  </p>
                  {eligiblePackagesLoading ? (
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading packages…
                    </div>
                  ) : eligiblePackages.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      This client has no packages with enough remaining balance for this booking.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {eligiblePackages.map(p => {
                        const remainingLabel = p.kind === 'minutes'
                          ? `${p.minutesRemaining} min remaining`
                          : `${p.sessionsRemaining} session${p.sessionsRemaining === 1 ? '' : 's'} remaining`;
                        const enoughForFull = p.kind === 'minutes'
                          ? (p.minutesRemaining || 0) >= booking.duration
                          : true;
                        return (
                          <button
                            key={p._id}
                            type="button"
                            onClick={() => {
                              setEditPackageId(p._id);
                              setEditPackageMinutes(
                                enoughForFull ? booking.duration : p.minutesRemaining
                              );
                              setEditError(null);
                            }}
                            className={`w-full p-3 rounded-lg border-2 text-left transition-colors
                              ${editPackageId === p._id
                                ? 'border-teal-600 bg-teal-50'
                                : 'border-line hover:border-teal-300'}`}
                          >
                            <div className="font-medium text-slate-900 text-sm">
                              {p.name || (p.kind === 'minutes' ? 'Minutes package' : `${p.sessionDuration}-min package`)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {remainingLabel}
                              {!enoughForFull && p.kind === 'minutes' && (
                                <span className="ml-1 text-amber-700">
                                  · partial only ({p.minutesRemaining} of {booking.duration} min)
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {editError}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-line flex gap-3">
              <button
                type="button"
                onClick={() => setShowPaymentMethodModal(false)}
                disabled={editSubmitting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-line text-slate-700 hover:bg-paper-deep text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPaymentMethodChange}
                disabled={editSubmitting || (editPaymentMethod === 'package' && !editPackageId)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#B07A4E] hover:bg-[#8A5D36] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {editSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentDetail;
