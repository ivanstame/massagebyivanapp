import React, { useState, useEffect } from 'react';
import { MapPin, Check, Home, Navigation, AlertCircle } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const AddressSection = ({
  savedAddress,
  currentAddress,
  onAddressChange,
  isComplete
}) => {
  const [locationType, setLocationType] = useState(savedAddress ? 'saved' : 'other');
  const [otherAddress, setOtherAddress] = useState({
    street: '',
    unit: '',
    city: '',
    state: '',
    zip: ''
  });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // When savedAddress becomes available (e.g. after geocode), auto-select it
  useEffect(() => {
    if (savedAddress && locationType === 'saved') {
      onAddressChange(savedAddress);
    }
  }, [savedAddress]);

  // If no saved address, default to "other"
  useEffect(() => {
    if (!savedAddress) {
      setLocationType('other');
    }
  }, [savedAddress]);

  const handleUseSaved = () => {
    setLocationType('saved');
    setVerifyError(null);
    if (savedAddress) {
      onAddressChange(savedAddress);
    }
  };

  const handleUseOther = () => {
    setLocationType('other');
    setVerifyError(null);
  };

  const handleFieldChange = (field, value) => {
    setOtherAddress(prev => ({ ...prev, [field]: value }));
    setVerifyError(null);
  };

  const isOtherAddressComplete = () => {
    return otherAddress.street.trim() && otherAddress.city.trim() &&
           otherAddress.state.trim() && otherAddress.zip.trim();
  };

  const handleVerifyAndUse = async () => {
    if (!isOtherAddressComplete()) return;

    setVerifying(true);
    setVerifyError(null);

    const fullAddress = `${otherAddress.street}${otherAddress.unit ? ', ' + otherAddress.unit : ''}, ${otherAddress.city}, ${otherAddress.state} ${otherAddress.zip}`;

    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(fullAddress)}`);
      const data = await res.json();

      if (!res.ok || !data.lat || !data.lng) {
        setVerifyError('Could not verify this address. Please check and try again.');
        setVerifying(false);
        return;
      }

      onAddressChange({
        fullAddress,
        lat: data.lat,
        lng: data.lng,
        street: otherAddress.street,
        city: otherAddress.city,
        state: otherAddress.state,
        zip: otherAddress.zip,
        unit: otherAddress.unit
      });
    } catch (err) {
      setVerifyError('Could not verify this address. Please check and try again.');
    } finally {
      setVerifying(false);
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

      {/* Location Options */}
      <div className="space-y-3">
        {/* My Address option */}
        {savedAddress && (
          <button
            type="button"
            onClick={handleUseSaved}
            className={`
              w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
              hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
              ${locationType === 'saved'
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-200 bg-white hover:border-teal-300'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  ${locationType === 'saved' ? 'bg-teal-600' : 'bg-teal-100'}
                `}>
                  <Home className={`w-5 h-5 ${locationType === 'saved' ? 'text-white' : 'text-teal-700'}`} />
                </div>
                <div>
                  <div className={`font-medium text-lg ${locationType === 'saved' ? 'text-teal-900' : 'text-slate-900'}`}>
                    My address
                  </div>
                  <div className="text-sm text-slate-600">
                    {savedAddress.fullAddress}
                  </div>
                </div>
              </div>
              {locationType === 'saved' && (
                <Check className="w-5 h-5 text-teal-600 flex-shrink-0" />
              )}
            </div>
          </button>
        )}

        {/* Different Address option */}
        <button
          type="button"
          onClick={handleUseOther}
          className={`
            w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
            hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
            ${locationType === 'other'
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-200 bg-white hover:border-teal-300'
            }
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${locationType === 'other' ? 'bg-teal-600' : 'bg-teal-100'}
              `}>
                <Navigation className={`w-5 h-5 ${locationType === 'other' ? 'text-white' : 'text-teal-700'}`} />
              </div>
              <div>
                <div className={`font-medium text-lg ${locationType === 'other' ? 'text-teal-900' : 'text-slate-900'}`}>
                  Different address
                </div>
                <div className="text-sm text-slate-600">
                  Enter a different location
                </div>
              </div>
            </div>
            {locationType === 'other' && (
              <Check className="w-5 h-5 text-teal-600 flex-shrink-0" />
            )}
          </div>
        </button>
      </div>

      {/* Other Address Form */}
      {locationType === 'other' && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h4 className="font-medium text-slate-900 mb-4">Enter Address</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                value={otherAddress.street}
                onChange={(e) => handleFieldChange('street', e.target.value)}
                placeholder="123 Main St"
                className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unit / Apt <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={otherAddress.unit}
                onChange={(e) => handleFieldChange('unit', e.target.value)}
                placeholder="Apt 4B"
                className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={otherAddress.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  placeholder="Los Angeles"
                  className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <select
                  value={otherAddress.state}
                  onChange={(e) => handleFieldChange('state', e.target.value)}
                  className="w-full px-2 py-2.5 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">--</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                <input
                  type="text"
                  value={otherAddress.zip}
                  onChange={(e) => handleFieldChange('zip', e.target.value)}
                  placeholder="90001"
                  maxLength={5}
                  className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            {verifyError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{verifyError}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleVerifyAndUse}
              disabled={!isOtherAddressComplete() || verifying}
              className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2
                ${isOtherAddressComplete() && !verifying
                  ? 'bg-teal-600 text-white hover:bg-cyan-900'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
            >
              {verifying ? (
                <span>Verifying address...</span>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Use This Address</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressSection;
