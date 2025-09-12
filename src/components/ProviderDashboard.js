import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Calendar, Users, Clock, Settings, CreditCard, Map, Mail } from 'lucide-react';
import api from '../services/api';
import { DateTime } from "luxon";
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

  // Verify provider access
  if (!user || user.accountType !== 'PROVIDER') {
    navigate('/login');
    return null;
  }

  // Add the stats state and fetching
  const [stats, setStats] = useState({ total: 0, completed: 0, upcoming: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [clientStats, setClientStats] = useState({ active: 0, newThisMonth: 0 });
  const [clientStatsLoading, setClientStatsLoading] = useState(true);
  const [mileageStats, setMileageStats] = useState({ thisMonth: 0 });
  const [mileageStatsLoading, setMileageStatsLoading] = useState(true);
  const [revenueStats, setRevenueStats] = useState({ thisMonth: 0 });
  const [revenueStatsLoading, setRevenueStatsLoading] = useState(true);

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

    const fetchClientStats = async () => {
      try {
        // TODO: Replace with actual API endpoint when backend is ready
        // const response = await api.get('/api/users/provider/clients/stats');
        // setClientStats(response.data);
        setClientStats({ active: 0, newThisMonth: 0 });
      } catch (err) {
        console.error('Failed to fetch client stats:', err);
      } finally {
        setClientStatsLoading(false);
      }
    };

    const fetchMileageStats = async () => {
      try {
        // TODO: Replace with actual API endpoint when backend is ready
        // const response = await api.get('/api/bookings/mileage/stats');
        // setMileageStats(response.data);
        setMileageStats({ thisMonth: 0 });
      } catch (err) {
        console.error('Failed to fetch mileage stats:', err);
      } finally {
        setMileageStatsLoading(false);
      }
    };

    const fetchRevenueStats = async () => {
      try {
        // TODO: Replace with actual API endpoint when backend is ready
        // const response = await api.get('/api/bookings/revenue/stats');
        // setRevenueStats(response.data);
        setRevenueStats({ thisMonth: 0 });
      } catch (err) {
        console.error('Failed to fetch revenue stats:', err);
      } finally {
        setRevenueStatsLoading(false);
      }
    };

    fetchStats();
    fetchClientStats();
    fetchMileageStats();
    fetchRevenueStats();
  }, []);
  

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Welcome back, {user.providerProfile?.businessName || user.profile?.fullName}
            </h1>
            <p className="mt-1 text-sm sm:text-base text-slate-500">
              Manage your appointments and business settings
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsLoading ? (
            <SkeletonCard />
          ) : (
            <StatCard
              icon={Calendar}
              label="Today's Appointments"
              value={stats.total}
              description={`${stats.completed} completed, ${stats.upcoming} upcoming`}
            />
          )}
          
          {clientStatsLoading ? (
            <SkeletonCard />
          ) : (
            <StatCard
              icon={Users}
              label="Active Clients"
              value={clientStats.active}
              description={`${clientStats.newThisMonth} new this month`}
            />
          )}
          
          {mileageStatsLoading ? (
            <SkeletonCard />
          ) : (
            <StatCard
              icon={Map}
              label="Total Miles"
              value={mileageStats.thisMonth}
              description="This month"
            />
          )}
          
          {revenueStatsLoading ? (
            <SkeletonCard />
          ) : (
            <StatCard
              icon={CreditCard}
              label="Revenue"
              value={`$${revenueStats.thisMonth.toFixed(2)}`}
              description="This month"
            />
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Link
            to="/provider/availability"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 
              hover:border-[#009ea5] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-4">
              <Calendar className="w-5 h-5 text-[#009ea5] mr-2" />
              <h3 className="font-medium text-slate-900">Manage Calendar</h3>
            </div>
            <p className="text-slate-500 text-sm">
              View and manage your appointments and availability
            </p>
          </Link>

          <Link
            to="/provider/clients"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 
              hover:border-[#387c7e] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-4">
              <Users className="w-5 h-5 text-[#387c7e] mr-2" />
              <h3 className="font-medium text-slate-900">Client Management</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Manage your client list and send invitations
            </p>
          </Link>

          <Link
            to="/provider/settings"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 
              hover:border-[#387c7e] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-4">
              <Settings className="w-5 h-5 text-[#387c7e] mr-2" />
              <h3 className="font-medium text-slate-900">Business Settings</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Update your business preferences and service area
            </p>
          </Link>

          <Link
            to="/provider/test-invites"
            className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 
              hover:border-[#387c7e] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center mb-4">
              <Mail className="w-5 h-5 text-[#387c7e] mr-2" />
              <h3 className="font-medium text-slate-900">Test Invitations</h3>
            </div>
            <p className="text-slate-500 text-sm">
              Create and manage test invitation codes
            </p>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            <p className="text-slate-500 text-sm italic">No recent activity</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderDashboard;
