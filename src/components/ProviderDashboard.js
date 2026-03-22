import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Users, Settings, MapPin, Clock } from 'lucide-react';
import api from '../services/api';
import { SkeletonCard } from './ui/Skeleton';

const StatCard = ({ icon: Icon, label, value, description }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      <div className="bg-[#009ea5]/10 p-3 rounded-lg">
        <Icon className="w-6 h-6 text-[#009ea5]" />
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
    fetchStats();
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

        {/* Quick Actions */}
        <h2 className="text-lg font-medium text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/provider/availability"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Calendar className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">Manage Availability</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Set your daily availability and manage your calendar
            </p>
          </Link>

          <Link
            to="/provider/schedule-template"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Clock className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">Weekly Template</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Set your recurring weekly schedule and anchor locations
            </p>
          </Link>

          <Link
            to="/provider/locations"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <MapPin className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">My Locations</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage saved locations and drop pins on the map
            </p>
          </Link>

          <Link
            to="/provider/clients"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Users className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">Client Management</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage your client list and send invitations
            </p>
          </Link>

          <Link
            to="/provider/appointments"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Calendar className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">Appointments</h3>
            </div>
            <p className="text-slate-500 text-sm">
              View upcoming and past appointments
            </p>
          </Link>

          <Link
            to="/provider/settings"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-3">
              <Settings className="w-5 h-5 text-[#009ea5] mr-2" />
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
