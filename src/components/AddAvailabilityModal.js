import React, { useState, useEffect, useContext } from 'react';
import { AlertCircle, Navigation, Home, Building2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { TIME_FORMATS, tzOf } from '../utils/timeConstants';
import api from '../services/api';
import { AuthContext } from '../AuthContext';

const AddAvailabilityModal = ({ date, onAdd, onClose }) => {
  // Provider's TZ — drives every parse of the date prop and every
  // time-picker option. Provider is the auth user on this route.
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState(null);

  // Mobile vs static (in-studio). Default mobile — that's the historical
  // behavior and what most providers do most days. Mobile blocks
  // implicitly depart from the provider's home base; there's no
  // separate departure picker anymore.
  const [kind, setKind] = useState('mobile');
  const [staticLocations, setStaticLocations] = useState([]);
  const [selectedStaticLocationId, setSelectedStaticLocationId] = useState('');

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await api.get('/api/saved-locations');
        const locs = res.data || [];
        setStaticLocations(locs.filter(l => l.isStaticLocation));
      } catch (err) {
        console.error('Failed to fetch locations:', err);
      }
    };
    fetchLocations();
  }, []);

  const generateTimeOptions = () => {
    const slots = [];
    let currentTime = DateTime.fromObject({ hour: 0, minute: 0 }, { zone: viewerTz });
    const endOfDay = DateTime.fromObject({ hour: 23, minute: 30 }, { zone: viewerTz });

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const dateLA = DateTime.fromJSDate(date).setZone(viewerTz);

    const startDateTime = DateTime.fromFormat(`${dateLA.toFormat('yyyy-MM-dd')} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: viewerTz });
    const endDateTime = DateTime.fromFormat(`${dateLA.toFormat('yyyy-MM-dd')} ${endTime}`, 'yyyy-MM-dd HH:mm', { zone: viewerTz });

    if (!startDateTime.isValid || !endDateTime.isValid) {
      setError('Invalid time format');
      return;
    }

    if (endDateTime <= startDateTime) {
      setError('End time must be after start time');
      return;
    }

    if (kind === 'static' && !selectedStaticLocationId) {
      setError('Please pick the in-studio location for this window');
      return;
    }

    const availability = {
      date: dateLA.toFormat('yyyy-MM-dd'),
      start: startTime,
      end: endTime,
      kind,
      ...(kind === 'static' ? { staticLocation: selectedStaticLocationId } : {}),
    };

    onAdd(availability);
  };

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50 modal-overlay"
    >
      <div className="bg-paper-elev p-6 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Add Availability</h2>
            <p className="text-sm text-slate-500 mt-1">
              {DateTime.fromJSDate(date).setZone(viewerTz).toFormat('cccc, LLLL d, yyyy')}
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

          {/* Mobile vs Static toggle. */}
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
                  <Navigation className={`w-4 h-4 ${kind === 'mobile' ? 'text-[#B07A4E]' : 'text-slate-500'}`} />
                  <span className="text-sm font-medium text-slate-900">Mobile</span>
                </div>
                <span className="text-xs text-slate-500">You travel to clients (departing from home base)</span>
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
                  <Building2 className={`w-4 h-4 ${kind === 'static' ? 'text-[#B07A4E]' : 'text-slate-500'}`} />
                  <span className="text-sm font-medium text-slate-900">In-studio</span>
                </div>
                <span className="text-xs text-slate-500">
                  {staticLocations.length === 0 ? 'No locations yet' : 'Clients come to you'}
                </span>
              </button>
            </div>
            {staticLocations.length === 0 && (
              <p className="text-xs text-slate-500 mt-2">
                <a href="/provider/locations" className="text-[#B07A4E] underline">
                  Tag a saved location as in-studio
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
                <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
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
