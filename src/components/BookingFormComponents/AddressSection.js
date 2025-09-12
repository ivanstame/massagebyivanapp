import React, { useState } from 'react';
import { MapPin, Check, Home, Edit2 } from 'lucide-react';
import AddressForm from '../AddressForm';

const AddressSection = ({ 
  savedAddress, 
  currentAddress, 
  onAddressChange, 
  googleMapsLoaded,
  isComplete 
}) => {
  const [isEditingAddress, setIsEditingAddress] = useState(!savedAddress);

  const handleAddressUpdate = (addressData) => {
    onAddressChange(addressData);
    // Only hide the form after user confirms the address
    if (addressData) {
      setIsEditingAddress(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <MapPin className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Service Location</h3>
            <p className="text-sm text-slate-600 mt-1">Where should we send your therapist?</p>
          </div>
        </div>
      </div>

      {/* Address display or form */}
      {(currentAddress || savedAddress) && !isEditingAddress ? (
        <div className="space-y-4">
          {/* Current/Saved address display */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <Home className="w-5 h-5 text-teal-600 mt-0.5" />
                <div>
                  <p className="font-medium text-teal-900 mb-1">
                    {currentAddress ? 'Service Address' : 'Using Saved Address'}
                  </p>
                  <p className="text-base text-slate-700">
                    {currentAddress?.fullAddress || savedAddress?.fullAddress}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingAddress(true)}
                className="text-teal-600 hover:text-teal-700 transition-colors"
                aria-label="Edit address"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Change address button */}
          <button
            onClick={() => setIsEditingAddress(true)}
            className="w-full px-4 py-3 text-teal-700 border-2 border-teal-600 rounded-lg font-medium
                       hover:bg-teal-50 transition-colors flex items-center justify-center space-x-2"
          >
            <MapPin className="w-5 h-5" />
            <span>Use Different Address</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Address form */}
          <div className="bg-cream-50 rounded-lg p-4 border border-cream-200">
            <AddressForm
              googleMapsLoaded={googleMapsLoaded}
              onAddressConfirmed={handleAddressUpdate}
              onCancel={savedAddress ? () => setIsEditingAddress(false) : null}
              showCancel={savedAddress !== null}
            />
          </div>

          {/* Use saved address button (if available) */}
          {savedAddress && (
            <button
              onClick={() => {
                setIsEditingAddress(false);
                onAddressChange(savedAddress);
              }}
              className="w-full px-4 py-3 text-teal-700 bg-teal-50 border-2 border-teal-300 rounded-lg font-medium
                         hover:bg-teal-100 transition-colors flex items-center justify-center space-x-2"
            >
              <Home className="w-5 h-5" />
              <span>Use Saved Address Instead</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressSection;
