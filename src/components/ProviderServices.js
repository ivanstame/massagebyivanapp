import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  DollarSign, Plus, Trash2, Clock, AlertCircle, CheckCircle,
  Save, GripVertical, ToggleLeft, ToggleRight
} from 'lucide-react';

const DEFAULT_PRICING = [
  { duration: 60, price: 125, label: '60 Minutes' },
  { duration: 90, price: 180, label: '90 Minutes' },
  { duration: 120, price: 250, label: '120 Minutes' },
];

const ProviderServices = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [basePricing, setBasePricing] = useState([]);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAddon, setShowAddAddon] = useState(false);
  const [newAddon, setNewAddon] = useState({ name: '', price: '', description: '', extraTime: 0 });

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    fetchServices();
  }, [user, navigate]);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/users/provider/${user._id}/services`);
      // The GET endpoint only returns active addons for clients.
      // For management, load from user profile to get ALL addons (including inactive)
      const profileRes = await axios.get('/api/users/profile', { withCredentials: true });
      const providerProfile = profileRes.data?.providerProfile || {};

      // Use provider's saved pricing or defaults
      const savedPricing = providerProfile.basePricing || [];
      setBasePricing(savedPricing.length > 0 ? savedPricing : DEFAULT_PRICING);

      // Load all addons (including inactive) for management
      setAddons(providerProfile.addons || []);
    } catch (err) {
      console.error('Error fetching services:', err);
      // Initialize with defaults if fetch fails
      setBasePricing(DEFAULT_PRICING);
      setAddons([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePricingChange = (index, field, value) => {
    setBasePricing(prev => prev.map((p, i) =>
      i === index ? { ...p, [field]: field === 'price' ? Number(value) || 0 : value } : p
    ));
    setSaved(false);
  };

  const handleAddPricingTier = () => {
    setBasePricing(prev => [...prev, { duration: 60, price: 0, label: '' }]);
    setSaved(false);
  };

  const handleRemovePricingTier = (index) => {
    if (basePricing.length <= 1) {
      setError('You need at least one pricing tier');
      return;
    }
    setBasePricing(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const handleAddAddon = () => {
    if (!newAddon.name.trim()) {
      setError('Add-on name is required');
      return;
    }
    if (!newAddon.price || Number(newAddon.price) < 0) {
      setError('Add-on price is required');
      return;
    }

    setAddons(prev => [...prev, {
      name: newAddon.name.trim(),
      price: Number(newAddon.price),
      description: newAddon.description.trim(),
      extraTime: Number(newAddon.extraTime) || 0,
      isActive: true
    }]);
    setNewAddon({ name: '', price: '', description: '', extraTime: 0 });
    setShowAddAddon(false);
    setSaved(false);
  };

  const handleRemoveAddon = (index) => {
    setAddons(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const handleToggleAddon = (index) => {
    setAddons(prev => prev.map((a, i) =>
      i === index ? { ...a, isActive: !a.isActive } : a
    ));
    setSaved(false);
  };

  const handleAddonFieldChange = (index, field, value) => {
    setAddons(prev => prev.map((a, i) =>
      i === index ? { ...a, [field]: field === 'price' || field === 'extraTime' ? Number(value) || 0 : value } : a
    ));
    setSaved(false);
  };

  const handleSave = async () => {
    // Validate
    for (const p of basePricing) {
      if (!p.duration || p.duration < 30) {
        setError('Duration must be at least 30 minutes');
        return;
      }
      if (p.price < 0) {
        setError('Prices cannot be negative');
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      // Auto-generate labels if missing
      const pricingWithLabels = basePricing.map(p => ({
        ...p,
        label: p.label || `${p.duration} Minutes`
      }));

      await axios.put('/api/users/provider/services', {
        basePricing: pricingWithLabels,
        addons
      }, { withCredentials: true });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save services');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading services...</div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Your offerings</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Services &amp; <em style={{ color: '#B07A4E' }}>pricing</em>
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Set your session pricing and add-on services. Clients see these when booking.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {saved && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700 flex items-start rounded">
            <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">Services saved. Clients will see updated pricing on their next booking.</p>
          </div>
        )}

        {/* Base Session Pricing */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#B07A4E]" />
              <h3 className="font-medium text-slate-900">Session Pricing</h3>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Set the price for each session duration you offer.
          </p>

          <div className="space-y-3">
            {basePricing.map((tier, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-paper-deep rounded-lg border border-line-soft">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Duration (min)</label>
                    <select
                      value={tier.duration}
                      onChange={(e) => handlePricingChange(index, 'duration', Number(e.target.value))}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    >
                      {[30, 45, 60, 75, 90, 120, 150, 180].map(d => (
                        <option key={d} value={d}>{d} min</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Price ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={tier.price}
                      onChange={(e) => handlePricingChange(index, 'price', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Label</label>
                    <input
                      type="text"
                      value={tier.label || ''}
                      onChange={(e) => handlePricingChange(index, 'label', e.target.value)}
                      placeholder={`${tier.duration} Minutes`}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleRemovePricingTier(index)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPricingTier}
            className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Duration
          </button>
        </div>

        {/* Add-on Services */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#B07A4E]" />
              <h3 className="font-medium text-slate-900">Add-on Services</h3>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Optional extras clients can add to their session. Toggle to enable/disable without deleting.
          </p>

          {addons.length === 0 && !showAddAddon ? (
            <div className="text-center py-6 bg-paper-deep rounded-lg border border-dashed border-slate-300">
              <p className="text-slate-500 text-sm">No add-on services yet</p>
              <p className="text-slate-400 text-xs mt-1">Add services like TheraGun, Hot Stone, etc.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {addons.map((addon, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border transition-colors ${
                    addon.isActive
                      ? 'bg-paper-elev border-line shadow-sm'
                      : 'bg-paper-deep border-line-soft opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleAddon(index)}
                      className="mt-1 flex-shrink-0"
                      title={addon.isActive ? 'Disable add-on' : 'Enable add-on'}
                    >
                      {addon.isActive ? (
                        <ToggleRight className="w-6 h-6 text-[#B07A4E]" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-400" />
                      )}
                    </button>

                    {/* Editable fields */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          value={addon.name}
                          onChange={(e) => handleAddonFieldChange(index, 'name', e.target.value)}
                          placeholder="Service name"
                          className="w-full border border-line rounded px-2 py-1.5 text-sm font-medium focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="relative">
                            <span className="absolute left-2 top-1.5 text-sm text-slate-400">$</span>
                            <input
                              type="number"
                              min="0"
                              value={addon.price}
                              onChange={(e) => handleAddonFieldChange(index, 'price', e.target.value)}
                              className="w-full border border-line rounded pl-6 pr-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                            />
                          </div>
                        </div>
                        <div className="w-20">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={addon.extraTime}
                              onChange={(e) => handleAddonFieldChange(index, 'extraTime', e.target.value)}
                              className="w-full border border-line rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                              title="Extra minutes added"
                            />
                            <span className="absolute right-2 top-1.5 text-xs text-slate-400">min</span>
                          </div>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={addon.description || ''}
                          onChange={(e) => handleAddonFieldChange(index, 'description', e.target.value)}
                          placeholder="Brief description (shown to clients)"
                          className="w-full border border-line rounded px-2 py-1.5 text-xs text-slate-600 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                        />
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleRemoveAddon(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new addon form */}
          {showAddAddon ? (
            <div className="mt-3 p-4 bg-paper-deep rounded-lg border border-line space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Service Name</label>
                  <input
                    type="text"
                    value={newAddon.name}
                    onChange={(e) => setNewAddon(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. TheraGun, Hot Stone"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Price ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={newAddon.price}
                      onChange={(e) => setNewAddon(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="10"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Extra min</label>
                    <input
                      type="number"
                      min="0"
                      value={newAddon.extraTime}
                      onChange={(e) => setNewAddon(prev => ({ ...prev, extraTime: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newAddon.description}
                  onChange={(e) => setNewAddon(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Percussive therapy for deep muscle relief"
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAddAddon(false); setNewAddon({ name: '', price: '', description: '', extraTime: 0 }); }}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAddon}
                  className="px-4 py-1.5 text-sm bg-[#B07A4E] text-white rounded hover:bg-[#8A5D36] font-medium"
                >
                  Add Service
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddAddon(true)}
              className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </button>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end mb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center px-6 py-2.5 rounded-lg text-white font-medium transition-colors ${
              saving ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#B07A4E] hover:bg-[#8A5D36]'
            }`}
          >
            {saving ? 'Saving...' : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Services
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProviderServices;
