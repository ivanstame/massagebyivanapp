import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Users, Settings, MapPin, Clock, DollarSign, TrendingUp } from 'lucide-react';
import api from '../services/api';
import { SkeletonCard } from './ui/Skeleton';

const StatCard = ({ icon: Icon, label, value, description }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      <div className="bg-[#B07A4E]/10 p-3 rounded-xl">
        <Icon className="w-6 h-6 text-[#B07A4E]" />
      </div>
    </div>
  </div>
);

const ProviderDashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user || user.accountType !== 'PROVIDER') {
    navigate('/login');
    return null;
  }

  const [stats, setStats] = useState({ total: 0, completed: 0, upcoming: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [revenue, setRevenue] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/api/bookings?stats=today');
        setStats(response.data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };

    const fetchRevenue = async () => {
      try {
        const response = await api.get('/api/bookings/revenue');
        setRevenue(response.data);
      } catch (err) {
        console.error('Failed to fetch revenue:', err);
      } finally {
        setRevenueLoading(false);
      }
    };

    fetchStats();
    fetchRevenue();
  }, []);

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Welcome back, {user.providerProfile?.businessName || user.profile?.fullName}
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500">
            Manage your appointments and business settings
          </p>
        </div>

        {/* Today's Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {statsLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                icon={Calendar}
                label="Today's Appointments"
                value={stats.total}
                description="Total scheduled"
              />
              <StatCard
                icon={Clock}
                label="Completed"
                value={stats.completed}
                description="Done today"
              />
              <StatCard
                icon={Calendar}
                label="Upcoming"
                value={stats.upcoming}
                description="Still to go"
              />
            </>
          )}
        </div>

        {/* Revenue Summary */}
        {revenueLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : revenue && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#B07A4E]" />
              Revenue
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={DollarSign}
                label="This Week"
                value={`$${(revenue.weekRevenue || 0).toLocaleString()}`}
                description={`${revenue.paidCount || 0} paid sessions total`}
              />
              <StatCard
                icon={DollarSign}
                label="This Month"
                value={`$${(revenue.monthRevenue || 0).toLocaleString()}`}
              />
              <StatCard
                icon={DollarSign}
                label="All Time"
                value={`$${(revenue.totalRevenue || 0).toLocaleString()}`}
                description={revenue.unpaidCount > 0 ? `${revenue.unpaidCount} unpaid` : undefined}
              />
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <h2 className="text-lg font-medium text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/provider/availability"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Calendar className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Manage Availability</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Set your daily availability and manage your calendar
            </p>
          </Link>

          <Link
            to="/provider/schedule-template"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Clock className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Weekly Template</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Set your recurring weekly schedule and anchor locations
            </p>
          </Link>

          <Link
            to="/provider/locations"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <MapPin className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">My Locations</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage saved locations and drop pins on the map
            </p>
          </Link>

          <Link
            to="/provider/services"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <DollarSign className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Services & Pricing</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage your session pricing and add-on services
            </p>
          </Link>

          <Link
            to="/provider/clients"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Users className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Client Management</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage your client list and send invitations
            </p>
          </Link>

          <Link
            to="/provider/appointments"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Calendar className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Appointments</h3>
            </div>
            <p className="text-slate-500 text-sm">
              View upcoming and past appointments
            </p>
          </Link>

          <Link
            to="/provider/settings"
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200
              hover:border-[#B07A4E] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Settings className="w-5 h-5 text-[#B07A4E] mr-2" />
              <h3 className="font-medium text-slate-900">Settings</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Update your business preferences
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ProviderDashboard;
