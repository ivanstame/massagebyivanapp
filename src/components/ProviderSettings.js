import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { Settings, MapPin, Clock, AlertCircle, CheckCircle, Trash2, Home } from 'lucide-react';
import axios from 'axios';
import { handlePhoneNumberChange, isValidPhoneNumber } from '../utils/phoneUtils';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const ProviderSettings = () => {
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [settings, setSettings] = useState({
    businessName: '',
    phoneNumber: '',
    address: { street: '', unit: '', city: '', state: '', zip: '' },
    scheduling: {
      defaultDuration: 60,
      bufferTime: 15,
      advanceBooking: 30,
      maxDailyBookings: 8
    },
    services: []
  });

  useEffect(() => {
    if (user?.providerProfile || user?.profile) {
      setSettings(prev => ({
        ...prev,
        businessName: user.providerProfile?.businessName || '',
        phoneNumber: user.profile?.phoneNumber || '',
        address: {
          street: user.profile?.address?.street || '',
          unit: user.profile?.address?.unit || '',
          city: user.profile?.address?.city || '',
          state: user.profile?.address?.state || '',
          zip: user.profile?.address?.zip || ''
        },
        scheduling: user.providerProfile?.scheduling || prev.scheduling,
        services: user.providerProfile?.services || []
      }));
    }
  }, [user]);

  const validateSettings = () => {
    if (!settings.businessName || settings.businessName.trim().length === 0) {
      setError('Business name is required');
      return false;
    }
    if (settings.scheduling.maxDailyBookings < 1 || settings.scheduling.maxDailyBookings > 12) {
      setError('Maximum daily bookings must be between 1 and 12');
      return false;
    }
    if (settings.phoneNumber && !isValidPhoneNumber(settings.phoneNumber)) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!validateSettings()) return;

    setIsLoading(true);

    try {
      const response = await axios.put('/api/users/provider/settings', { settings });

      // Update the AuthContext user with new data
      if (response.data.profile || response.data.settings) {
        setUser(prev => ({
          ...prev,
          providerProfile: response.data.settings || prev.providerProfile,
          profile: response.data.profile || prev.profile
        }));
      }

      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleteLoading(true);

    try {
      await axios.delete('/api/users/account');
      setShowDeleteConfirm(false);
      window.location.href = '/login';
    } catch (error) {
      setDeleteError(error.response?.data?.message || 'Failed to delete account');
      setDeleteLoading(false);
    }
  };

  const handleAddressChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value }
    }));
  };

  return (
    <div className="pt-16">
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your business preferences
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700 flex items-start rounded">
            <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{successMessage}</p>
          </div>
        )}

        {/* Business Information */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-[#009ea5]" />
            <h3 className="font-medium text-slate-900">Business Information</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={settings.businessName}
                onChange={(e) => setSettings(prev => ({ ...prev, businessName: e.target.value }))}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                placeholder="Enter your business name"
              />
              <p className="mt-1 text-xs text-slate-500">
                This name will be displayed to your clients
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.phoneNumber}
                onChange={(e) => handlePhoneNumberChange(e, (value) =>
                  setSettings(prev => ({ ...prev, phoneNumber: value }))
                )}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                placeholder="(555) 123-4567"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used for client text messaging
              </p>
            </div>
          </div>
        </div>

        {/* Home Address */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Home className="w-5 h-5 text-[#009ea5]" />
            <h3 className="font-medium text-slate-900">Home Address</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Your home address is used as the default starting point for drive time calculations.
            Saving this will auto-create or update your "Home" saved location.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                value={settings.address.street}
                onChange={(e) => handleAddressChange('street', e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                placeholder="712 Jasmine Ave"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit / Apt</label>
              <input
                type="text"
                value={settings.address.unit}
                onChange={(e) => handleAddressChange('unit', e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                placeholder="Suite 100 (optional)"
              />
            </div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={settings.address.city}
                  onChange={(e) => handleAddressChange('city', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                  placeholder="Corona Del Mar"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <select
                  value={settings.address.state}
                  onChange={(e) => handleAddressChange('state', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                >
                  <option value="">--</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                <input
                  type="text"
                  value={settings.address.zip}
                  onChange={(e) => handleAddressChange('zip', e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
                  placeholder="92625"
                  maxLength={5}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#009ea5]" />
            <h3 className="font-medium text-slate-900">Scheduling</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Default Appointment Duration
              </label>
              <select
                value={settings.scheduling.defaultDuration}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  scheduling: { ...prev.scheduling, defaultDuration: parseInt(e.target.value) }
                }))}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
              >
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>120 minutes</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Maximum Daily Bookings
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={settings.scheduling.maxDailyBookings}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  scheduling: { ...prev.scheduling, maxDailyBookings: parseInt(e.target.value) }
                }))}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg
              hover:bg-red-700 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>

          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-6 py-2.5 bg-[#009ea5] text-white text-sm font-medium rounded-lg
              hover:bg-[#008a91] disabled:bg-slate-400"
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Delete Account
              </h3>
              <p className="text-slate-600 mb-6">
                Are you sure you want to delete your account? This action cannot be undone.
                All your data, including bookings, availability, and client information will be permanently deleted.
              </p>
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                  <p>{deleteError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {deleteLoading ? 'Deleting...' : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderSettings;
