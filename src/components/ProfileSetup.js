import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import AddressForm from './AddressForm';
import api from '../services/api';
import { AlertCircle, User, Phone, Briefcase, MapPin, AlertTriangle } from 'lucide-react';
import { handlePhoneNumberChange, isValidPhoneNumber } from '../utils/phoneUtils';

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

const ProgressIndicator = ({ currentStep, accountType }) => {
  const totalSteps = accountType === 'PROVIDER' ? 2 : 3;
  const stepLabels = [
    'Account',
    'Profile',
    ...(accountType === 'CLIENT' ? ['Preferences'] : [])
  ];

  return (
    <div className="mb-8 w-full max-w-2xl">
      <div className="flex justify-between mb-2">
        {stepLabels.map((label, index) => (
          <div
            key={label}
            className={`text-sm font-medium ${currentStep >= index + 1 ? 'text-[#387c7e]' : 'text-slate-400'}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="h-1 bg-slate-100 rounded-full">
        <div
          className="h-full bg-[#387c7e] rounded-full transition-all duration-500"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
};

const ProfileSetup = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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
    // Only include health fields for clients
    ...(user?.accountType === 'CLIENT' && {
      allergies: '',
      medicalConditions: ''
    })
  });

  useEffect(() => {
    if (!user) {
      navigate('/signup');
      return;
    }

    if (user.admin) {
      navigate('/admin-dashboard');
      return;
    }
  }, [user, navigate]);

  useEffect(() => {
    const isValid = (
      formData.fullName.trim() !== '' &&
      formData.phoneNumber.trim() !== '' &&
      isValidPhoneNumber(formData.phoneNumber) &&
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

      const requestBody = {
        fullName: formData.fullName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        address: {
          street: formData.street.trim(),
          unit: formData.unit?.trim() || '',
          city: formData.city.trim(),
          state: formData.state.trim(),
          zip: formData.zip.trim()
        },
        allergies: formData.allergies?.trim() || '',
        medicalConditions: formData.medicalConditions?.trim() || '',
        registrationStep: user?.accountType === 'PROVIDER' ? 3 : 2
      };

      // For providers, include the business name in providerProfile
      if (user?.accountType === 'PROVIDER') {
        requestBody.providerProfile = {
          businessName: formData.businessName.trim()
        };
      } else {
        // For clients, include businessName at root level (if needed for any reason)
        requestBody.businessName = formData.businessName?.trim() || '';
      }

      const response = await api.put('/api/users/profile', requestBody);
      const userData = response.data;

      setUser({
        ...user,
        ...userData.user,
        registrationStep: 3
      });

      if (user?.accountType === 'PROVIDER') {
        navigate('/dashboard', {
          replace: true
        });
      } else {
        navigate('/client-preferences', {
          replace: true,
          state: { forceReload: true }
        });
      }

    } catch (err) {
      console.error('Submission Error:', err);
      setError(err.response?.data?.message || 'An error occurred while saving your profile');
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
        <ProgressIndicator currentStep={2} accountType={user?.accountType} />
        
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-normal text-slate-700">Profile Information</h2>
            <p className="mt-2 text-slate-500">
              {user?.accountType === 'PROVIDER' ? 'Step 2 of 2: Basic Information' : 'Step 2 of 3: Basic Information'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-md">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact Information Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-800 flex items-center">
                <User className="w-5 h-5 mr-2 text-[#387c7e]" />
                Contact Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                      placeholder="John Doe"
                    />
                    <User className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={(e) => handlePhoneNumberChange(e, (value) =>
                        setFormData(prev => ({
                          ...prev,
                          phoneNumber: value
                        }))
                      )}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                      placeholder="(555) 123-4567"
                    />
                    <Phone className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            {user?.accountType === 'PROVIDER' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-slate-800 flex items-center">
                  <Briefcase className="w-5 h-5 mr-2 text-[#387c7e]" />
                  Business Information
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Business Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                      placeholder="Healing Hands Massage Therapy"
                    />
                    <Briefcase className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Address Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-800 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-[#387c7e]" />
                {user?.accountType === 'PROVIDER' ? 'Business Address' : 'Your Address'}
              </h3>
              
              <AddressForm 
                onAddressConfirmed={(addr) => setFormData(prev => ({
                  ...prev,
                  street: addr.street,
                  city: addr.city,
                  state: addr.state,
                  zip: addr.zip,
                  unit: addr.unit
                }))}
              />
            </div>

            {/* Health Information Section - Only for Clients */}
            {user?.accountType === 'CLIENT' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-slate-800 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-[#387c7e]" />
                  Health Information
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Allergies (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="allergies"
                      value={formData.allergies}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition"
                      placeholder="e.g., Latex, essential oils, nuts"
                    />
                    <AlertTriangle className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    List any allergies your therapist should be aware of
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Medical Conditions (Optional)
                  </label>
                  <textarea
                    name="medicalConditions"
                    value={formData.medicalConditions}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#387c7e] focus:border-transparent transition h-24 resize-none"
                    placeholder="List any medical conditions or concerns that may affect your treatment (e.g., pregnancy, injuries, chronic conditions)"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    This information helps your therapist provide safe, effective treatment
                  </p>
                </div>
              </div>
            )}

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
