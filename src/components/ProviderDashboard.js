import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Users, Settings, MapPin, Clock, DollarSign, Sparkles, Plus, Ban, ArrowRight } from 'lucide-react';
import api from '../services/api';
import { DateTime } from 'luxon';
import { BrushLeaf } from './brush/BrushMotifs';

const Stat = ({ label, value, sub, accent }) => (
  <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5 relative overflow-hidden">
    <div className="av-meta text-ink-3">{label}</div>
    <div className="font-display mt-2"
      style={{ fontSize: 30, lineHeight: 1, fontWeight: 500, color: accent ? '#B07A4E' : '#2A2520' }}>
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

const TimelineRow = ({ booking, formatTime }) => (
  <Link
    to={`/appointments/${booking._id}`}
    className="flex items-center gap-3.5 py-3 px-3.5 rounded-card bg-paper-deep
      hover:shadow-atelier-sm transition"
    style={{ borderLeft: '3px solid #B07A4E' }}
  >
    <span className="av-meta text-accent" style={{ width: 54 }}>
      {formatTime(booking.startTime)}
    </span>
    <div className="flex-1 min-w-0">
      <div className="font-display" style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 500 }}>
        {booking.client?.profile?.fullName || booking.recipientInfo?.name || 'Client'}
      </div>
      <div className="text-xs text-ink-2 mt-0.5 truncate">
        {booking.duration} min · {booking.location?.address?.split(',')[0] || ''}
      </div>
    </div>
    <ArrowRight className="w-3.5 h-3.5 text-ink-3" />
  </Link>
);

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
      <h3 className="font-display text-ink" style={{ fontSize: 16, fontWeight: 500 }}>{title}</h3>
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

  const [stats, setStats] = useState({ total: 0, completed: 0, upcoming: 0 });
  const [revenue, setRevenue] = useState(null);
  const [todayBookings, setTodayBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const today = DateTime.now().setZone('America/Los_Angeles').toFormat('yyyy-MM-dd');
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

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'pm' : 'am';
    const dh = h % 12 || 12;
    return `${dh}:${m.toString().padStart(2, '0')}${period}`;
  };

  const now = DateTime.now().setZone('America/Los_Angeles');
  const greeting = now.hour < 12 ? 'Good morning' : now.hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toFormat('EEEE · d LLLL').toLowerCase();
  const firstName = user.profile?.fullName?.split(' ')[0]
    || user.providerProfile?.businessName
    || 'there';

  // Build the subtitle copy
  const firstAppt = todayBookings.find(b => b.status !== 'completed');
  const subtitle = (() => {
    if (loading) return 'Loading your day...';
    if (todayBookings.length === 0) return 'No sessions today. Stillness is a gift.';
    if (todayBookings.length === 1) return firstAppt
      ? `One session today. It begins at ${formatTime(firstAppt.startTime)}.`
      : 'One session today, already complete.';
    const wordCount = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const count = todayBookings.length < 10 ? wordCount[todayBookings.length] : todayBookings.length;
    return firstAppt
      ? `${count.charAt(0).toUpperCase() + count.slice(1)} sessions today. The first begins at ${formatTime(firstAppt.startTime)}.`
      : `${count.charAt(0).toUpperCase() + count.slice(1)} sessions today, all done.`;
  })();

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Greeting header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
          <div>
            <div className="av-eyebrow mb-2">{todayLabel}</div>
            <h1 className="font-display" style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
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
              <div className="font-display" style={{ fontSize: 20, fontWeight: 500 }}>Today's rhythm</div>
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
                {todayBookings.map(b => <TimelineRow key={b._id} booking={b} formatTime={formatTime} />)}
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
              <div className="font-display mt-2" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em' }}>
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
                  Weekly template <ArrowRight className="w-3 h-3" />
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
