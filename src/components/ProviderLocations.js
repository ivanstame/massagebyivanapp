// Locations — every place the provider keeps on file. A single record
// can wear multiple roles: home base (default departure), in-studio
// (clients come here, with buffer + pricing), or simply a saved
// departure point. Replaces the prior split between this page and
// /provider/static-locations — we no longer maintain two records for
// the same physical place.

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  MapPin, Plus, Trash2, Home, Building2, AlertCircle, X, Map,
  Edit2, Save, Clock, DollarSign
} from 'lucide-react';
import PinDropMap from './PinDropMap';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const blankDraft = () => ({
  name: '', address: '', lat: null, lng: null,
  street: '', city: '', state: 'CA', zip: '',
  isHomeBase: false,
  isStaticLocation: false,
  staticConfig: {
    bufferMinutes: 15,
    useMobilePricing: true,
    pricing: []
  }
});

const ProviderLocations = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [mobilePricing, setMobilePricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Editor state. editingId === null = no editor; 'new' = creating;
  // otherwise an existing location's _id.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [addMode, setAddMode] = useState('pin'); // 'pin' or 'address'
  const [saving, setSaving] = useState(false);

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
        axios.get('/api/saved-locations', { withCredentials: true }),
        axios.get('/api/users/profile', { withCredentials: true })
      ]);
      setLocations(locRes.data || []);
      setMobilePricing(profileRes.data?.providerProfile?.basePricing || []);
    } catch (err) {
      setError('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, []);

  const geocodeAddress = async (address) => {
    try {
      const res = await axios.get(`/api/geocode?address=${encodeURIComponent(address)}`, { withCredentials: true });
      if (res.data && res.data.lat && res.data.lng) return { lat: res.data.lat, lng: res.data.lng };
      return null;
    } catch {
      return null;
    }
  };

  const startNew = () => {
    setDraft(blankDraft());
    setAddMode('pin');
    setEditingId('new');
  };

  const startEdit = (loc) => {
    setDraft({
      name: loc.name || '',
      address: loc.address || '',
      lat: loc.lat,
      lng: loc.lng,
      street: '', city: '', state: 'CA', zip: '', // unused in edit mode
      isHomeBase: !!loc.isHomeBase,
      isStaticLocation: !!loc.isStaticLocation,
      staticConfig: {
        bufferMinutes: loc.staticConfig?.bufferMinutes ?? 15,
        useMobilePricing: loc.staticConfig?.useMobilePricing ?? true,
        pricing: Array.isArray(loc.staticConfig?.pricing)
          ? loc.staticConfig.pricing.map(p => ({ ...p }))
          : []
      }
    });
    setAddMode('pin');
    setEditingId(loc._id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const handlePinConfirmed = (data) => {
    setDraft(prev => ({
      ...prev,
      address: data.fullAddress || data.address || '',
      lat: data.lat,
      lng: data.lng
    }));
  };

  const copyMobilePricing = () => {
    setDraft(prev => ({
      ...prev,
      staticConfig: {
        ...prev.staticConfig,
        useMobilePricing: false,
        pricing: mobilePricing.map(p => ({
          duration: p.duration,
          price: p.price,
          label: p.label || `${p.duration} Minutes`
        }))
      }
    }));
  };

  const setPricingTier = (idx, field, value) => {
    setDraft(prev => ({
      ...prev,
      staticConfig: {
        ...prev.staticConfig,
        pricing: prev.staticConfig.pricing.map((p, i) =>
          i === idx
            ? { ...p, [field]: field === 'price' || field === 'duration' ? Number(value) || 0 : value }
            : p
        )
      }
    }));
  };

  const addPricingTier = () => {
    setDraft(prev => ({
      ...prev,
      staticConfig: {
        ...prev.staticConfig,
        pricing: [...prev.staticConfig.pricing, { duration: 60, price: 0, label: '60 Minutes' }]
      }
    }));
  };

  const removePricingTier = (idx) => {
    setDraft(prev => ({
      ...prev,
      staticConfig: {
        ...prev.staticConfig,
        pricing: prev.staticConfig.pricing.filter((_, i) => i !== idx)
      }
    }));
  };

  const save = async (e) => {
    e?.preventDefault?.();
    setError(null);

    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }

    let { address, lat, lng } = draft;

    // Resolve address for create-via-typed-address path.
    if (editingId === 'new' && addMode === 'address') {
      address = [draft.street, draft.city, draft.state, draft.zip]
        .map(s => s && s.trim()).filter(Boolean).join(', ');
      if (!draft.street || !draft.city || !draft.state || !draft.zip) {
        setError('Street, city, state, and ZIP are required');
        return;
      }
      setSaving(true);
      const coords = await geocodeAddress(address);
      if (!coords) {
        setSaving(false);
        setError('Could not find that address. Please check and try again.');
        return;
      }
      lat = coords.lat;
      lng = coords.lng;
    }

    if (lat == null || lng == null || !address) {
      setError('Drop a pin or type an address to set the location');
      return;
    }

    if (draft.isStaticLocation && !draft.staticConfig.useMobilePricing) {
      if (!draft.staticConfig.pricing.length) {
        setError('Add at least one pricing tier or switch to mobile pricing');
        return;
      }
      for (const p of draft.staticConfig.pricing) {
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
      setSaving(true);
      const payload = {
        name: draft.name.trim(),
        address,
        lat, lng,
        isHomeBase: draft.isHomeBase,
        isStaticLocation: draft.isStaticLocation,
        ...(draft.isStaticLocation && { staticConfig: draft.staticConfig })
      };

      if (editingId === 'new') {
        await axios.post('/api/saved-locations', payload, { withCredentials: true });
      } else {
        await axios.put(`/api/saved-locations/${editingId}`, payload, { withCredentials: true });
      }

      cancelEdit();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete "${loc.name}"? It will be removed from any weekly template days that use it.`)) return;
    try {
      await axios.delete(`/api/saved-locations/${loc._id}`, { withCredentials: true });
      await load();
    } catch {
      setError('Failed to delete location');
    }
  };

  const handleSetHomeBase = async (id) => {
    try {
      await axios.put(`/api/saved-locations/${id}`, { isHomeBase: true }, { withCredentials: true });
      await load();
    } catch {
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
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Where you work</div>
          <h1 className="font-display" style={{ fontSize: "2rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Locations
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Save places you work from. Tag a location as <strong>home base</strong> (your default
            departure) or <strong>in-studio</strong> (clients come to you, with their own turnover
            buffer and optional pricing). One record per place — one address can wear multiple roles.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-2"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Existing locations — flush rows with hairline dividers
            instead of per-location cards. The page-level container
            already gives breathing room; cards-per-row was redundant
            chrome the user kept noticing as boxes-within-boxes. */}
        {editingId === null && (
          <div className="mb-6">
            {locations.length === 0 ? (
              <div className="text-center py-8 bg-paper-deep rounded-lg border border-dashed border-slate-300">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No saved locations yet</p>
                <p className="text-slate-500 text-xs mt-1">Add your first location below</p>
              </div>
            ) : (
              locations.map(loc => (
                <div key={loc._id} className="py-4 border-b border-line-soft last:border-b-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {loc.isHomeBase ? (
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                          <Home className="w-4 h-4 text-teal-600" />
                        </div>
                      ) : loc.isStaticLocation ? (
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-slate-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{loc.name}</span>
                        {loc.isHomeBase && (
                          <span className="px-2 py-0.5 text-xs bg-teal-50 text-teal-700 rounded-full font-medium">
                            Home base
                          </span>
                        )}
                        {loc.isStaticLocation && (
                          <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full font-medium">
                            In-studio
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{loc.address}</div>
                      {loc.isStaticLocation && (
                        <div className="mt-1.5 text-xs text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {loc.staticConfig?.bufferMinutes ?? 15} min turnover
                          </div>
                          <div className="flex items-start gap-1.5">
                            <DollarSign className="w-3 h-3 text-slate-500 mt-0.5" />
                            <span className="break-words">
                              {loc.staticConfig?.useMobilePricing
                                ? 'Uses mobile pricing'
                                : (loc.staticConfig?.pricing?.length > 0
                                    ? loc.staticConfig.pricing
                                        .slice()
                                        .sort((a, b) => (a.duration || 0) - (b.duration || 0))
                                        .map(p => `${p.duration}min $${p.price}`)
                                        .join(' · ')
                                    : 'No pricing set')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(loc)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#B07A4E] hover:bg-[#B07A4E]/10 rounded"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      {!loc.isHomeBase && (
                        <button
                          onClick={() => handleSetHomeBase(loc._id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-teal-600 rounded"
                          title="Set as home base"
                        >
                          <Home className="w-3.5 h-3.5" /> Home
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(loc)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add button */}
        {editingId === null && (
          <button
            onClick={startNew}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add a location
          </button>
        )}

        {/* Editor — typographic header + flush form, no outer card.
            Hierarchy comes from the section dividers inside (border-t
            border-line on subgroup wrappers). */}
        {editingId !== null && draft && (
          <div>
            <div className="flex items-center justify-between py-2 mb-4 border-b border-line">
              <h3 className="font-display text-lg text-slate-900">
                {editingId === 'new' ? 'Add a location' : 'Edit location'}
              </h3>
              <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Address mode toggle (create only) */}
            {editingId === 'new' && (
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setAddMode('pin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    addMode === 'pin' ? 'bg-[#B07A4E] text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  <Map className="w-3.5 h-3.5" /> Drop a pin
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('address')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
                    addMode === 'address' ? 'bg-[#B07A4E] text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" /> Type address
                </button>
              </div>
            )}

            <form onSubmit={save} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Peters Chiropractic, Gold's Gym HB, Home"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
              </div>

              {/* Address — pin or typed (typed only on create) */}
              {(editingId !== 'new' || addMode === 'pin') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <p className="text-xs text-slate-500 mb-2">
                    {editingId === 'new' ? 'Drop a pin on the map.' : 'To change the address, drop a new pin.'}
                  </p>
                  <div className="rounded-lg overflow-hidden border border-line">
                    <PinDropMap
                      onLocationConfirmed={handlePinConfirmed}
                      initialLocation={draft.lat != null ? { lat: draft.lat, lng: draft.lng, address: draft.address } : null}
                    />
                    {draft.address && (
                      <div className="p-2 bg-paper-deep text-xs text-slate-600">
                        {draft.address}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {editingId === 'new' && addMode === 'address' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Street</label>
                    <input
                      type="text"
                      value={draft.street}
                      onChange={(e) => setDraft({ ...draft, street: e.target.value })}
                      placeholder="123 Main St"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={draft.city}
                        onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                      <select
                        value={draft.state}
                        onChange={(e) => setDraft({ ...draft, state: e.target.value })}
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
                        value={draft.zip}
                        onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
                        maxLength={5}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Roles */}
              <div className="border-t border-line pt-4 space-y-2">
                <p className="text-sm font-medium text-slate-700 mb-1">Roles</p>
                <p className="text-xs text-slate-500 mb-2">
                  This place can be tagged with one or both. Both can be off if it's just a saved departure point.
                </p>

                <label className="flex items-start gap-3 py-2 px-1 cursor-pointer hover:bg-paper-deep rounded -mx-1">
                  <input
                    type="checkbox"
                    checked={draft.isHomeBase}
                    onChange={(e) => setDraft({ ...draft, isHomeBase: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <Home className="w-3.5 h-3.5 text-teal-600" /> Home base
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Default departure point for drive-time math. Exactly one home base per provider.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 py-2 px-1 cursor-pointer hover:bg-paper-deep rounded -mx-1">
                  <input
                    type="checkbox"
                    checked={draft.isStaticLocation}
                    onChange={(e) => setDraft({ ...draft, isStaticLocation: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" /> In-studio
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Clients come here. Has its own turnover buffer and optional pricing.
                    </div>
                  </div>
                </label>
              </div>

              {/* In-studio config (only when isStaticLocation) */}
              {draft.isStaticLocation && (
                <div className="border-t border-line pt-4 space-y-4">
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
                        value={draft.staticConfig.bufferMinutes}
                        onChange={(e) => setDraft({
                          ...draft,
                          staticConfig: { ...draft.staticConfig, bufferMinutes: e.target.value }
                        })}
                        className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                      />
                      <span className="text-sm text-slate-600">minutes</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Pricing</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 py-2 px-1 cursor-pointer hover:bg-paper-deep rounded -mx-1">
                        <input
                          type="radio"
                          checked={draft.staticConfig.useMobilePricing}
                          onChange={() => setDraft({
                            ...draft,
                            staticConfig: { ...draft.staticConfig, useMobilePricing: true }
                          })}
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

                      <label className="flex items-start gap-3 py-2 px-1 cursor-pointer hover:bg-paper-deep rounded -mx-1">
                        <input
                          type="radio"
                          checked={!draft.staticConfig.useMobilePricing}
                          onChange={() => setDraft({
                            ...draft,
                            staticConfig: { ...draft.staticConfig, useMobilePricing: false }
                          })}
                          className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">Custom pricing for this location</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Common when in-studio rates are lower than in-home.
                          </div>
                        </div>
                      </label>
                    </div>

                    {!draft.staticConfig.useMobilePricing && (
                      <div className="mt-3 pl-3 border-l-2 border-line space-y-2">
                        {draft.staticConfig.pricing.length === 0 && mobilePricing.length > 0 && (
                          <button
                            type="button"
                            onClick={copyMobilePricing}
                            className="text-sm text-[#B07A4E] hover:text-[#8A5D36] underline"
                          >
                            Copy from my mobile pricing as a starting point
                          </button>
                        )}
                        {draft.staticConfig.pricing.map((tier, idx) => (
                          <div key={idx} className="flex items-end gap-2 py-2 border-b border-line-soft last:border-b-0">
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
                              type="button"
                              onClick={() => removePricingTier(idx)}
                              className="p-1 text-slate-500 hover:text-red-500 mb-0.5"
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
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:bg-slate-400 font-medium"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : (editingId === 'new' ? 'Save location' : 'Save changes')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderLocations;
