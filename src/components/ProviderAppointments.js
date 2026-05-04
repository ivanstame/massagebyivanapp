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
  // Per-month accordion state. Map<groupKey, isOpen>. Defaults are
  // computed at render time (this/next week + nearest month open;
  // older months collapsed) but the user can toggle anything.
  const [openGroups, setOpenGroups] = useState({});
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
    // Cancelled bookings are hidden everywhere in this view — provider
    // explicitly flagged them as visual noise. They still exist in the
    // DB and remain visible inside a specific client's history page if
    // ever needed.
    const filtered = appointments
      .filter(a => a.status !== 'cancelled')
      .filter(matchesFilters);
    const upcoming = filtered.filter(a => !isPast(a))
      .sort((a, b) => moment.utc(a.date).diff(moment.utc(b.date)) ||
                      a.startTime.localeCompare(b.startTime));
    const past = filtered.filter(isPast)
      .sort((a, b) => moment.utc(b.date).diff(moment.utc(a.date)) ||
                      b.startTime.localeCompare(a.startTime));

    // Build ordered, named groups for both directions. Groups beyond
    // the immediate Today/Tomorrow/This week/Next week (or Last week)
    // bucket roll up by month so the list stays scannable instead of
    // dumping years' worth of data into a single "Earlier" pile.
    const today = moment.tz('America/Los_Angeles').startOf('day');
    const tomorrow = today.clone().add(1, 'day');
    const endOfThisWeek = today.clone().endOf('week');
    const endOfNextWeek = endOfThisWeek.clone().add(7, 'days');
    const startOfLastWeek = today.clone().subtract(7, 'days');

    const buildGroup = (key, label) => ({ key, label, list: [] });
    // Stable keys keep the openGroups map valid across renders. Use
    // YYYY-MM for month keys.
    const monthKey = (d) => d.format('YYYY-MM');
    const monthLabel = (d) => d.format('MMMM YYYY');

    // ─── Upcoming ────────────────────────────────────────────────
    const upcomingOrdered = []; // [{key,label,list}]
    const upcomingMap = new Map();
    const ensureUp = (key, label) => {
      if (!upcomingMap.has(key)) {
        const g = buildGroup(key, label);
        upcomingMap.set(key, g);
        upcomingOrdered.push(g);
      }
      return upcomingMap.get(key);
    };
    for (const a of upcoming) {
      const d = moment.utc(a.date).tz('America/Los_Angeles').startOf('day');
      if (d.isSame(today, 'day')) ensureUp('today', 'Today').list.push(a);
      else if (d.isSame(tomorrow, 'day')) ensureUp('tomorrow', 'Tomorrow').list.push(a);
      else if (d.isSameOrBefore(endOfThisWeek)) ensureUp('this-week', 'This week').list.push(a);
      else if (d.isSameOrBefore(endOfNextWeek)) ensureUp('next-week', 'Next week').list.push(a);
      else ensureUp(`m-${monthKey(d)}`, monthLabel(d)).list.push(a);
    }

    // ─── Past ────────────────────────────────────────────────────
    const pastOrdered = [];
    const pastMap = new Map();
    const ensurePast = (key, label) => {
      if (!pastMap.has(key)) {
        const g = buildGroup(key, label);
        pastMap.set(key, g);
        pastOrdered.push(g);
      }
      return pastMap.get(key);
    };
    for (const a of past) {
      const d = moment.utc(a.date).tz('America/Los_Angeles').startOf('day');
      if (d.isSameOrAfter(startOfLastWeek)) ensurePast('last-week', 'Last week').list.push(a);
      else ensurePast(`m-${monthKey(d)}`, monthLabel(d)).list.push(a);
    }

    const allUpcoming = appointments.filter(a => !isPast(a));
    const unpaidUpcoming = allUpcoming.filter(a =>
      a.paymentStatus !== 'paid' && (a.pricing?.totalPrice || 0) > 0
    ).length;
    // Past chip badge counts non-cancelled past only — the chip would
    // lie otherwise (clicking "Past 23" then seeing 11 rows because
    // cancelled aren't rendered).
    const pastCountAll = appointments.filter(a => a.status !== 'cancelled' && isPast(a)).length;

    return {
      upcomingGroups: upcomingOrdered,
      pastGroups: pastOrdered,
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
          pastCount === 0 ? (
            <p className="text-sm text-ink-2 text-center py-8">
              {search.trim() ? 'Nothing matches that filter.' : 'No past appointments.'}
            </p>
          ) : (
            <CollapsibleGroups
              groups={pastGroups}
              openGroups={openGroups}
              setOpenGroups={setOpenGroups}
              defaultOpenKeys={['last-week', pastGroups[1]?.key].filter(Boolean)}
              provider={user}
            />
          )
        ) : (
          <>
            {upcomingCount === 0 ? (
              <p className="text-sm text-ink-2 text-center py-8">
                {filter === 'all' && !search.trim()
                  ? 'No upcoming appointments.'
                  : 'Nothing matches that filter.'}
              </p>
            ) : (
              <CollapsibleGroups
                groups={upcomingGroups}
                openGroups={openGroups}
                setOpenGroups={setOpenGroups}
                defaultOpenKeys={['today', 'tomorrow', 'this-week', 'next-week']}
                provider={user}
              />
            )}

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
                  <div className="mt-4">
                    <CollapsibleGroups
                      groups={pastGroups}
                      openGroups={openGroups}
                      setOpenGroups={setOpenGroups}
                      defaultOpenKeys={['last-week', pastGroups[1]?.key].filter(Boolean)}
                      provider={user}
                    />
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

// Compute the live price for a booking using the provider's CURRENT
// pricing config + the client's CURRENT pricingTier. The booking's
// stored pricing.totalPrice reflects what was charged at booking time
// — outdated as soon as the client gets moved to a different tier or
// the provider raises their rates. Provider explicitly wants the row
// to read the up-to-date number, not historical ledger data.
function computeLivePrice(booking, provider) {
  if (!provider?.providerProfile) return null;
  const tierId = booking.client?.clientProfile?.pricingTierId;
  let pricing = provider.providerProfile.basePricing || [];
  if (tierId) {
    const tier = (provider.providerProfile.pricingTiers || [])
      .find(t => String(t._id) === String(tierId));
    if (tier?.pricing?.length) pricing = tier.pricing;
  }
  const tierEntry = pricing.find(p => p.duration === booking.duration);
  if (!tierEntry) return null;
  const addonDefs = provider.providerProfile.addons || [];
  const addonsTotal = (booking.addons || [])
    .map(name => addonDefs.find(a => a.name === name))
    .filter(Boolean)
    .reduce((sum, a) => sum + (a.price || 0), 0);
  return tierEntry.price + addonsTotal;
}

// Stack of collapsible date groups. Each group has its own toggle so
// the user can keep "This week" open and "April 2026" closed
// independently. Default-open keys (e.g. today/tomorrow/this-week)
// are honored on first render; user toggles win after that.
const CollapsibleGroups = ({ groups, openGroups, setOpenGroups, defaultOpenKeys = [], provider }) => {
  const isOpen = (key) =>
    openGroups[key] === undefined ? defaultOpenKeys.includes(key) : openGroups[key];
  const toggle = (key) =>
    setOpenGroups(prev => ({ ...prev, [key]: !isOpen(key) }));

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        if (!g.list || g.list.length === 0) return null;
        const open = isOpen(g.key);
        return (
          <div key={g.key} className="border border-line rounded-card bg-paper-elev/50">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-paper-deep rounded-card"
            >
              {open ? <ChevronDown className="w-4 h-4 text-ink-3" /> : <ChevronRight className="w-4 h-4 text-ink-3" />}
              <span className="av-eyebrow text-ink-2">{g.label}</span>
              <span className="text-[11px] text-ink-3">{g.list.length}</span>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                {g.list.map(a => <AppointmentRow key={a._id} booking={a} provider={provider} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Single appointment row — the only renderer in this view. Tap → detail.
// Mirrors the dashboard's TimelineRow visual rhythm so the two views feel
// like one product instead of two competing pages.
const AppointmentRow = ({ booking, provider }) => {
  // Live price = recompute from provider's current pricing tiers +
  // client's current tier. Falls back to the booking's stored
  // pricing.totalPrice only if we can't compute live (missing
  // duration in tier, etc) — better to show old data than nothing.
  const livePrice = computeLivePrice(booking, provider);
  const displayPrice = livePrice != null ? livePrice : (booking.pricing?.totalPrice || 0);
  const formatTime = (hhmm) => moment(hhmm, 'HH:mm').format('h:mm A');
  const recipient = booking.recipientType === 'other' && booking.recipientInfo?.name
    ? booking.recipientInfo.name
    : (booking.client?.profile?.fullName || booking.client?.email || 'Client');

  const neighborhood = booking.location?.address?.split(',')[0] || '';
  const isCancelled = booking.status === 'cancelled';
  const isCompleted = booking.status === 'completed';
  const hasPrice = displayPrice > 0;
  const isUnpaid = hasPrice && booking.paymentStatus !== 'paid';
  const isChain = !!booking.groupId;

  return (
    <Link
      to={`/appointments/${booking._id}`}
      className={`flex items-center gap-3.5 py-3 px-3.5 rounded-card bg-paper-elev border border-line
        hover:shadow-atelier-sm transition ${isCancelled ? 'opacity-60' : ''}`}
      style={!isCancelled && !isCompleted ? { borderLeft: '3px solid #B07A4E' } : undefined}
    >
      {/* Date + Time column. Date is the dominant line so a row scanned
          inside "May 2026" or "This week" still tells you Tue 5/12 vs
          Thu 5/14 at a glance. */}
      <div className="flex flex-col items-start" style={{ width: 78 }}>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isCancelled || isCompleted ? 'text-ink-3' : 'text-ink'}`}>
          {moment.utc(booking.date).tz('America/Los_Angeles').format('ddd M/D')}
        </span>
        <span className={`av-meta mt-0.5 ${isCancelled || isCompleted ? 'text-ink-3' : 'text-accent'}`}>
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

      {/* Status indicators column. Price replaces the old $ icon — at
          a glance the provider sees what each session is worth.
          Unpaid appointments get an amber pill so they still stand
          out; paid/no-price appointments render plain.  */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isCompleted && (
          <CheckCircle className="w-4 h-4 text-green-600" title="Completed" />
        )}
        {isCancelled && (
          <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            Cancelled
          </span>
        )}
        {hasPrice && !isCancelled && (
          isUnpaid ? (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
              title="Unpaid"
            >
              ${displayPrice}
            </span>
          ) : (
            <span className="text-xs font-medium text-ink-2">
              ${displayPrice}
            </span>
          )
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
