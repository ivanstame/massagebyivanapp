import React, { useEffect, useState, useContext, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { AuthContext } from '../AuthContext';
import {
  AlertTriangle, ArrowRight, Search, Repeat, Users,
  CircleDollarSign, CheckCircle, ChevronDown, ChevronRight,
} from 'lucide-react';

// Provider's appointments page. Calm-glance list that matches the
// dashboard's "today's rhythm" rhythm: each appointment is a single tappable
// row that hands off to /appointments/:id for actions (confirm, complete,
// pay, cancel, navigate). The detail page is the single source of truth
// for per-appointment actions; this view is purely navigational +
// browseable.
//
// Layout:
//   [search box]
//   [filter chips: All · Pending · Confirmed · Unpaid]
//
//   Today
//     ┌ row · row · row
//   Tomorrow
//     ┌ row · row
//   This Week
//   Next Week
//   Later
//
//   Show N past appointments
//     Last week
//     This month
//     Earlier

const ProviderAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { user } = useContext(AuthContext);

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/bookings', { withCredentials: true });
      if (!Array.isArray(response.data)) {
        setError('Invalid data format received from server');
        return;
      }
      // Defensive filter — provider should only see their own.
      const mine = response.data.filter(a =>
        String(a.provider?._id || a.provider) === String(user._id)
      );
      setAppointments(mine);
    } catch (err) {
      if (err.response) {
        setError(`Server error: ${err.response.status} - ${err.response.data?.message || err.message}`);
      } else if (err.request) {
        setError('No response from server');
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Cancelled bookings always belong in past, regardless of date — matches
  // BookingList semantics so a future-dated cancelled occurrence doesn't
  // reappear here looking unprocessed.
  const isPast = (a) => {
    if (a.status === 'cancelled') return true;
    // localDate is the LA-local YYYY-MM-DD; endTime is HH:mm in LA.
    // Build the end moment in LA and compare to now-in-LA. The old
    // version used moment.utc(a.date).set('hour', endHour) which
    // interpreted the LA endTime as UTC, marking same-day afternoon
    // appointments as "past" any time after ~late morning (LA) — so
    // a same-day booking added in the afternoon disappeared from the
    // Upcoming list entirely.
    const endLA = moment.tz(
      `${a.localDate} ${a.endTime}`,
      'YYYY-MM-DD HH:mm',
      'America/Los_Angeles'
    );
    return endLA.isSameOrBefore(moment.tz('America/Los_Angeles'));
  };

  const getRecipientName = (a) => {
    if (a.recipientType === 'other' && a.recipientInfo?.name) return a.recipientInfo.name;
    return a.client?.profile?.fullName || a.client?.email || 'Unknown Client';
  };

  // Apply filters + search. Search hits recipient name and address.
  const matchesFilters = (a) => {
    if (filter === 'unpaid' && a.paymentStatus === 'paid') return false;
    // 'past' filter is handled separately in the render (it flips the
    // upcoming/past split, not just narrows the matching set).
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = [
        getRecipientName(a),
        a.location?.address || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  };

  const { upcomingGroups, pastGroups, upcomingCount, pastCount, pastCountAll, unpaidUpcomingCount } = useMemo(() => {
    const filtered = appointments.filter(matchesFilters);
    const upcoming = filtered.filter(a => !isPast(a))
      .sort((a, b) => moment.utc(a.date).diff(moment.utc(b.date)) ||
                      a.startTime.localeCompare(b.startTime));
    const past = filtered.filter(isPast)
      .sort((a, b) => moment.utc(b.date).diff(moment.utc(a.date)) ||
                      b.startTime.localeCompare(a.startTime));

    // Group upcoming by relative date.
    const today = moment.tz('America/Los_Angeles').startOf('day');
    const tomorrow = today.clone().add(1, 'day');
    const endOfThisWeek = today.clone().endOf('week'); // Saturday-end
    const endOfNextWeek = endOfThisWeek.clone().add(7, 'days');

    const upcomingBuckets = {
      Today: [],
      Tomorrow: [],
      'This Week': [],
      'Next Week': [],
      Later: [],
    };
    for (const a of upcoming) {
      const d = moment.utc(a.date).tz('America/Los_Angeles').startOf('day');
      if (d.isSame(today, 'day')) upcomingBuckets['Today'].push(a);
      else if (d.isSame(tomorrow, 'day')) upcomingBuckets['Tomorrow'].push(a);
      else if (d.isSameOrBefore(endOfThisWeek)) upcomingBuckets['This Week'].push(a);
      else if (d.isSameOrBefore(endOfNextWeek)) upcomingBuckets['Next Week'].push(a);
      else upcomingBuckets['Later'].push(a);
    }

    // Past buckets are simpler — provider scans for "last few" in practice.
    const startOfThisMonth = today.clone().startOf('month');
    const startOfLastWeek = today.clone().subtract(7, 'days');

    const pastBuckets = {
      'Last week': [],
      'This month': [],
      'Earlier': [],
    };
    for (const a of past) {
      const d = moment.utc(a.date).tz('America/Los_Angeles').startOf('day');
      if (d.isSameOrAfter(startOfLastWeek)) pastBuckets['Last week'].push(a);
      else if (d.isSameOrAfter(startOfThisMonth)) pastBuckets['This month'].push(a);
      else pastBuckets['Earlier'].push(a);
    }

    const allUpcoming = appointments.filter(a => !isPast(a));
    const unpaidUpcoming = allUpcoming.filter(a =>
      a.paymentStatus !== 'paid' && (a.pricing?.totalPrice || 0) > 0
    ).length;
    // Total past count over the full set so the chip badge shows
    // "23 past" even when filter='all' (badge isn't gated on filter).
    const pastCountAll = appointments.filter(isPast).length;

    return {
      upcomingGroups: upcomingBuckets,
      pastGroups: pastBuckets,
      upcomingCount: upcoming.length,
      pastCount: past.length,
      pastCountAll,
      unpaidUpcomingCount: unpaidUpcoming,
    };
  }, [appointments, filter, search]);

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Your hours</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Appointments
          </h1>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-400 rounded-r-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700 font-medium">Error loading appointments</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              <button onClick={fetchAppointments} className="mt-2 text-sm text-red-700 underline hover:text-red-800">
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-3 relative">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or address"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-paper-elev border border-line rounded-card
              focus:outline-none focus:ring-2 focus:ring-[#B07A4E]/30 focus:border-[#B07A4E]"
          />
        </div>

        {/* Filter chips */}
        <div className="mb-6 flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'}    onClick={() => setFilter('all')}    label="All" />
          <FilterChip active={filter === 'past'}   onClick={() => setFilter('past')}   label="Past" badge={pastCountAll} />
          <FilterChip active={filter === 'unpaid'} onClick={() => setFilter('unpaid')} label="Unpaid" badge={unpaidUpcomingCount} accent="amber" />
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-2 text-center py-12">Loading…</p>
        ) : upcomingCount === 0 && pastCount === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : filter === 'past' ? (
          /* Past-only view: skip the upcoming section + accordion, render
             past groups expanded so a user clicking Past sees real content
             immediately rather than an empty page + a collapsed bottom row. */
          pastCount === 0 ? (
            <p className="text-sm text-ink-2 text-center py-8">
              {search.trim() ? 'Nothing matches that filter.' : 'No past appointments.'}
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(pastGroups).map(([label, list]) =>
                list.length === 0 ? null : (
                  <DateGroup key={label} label={label} count={list.length}>
                    {list.map(a => <AppointmentRow key={a._id} booking={a} />)}
                  </DateGroup>
                )
              )}
            </div>
          )
        ) : (
          <>
            {/* Upcoming groups */}
            {upcomingCount === 0 ? (
              <p className="text-sm text-ink-2 text-center py-8">
                {filter === 'all' && !search.trim()
                  ? 'No upcoming appointments.'
                  : 'Nothing matches that filter.'}
              </p>
            ) : (
              <div className="space-y-6">
                {Object.entries(upcomingGroups).map(([label, list]) =>
                  list.length === 0 ? null : (
                    <DateGroup key={label} label={label} count={list.length}>
                      {list.map(a => <AppointmentRow key={a._id} booking={a} />)}
                    </DateGroup>
                  )
                )}
              </div>
            )}

            {/* Past — collapsed accordion (legacy access path; tap the
                Past chip up top for a dedicated view). */}
            {pastCount > 0 && (
              <div className="mt-10 pt-6 border-t border-line">
                <button
                  onClick={() => setShowPast(s => !s)}
                  className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink font-medium"
                >
                  {showPast ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {pastCount} past appointment{pastCount === 1 ? '' : 's'}
                </button>
                {showPast && (
                  <div className="mt-4 space-y-6">
                    {Object.entries(pastGroups).map(([label, list]) =>
                      list.length === 0 ? null : (
                        <DateGroup key={label} label={label} count={list.length}>
                          {list.map(a => <AppointmentRow key={a._id} booking={a} />)}
                        </DateGroup>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Filter chip pill. Optional `badge` count rendered next to label;
// `accent` controls the badge color (amber for "needs attention").
const FilterChip = ({ active, onClick, label, badge, accent }) => {
  const accentClasses = accent === 'amber'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-paper-deep text-ink-2';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
        ${active
          ? 'bg-[#B07A4E] text-white'
          : 'bg-paper-elev border border-line text-ink-2 hover:border-[#B07A4E]/40 hover:text-ink'
        }`}
    >
      {label}
      {!!badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : accentClasses}`}>
          {badge}
        </span>
      )}
    </button>
  );
};

// Date-bucket header + its rows.
const DateGroup = ({ label, count, children }) => (
  <div>
    <div className="flex items-baseline gap-2.5 mb-2.5">
      <span className="av-eyebrow text-ink-2">{label}</span>
      <span className="text-[11px] text-ink-3">{count}</span>
      <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
    </div>
    <div className="space-y-2">{children}</div>
  </div>
);

// Single appointment row — the only renderer in this view. Tap → detail.
// Mirrors the dashboard's TimelineRow visual rhythm so the two views feel
// like one product instead of two competing pages.
const AppointmentRow = ({ booking }) => {
  const formatTime = (hhmm) => moment(hhmm, 'HH:mm').format('h:mm A');
  const recipient = booking.recipientType === 'other' && booking.recipientInfo?.name
    ? booking.recipientInfo.name
    : (booking.client?.profile?.fullName || booking.client?.email || 'Client');

  const neighborhood = booking.location?.address?.split(',')[0] || '';
  const isCancelled = booking.status === 'cancelled';
  const isCompleted = booking.status === 'completed';
  const hasPrice = (booking.pricing?.totalPrice || 0) > 0;
  const isUnpaid = hasPrice && booking.paymentStatus !== 'paid';
  const isChain = !!booking.groupId;

  return (
    <Link
      to={`/appointments/${booking._id}`}
      className={`flex items-center gap-3.5 py-3 px-3.5 rounded-card bg-paper-elev border border-line
        hover:shadow-atelier-sm transition ${isCancelled ? 'opacity-60' : ''}`}
      style={!isCancelled && !isCompleted ? { borderLeft: '3px solid #B07A4E' } : undefined}
    >
      {/* Time column */}
      <div className="flex flex-col items-start" style={{ width: 64 }}>
        <span className={`av-meta ${isCancelled || isCompleted ? 'text-ink-3' : 'text-accent'}`}>
          {formatTime(booking.startTime)}
        </span>
        <span className="text-[10px] text-ink-3 mt-0.5">{booking.duration}m</span>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-display truncate ${isCancelled ? 'line-through text-ink-3' : 'text-ink'}`}
            style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 500 }}
          >
            {recipient}
          </span>
          {booking.series && (
            <span title="Recurring"><Repeat className="w-3 h-3 text-ink-3 flex-shrink-0" /></span>
          )}
          {isChain && (
            <span title="Back-to-back chain"><Users className="w-3 h-3 text-ink-3 flex-shrink-0" /></span>
          )}
        </div>
        {neighborhood && (
          <div className="text-xs text-ink-2 truncate mt-0.5">{neighborhood}</div>
        )}
      </div>

      {/* Status indicators column */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isCompleted && (
          <CheckCircle className="w-4 h-4 text-green-600" title="Completed" />
        )}
        {isCancelled && (
          <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            Cancelled
          </span>
        )}
        {isUnpaid && !isCancelled && (
          <CircleDollarSign className="w-4 h-4 text-amber-600" title="Unpaid" />
        )}
      </div>

      <ArrowRight className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
    </Link>
  );
};

const EmptyState = ({ filter, search }) => (
  <div className="text-center py-16 bg-paper-elev rounded-card border border-dashed border-line">
    <p className="text-ink-2 text-sm">
      {search.trim()
        ? `No appointments match "${search.trim()}".`
        : filter !== 'all'
          ? 'No appointments match that filter.'
          : 'No appointments yet. Once clients book, they\'ll show up here.'}
    </p>
  </div>
);

export default ProviderAppointments;
