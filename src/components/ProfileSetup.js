import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import AddressForm from './AddressForm';

const STATES = [
  ['AK', 'Alaska'], ['AL', 'Alabama'], ['AR', 'Arkansas'], ['AZ', 'Arizona'], 
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], 
  ['DC', 'District of Columbia'], ['DE', 'Delaware'], ['FL', 'Florida'], 
  ['GA', 'Georgia'], ['HI', 'Hawaii'], ['IA', 'Iowa'], ['ID', 'Idaho'], 
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['KS', 'Kansas'], ['KY', 'Kentucky'], 
  ['LA', 'Louisiana'], ['MA', 'Massachusetts'], ['MD', 'Maryland'], 
  ['ME', 'Maine'], ['MI', 'Michigan'], ['MN', 'Minnesota'], 
  ['MO', 'Missouri'], ['MS', 'Mississippi'], ['MT', 'Montana'], 
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['NE', 'Nebraska'], 
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], 
  ['NV', 'Nevada'], ['NY', 'New York'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], 
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], 
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], 
  ['TX', 'Texas'], ['UT', 'Utah'], ['VA', 'Virginia'], ['VT', 'Vermont'], 
  ['WA', 'Washington'], ['WI', 'Wisconsin'], ['WV', 'West Virginia'], 
  ['WY', 'Wyoming']
];

const ProgressIndicator = ({ currentStep }) => (
  <div className="mb-8 w-full max-w-2xl">
    <div className="flex justify-between mb-2">
      <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
        Account
      </div>
      <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
        Profile
      </div>
      <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
        Preferences
      </div>
    </div>
    <div className="h-1 bg-slate-100 rounded-full">
      <div 
        className="h-full bg-[#387c7e] rounded-full transition-all duration-500"
        style={{ width: `${(currentStep / 3) * 100}%` }}
      />
    </div>
  </div>
);

const ProfileSetup = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [formValid, setFormValid] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    street: '',
    unit: '',
    city: '',
    state: '',
    zip: '',
    businessName: '',
    allergies: '',
    medicalConditions: ''
  });

  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google?.maps?.places) {
        console.log(`[GoogleMaps] ${new Date().toISOString()} | Google Maps API already loaded`);
        setGoogleMapsLoaded(true);
        return;
      }

      // Use the environment variable for the API key
      const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error(`[GoogleMaps] ${new Date().toISOString()} | Missing Google Maps API key`);
        setLoadError('Missing Google Maps API key');
        return;
      }

      console.log(`[GoogleMaps] ${new Date().toISOString()} | Loading Google Maps API script from ProfileSetup`);
      
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        if (!window.google?.maps?.places) {
          console.error(`[GoogleMaps] ${new Date().toISOString()} | Failed to load Google Maps API`);
          setLoadError('Failed to load Google Maps API');
          return;
        }
        console.log(`[GoogleMaps] ${new Date().toISOString()} | Google Maps API script loaded successfully from ProfileSetup`);
        setGoogleMapsLoaded(true);
      };

      script.onerror = (error) => {
        console.error(`[GoogleMaps] ${new Date().toISOString()} | Failed to load Google Maps script:`, error);
        setLoadError('Failed to load Google Maps script');
      };

      document.head.appendChild(script);
    };

    if (!user) {
      navigate('/signup');
      return;
    }

    if (user.admin) {
      navigate('/admin-dashboard');
      return;
    }

    loadGoogleMaps();
  }, [user, navigate]);

  useEffect(() => {
    const isValid = (
      formData.fullName.trim() !== '' &&
      formData.phoneNumber.trim() !== '' &&
      formData.street.trim() !== '' &&
      formData.city.trim() !== '' &&
      formData.state.trim() !== '' &&
      formData.zip.trim() !== '' &&
      (user?.accountType !== 'PROVIDER' || formData.businessName.trim() !== '')
    );
    setFormValid(isValid);
  }, [formData, user?.accountType]);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValid || isLoading) return;

    setIsLoading(true);
    setError('');

    try {

      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include',
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          address: {
            street: formData.street.trim(),
            unit: formData.unit.trim(),
            city: formData.city.trim(),
            state: formData.state.trim(),
            zip: formData.zip.trim()
          },
          businessName: formData.businessName.trim(),
          allergies: formData.allergies.trim(),
          medicalConditions: formData.medicalConditions.trim(),
          registrationStep: 2
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Profile update failed');
      }

      const userData = await response.json();
      setUser({
        ...user,
        ...userData.user,
        registrationStep: 3
      });

      navigate('/treatment-preferences', { 
        replace: true,
        state: { forceReload: true } 
      });

    } catch (err) {
      console.error('Submission Error:', err);
      setError(err.message || 'An error occurred while saving your profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (user?.admin) return null;

  if (loadError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg border border-red-200">
        <strong>Error:</strong> {loadError}. Check your API key and network connection.
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-2xl">
        <ProgressIndicator currentStep={2} />
        
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-normal text-slate-700">Profile Information</h2>
            <p className="mt-2 text-slate-500">Step 2 of 3: Basic Information</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                  placeholder="Your contact number"
                />
              </div>
            </div>

            {user.accountType === 'PROVIDER' && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                  placeholder="Your business name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                {user.accountType === 'PROVIDER' ? 'Business Address' : 'Address'}
              </label>
              <AddressForm 
                onAddressConfirmed={(addr) => setFormData(prev => ({
                  ...prev,
                  street: addr.street,
                  city: addr.city,
                  state: addr.state,
                  zip: addr.zip,
                  unit: addr.unit
                }))}
                googleMapsLoaded={googleMapsLoaded}
              />
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Allergies
                </label>
                <input
                  type="text"
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                  placeholder="Any allergies we should be aware of (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Medical Conditions
                </label>
                <textarea
                  name="medicalConditions"
                  value={formData.medicalConditions}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition h-24"
                  placeholder="Please list any medical conditions or concerns that may affect your treatment (optional)"
                />
              </div>
            </div>

            <div className="flex justify-between space-x-4">
              <button
                type="submit"
                disabled={!formValid || isLoading}
                className={`flex-1 py-3 px-4 rounded-md ${
                  formValid && !isLoading 
                    ? 'bg-[#387c7e] hover:bg-[#2c5f60]' 
                    : 'bg-gray-300 cursor-not-allowed'
                } text-white font-medium transition-all duration-150`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  </div>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
