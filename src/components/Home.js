import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../AuthContext';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, ArrowRight, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { DateTime } from 'luxon';

const Home = () => {
  const { user } = useContext(AuthContext);
  const [nextBooking, setNextBooking] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(true);

  useEffect(() => {
    const fetchNext = async () => {
      try {
        const res = await api.get('/api/bookings');
        const now = new Date();
        const upcoming = (res.data || [])
          .filter(b => new Date(b.date) >= now && b.status !== 'cancelled')
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setNextBooking(upcoming[0] || null);
      } catch (err) {
        console.error('Failed to fetch bookings:', err);
      } finally {
        setLoadingBooking(false);
      }
    };
    fetchNext();
  }, []);

  const formatBookingDate = (date, startTime) => {
    try {
      const dt = DateTime.fromISO(new Date(date).toISOString().split('T')[0] + 'T' + startTime, { zone: 'America/Los_Angeles' });
      return {
        day: dt.toFormat('cccc, MMMM d'),
        time: dt.toFormat('h:mm a')
      };
    } catch {
      return { day: 'Upcoming', time: startTime };
    }
  };

  return (
    <div className="pt-16">
      <div className="max-w-2xl mx-auto p-4">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user.profile?.fullName?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-slate-500 mt-1">Manage your massage appointments</p>
        </div>

        {/* Profile incomplete warning */}
        {!user.profile?.fullName && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Complete your profile</p>
              <p className="text-sm text-amber-700 mt-1">
                Add your details for a better booking experience.{' '}
                <Link to="/my-profile" className="font-medium underline hover:text-amber-900">
                  Update profile
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Next Appointment Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-[#009ea5] to-[#007a80]">
            <h2 className="text-white font-semibold text-lg">Next Appointment</h2>
          </div>
          <div className="p-6">
            {loadingBooking ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 rounded-xl w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded-xl w-1/2"></div>
              </div>
            ) : nextBooking ? (
              <div className="space-y-3">
                {(() => {
                  const { day, time } = formatBookingDate(nextBooking.date, nextBooking.startTime);
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-[#009ea5]" />
                        <span className="text-slate-900 font-medium">{day}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-[#009ea5]" />
                        <span className="text-slate-700">{time} — {nextBooking.duration} minutes</span>
                      </div>
                    </>
                  );
                })()}
                {nextBooking.location?.address && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-[#009ea5]" />
                    <span className="text-slate-700">{nextBooking.location.address}</span>
                  </div>
                )}
                <Link
                  to={`/appointments/${nextBooking._id}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#009ea5] hover:text-[#008a91] transition-colors"
                >
                  View details <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-500">No upcoming appointments</p>
                <Link
                  to="/book"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#009ea5] hover:text-[#008a91] transition-colors"
                >
                  Book your next session <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/book"
            className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-[#009ea5]/30 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="bg-[#009ea5]/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#009ea5]/20 transition-colors">
              <Calendar className="w-6 h-6 text-[#009ea5]" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Book Appointment</h3>
            <p className="text-sm text-slate-500">Schedule your next massage session</p>
          </Link>

          <Link
            to="/my-bookings"
            className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-[#009ea5]/30 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="bg-[#009ea5]/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#009ea5]/20 transition-colors">
              <Clock className="w-6 h-6 text-[#009ea5]" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">My Appointments</h3>
            <p className="text-sm text-slate-500">View and manage your bookings</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
