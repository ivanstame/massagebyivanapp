import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MapPin, Plus, Trash2, Home, AlertCircle, X } from 'lucide-react';

const SavedLocationsManager = ({ onLocationsChange }) => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', address: '', isHomeBase: false });
  const [geocoding, setGeocoding] = useState(false);

  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/saved-locations', { withCredentials: true });
      setLocations(res.data);
      if (onLocationsChange) onLocationsChange(res.data);
    } catch (err) {
      setError('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [onLocationsChange]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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
      console.error('Geocoding error:', err);
      return null;
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocation.name || !newLocation.address) {
      setError('Name and address are required');
      return;
    }

    try {
      setGeocoding(true);
      setError(null);

      const coords = await geocodeAddress(newLocation.address);
      if (!coords) {
        setError('Could not find that address. Please check and try again.');
        return;
      }

      await axios.post('/api/saved-locations', {
        name: newLocation.name,
        address: newLocation.address,
        lat: coords.lat,
        lng: coords.lng,
        isHomeBase: newLocation.isHomeBase
      }, { withCredentials: true });

      setNewLocation({ name: '', address: '', isHomeBase: false });
      setShowAddForm(false);
      await fetchLocations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add location');
    } finally {
      setGeocoding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/saved-locations/${id}`, { withCredentials: true });
      await fetchLocations();
    } catch (err) {
      setError('Failed to delete location');
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading locations...</div>;
  }

  return (
    <div>
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded flex items-start">
          <AlertCircle className="w-4 h-4 mr-1.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Location list */}
      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc._id} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg">
            <div className="flex-shrink-0">
              {loc.isHomeBase ? (
                <Home className="w-4 h-4 text-blue-500" />
              ) : (
                <MapPin className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{loc.name}</div>
              <div className="text-xs text-slate-500 truncate">{loc.address}</div>
            </div>
            {loc.isHomeBase && (
              <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full flex-shrink-0">Home</span>
            )}
            <button
              onClick={() => handleDelete(loc._id)}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
              title="Delete location"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAddForm ? (
        <form onSubmit={handleAddLocation} className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location Name</label>
            <input
              type="text"
              value={newLocation.name}
              onChange={(e) => setNewLocation(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Peters Chiropractic"
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={newLocation.address}
              onChange={(e) => setNewLocation(prev => ({ ...prev, address: e.target.value }))}
              placeholder="123 Main St, Huntington Beach, CA"
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-[#009ea5] focus:border-[#009ea5]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newLocation.isHomeBase}
              onChange={(e) => setNewLocation(prev => ({ ...prev, isHomeBase: e.target.checked }))}
              className="rounded border-slate-300 text-[#009ea5] focus:ring-[#009ea5]"
            />
            This is my home base
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setError(null); }}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={geocoding}
              className="px-3 py-1.5 text-sm bg-[#009ea5] text-white rounded hover:bg-[#008a91] disabled:bg-slate-400"
            >
              {geocoding ? 'Finding address...' : 'Add Location'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#009ea5] hover:text-[#009ea5] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      )}
    </div>
  );
};

export default SavedLocationsManager;
