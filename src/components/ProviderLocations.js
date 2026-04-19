import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { MapPin, Plus, Trash2, Home, AlertCircle, X, Map } from 'lucide-react';
import PinDropMap from './PinDropMap';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const ProviderLocations = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState('pin'); // 'pin' or 'address'
  const [newLocation, setNewLocation] = useState({
    name: '', address: '', lat: null, lng: null, isHomeBase: false,
    street: '', city: '', state: 'CA', zip: ''
  });
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    fetchLocations();
  }, [user, navigate]);

  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/saved-locations', { withCredentials: true });
      setLocations(res.data);
    } catch (err) {
      setError('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, []);

  const geocodeAddress = async (address) => {
    try {
      const res = await axios.get(`/api/geocode?address=${encodeURIComponent(address)}`, {
        withCredentials: true
      });
      if (res.data && res.data.lat && res.data.lng) {
        return { lat: res.data.lat, lng: res.data.lng };
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  const handlePinConfirmed = (locationData) => {
    setNewLocation(prev => ({
      ...prev,
      address: locationData.fullAddress,
      lat: locationData.lat,
      lng: locationData.lng
    }));
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocation.name) {
      setError('Location name is required');
      return;
    }

    if (addMode === 'pin' && (!newLocation.lat || !newLocation.lng)) {
      setError('Drop a pin on the map or use your current location');
      return;
    }

    if (addMode === 'address' && !newLocation.street) {
      setError('Street address is required');
      return;
    }

    if (addMode === 'address' && !newLocation.city) {
      setError('City is required');
      return;
    }

    try {
      setGeocoding(true);
      setError(null);

      let lat = newLocation.lat;
      let lng = newLocation.lng;
      let address = newLocation.address;

      // If using address mode, build address string and geocode
      if (addMode === 'address') {
        address = [newLocation.street, newLocation.city, newLocation.state, newLocation.zip]
          .filter(Boolean).join(', ');

        const coords = await geocodeAddress(address);
        if (!coords) {
          setError('Could not find that address. Please check and try again.');
          return;
        }
        lat = coords.lat;
        lng = coords.lng;
      }

      await axios.post('/api/saved-locations', {
        name: newLocation.name,
        address,
        lat,
        lng,
        isHomeBase: newLocation.isHomeBase
      }, { withCredentials: true });

      setNewLocation({ name: '', address: '', lat: null, lng: null, isHomeBase: false, street: '', city: '', state: 'CA', zip: '' });
      setShowAddForm(false);
      await fetchLocations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add location');
    } finally {
      setGeocoding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this location? It will be removed from any weekly template days that use it.')) {
      return;
    }
    try {
      await axios.delete(`/api/saved-locations/${id}`, { withCredentials: true });
      await fetchLocations();
    } catch (err) {
      setError('Failed to delete location');
    }
  };

  const handleSetHomeBase = async (id) => {
    try {
      await axios.put(`/api/saved-locations/${id}`, { isHomeBase: true }, { withCredentials: true });
      await fetchLocations();
    } catch (err) {
      setError('Failed to update home base');
    }
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading locations...</div>
      </div>
    );
  }

  return (
    <div className="pt-16">
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My Locations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Save locations you work from regularly. Assign them to days in your Weekly Template.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-2"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Existing locations */}
        <div className="space-y-3 mb-6">
          {locations.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No saved locations yet</p>
              <p className="text-slate-400 text-xs mt-1">Add your first location below</p>
            </div>
          ) : (
            locations.map(loc => (
              <div key={loc._id} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="flex-shrink-0">
                  {loc.isHomeBase ? (
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                      <Home className="w-4 h-4 text-teal-600" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{loc.name}</div>
                  <div className="text-xs text-slate-500 truncate">{loc.address}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {loc.isHomeBase ? (
                    <span className="px-2 py-1 text-xs bg-blue-50 text-teal-600 rounded-full font-medium">Home Base</span>
                  ) : (
                    <button
                      onClick={() => handleSetHomeBase(loc._id)}
                      className="px-2 py-1 text-xs text-slate-500 hover:text-teal-600 hover:bg-blue-50 rounded-full transition-colors"
                      title="Set as home base"
                    >
                      Set as Home
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(loc._id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Delete location"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add location */}
        {showAddForm ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-medium text-slate-900">Add New Location</h3>

              {/* Mode toggle */}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setAddMode('pin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    addMode === 'pin'
                      ? 'bg-[#B07A4E] text-white'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  <Map className="w-3.5 h-3.5" />
                  Drop a Pin
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('address')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    addMode === 'address'
                      ? 'bg-[#B07A4E] text-white'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Type Address
                </button>
              </div>
            </div>

            <form onSubmit={handleAddLocation} className="p-4 space-y-4">
              {/* Location name — always shown */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location Name</label>
                <input
                  type="text"
                  value={newLocation.name}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Peters Chiropractic, Gold's Gym HB"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
              </div>

              {/* Pin drop mode */}
              {addMode === 'pin' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Drop a Pin</label>
                  <PinDropMap
                    onLocationConfirmed={handlePinConfirmed}
                    initialLocation={newLocation.lat ? { lat: newLocation.lat, lng: newLocation.lng, address: newLocation.address } : null}
                  />
                  {newLocation.lat && newLocation.address && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                      Selected: {newLocation.address}
                    </div>
                  )}
                </div>
              )}

              {/* Address mode — structured fields */}
              {addMode === 'address' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={newLocation.street}
                      onChange={(e) => setNewLocation(prev => ({ ...prev, street: e.target.value }))}
                      placeholder="123 Main St"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={newLocation.city}
                        onChange={(e) => setNewLocation(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="Huntington Beach"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                      <select
                        value={newLocation.state}
                        onChange={(e) => setNewLocation(prev => ({ ...prev, state: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      >
                        <option value="">--</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={newLocation.zip}
                        onChange={(e) => setNewLocation(prev => ({ ...prev, zip: e.target.value }))}
                        placeholder="92648"
                        maxLength={5}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Home base checkbox */}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newLocation.isHomeBase}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, isHomeBase: e.target.checked }))}
                  className="rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
                />
                This is my home base
              </label>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setError(null);
                    setNewLocation({ name: '', address: '', lat: null, lng: null, isHomeBase: false });
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={geocoding}
                  className="px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:bg-slate-400 font-medium"
                >
                  {geocoding ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        )}

        {/* Info box */}
        <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How locations work</p>
            <ul className="list-disc ml-4 space-y-1 text-blue-700">
              <li>Save places you regularly work from (clinics, gyms, offices)</li>
              <li>Assign them to specific days in your <strong>Weekly Template</strong></li>
              <li>Your <strong>home base</strong> is used to calculate drive times when no anchor is set</li>
              <li>Anchored days block off time on your calendar for that location</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderLocations;
