import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, MapPin, ChevronDown, ChevronUp, Navigation, Home, Building2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import api from '../services/api';
import PinDropMap from './PinDropMap';

const AddAvailabilityModal = ({ date, onAdd, onClose }) => {
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState(null);

  // Mobile vs static (in-studio). Default mobile — that's the historical
  // behavior and what most providers do most days.
  const [kind, setKind] = useState('mobile');
  const [staticLocations, setStaticLocations] = useState([]);
  const [selectedStaticLocationId, setSelectedStaticLocationId] = useState('');

  // Departure location state (only relevant when kind === 'mobile')
  const [savedLocations, setSavedLocations] = useState([]);
  const [homeBase, setHomeBase] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [departureMode, setDepartureMode] = useState('homebase'); // 'homebase' | 'saved' | 'pin'
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [pinLocation, setPinLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const [savedRes, staticRes] = await Promise.all([
          api.get('/api/saved-locations'),
          api.get('/api/static-locations').catch(() => ({ data: [] })),
        ]);
        const locs = savedRes.data || [];
        setSavedLocations(locs);
        const home = locs.find(l => l.isHomeBase);
        setHomeBase(home || null);
        setStaticLocations(staticRes.data || []);
      } catch (err) {
        console.error('Failed to fetch locations:', err);
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, []);

  const generateTimeOptions = () => {
    const slots = [];
    let currentTime = DateTime.fromObject({ hour: 0, minute: 0 }, { zone: DEFAULT_TZ });
    const endOfDay = DateTime.fromObject({ hour: 23, minute: 30 }, { zone: DEFAULT_TZ });

    while (currentTime <= endOfDay) {
      slots.push(
        <option key={currentTime.toFormat('HH:mm')} value={currentTime.toFormat('HH:mm')}>
          {currentTime.toFormat(TIME_FORMATS.TIME_12H)}
        </option>
      );
      currentTime = currentTime.plus({ minutes: 30 });
    }
    return slots;
  };

  const getSelectedAnchor = () => {
    if (departureMode === 'homebase') {
      return homeBase ? { locationId: homeBase._id } : null;
    }
    if (departureMode === 'saved' && selectedLocationId) {
      return { locationId: selectedLocationId };
    }
    if (departureMode === 'pin' && pinLocation) {
      return {
        name: 'Pinned Location',
        address: pinLocation.address || '',
        lat: pinLocation.lat,
        lng: pinLocation.lng,
      };
    }
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const dateLA = DateTime.fromJSDate(date).setZone(DEFAULT_TZ);

    const startDateTime = DateTime.fromFormat(`${dateLA.toFormat('yyyy-MM-dd')} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    const endDateTime = DateTime.fromFormat(`${dateLA.toFormat('yyyy-MM-dd')} ${endTime}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });

    if (!startDateTime.isValid || !endDateTime.isValid) {
      setError('Invalid time format');
      return;
    }

    if (endDateTime <= startDateTime) {
      setError('End time must be after start time');
      return;
    }

    if (kind === 'static') {
      if (!selectedStaticLocationId) {
        setError('Please pick the in-studio location for this window');
        return;
      }
    } else {
      if (departureMode === 'pin' && !pinLocation) {
        setError('Please drop a pin on the map to set your departure location');
        return;
      }
      if (departureMode === 'saved' && !selectedLocationId) {
        setError('Please select a saved location');
        return;
      }
    }

    const availability = {
      date: dateLA.toFormat('yyyy-MM-dd'),
      start: startTime,
      end: endTime,
      kind,
      // Static availability is anchored to its location, not a separate
      // departure point — skip the anchor field entirely.
      ...(kind === 'static'
        ? { staticLocation: selectedStaticLocationId }
        : { anchor: getSelectedAnchor() }),
    };

    onAdd(availability);
  };

  const nonHomeSavedLocations = savedLocations.filter(l => !l.isHomeBase);

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50 modal-overlay"
    >
      <div className="bg-paper-elev p-6 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Add Availability</h2>
            <p className="text-sm text-slate-500 mt-1">
              {DateTime.fromJSDate(date).setZone(DEFAULT_TZ).toFormat('cccc, LLLL d, yyyy')}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Time selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 mb-1">
                Start Time
              </label>
              <select
                id="startTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-base focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              >
                {generateTimeOptions()}
              </select>
            </div>
            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-slate-700 mb-1">
                End Time
              </label>
              <select
                id="endTime"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-base focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              >
                {generateTimeOptions()}
              </select>
            </div>
          </div>

          {/* Mobile vs Static toggle. Static disables the departure picker
              entirely — those bookings happen at one fixed location. */}
          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">What kind of availability is this?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('mobile')}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  kind === 'mobile'
                    ? 'border-[#B07A4E] bg-[#B07A4E]/5'
                    : 'border-line hover:border-line-soft'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Navigation className={`w-4 h-4 ${kind === 'mobile' ? 'text-[#B07A4E]' : 'text-slate-400'}`} />
                  <span className="text-sm font-medium text-slate-900">Mobile</span>
                </div>
                <span className="text-xs text-slate-500">You travel to clients</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('static')}
                disabled={staticLocations.length === 0}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  kind === 'static'
                    ? 'border-[#B07A4E] bg-[#B07A4E]/5'
                    : 'border-line hover:border-line-soft'
                } ${staticLocations.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={staticLocations.length === 0 ? 'Add an in-studio location first' : ''}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Building2 className={`w-4 h-4 ${kind === 'static' ? 'text-[#B07A4E]' : 'text-slate-400'}`} />
                  <span className="text-sm font-medium text-slate-900">In-studio</span>
                </div>
                <span className="text-xs text-slate-500">
                  {staticLocations.length === 0 ? 'No locations yet' : 'Clients come to you'}
                </span>
              </button>
            </div>
            {staticLocations.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">
                <a href="/provider/static-locations" className="text-[#B07A4E] underline">
                  Add an in-studio location
                </a>{' '}
                to enable in-studio availability.
              </p>
            )}
          </div>

          {/* Static-location picker (only when kind === 'static') */}
          {kind === 'static' && staticLocations.length > 0 && (
            <div>
              <label htmlFor="staticLocation" className="block text-sm font-medium text-slate-700 mb-1">
                In-studio location
              </label>
              <div className="relative">
                <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  id="staticLocation"
                  value={selectedStaticLocationId}
                  onChange={(e) => setSelectedStaticLocationId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E] bg-paper-elev"
                >
                  <option value="">Pick a location…</option>
                  {staticLocations.map(loc => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name} — {loc.address}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Bookings within this window will be at this location. Turnover buffer comes from the location settings.
              </p>
            </div>
          )}

          {/* Departure Location (only when kind === 'mobile') */}
          {kind === 'mobile' && (
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#B07A4E]" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Departure Location</p>
                  <p className="text-xs text-slate-500">
                    {locationsLoading ? 'Loading...' :
                     departureMode === 'homebase' && homeBase ? homeBase.address :
                     departureMode === 'homebase' && !homeBase ? 'No home base set' :
                     departureMode === 'saved' ? (savedLocations.find(l => l._id === selectedLocationId)?.address || 'Select a location') :
                     departureMode === 'pin' && pinLocation ? pinLocation.address :
                     'Drop a pin'}
                  </p>
                </div>
              </div>
              {showLocationPicker ?
                <ChevronUp className="w-4 h-4 text-slate-400" /> :
                <ChevronDown className="w-4 h-4 text-slate-400" />
              }
            </button>

            {showLocationPicker && (
              <div className="mt-3 space-y-3">
                {/* Home base option */}
                {homeBase && (
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    departureMode === 'homebase' ? 'border-[#B07A4E] bg-teal-50' : 'border-line hover:bg-paper-deep'
                  }`}>
                    <input
                      type="radio"
                      name="departure"
                      checked={departureMode === 'homebase'}
                      onChange={() => setDepartureMode('homebase')}
                      className="mt-1 text-[#B07A4E] focus:ring-[#B07A4E]"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Home Base
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{homeBase.address}</p>
                    </div>
                  </label>
                )}

                {!homeBase && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">
                      No home base set. <a href="/provider/locations" className="font-medium underline">Set one in Locations</a>.
                    </p>
                  </div>
                )}

                {/* Saved locations */}
                {nonHomeSavedLocations.length > 0 && (
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    departureMode === 'saved' ? 'border-[#B07A4E] bg-teal-50' : 'border-line hover:bg-paper-deep'
                  }`}>
                    <input
                      type="radio"
                      name="departure"
                      checked={departureMode === 'saved'}
                      onChange={() => setDepartureMode('saved')}
                      className="mt-1 text-[#B07A4E] focus:ring-[#B07A4E]"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Saved Location</p>
                      {departureMode === 'saved' && (
                        <select
                          value={selectedLocationId || ''}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          className="mt-2 w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                        >
                          <option value="">Choose a location...</option>
                          {nonHomeSavedLocations.map(loc => (
                            <option key={loc._id} value={loc._id}>{loc.name} — {loc.address}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                )}

                {/* Pin drop */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  departureMode === 'pin' ? 'border-[#B07A4E] bg-teal-50' : 'border-line hover:bg-paper-deep'
                }`}>
                  <input
                    type="radio"
                    name="departure"
                    checked={departureMode === 'pin'}
                    onChange={() => setDepartureMode('pin')}
                    className="mt-1 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Drop a Pin</p>
                    <p className="text-xs text-slate-500">Tap the map to set a custom departure point</p>
                  </div>
                </label>

                {departureMode === 'pin' && (
                  <div className="rounded-lg overflow-hidden border border-line">
                    <PinDropMap
                      onLocationConfirmed={(loc) => setPinLocation(loc)}
                      initialLocation={pinLocation}
                    />
                    {pinLocation && (
                      <div className="p-2 bg-paper-deep text-xs text-slate-600">
                        {pinLocation.address || `${pinLocation.lat.toFixed(4)}, ${pinLocation.lng.toFixed(4)}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] transition-colors font-medium"
            >
              Add Availability
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAvailabilityModal;
