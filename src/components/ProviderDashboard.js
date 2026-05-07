import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Users, Settings, MapPin, Clock, DollarSign, Sparkles, Plus, Ban, ArrowRight, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { DateTime } from 'luxon';
import { tzOf } from '../utils/timeConstants';
import { BrushLeaf } from './brush/BrushMotifs';

const Stat = ({ label, value, sub, accent }) => (
  <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5 relative overflow-hidden">
    <div className="av-meta text-ink-3">{label}</div>
    <div className="font-display mt-2"
      style={{ fontSize: "1.875rem", lineHeight: 1, fontWeight: 500, color: accent ? '#B07A4E' : '#2A2520' }}>
      {value}
    </div>
    {sub && <div className="text-xs text-ink-3 mt-1">{sub}</div>}
  </div>
);

const Eyebrow = ({ children }) => (
  <div className="flex items-center gap-2.5">
    <span className="av-eyebrow">{children}</span>
    <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
  </div>
);

// Derive a session's visual state from its booking.status + the wall
// clock. Returns one of:
//   'done'     → completed (closed out cleanly)
//   'now'      → current time is between start and end
//   'overdue'  → past end time but still confirmed (provider forgot
//                to mark complete) — gets a one-tap action
//   'upcoming' → future
function deriveSessionState(booking, now) {
  if (booking.status === 'completed') return 'done';
  if (!booking.localDate || !booking.startTime || !booking.endTime) return 'upcoming';
  // Each booking carries its own TZ — interpret startTime/endTime in
  // that TZ so a Chicago booking shows "now" at Chicago wall clock.
  const bookingTz = booking.timezone || 'America/Los_Angeles';
  const startsAt = DateTime.fromFormat(
    `${booking.localDate} ${booking.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: bookingTz }
  );
  const endsAt = DateTime.fromFormat(
    `${booking.localDate} ${booking.endTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: bookingTz }
  );
  if (!startsAt.isValid || !endsAt.isValid) return 'upcoming';
  if (now >= endsAt) return 'overdue';
  if (now >= startsAt) return 'now';
  return 'upcoming';
}

