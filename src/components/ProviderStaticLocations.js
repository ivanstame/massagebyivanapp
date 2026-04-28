// In-studio Locations — places where clients come to the provider
// (their own room at a spa, private studio, etc.). Distinct from
// "Locations" which are saved client addresses / pin-drops the
// provider has *delivered to*.
//
// Each static location carries its own turnover buffer (sheet/towel
// reset between back-to-back bookings) and an optional pricing
// override (in-studio rates are commonly lower than in-home).

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  MapPin, Plus, Trash2, AlertCircle, Clock, DollarSign,
  Edit2, X, Save, Map
} from 'lucide-react';
import PinDropMap from './PinDropMap';

const ProviderStaticLocations = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [mobilePricing, setMobilePricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Editing state. null = not editing; 'new' = adding fresh; otherwise
  // an existing location's _id.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    load();
  }, [user, navigate]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [locRes, profileRes] = await Promise.all([
        axios.get('/api/static-locations', { withCredentials: true }),
        axios.get('/api/users/profile', { withCredentials: true })
      ]);
      setLocations(locRes.data || []);
      setMobilePricing(profileRes.data?.providerProfile?.basePricing || []);
    } catch (err) {
      console.error('Failed to load static locations:', err);
      setError('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, []);

  const startNew = () => {
    setEditingId('new');
    setDraft({
      name: '',
      address: '',
      lat: null,
      lng: null,
      bufferMinutes: 15,
      useMobilePricing: true,
      pricing: []
    });
  };

  const startEdit = (loc) => {
    setEditingId(loc._id);
    setDraft({
      name: loc.name,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      bufferMinutes: loc.bufferMinutes ?? 15,
      useMobilePricing: !!loc.useMobilePricing,
      pricing: loc.pricing && loc.pricing.length > 0
        ? loc.pricing.map(p => ({ ...p }))
        : []
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const handlePinConfirmed = (locationData) => {
    setDraft(prev => ({
      ...prev,
      address: locationData.fullAddress || locationData.address || '',
      lat: locationData.lat,
      lng: locationData.lng
    }));
  };

  const copyMobilePricing = () => {
    setDraft(prev => ({
      ...prev,
      useMobilePricing: false,
      pricing: mobilePricing.map(p => ({
        duration: p.duration,
        price: p.price,
        label: p.label || `${p.duration} Minutes`
      }))
    }));
  };

  const setPricingTier = (idx, field, value) => {
    setDraft(prev => ({
      ...prev,
      pricing: prev.pricing.map((p, i) =>
        i === idx
          ? { ...p, [field]: field === 'price' || field === 'duration' ? Number(value) || 0 : value }
          : p
      )
    }));
  };

  const addPricingTier = () => {
    setDraft(prev => ({
      ...prev,
      pricing: [...prev.pricing, { duration: 60, price: 0, label: '60 Minutes' }]
    }));
  };

  const removePricingTier = (idx) => {
    setDraft(prev => ({
      ...prev,
      pricing: prev.pricing.filter((_, i) => i !== idx)
    }));
  };

  const save = async () => {
    setError(null);
    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!draft.address || draft.lat == null || draft.lng == null) {
      setError('Drop a pin on the map to set the address');
      return;
    }
    if (!draft.useMobilePricing) {
      if (!draft.pricing.length) {
        setError('Add at least one pricing tier or switch to mobile pricing');
        return;
      }
      for (const p of draft.pricing) {
        if (!p.duration || p.duration < 15) {
          setError('Each pricing tier needs a duration of at least 15 minutes');
          return;
        }
        if (p.price < 0) {
          setError('Prices cannot be negative');
          return;
        }
      }
    }

    try {
      const payload = {
        name: draft.name.trim(),
        address: draft.address,
        lat: draft.lat,
        lng: draft.lng,
        bufferMinutes: Number(draft.bufferMinutes) || 15,
        useMobilePricing: draft.useMobilePricing,
        pricing: draft.useMobilePricing ? [] : draft.pricing
      };

      if (editingId === 'new') {
        await axios.post('/api/static-locations', payload, { withCredentials: true });
      } else {
        await axios.put(`/api/static-locations/${editingId}`, payload, { withCredentials: true });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    }
  };

  const archive = async (loc) => {
    const yes = window.confirm(
      `Archive "${loc.name}"? Existing availability and bookings tied to it stay intact, ` +
      `but it won't appear in pickers anymore.`
    );
    if (!yes) return;
    try {
      await axios.delete(`/api/static-locations/${loc._id}`, { withCredentials: true });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to archive');
    }
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-6">
          <div className="av-eyebrow mb-2">Where clients come to you</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            In-studio <em style={{ color: '#B07A4E' }}>locations</em>
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Add the places you take in-studio bookings (your own room at a wellness center, a private studio).
            Each location has its own turnover buffer and optional pricing — separate from your mobile pricing.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Existing locations */}
        {locations.length > 0 && editingId === null && (
          <div className="space-y-3 mb-6">
            {locations.map(loc => (
              <div key={loc._id} className="bg-paper-elev rounded-lg shadow-sm border border-line p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">{loc.name}</h3>
                    <div className="mt-2 space-y-1.5 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span>{loc.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0 text-slate-400" />
                        <span>{loc.bufferMinutes} min turnover between bookings</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <DollarSign className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span>
                          {loc.useMobilePricing
                            ? 'Uses your mobile pricing'
                            : (loc.pricing.length > 0
                                ? loc.pricing
                                    .slice()
                                    .sort((a, b) => (a.duration || 0) - (b.duration || 0))
                                    .map(p => `${p.duration}min $${p.price}`)
                                    .join(' · ')
                                : 'No pricing set')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => startEdit(loc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-[#B07A4E] hover:bg-[#B07A4E]/10 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => archive(loc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Archive
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {locations.length === 0 && editingId === null && (
          <div className="text-center py-10 bg-paper-elev rounded-lg border-2 border-dashed border-line mb-4">
            <Map className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-1">No in-studio locations yet</p>
            <p className="text-sm text-slate-400">Add your first one to start taking in-studio bookings.</p>
          </div>
        )}

        {/* Add button */}
        {editingId === null && (
          <button
            onClick={startNew}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] font-medium"
          >
            <Plus className="w-4 h-4" />
            Add an in-studio location
          </button>
        )}

        {/* Editor */}
        {editingId !== null && draft && (
          <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editingId === 'new' ? 'Add an in-studio location' : 'Edit location'}
              </h2>
              <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Location name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. My Room at Healing Hands Wellness"
                maxLength={100}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />
            </div>

            {/* Address via pin drop */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address
              </label>
              <p className="text-xs text-slate-500 mb-2">Drop a pin on the map to set the address.</p>
              <div className="rounded-lg overflow-hidden border border-line">
                <PinDropMap
                  onLocationConfirmed={handlePinConfirmed}
                  initialLocation={draft.lat != null ? { lat: draft.lat, lng: draft.lng } : null}
                />
                {draft.address && (
                  <div className="p-2 bg-paper-deep text-xs text-slate-600">
                    {draft.address}
                  </div>
                )}
              </div>
            </div>

            {/* Buffer */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Turnover buffer
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Time between back-to-back bookings here — sheet/towel reset, room cleanup.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={draft.bufferMinutes}
                  onChange={(e) => setDraft({ ...draft, bufferMinutes: e.target.value })}
                  className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
                <span className="text-sm text-slate-600">minutes</span>
              </div>
            </div>

            {/* Pricing */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Pricing
              </label>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-paper-deep">
                  <input
                    type="radio"
                    checked={draft.useMobilePricing}
                    onChange={() => setDraft({ ...draft, useMobilePricing: true })}
                    className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">Use my mobile pricing</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Same rates as your in-home offerings.
                      {mobilePricing.length > 0 && (
                        <> Currently: {mobilePricing.map(p => `${p.duration}min $${p.price}`).join(' · ')}</>
                      )}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-paper-deep">
                  <input
                    type="radio"
                    checked={!draft.useMobilePricing}
                    onChange={() => {
                      // Seed with empty list if switching from mobile-pricing
                      if (draft.useMobilePricing) {
                        setDraft({ ...draft, useMobilePricing: false, pricing: [] });
                      }
                    }}
                    className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">Custom pricing for this location</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Common when in-studio rates are lower than in-home (no travel surcharge).
                    </div>
                  </div>
                </label>
              </div>

              {!draft.useMobilePricing && (
                <div className="mt-3 pl-3 border-l-2 border-line space-y-2">
                  {draft.pricing.length === 0 && mobilePricing.length > 0 && (
                    <button
                      type="button"
                      onClick={copyMobilePricing}
                      className="text-sm text-[#B07A4E] hover:text-[#8A5D36] underline"
                    >
                      Copy from my mobile pricing as a starting point
                    </button>
                  )}
                  {draft.pricing.map((tier, idx) => (
                    <div key={idx} className="flex items-end gap-2 p-2 bg-paper-deep rounded-lg border border-line-soft">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-0.5">Label</label>
                        <input
                          type="text"
                          value={tier.label || ''}
                          onChange={(e) => setPricingTier(idx, 'label', e.target.value)}
                          placeholder="60 Minutes"
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-slate-500 mb-0.5">Min</label>
                        <select
                          value={tier.duration}
                          onChange={(e) => setPricingTier(idx, 'duration', e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                        >
                          {[30, 45, 60, 75, 90, 105, 120, 150, 180].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-slate-500 mb-0.5">$</label>
                        <input
                          type="number"
                          min="0"
                          value={tier.price}
                          onChange={(e) => setPricingTier(idx, 'price', e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => removePricingTier(idx)}
                        className="p-1 text-slate-400 hover:text-red-500 mb-0.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPricingTier}
                    className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E]"
                  >
                    <Plus className="w-4 h-4" />
                    Add a pricing tier
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] font-medium"
              >
                <Save className="w-4 h-4" />
                {editingId === 'new' ? 'Save location' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderStaticLocations;
