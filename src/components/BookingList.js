import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Phone, MessageSquare, AlertCircle, ArrowRight, CalendarClock } from 'lucide-react';
import { DateTime } from 'luxon';
import { tzOf } from '../utils/timeConstants';
import { buildStandingRequestSmsLink } from '../utils/standingAppointmentRequest';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLES = {
  confirmed:   { bg: 'transparent', text: 'var(--ink-3)', border: 'var(--line)' },
  pending:     { bg: 'var(--accent-soft)', text: 'var(--accent)', border: 'transparent' },
  completed:   { bg: 'transparent', text: 'var(--ink-3)', border: 'var(--line)' },
  cancelled:   { bg: 'rgba(165,70,65,0.10)', text: '#A54641', border: 'transparent' },
  'in-progress': { bg: 'rgba(184,121,42,0.12)', text: '#B8792A', border: 'transparent' },
};

const BookingList = () => {
  const [bookings, setBookings] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useContext(AuthContext);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    const fetchProviderInfo = async () => {
      if (user.accountType === 'CLIENT' && user.providerId) {
        try {
          const res = await axios.get(`/api/users/provider/${user.providerId}`);
          setProvider(res.data);
        } catch (err) {
          console.error('Error fetching provider info:', err);
        }
      }
    };
    fetchProviderInfo();
    fetchBookings();
  }, [user]);

  const fetchBookings = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get('/api/bookings', { withCredentials: true });
      if (Array.isArray(res.data)) {
        setBookings(res.data);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      setError('Error fetching bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Cancel this booking? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/bookings/${bookingId}`, { withCredentials: true });
      setBookings(prev => prev.filter(b => b._id !== bookingId));
    } catch (err) {
      console.error('Error cancelling booking:', err);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  const handleAddToCalendar = (booking) => {
    const bookingTz = tzOf(booking);
    const start = DateTime.fromISO(booking.date).setZone(bookingTz).set({
      hour: parseInt(booking.startTime.split(':')[0]),
      minute: parseInt(booking.startTime.split(':')[1])
    });
    const end = DateTime.fromISO(booking.date).setZone(bookingTz).set({
      hour: parseInt(booking.endTime.split(':')[0]),
      minute: parseInt(booking.endTime.split(':')[1])
    });
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${
      encodeURIComponent('Massage Appointment')}&dates=${
      start.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}/${
      end.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}&location=${
      encodeURIComponent(booking.location?.address || '')}`;
    window.open(url, '_blank');
  };

  const isFuture = (booking) => {
    if (booking.status === 'cancelled' || booking.status === 'completed') return false;
    try {
      const bookingTz = tzOf(booking);
      const end = DateTime.fromISO(booking.date).setZone(bookingTz).set({
        hour: parseInt(booking.endTime.split(':')[0]),
        minute: parseInt(booking.endTime.split(':')[1])
      });
      // Comparison is on absolute instants — UTC "now" is correct
      // regardless of bookingTz.
      return end > DateTime.utc();
    } catch {
      return false;
    }
  };

  const filtered = (() => {
    const sortAsc = (a, b) => DateTime.fromISO(a.date).diff(DateTime.fromISO(b.date)).milliseconds;
    const sortDesc = (a, b) => DateTime.fromISO(b.date).diff(DateTime.fromISO(a.date)).milliseconds;
    if (activeTab === 'upcoming') {
      return bookings.filter(isFuture).sort(sortAsc);
    }
    if (activeTab === 'past') {
      return bookings.filter(b => !isFuture(b)).sort(sortDesc);
    }
    // all — future first, then past
    const up = bookings.filter(isFuture).sort(sortAsc);
    const past = bookings.filter(b => !isFuture(b)).sort(sortDesc);
    return [...up, ...past];
  })();

  // Format an "HH:mm" string into "h:mm a". Pure clock-face math —
  // no TZ conversion needed; we just need a Luxon DateTime to render
  // the format.
  const formatTime = (timeString) => {
    const [h, m] = timeString.split(':').map(Number);
    return DateTime.fromObject({ hour: h, minute: m }).toFormat('h:mm a');
  };

  const renderBooking = (booking, idx) => {
    const dt = DateTime.fromISO(booking.date).setZone(tzOf(booking));
    const day = dt.toFormat('dd');
    const month = dt.toFormat('LLL').toUpperCase();
    const weekday = dt.toFormat('EEEE');
    const timeRange = `${weekday} · ${formatTime(booking.startTime)}`;
    const isPrimary = idx === 0 && activeTab === 'upcoming';
    const isMuted = booking.status === 'completed' || booking.status === 'cancelled';
    const statusStyle = STATUS_STYLES[booking.status] || STATUS_STYLES.confirmed;
    const duration = booking.duration || Math.round((DateTime.fromISO(booking.date).set({
      hour: parseInt(booking.endTime.split(':')[0]),
      minute: parseInt(booking.endTime.split(':')[1])
    }).diff(DateTime.fromISO(booking.date).set({
      hour: parseInt(booking.startTime.split(':')[0]),
      minute: parseInt(booking.startTime.split(':')[1])
    })).as('minutes')));
    const title = `${duration} min${booking.serviceType?.name ? ` · ${booking.serviceType.name.toLowerCase()}` : ''}`;

    return (
      <div
        key={booking._id}
        className="rounded-card shadow-atelier-sm overflow-hidden"
        style={{
          background: 'var(--bg-elev)',
          border: `1px solid ${isPrimary ? 'var(--accent)' : 'var(--line)'}`,
          opacity: isMuted ? 0.65 : 1,
        }}
      >
        <Link to={`/appointments/${booking._id}`} className="flex gap-3.5 items-center p-3.5">
          {/* Date tile */}
          <div
            className="flex flex-col items-center justify-center flex-shrink-0"
            style={{
              width: 56, height: 58, borderRadius: 10,
              background: isPrimary ? '#B07A4E' : 'var(--bg-deep)',
              color: isPrimary ? '#fff' : 'var(--ink)',
            }}
          >
            <div className="av-meta" style={{ fontSize: "0.5625rem", opacity: 0.8, color: 'inherit' }}>{month}</div>
            <div className="font-display" style={{ fontSize: "1.375rem", lineHeight: 1, fontWeight: 500 }}>{day}</div>
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <div className="font-display truncate" style={{ fontSize: "1rem", lineHeight: 1.25, fontWeight: 500 }}>
              {title}
            </div>
            <div className="text-xs text-ink-3 mt-0.5 truncate">{timeRange}</div>
            {booking.recipientType === 'other' && booking.recipientInfo?.name && (
              <div className="text-xs text-ink-2 mt-1">For: {booking.recipientInfo.name}</div>
            )}
          </div>

          {/* Status pill */}
          <div
            className="flex-shrink-0 av-meta"
            style={{
              padding: '4px 8px', borderRadius: 999,
              background: statusStyle.bg,
              color: statusStyle.text,
              border: `1px solid ${statusStyle.border}`,
              fontSize: "0.625rem",
            }}
          >
            {booking.status === 'in-progress' ? 'In progress' : booking.status || 'Pending'}
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-ink-3 ml-1 hidden sm:block" />
        </Link>

        {/* Action row — only show on upcoming, non-cancelled */}
        {!isMuted && (
          <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-0 border-t border-line-soft">
            <button
              onClick={() => handleAddToCalendar(booking)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-ink-2 hover:bg-paper-deep transition"
            >
              <Calendar className="w-3 h-3" /> Add to calendar
            </button>
            {user.accountType === 'CLIENT' && provider?.profile?.phoneNumber && (
              <>
                <a
                  href={`tel:${provider.profile.phoneNumber}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-ink-2 hover:bg-paper-deep transition"
                >
                  <Phone className="w-3 h-3" /> Call
                </a>
                <a
                  href={`sms:${provider.profile.phoneNumber}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-ink-2 hover:bg-paper-deep transition"
                >
                  <MessageSquare className="w-3 h-3" /> Text
                </a>
              </>
            )}
            <button
              onClick={() => handleCancelBooking(booking._id)}
              className="inline-flex items-center px-2.5 py-1.5 rounded text-xs text-red-600 hover:bg-red-50 transition ml-auto"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="av-paper pt-16 min-h-screen">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
          <div className="flex items-start gap-3 p-4 border border-red-200 rounded-card" style={{ background: 'rgba(165,70,65,0.08)' }}>
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="av-eyebrow mb-2">
            {user.accountType === 'CLIENT' && provider?.providerProfile?.businessName
              ? `Your hours with ${provider.providerProfile.businessName}`
              : 'Your hours'}
          </div>
          <h1 className="font-display" style={{ fontSize: "1.875rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Appointments
          </h1>

          {/* Page-level "ask about standing appointment" prompt — generic
              version (no specific date/time). Opens an SMS to the
              provider asking about a regular schedule; the conversation
              happens out-of-band per the design rule, the provider sets
              up the standing appointment in Avayble when they're ready.
              Hidden when the provider has no phone on file. */}
          {user.accountType === 'CLIENT' && (() => {
            const link = buildStandingRequestSmsLink({
              providerPhone: provider?.profile?.phoneNumber,
              providerName: provider?.providerProfile?.businessName || provider?.profile?.fullName,
              clientName: user?.profile?.fullName,
            });
            if (!link) return null;
            return (
              <a
                href={link}
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36]"
              >
                <CalendarClock className="w-4 h-4" />
                Ask about a standing appointment →
              </a>
            );
          })()}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="av-meta transition"
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                background: activeTab === t.id ? 'var(--ink)' : 'transparent',
                color: activeTab === t.id ? 'var(--bg)' : 'var(--ink-2)',
                border: `1px solid ${activeTab === t.id ? 'var(--ink)' : 'var(--line)'}`,
                fontSize: "0.6875rem",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-20 bg-paper-elev border border-line rounded-card animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <div className="av-meta text-ink-3 mb-2">Nothing here</div>
            <p className="text-sm text-ink-2 mb-5">
              {activeTab === 'upcoming'
                ? 'No upcoming appointments on the book.'
                : activeTab === 'past'
                  ? 'No past appointments yet.'
                  : 'No appointments yet.'}
            </p>
            {activeTab !== 'past' && (
              <Link to="/book"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-btn bg-accent text-white text-[13px] font-medium hover:bg-accent-ink transition">
                Book a session <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((b, idx) => renderBooking(b, idx))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingList;
