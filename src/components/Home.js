import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../AuthContext';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, ArrowRight, User, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { DateTime } from 'luxon';
import { BrushBlob, BrushCircle, BrushLeaf } from './brush/BrushMotifs';

const Home = () => {
  const { user } = useContext(AuthContext);
  const [nextBooking, setNextBooking] = useState(null);
  const [lastBookingDaysAgo, setLastBookingDaysAgo] = useState(null);
  const [totalPast, setTotalPast] = useState(0);
  const [loadingBooking, setLoadingBooking] = useState(true);

  useEffect(() => {
    const fetchNext = async () => {
      try {
        const res = await api.get('/api/bookings');
        const now = new Date();
        const all = (res.data || []).filter(b => b.status !== 'cancelled');
        const upcoming = all
          .filter(b => new Date(b.date) >= now)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setNextBooking(upcoming[0] || null);

        const past = all
          .filter(b => new Date(b.date) < now)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setTotalPast(past.length);
        if (past[0]) {
          const days = Math.floor((now - new Date(past[0].date)) / (1000 * 60 * 60 * 24));
          setLastBookingDaysAgo(days);
        }
      } catch (err) {
        console.error('Failed to fetch bookings:', err);
      } finally {
        setLoadingBooking(false);
      }
    };
    fetchNext();
  }, []);

  const firstName = user?.profile?.fullName?.split(' ')[0] || 'there';
  const now = DateTime.now().setZone('America/Los_Angeles');
  const greeting = now.hour < 12 ? 'Good morning' : now.hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toFormat('EEEE · d LLLL').toLowerCase();

  const nextAppt = nextBooking ? (() => {
    try {
      const dt = DateTime.fromISO(
        new Date(nextBooking.date).toISOString().split('T')[0] + 'T' + nextBooking.startTime,
        { zone: 'America/Los_Angeles' }
      );
      const end = dt.plus({ minutes: nextBooking.duration });
      return {
        dateLine: dt.toFormat('EEEE, d LLLL'),
        timeLine: `${dt.toFormat('h:mm a')} — ${end.toFormat('h:mm a')}`.toLowerCase(),
        address: nextBooking.location?.address,
        duration: nextBooking.duration,
      };
    } catch {
      return null;
    }
  })() : null;

  return (
    <div className="av-paper pt-16">
      {/* Header: greeting + brush blob decoration */}
      <div className="relative px-6 pt-6 pb-2 max-w-2xl mx-auto">
        <div className="absolute -top-8 -right-10 pointer-events-none" style={{ zIndex: 0 }}>
          <BrushBlob width={260} height={260} color="#B07A4E" opacity={0.09} />
        </div>

        <div className="relative z-10">
          <div className="av-meta text-ink-3">{todayLabel}</div>
          <h1 className="font-display mt-1 mb-0" style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            {greeting},<br />
            <em style={{ color: '#B07A4E' }}>{firstName}.</em>
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-10">
        {/* Profile incomplete warning */}
        {!user?.profile?.fullName && (
          <div className="mt-6 p-4 border border-amber-200 rounded-card flex items-start gap-3"
            style={{ background: 'rgba(184,121,42,0.08)' }}>
            <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Complete your profile</p>
              <p className="text-sm text-amber-800 mt-1">
                Add your details for a better booking experience.{' '}
                <Link to="/my-profile" className="font-medium underline hover:text-amber-900">
                  Update profile
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Next appointment centerpiece */}
        <div className="mt-7 relative overflow-hidden bg-paper-elev border border-line rounded-card shadow-atelier-sm p-5">
          <div className="absolute -right-5 -top-5 pointer-events-none opacity-25">
            <BrushCircle size={140} color="#B07A4E" stroke={6} />
          </div>

          {loadingBooking ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-paper-deep rounded w-1/3"></div>
              <div className="h-7 bg-paper-deep rounded w-2/3"></div>
              <div className="h-4 bg-paper-deep rounded w-1/2"></div>
            </div>
          ) : nextAppt ? (
            <>
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="av-meta" style={{ color: '#B07A4E' }}>Your next hour</div>
                  <div className="font-display mt-2" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 500 }}>
                    {nextAppt.dateLine}
                  </div>
                  <div className="mt-0.5 text-ink-2" style={{ fontSize: 15 }}>
                    {nextAppt.timeLine}
                  </div>
                </div>
                <div className="av-meta px-2.5 py-1 rounded-full border border-line text-ink-2">
                  {nextBooking.status === 'confirmed' ? 'Confirmed' : (nextBooking.status || 'Pending')}
                </div>
              </div>

              <hr className="my-4 border-0 h-px" style={{ background: 'var(--line)' }} />

              <div className="flex flex-col gap-2.5 text-sm relative z-10">
                <Row icon={<Clock className="w-[15px] h-[15px]" />} label="Session">
                  {nextAppt.duration} min
                </Row>
                {nextAppt.address && (
                  <Row icon={<MapPin className="w-[15px] h-[15px]" />} label="At">
                    {nextAppt.address}
                  </Row>
                )}
                {nextBooking.provider?.providerProfile?.businessName && (
                  <Row icon={<User className="w-[15px] h-[15px]" />} label="With">
                    {nextBooking.provider.providerProfile.businessName}
                  </Row>
                )}
              </div>

              <div className="flex gap-2 mt-4 relative z-10">
                <Link to={`/appointments/${nextBooking._id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4
                    rounded-btn border border-line bg-transparent text-ink text-[13px] font-medium
                    hover:bg-paper-deep transition">
                  Details
                </Link>
                <Link to="/book"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4
                    rounded-btn bg-accent text-white text-[13px] font-medium hover:bg-accent-ink transition">
                  Book again
                </Link>
              </div>
            </>
          ) : (
            <div className="relative z-10">
              <div className="av-meta" style={{ color: '#B07A4E' }}>A clear schedule</div>
              <div className="font-display mt-2" style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 500 }}>
                No appointments on the books.
              </div>
              <div className="text-sm text-ink-2 mt-1">Find a time that suits you.</div>
              <Link to="/book"
                className="mt-4 inline-flex items-center gap-1.5 py-2.5 px-4
                  rounded-btn bg-accent text-white text-[13px] font-medium hover:bg-accent-ink transition">
                Book a session <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Quick actions grid */}
        <div className="mt-7">
          <Eyebrow>Attend to</Eyebrow>
          <div className="grid grid-cols-2 gap-2.5 mt-3.5">
            <QuickCard to="/book" title="Book a session" sub="Find a time" />
            <QuickCard to="/my-bookings" title="My appointments"
              sub={totalPast > 0 ? `${totalPast} session${totalPast === 1 ? '' : 's'}` : 'Upcoming & past'} />
            <QuickCard to="/my-profile" title="Profile" sub="Details & addresses" />
            <QuickCard to="/treatment-preferences" title="Preferences" sub="Pressure · notes" />
          </div>
        </div>

        {/* Gentle recommendation */}
        {lastBookingDaysAgo !== null && lastBookingDaysAgo >= 14 && (
          <Link to="/book" className="mt-7 block">
            <div className="p-4 rounded-card flex gap-3.5 items-center border"
              style={{ background: 'rgba(176,122,78,0.12)', borderColor: 'transparent' }}>
              <BrushLeaf size={36} color="#B07A4E" />
              <div className="flex-1">
                <div className="font-display" style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 500 }}>
                  You last booked {lastBookingDaysAgo} days ago.
                </div>
                <div className="text-ink-2 mt-0.5" style={{ fontSize: 12.5 }}>
                  Your shoulders miss you.
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-accent" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
};

const Eyebrow = ({ children }) => (
  <div className="flex items-center gap-2.5">
    <span className="av-eyebrow">{children}</span>
    <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
  </div>
);

const Row = ({ icon, label, children }) => (
  <div className="flex gap-2.5 items-center">
    <span className="text-accent inline-flex">{icon}</span>
    <span className="av-meta text-ink-3" style={{ width: 52 }}>{label}</span>
    <span className="text-ink flex-1">{children}</span>
  </div>
);

const QuickCard = ({ to, title, sub }) => (
  <Link to={to} className="bg-paper-elev border border-line rounded-card shadow-atelier-sm p-3.5
    hover:shadow-atelier-md transition block">
    <div className="font-display" style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 500 }}>{title}</div>
    <div className="text-ink-3 mt-1" style={{ fontSize: 11.5 }}>{sub}</div>
    <div className="mt-3.5 flex justify-end text-accent">
      <ArrowRight className="w-3.5 h-3.5" />
    </div>
  </Link>
);

export default Home;
