import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { Settings, MapPin, Clock, CreditCard, Sliders, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import axios from 'axios';
import { handlePhoneNumberChange, isValidPhoneNumber } from '../utils/phoneUtils';

const ProviderSettings = () => {
  const { user } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [settings, setSettings] = useState({
    businessName: '',
    scheduling: {
      defaultDuration: 60,
      bufferTime: 15,
      advanceBooking: 30,
      maxDailyBookings: 8
    },
    services: []
  });

  // Load initial settings with debug logging
  useEffect(() => {
    console.log('ProviderSettings: Current user data:', user);
    console.log('ProviderSettings: User providerProfile:', user?.providerProfile);
    
    if (user?.providerProfile) {
      const updatedSettings = {
        ...settings,
        businessName: user.providerProfile.businessName || '',
        phoneNumber: user.profile?.phoneNumber || '',
        scheduling: user.providerProfile.scheduling || settings.scheduling,
        services: user.providerProfile.services || []
      };
      
      console.log('ProviderSettings: Setting state with:', updatedSettings);
      setSettings(updatedSettings);
    } else if (user?.accountType === 'PROVIDER') {
      console.warn('ProviderSettings: User is PROVIDER but providerProfile is missing or empty');
      console.log('ProviderSettings: User object structure:', JSON.stringify(user, null, 2));
    }
  }, [user]);

  const validateSettings = () => {
    // Validate business name
    if (!settings.businessName || settings.businessName.trim().length === 0) {
      setError('Business name is required');
      return false;
    }

    // Validate scheduling
    if (settings.scheduling.maxDailyBookings < 1 || settings.scheduling.maxDailyBookings > 12) {
      setError('Maximum daily bookings must be between 1 and 12');
      return false;
    }


    // Validate phone number format
    if (settings.phoneNumber && !isValidPhoneNumber(settings.phoneNumber)) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    // Validate form before saving
    if (!validateSettings()) {
      return;
    }

    setIsLoading(true);

    try {
      console.log('ProviderSettings: Sending settings to server:', settings);
      const response = await axios.put('/api/users/provider/settings', {
        settings
      });

      console.log('ProviderSettings: Server response:', response.data);
      setSuccessMessage('Settings saved successfully');
      
      // Refresh the user data to ensure the AuthContext gets updated
      // This will trigger the useEffect to reload settings with the updated data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('ProviderSettings: Error saving settings:', error);
      console.error('ProviderSettings: Error response:', error.response?.data);
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
      // Close the modal and redirect to login page
      setShowDeleteConfirm(false);
      window.location.href = '/login';
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteError(error.response?.data?.message || 'Failed to delete account');
      setDeleteLoading(false);
    }
  };

  const SchedulingSettings = () => (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#387c7e]" />
        <h3 className="font-medium text-slate-900">Scheduling</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Default Appointment Duration
          </label>
          <select
            value={settings.scheduling.defaultDuration}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              scheduling: {
                ...prev.scheduling,
                defaultDuration: parseInt(e.target.value)
              }
            }))}
            className="w-full p-2 border rounded-md"
          >
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>


        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Maximum Daily Bookings
          </label>
          <input
            type="number"
            min="1"
            max="12"
            value={settings.scheduling.maxDailyBookings}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              scheduling: {
                ...prev.scheduling,
                maxDailyBookings: parseInt(e.target.value)
              }
            }))}
            className="w-full p-2 border rounded-md"
          />
        </div>
      </div>
    </div>
  );


  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Provider Settings</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your business preferences
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
            <div className="flex">
              <AlertCircle className="w-5 h-5 mr-2" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 text-green-700">
            <div className="flex">
              <CheckCircle className="w-5 h-5 mr-2" />
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        {/* Business Information */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-[#387c7e]" />
            <h3 className="font-medium text-slate-900">Business Information</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={settings.businessName}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  businessName: e.target.value
                }))}
                className="w-full p-2 border rounded-md"
                placeholder="Enter your business name"
                required
              />
              <p className="mt-1 text-sm text-slate-500">
                This name will be displayed to your clients
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.phoneNumber}
                onChange={(e) => handlePhoneNumberChange(e, (value) =>
                  setSettings(prev => ({
                    ...prev,
                    phoneNumber: value
                  }))
                )}
                className="w-full p-2 border rounded-md"
                placeholder="(555) 123-4567"
              />
              <p className="mt-1 text-sm text-slate-500">
                This number will be used for client text messaging
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SchedulingSettings />
        </div>

        <div className="mt-6 flex justify-between items-center">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md
              hover:bg-red-700 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
          
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-[#387c7e] text-white rounded-md
              hover:bg-[#2c5f60] disabled:opacity-50"
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
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md
                    hover:bg-slate-50"
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md
                    hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
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
