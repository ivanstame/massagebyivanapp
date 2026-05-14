import React, { useState, useEffect } from 'react';
import { MapPin, Check, Home, Navigation, AlertCircle, Building2 } from 'lucide-react';

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
  savedLocations = [],
  // Venues attached to TODAY's availability via a 'flexible' block —
  // the provider opened up this date for either mobile OR in-studio
  // at this specific venue. Surfaced for everyone (provider + client)
  // because anyone booking this day can choose to come to the venue.
  // Merged with savedLocations for display, deduped by _id.
  flexibleVenues = [],
  isComplete
}) => {
  // Three modes:
  //   'saved'  — client's home address on file (default when present)
  //   'venue'  — one of the provider's saved locations (Peters
  //              Chiropractic, studio, etc.). Provider-only path,
  //              gated on savedLocations being non-empty.
  //   'other'  — manual entry, falls through to geocoding
  const [locationType, setLocationType] = useState(savedAddress ? 'saved' : 'other');
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [otherAddress, setOtherAddress] = useState({
    street: '',
    unit: '',
    city: '',
    state: '',
    zip: ''
  });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // If no saved address, default to "other"
  useEffect(() => {
    if (!savedAddress) {
      setLocationType('other');
    }
  }, [savedAddress]);

  // When user switches back to saved address, the parent already has
  // the geocoded location from its own useEffect. No need to call
  // onAddressChange here — just reset locationType so the UI shows it.
  const handleUseSaved = () => {
    setLocationType('saved');
    setVerifyError(null);
  };

  const handleUseOther = () => {
    setLocationType('other');
    setVerifyError(null);
  };

  const handleUseVenue = () => {
    setLocationType('venue');
    setVerifyError(null);
  };

  // Pick a specific saved location. lat/lng/address are already on the
  // doc (geocoded at save-time), so no /api/geocode round-trip needed.
  const handleSelectVenue = (loc) => {
    setSelectedVenueId(loc._id);
    setVerifyError(null);
    onAddressChange({
      fullAddress: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      // Tag for downstream: tells the booking summary this address
      // came from a saved venue, not from the client's profile.
      savedLocationId: loc._id,
      savedLocationName: loc.name,
    });
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

  // When there's no saved address to differ FROM, the two-option
  // picker is just confusing — there's nothing to "differ" from. Skip
  // the toggle in that case and show the entry form directly with a
  // clearer header. The "Different address" branding only makes sense
  // when there's a default sitting next to it for contrast.
  const hasSaved = !!savedAddress;
  // Merge provider-side savedLocations with today's flexibleVenues,
  // dedup by _id so a venue that's both saved AND attached to a
  // flexible block doesn't appear twice. flexibleVenues take priority
  // for the merged record (they include staticConfig populated for
  // pricing-override resolution).
  const venuesById = new Map();
  for (const v of savedLocations || []) {
    if (v && v._id) venuesById.set(String(v._id), v);
  }
  for (const v of flexibleVenues || []) {
    if (v && v._id) venuesById.set(String(v._id), v);
  }
  const mergedVenues = Array.from(venuesById.values());
  const hasVenues = mergedVenues.length > 0;
  // Show the picker whenever there's any default to choose against.
  const showPicker = hasSaved || hasVenues;

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <MapPin className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              {hasSaved ? 'Service Location' : 'Where is the appointment?'}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {hasSaved
                ? 'Where should we send your provider?'
                : 'Enter the street address where the provider should arrive.'}
            </p>
          </div>
        </div>
      </div>

      {/* Location Options — only when there's a default to choose
          against. With no default, skip the picker and show the form
          directly below. */}
      {showPicker && (
        <div className="space-y-3">
          {hasSaved && (
            <button
              type="button"
              onClick={handleUseSaved}
              className={`
                w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                ${locationType === 'saved'
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-line bg-paper-elev hover:border-teal-300'
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
                      Default address
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

          {/* Provider's saved venues — Peters Chiropractic, studio,
              home base, etc. Only surfaces for provider bookings (the
              parent only fetches savedLocations in that case). */}
          {hasVenues && (
            <button
              type="button"
              onClick={handleUseVenue}
              className={`
                w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                ${locationType === 'venue'
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-line bg-paper-elev hover:border-teal-300'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${locationType === 'venue' ? 'bg-teal-600' : 'bg-teal-100'}
                  `}>
                    <Building2 className={`w-5 h-5 ${locationType === 'venue' ? 'text-white' : 'text-teal-700'}`} />
                  </div>
                  <div>
                    <div className={`font-medium text-lg ${locationType === 'venue' ? 'text-teal-900' : 'text-slate-900'}`}>
                      Saved venue
                    </div>
                    <div className="text-sm text-slate-600">
                      Pick one of your saved locations
                    </div>
                  </div>
                </div>
                {locationType === 'venue' && (
                  <Check className="w-5 h-5 text-teal-600 flex-shrink-0" />
                )}
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={handleUseOther}
            className={`
              w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
              hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
              ${locationType === 'other'
                ? 'border-teal-600 bg-teal-50'
                : 'border-line bg-paper-elev hover:border-teal-300'
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
                    {hasSaved ? 'Different address' : 'Custom address'}
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
      )}

      {/* Venue picker — provider's saved locations + today's flexible
          venues, merged. */}
      {locationType === 'venue' && hasVenues && (
        <div className="mt-6 p-4 bg-paper-deep rounded-lg border border-line">
          <h4 className="font-medium text-slate-900 mb-3">Pick a venue</h4>
          <div className="space-y-2">
            {mergedVenues.map(loc => {
              const isSelected = selectedVenueId === loc._id;
              return (
                <button
                  key={loc._id}
                  type="button"
                  onClick={() => handleSelectVenue(loc)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all
                    ${isSelected
                      ? 'border-teal-600 bg-teal-50'
                      : 'border-line bg-paper-elev hover:border-teal-300'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {loc.isHomeBase
                        ? <Home className="w-4 h-4 text-slate-600" />
                        : <Building2 className="w-4 h-4 text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {loc.name}
                        {loc.isHomeBase && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">(home base)</span>
                        )}
                        {loc.isStaticLocation && !loc.isHomeBase && (
                          <span className="ml-1.5 text-xs font-normal text-blue-700">(in-studio)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{loc.address}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Other Address Form */}
      {locationType === 'other' && (
        <div className={`${hasSaved ? 'mt-6 p-4 bg-paper-deep rounded-lg border border-line' : ''}`}>
          {hasSaved && <h4 className="font-medium text-slate-900 mb-4">Enter Address</h4>}
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
                Unit / Apt <span className="text-slate-500 font-normal">(optional)</span>
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