// Friendly "in 2h 15m" / "in 45m" / "in 5m" countdown for upcoming
// sessions. Falls back to start time if it's >12h out.
function countdownFromNow(booking, now) {
  if (!booking.localDate || !booking.startTime) return '';
  const bookingTz = booking.timezone || 'America/Los_Angeles';
  const startsAt = DateTime.fromFormat(
    `${booking.localDate} ${booking.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: bookingTz }
  );
  if (!startsAt.isValid) return '';
  const diffMin = Math.max(0, Math.round(startsAt.diff(now, 'minutes').minutes));
  if (diffMin <= 0) return 'now';
  if (diffMin > 12 * 60) return ''; // too far out, time of day is enough
  if (diffMin < 60) return `in ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

const TimelineRow = ({ booking, formatTime, now, onMarkComplete, marking }) => {
  const state = deriveSessionState(booking, now);

  // Per-state visual treatment. Border color, opacity, and the right-
  // side meta (pill / countdown / inline action) all key off the
  // single derived state, so we never render contradictory cues.
  const visual = {
    done: {
      borderColor: '#10b981',           // emerald-500
      opacity: 0.7,
      pill: <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle className="w-3 h-3" /> Done</span>,
    },
    now: {
      borderColor: '#B07A4E',
      opacity: 1,
      pill: <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-[#B07A4E] text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Now</span>,
    },
    overdue: {
      borderColor: '#f59e0b',           // amber-500
      opacity: 1,
      pill: <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle className="w-3 h-3" /> Close out</span>,
    },
    upcoming: {
      borderColor: '#B07A4E',
      opacity: 1,
      pill: countdownFromNow(booking, now)
        ? <span className="text-[11px] text-ink-3">{countdownFromNow(booking, now)}</span>
        : null,
    },
  }[state];

  return (
    <div
      className="flex items-center gap-3.5 py-3 px-3.5 rounded-card bg-paper-deep hover:shadow-atelier-sm transition"
      style={{ borderLeft: `3px solid ${visual.borderColor}`, opacity: visual.opacity }}
    >
      <Link to={`/appointments/${booking._id}`} className="flex items-center gap-3.5 flex-1 min-w-0">
        <span className={`av-meta ${state === 'done' ? 'text-ink-3' : 'text-accent'}`} style={{ width: 54 }}>
          {formatTime(booking.startTime)}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`font-display ${state === 'done' ? 'text-ink-2' : ''}`}
            style={{ fontSize: "0.9375rem", lineHeight: 1.25, fontWeight: 500 }}
          >
            {booking.client?.profile?.fullName || booking.recipientInfo?.name || 'Client'}
          </div>
          <div className="text-xs text-ink-2 mt-0.5 truncate">
            {booking.duration} min · {booking.location?.address?.split(',')[0] || ''}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        {visual.pill}
        {state === 'overdue' && onMarkComplete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMarkComplete(booking); }}
            disabled={marking === booking._id}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 px-2 py-1 rounded border border-amber-300 hover:bg-amber-50 disabled:opacity-50"
          >
            {marking === booking._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Mark
          </button>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-ink-3" />
      </div>
    </div>
  );
};

const EmptyRow = ({ time }) => (
  <div className="flex items-center gap-3.5 py-2.5" style={{ borderTop: '1px dashed var(--line-2)' }}>
    <span className="av-meta text-ink-3" style={{ width: 54 }}>{time}</span>
    <span className="text-xs italic text-ink-3">— open —</span>
  </div>
);

const ActionCard = ({ to, icon: Icon, title, sub }) => (
  <Link to={to}
    className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5
      hover:shadow-atelier-md transition block">
    <div className="flex items-center gap-2.5 mb-1.5">
      <Icon className="w-4 h-4 text-accent" />
      <h3 className="font-display text-ink" style={{ fontSize: "1rem", fontWeight: 500 }}>{title}</h3>
    </div>
    <p className="text-[13px] text-ink-2">{sub}</p>
  </Link>
);

const ProviderDashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user || user.accountType !== 'PROVIDER') {
    navigate('/login');
    return null;
  }

  const viewerTz = tzOf(user);
  const [stats, setStats] = useState({ total: 0, completed: 0, upcoming: 0 });
  const [revenue, setRevenue] = useState(null);
  const [todayBookings, setTodayBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tick every minute so countdown labels and state transitions
  // (upcoming → now → overdue) stay live without a refresh. Anchored
  // in the auth provider's TZ so a Chicago provider's "now" matches
  // their wall clock.
  const [now, setNow] = useState(() => DateTime.now().setZone(viewerTz));
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const today = DateTime.now().setZone(viewerTz).toFormat('yyyy-MM-dd');
        const [statsRes, revRes, bookRes] = await Promise.allSettled([
          api.get('/api/bookings?stats=today'),
          api.get('/api/bookings/revenue'),
          api.get(`/api/bookings?date=${today}`)
        ]);
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (revRes.status === 'fulfilled') setRevenue(revRes.value.data);
        if (bookRes.status === 'fulfilled') {
          const sorted = (bookRes.value.data || [])
            .filter(b => b.status !== 'cancelled')
            .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
          setTodayBookings(sorted);
        }
      } catch (err) {
        console.error('Dashboard fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setNow(DateTime.now().setZone(viewerTz)),
      60 * 1000
    );
    return () => clearInterval(id);
  }, []);

  const handleMarkComplete = async (booking) => {
    try {
      setMarkingId(booking._id);
      await api.patch(`/api/bookings/${booking._id}/status`, { status: 'completed' });
      setTodayBookings(prev =>
        prev.map(b => (b._id === booking._id ? { ...b, status: 'completed' } : b))
      );
    } catch (err) {
      console.error('Mark complete failed:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'pm' : 'am';
    const dh = h % 12 || 12;
    return `${dh}:${m.toString().padStart(2, '0')}${period}`;
  };

  const greeting = now.hour < 12 ? 'Good morning' : now.hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toFormat('EEEE · d LLLL').toLowerCase();
  const firstName = user.profile?.fullName?.split(' ')[0]
    || user.providerProfile?.businessName
    || 'there';

  // Subtitle copy reflects the actual mix of states across today's
  // sessions — "1 done · 2 to go" reads more honestly than "three
  // sessions today" when one is already wrapped. Picks the most
  // useful single sentence for the current shape of the day.
  const subtitle = (() => {
    if (loading) return 'Loading your day...';
    if (todayBookings.length === 0) return 'No sessions today. Stillness is a gift.';

    const counts = { done: 0, now: 0, overdue: 0, upcoming: 0 };
    let nowName = '';
    let firstUpcoming = null;
    for (const b of todayBookings) {
      const s = deriveSessionState(b, now);
      counts[s] += 1;
      if (s === 'now' && !nowName) {
        nowName = b.client?.profile?.fullName?.split(' ')[0]
          || b.recipientInfo?.name?.split(' ')[0]
          || 'a client';
      }
      if (s === 'upcoming' && !firstUpcoming) firstUpcoming = b;
    }

    // Priority order for which state to lead with:
    //   1. In-session "now" — the most time-sensitive thing on screen
    //   2. Overdue — provider needs to act, lead with the prompt
    //   3. All done — closure feels good, say so
    //   4. Mixed past + future — show the breakdown
    //   5. Pure upcoming — friendly time-til-first
    if (counts.now > 0) {
      const rest = todayBookings.length - counts.now - counts.done;
      const after = rest > 0 ? ` · ${rest} after this` : '';
      return `With ${nowName} now${after}.`;
    }
    if (counts.overdue > 0) {
      const word = counts.overdue === 1 ? 'session needs' : 'sessions need';
      return `${counts.overdue} ${word} closing out from earlier today.`;
    }
    if (counts.done === todayBookings.length) {
      return todayBookings.length === 1
        ? 'All done — 1 of 1 closed out.'
        : `All done — ${counts.done} of ${todayBookings.length} closed out.`;
    }
    if (counts.done > 0 && counts.upcoming > 0) {
      const goWord = counts.upcoming === 1 ? '1 to go' : `${counts.upcoming} to go`;
      return `${counts.done} done · ${goWord}.`;
    }
    if (firstUpcoming) {
      const word = todayBookings.length === 1 ? 'One session' : `${todayBookings.length} sessions`;
      return `${word} today. First at ${formatTime(firstUpcoming.startTime)}.`;
    }
    return `${todayBookings.length} sessions today.`;
  })();

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-8">
        {/* Greeting header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
          <div>
            <div className="av-eyebrow mb-2">{todayLabel}</div>
            <h1 className="font-display" style={{ fontSize: "2.25rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {greeting}, <em style={{ color: '#B07A4E' }}>{firstName}.</em>
            </h1>
            <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/provider/availability"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-btn border border-line
                bg-transparent text-ink text-[13px] font-medium hover:bg-paper-deep transition"
            >
              <Ban className="w-3.5 h-3.5" /> Block time
            </Link>
            <Link
              to="/provider/availability"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-btn bg-accent text-white
                text-[13px] font-medium hover:bg-accent-ink transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add availability
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
          <Stat label="Today" value={stats.total} sub="scheduled sessions" />
          <Stat label="Upcoming" value={stats.upcoming} sub="still to go" />
          <Stat
            label="Month revenue"
            value={revenue ? `$${(revenue.monthRevenue || 0).toLocaleString()}` : '—'}
            sub={revenue?.paidCount ? `${revenue.paidCount} paid sessions` : undefined}
            accent
          />
          <Stat
            label="This week"
            value={revenue ? `$${(revenue.weekRevenue || 0).toLocaleString()}` : '—'}
            sub="on the book"
          />
        </div>

        {/* Today's rhythm + side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-8">
          <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <div className="font-display" style={{ fontSize: "1.25rem", fontWeight: 500 }}>Today's rhythm</div>
              <Link to="/provider/appointments" className="av-meta text-accent hover:text-accent-ink">
                See all
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 bg-paper-deep rounded-card"></div>
                <div className="h-10 bg-paper-deep rounded-card"></div>
                <div className="h-10 bg-paper-deep rounded-card"></div>
              </div>
            ) : todayBookings.length === 0 ? (
              <div className="py-10 text-center">
                <div className="av-meta text-ink-3 mb-2">A clear day</div>
                <p className="text-sm text-ink-2">No sessions on the book. Rest or open more time.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {todayBookings.map(b => (
                  <TimelineRow
                    key={b._id}
                    booking={b}
                    formatTime={formatTime}
                    now={now}
                    onMarkComplete={handleMarkComplete}
                    marking={markingId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Revenue recap side card */}
          <div className="flex flex-col gap-4">
            <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5 relative overflow-hidden">
              <div className="absolute -right-5 -bottom-5 pointer-events-none" style={{ opacity: 0.14 }}>
                <BrushLeaf size={100} color="#B07A4E" />
              </div>
              <div className="av-meta text-accent">All-time revenue</div>
              <div className="font-display mt-2" style={{ fontSize: "1.625rem", fontWeight: 500, letterSpacing: '-0.01em' }}>
                {revenue ? `$${(revenue.totalRevenue || 0).toLocaleString()}` : '—'}
              </div>
              <div className="text-xs text-ink-2 mt-1">
                {revenue?.unpaidCount > 0
                  ? `${revenue.unpaidCount} unpaid`
                  : 'Across every session to date'}
              </div>
              <Link to="/provider/mileage" className="mt-4 inline-flex items-center gap-1.5 text-accent text-[13px] font-medium hover:text-accent-ink transition">
                Open reports <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5">
              <div className="av-meta text-ink-3 mb-3">Getting around</div>
              <div className="flex flex-col gap-2">
                <Link to="/provider/schedule-template" className="text-[13.5px] text-ink hover:text-accent transition flex items-center justify-between">
                  Weekly hours <ArrowRight className="w-3 h-3" />
                </Link>
                <Link to="/provider/locations" className="text-[13.5px] text-ink hover:text-accent transition flex items-center justify-between">
                  Locations <ArrowRight className="w-3 h-3" />
                </Link>
                <Link to="/provider/services" className="text-[13.5px] text-ink hover:text-accent transition flex items-center justify-between">
                  Services &amp; pricing <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mb-2">
          <Eyebrow>Attend to</Eyebrow>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
          <ActionCard to="/provider/availability" icon={Calendar} title="Availability" sub="Your schedule for the coming weeks" />
          <ActionCard to="/provider/clients" icon={Users} title="Clients" sub="Your people, their notes, their history" />
          <ActionCard to="/provider/appointments" icon={Clock} title="Appointments" sub="Upcoming & past sessions" />
          <ActionCard to="/provider/locations" icon={MapPin} title="Locations" sub="Home base and saved addresses" />
          <ActionCard to="/provider/services" icon={Sparkles} title="Services" sub="Durations, prices, add-ons" />
          <ActionCard to="/provider/settings" icon={Settings} title="Settings" sub="Business preferences & integrations" />
        </div>
      </div>
    </div>
  );
};

export default ProviderDashboard;
