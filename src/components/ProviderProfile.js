import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { 
  MapPin, Clock, Calendar, Check, AlertCircle, 
  Mail, Phone, FileText, Users 
} from 'lucide-react';
import axios from 'axios';
import moment from 'moment-timezone';

const ProviderProfile = () => {
  const { providerId } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [provider, setProvider] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalClients: 0,
    completedAppointments: 0,
    yearsInBusiness: 0,
    servicedAreas: []
  });
  const [services, setServices] = useState([]);

  useEffect(() => {
    fetchProviderProfile();
  }, [providerId]);

  const fetchProviderProfile = async () => {
    try {
      const [profileResponse, statsResponse] = await Promise.all([
        axios.get(`/api/users/provider/${providerId}/profile`),
        axios.get(`/api/users/provider/${providerId}/stats`)
      ]);

      setProvider(profileResponse.data);
      setStats(statsResponse.data);
      setServices(profileResponse.data.providerProfile.services || []);
    } catch (error) {
      console.error('Error fetching provider profile:', error);
      setError('Failed to load provider profile');
    } finally {
      setIsLoading(false);
    }
  };

  const ServiceCard = ({ service }) => (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <h3 className="text-lg font-medium text-slate-900">{service.name}</h3>
      <p className="mt-2 text-slate-600">{service.description}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[#B07A4E] font-medium">
          {service.duration} minutes
        </span>
        <span className="text-slate-900 font-medium">
          ${service.price}
        </span>
      </div>
    </div>
  );

  const BusinessHours = () => (
    <div className="space-y-2">
      {provider.providerProfile.availability.map((day, index) => (
        <div key={index} className="flex justify-between items-center">
          <span className="text-slate-600">{day.day}</span>
          <span className="text-slate-900">
            {day.hours || 'Closed'}
          </span>
        </div>
      ))}
    </div>
  );

  const Stats = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-2xl font-bold text-[#B07A4E]">
          {stats.totalClients}
        </div>
        <div className="text-sm text-slate-600">Active Clients</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#B07A4E]">
          {stats.completedAppointments}
        </div>
        <div className="text-sm text-slate-600">Appointments</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#B07A4E]">
          {stats.yearsInBusiness}
        </div>
        <div className="text-sm text-slate-600">Years Experience</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#B07A4E]">
          {stats.servicedAreas.length}
        </div>
        <div className="text-sm text-slate-600">Areas Served</div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="pt-16">
        <div className="max-w-7xl mx-auto p-4">
          <div className="text-center">Loading provider profile...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-16">
        <div className="max-w-7xl mx-auto p-4">
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
            <div className="flex">
              <AlertCircle className="w-5 h-5 mr-2" />
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {provider.providerProfile.businessName}
              </h1>
            </div>
            <div className="mt-4 md:mt-0 space-x-4">
              {provider.profile?.phoneNumber && (
                <button
                  onClick={() => window.location.href = `tel:${provider.profile.phoneNumber}`}
                  className="inline-flex items-center px-3 py-1.5 border border-slate-300
                    rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  <Phone className="w-4 h-4 mr-1.5" />
                  Call
                </button>
              )}
              <button
                onClick={() => window.location.href = `mailto:${provider.email}`}
                className="inline-flex items-center px-3 py-1.5 border border-slate-300
                  rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                <Mail className="w-4 h-4 mr-1.5" />
                Email
              </button>
              <button
                onClick={() => navigate('/book')}
                className="inline-flex items-center px-4 py-2 bg-[#B07A4E]
                  text-white rounded-lg hover:bg-[#8A5D36]"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Book Appointment
              </button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <Stats />
        </div>

        {/* Services Grid */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => (
              <ServiceCard key={index} service={service} />
            ))}
          </div>
        </div>

        {/* Business Hours and Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Business Hours
            </h2>
            <BusinessHours />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Service Areas
            </h2>
            <div className="space-y-2">
              {stats.servicedAreas.map((area, index) => (
                <div key={index} className="flex items-center text-slate-600">
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                  {area}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderProfile;
