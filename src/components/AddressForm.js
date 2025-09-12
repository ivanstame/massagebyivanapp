import React, { useState } from 'react';
import { MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

const AddressForm = ({ onAddressConfirmed, onCancel, showCancel }) => {
  // Form fields
  const [street, setStreet] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  
  // State
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [addressDetails, setAddressDetails] = useState(null);

  // Verify address with geocoding
  const verifyAddress = async () => {
    if (!street || !city || !state || !zip) {
      setVerificationError('Please fill in all required fields');
      return;
    }

    setIsVerifying(true);
    setVerificationError('');

    try {
      const fullAddress = `${street}${unit ? ', ' + unit : ''}, ${city}, ${state} ${zip}`;
      
      // Geocode the address
      const response = await api.get('/api/geocode', {
        params: { address: fullAddress }
      });

      if (response.data.lat && response.data.lng) {
        setAddressDetails({
          lat: response.data.lat,
          lng: response.data.lng,
          formatted_address: fullAddress
        });
        setIsVerified(true);
      } else {
        setVerificationError('Unable to verify this address. Please check and try again.');
      }
    } catch (error) {
      console.error('Address verification error:', error);
      
      // Handle specific error messages from the server
      if (error.response?.data?.message) {
        setVerificationError(error.response.data.message);
      } else if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
        setVerificationError('Unable to verify address. Please check your internet connection.');
      } else {
        setVerificationError('Unable to verify address. Please try again later.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle form changes
  const handleFieldChange = () => {
    setIsVerified(false);
    setVerificationError('');
  };

  return (
    <div className="space-y-4">
      {/* Traditional Address Form */}
      {!isVerified ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={street}
                onChange={(e) => {
                  setStreet(e.target.value);
                  handleFieldChange();
                }}
                placeholder="123 Main Street"
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Unit/Apt (optional)
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  handleFieldChange();
                }}
                placeholder="Apt 4B"
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  handleFieldChange();
                }}
                placeholder="Los Angeles"
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  handleFieldChange();
                }}
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select State</option>
                <option value="CA">California</option>
                <option value="NY">New York</option>
                <option value="TX">Texas</option>
                <option value="FL">Florida</option>
                <option value="IL">Illinois</option>
                <option value="PA">Pennsylvania</option>
                <option value="OH">Ohio</option>
                <option value="GA">Georgia</option>
                <option value="NC">North Carolina</option>
                <option value="MI">Michigan</option>
                {/* Add more states as needed */}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={zip}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setZip(value);
                  handleFieldChange();
                }}
                placeholder="90210"
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Verification Error */}
          {verificationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{verificationError}</p>
            </div>
          )}

          {/* Verify Button */}
          <button
            onClick={verifyAddress}
            disabled={isVerifying || !street || !city || !state || !zip}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              isVerifying || !street || !city || !state || !zip
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-teal-600 text-white hover:bg-cyan-900'
            }`}
          >
            {isVerifying ? 'Verifying Address...' : 'Verify Address'}
          </button>
        </div>
      ) : (
        /* Verified Address Display */
        <div className="space-y-4">
          <div className="bg-teal-50 rounded-lg p-6 border border-teal-200">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-teal-900 mb-1">Address Verified!</h3>
                <p className="text-teal-800">
                  {addressDetails?.formatted_address}
                </p>
                <button
                  onClick={() => {
                    setIsVerified(false);
                    setAddressDetails(null);
                  }}
                  className="mt-2 text-sm text-teal-600 hover:text-teal-700 underline"
                >
                  Change Address
                </button>
              </div>
            </div>
          </div>
          
          {/* Action buttons after verification */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                // Keep the verified state and just confirm use
                onAddressConfirmed({
                  fullAddress: addressDetails.formatted_address,
                  lat: addressDetails.lat,
                  lng: addressDetails.lng,
                  unit,
                  street,
                  city,
                  state,
                  zip
                });
              }}
              className="flex-1 bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-cyan-900 transition-colors"
            >
              Use This Address
            </button>
            
            {showCancel && onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-3 text-slate-700 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressForm;
