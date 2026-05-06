import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, CheckCircle, Map, Search, X } from 'lucide-react';
import PinDropMap from './PinDropMap';

const AddressForm = ({ onAddressConfirmed, onCancel, showCancel }) => {
  // Input mode: 'map' or 'search'
  const [inputMode, setInputMode] = useState('map');

  // Autocomplete state
  const [searchValue, setSearchValue] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const autocompleteRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize Google Places Autocomplete when in search mode
  const initAutocomplete = useCallback(() => {
    if (!window.google?.maps?.places || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address', 'geometry', 'address_components']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        // Parse address components
        const components = {};
        (place.address_components || []).forEach(c => {
          if (c.types.includes('street_number')) components.streetNumber = c.long_name;
          if (c.types.includes('route')) components.route = c.long_name;
          if (c.types.includes('locality')) components.city = c.long_name;
          if (c.types.includes('administrative_area_level_1')) components.state = c.short_name;
          if (c.types.includes('postal_code')) components.zip = c.long_name;
          if (c.types.includes('subpremise')) components.unit = c.long_name;
        });

        setSelectedPlace({
          address: place.formatted_address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          street: [components.streetNumber, components.route].filter(Boolean).join(' '),
          city: components.city || '',
          state: components.state || '',
          zip: components.zip || '',
          unit: components.unit || ''
        });
        setSearchValue(place.formatted_address);
      }
    });

    autocompleteRef.current = autocomplete;
  }, []);

  useEffect(() => {
    if (inputMode === 'search') {
      // Small delay to ensure input is rendered
      const timer = setTimeout(initAutocomplete, 100);
      return () => clearTimeout(timer);
    }
    // Cleanup autocomplete when switching away
    return () => {
      autocompleteRef.current = null;
    };
  }, [inputMode, initAutocomplete]);

  // Handle pin drop confirmation from map
  const handleMapLocationConfirmed = (location) => {
    onAddressConfirmed({
      fullAddress: location.fullAddress,
      lat: location.lat,
      lng: location.lng,
      street: location.street || location.fullAddress || '',
      city: location.city || '',
      state: location.state || '',
      zip: location.zip || '',
      unit: location.unit || ''
    });
  };

  // Handle autocomplete selection confirm
  const handleSearchConfirm = () => {
    if (!selectedPlace) return;
    onAddressConfirmed({
      fullAddress: selectedPlace.address,
      lat: selectedPlace.lat,
      lng: selectedPlace.lng,
      street: selectedPlace.street || '',
      city: selectedPlace.city || '',
      state: selectedPlace.state || '',
      zip: selectedPlace.zip || '',
      unit: selectedPlace.unit || ''
    });
  };

  const clearSearch = () => {
    setSearchValue('');
    setSelectedPlace(null);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setInputMode('map')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            inputMode === 'map'
              ? 'bg-paper-elev text-teal-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Map className="w-4 h-4" />
          Drop Pin
        </button>
        <button
          type="button"
          onClick={() => setInputMode('search')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            inputMode === 'search'
              ? 'bg-paper-elev text-teal-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Search className="w-4 h-4" />
          Search Address
        </button>
      </div>

      {/* Map mode */}
      {inputMode === 'map' && (
        <PinDropMap onLocationConfirmed={handleMapLocationConfirmed} />
      )}

      {/* Search / Autocomplete mode */}
      {inputMode === 'search' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Start typing your address
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  setSelectedPlace(null);
                }}
                placeholder="123 Main St, Huntington Beach, CA"
                className="w-full pl-10 pr-10 py-3 text-base border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoFocus
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Select a suggestion from the dropdown to confirm the address
            </p>
          </div>

          {/* Selected place confirmation */}
          {selectedPlace && (
            <div className="space-y-3">
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-teal-900">{selectedPlace.address}</p>
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="mt-1 text-sm text-teal-600 hover:text-teal-700 underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSearchConfirm}
                  className="flex-1 bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-cyan-900 transition-colors"
                >
                  Use This Address
                </button>
                {showCancel && onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-3 text-slate-700 border border-slate-300 rounded-lg font-medium hover:bg-paper-deep transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressForm;
