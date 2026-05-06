import React, { useState, useEffect, useLayoutEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  DollarSign, Plus, Trash2, Clock, AlertCircle, CheckCircle,
  Save, ChevronUp, ChevronDown, ToggleLeft, ToggleRight
} from 'lucide-react';
import { getTrade } from '../shared/trades';
import PackageDealsSection from './PackageDealsSection';
import SoldPackagesSection from './SoldPackagesSection';

const ProviderServices = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [basePricing, setBasePricing] = useState([]);
  const [pricingTiers, setPricingTiers] = useState([]); // alternate tiers (Discount, etc.)
  const [addons, setAddons] = useState([]);
  const [trade, setTrade] = useState('other');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAddon, setShowAddAddon] = useState(false);
  const [newAddon, setNewAddon] = useState({ name: '', price: '', description: '', extraTime: 0 });

  // Which custom pricing tiers are currently expanded in the unified
  // Pricing card. Standard is always expanded; custom tiers default to
  // collapsed so the page leads with what 95% of providers care about.
  // { [tier._uid]: true } = expanded.
  const [expandedTiers, setExpandedTiers] = useState({});
  const toggleTierExpanded = (uid) => {
    setExpandedTiers(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  // Top-level tabs. The Services page used to be a long scroll of
  // four large sections (Pricing, Add-ons, Package Deals, Sold
  // Packages), which made the whole page hard to navigate even
  // after the unified Pricing card landed. Tabs let the provider
  // focus on one concern at a time. Persisted in the URL hash so
  // refreshes / back-button / shared links land on the right tab.
  const TABS = [
    { id: 'pricing',  label: 'Pricing' },
    { id: 'addons',   label: 'Add-ons' },
    { id: 'packages', label: 'Packages' },
  ];
  const [activeTab, setActiveTab] = useState(() => {
    const hash = typeof window !== 'undefined'
      ? window.location.hash.replace('#', '')
      : '';
    return TABS.some(t => t.id === hash) ? hash : 'pricing';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  // FLIP animation for offering reorder. We capture each row's top
  // before basePricing changes (in the move handler) and after the new
  // layout commits we animate from the captured delta back to zero so
  // each affected row visibly slides into its new spot.
  const rowRefs = useRef({});
  const previousTops = useRef({});

  useLayoutEffect(() => {
    if (Object.keys(previousTops.current).length === 0) return;
    Object.entries(rowRefs.current).forEach(([uid, el]) => {
      if (!el) return;
      const prevTop = previousTops.current[uid];
      if (prevTop === undefined) return;
      const newTop = el.getBoundingClientRect().top;
      const deltaY = prevTop - newTop;
      if (deltaY === 0) return;
      el.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0)' }
        ],
        { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    });
    previousTops.current = {};
    // Also re-runs when alternate tiers change order so tier-row swaps
    // get the same animation treatment as Standard.
  }, [basePricing, pricingTiers]);

  const captureRowPositions = () => {
    Object.entries(rowRefs.current).forEach(([uid, el]) => {
      if (el) previousTops.current[uid] = el.getBoundingClientRect().top;
    });
  };

  const tradePreset = getTrade(trade);

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
      // Load from user profile to get trade, ALL addons (including inactive), and pricing
      const profileRes = await axios.get('/api/users/profile', { withCredentials: true });
      const providerProfile = profileRes.data?.providerProfile || {};
      const providerTrade = providerProfile.trade || 'other';
      setTrade(providerTrade);

      // Seed with trade-appropriate starter packages when the provider has none yet.
      // These are in-memory suggestions; nothing is persisted until Save.
      // _uid is a client-only stable id used as the React key + as the FLIP
      // identity so the move animation can track which row went where.
      const withUid = arr => arr.map(p => ({
        ...p,
        _uid: p._uid || `t-${Math.random().toString(36).slice(2, 10)}`
      }));
      const savedPricing = providerProfile.basePricing || [];
      if (savedPricing.length > 0) {
        setBasePricing(withUid(savedPricing));
      } else {
        setBasePricing(withUid(getTrade(providerTrade).starterPackages.map(p => ({ ...p }))));
      }

      // Hydrate alternate pricing tiers. Each tier carries its own _id
      // (from the server) so client-tag references survive renames.
      const savedTiers = providerProfile.pricingTiers || [];
      setPricingTiers(savedTiers.map(t => ({
        _id: t._id,
        _uid: `tier-${t._id || Math.random().toString(36).slice(2, 8)}`,
        name: t.name,
        pricing: withUid(t.pricing || [])
      })));

      setAddons(providerProfile.addons || []);
    } catch (err) {
      console.error('Error fetching services:', err);
      setBasePricing(getTrade('other').starterPackages.map(p => ({ ...p })));
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
    setBasePricing(prev => [
      ...prev,
      { duration: 60, price: 0, label: '', _uid: `t-${Math.random().toString(36).slice(2, 10)}` }
    ]);
    setSaved(false);
  };

  // ── Alternate pricing tiers (Discount / Concierge / Grandfathered / etc.) ──
  const addAlternateTier = () => {
    // Seed new tier from the standard's structure so the provider just
    // tweaks prices instead of rebuilding the duration list.
    const seed = basePricing.map(p => ({
      duration: p.duration,
      price: p.price,
      label: p.label || `${p.duration} Minutes`,
      _uid: `t-${Math.random().toString(36).slice(2, 10)}`
    }));
    const newUid = `tier-${Math.random().toString(36).slice(2, 10)}`;
    setPricingTiers(prev => [
      ...prev,
      {
        _uid: newUid,
        name: '',
        pricing: seed
      }
    ]);
    // Auto-expand the new tier so the provider can edit right away
    // — collapsed-by-default makes sense for existing tiers, not for
    // the one they just intentionally created.
    setExpandedTiers(prev => ({ ...prev, [newUid]: true }));
    setSaved(false);
  };

  const renameTier = (uid, name) => {
    setPricingTiers(prev => prev.map(t => t._uid === uid ? { ...t, name } : t));
    setSaved(false);
  };

  const removeTier = (uid) => {
    if (!window.confirm(
      'Remove this pricing tier? Clients tagged with it will fall back to your Standard pricing.'
    )) return;
    setPricingTiers(prev => prev.filter(t => t._uid !== uid));
    setSaved(false);
  };

  const updateTierTier = (tierUid, rowIdx, field, value) => {
    setPricingTiers(prev => prev.map(t => {
      if (t._uid !== tierUid) return t;
      return {
        ...t,
        pricing: t.pricing.map((p, i) =>
          i === rowIdx
            ? { ...p, [field]: field === 'price' ? Number(value) || 0 : value }
            : p
        )
      };
    }));
    setSaved(false);
  };

  const addTierRow = (tierUid) => {
    setPricingTiers(prev => prev.map(t => {
      if (t._uid !== tierUid) return t;
      return {
        ...t,
        pricing: [
          ...t.pricing,
          { duration: 60, price: 0, label: '', _uid: `t-${Math.random().toString(36).slice(2, 10)}` }
        ]
      };
    }));
    setSaved(false);
  };

  const removeTierRow = (tierUid, rowIdx) => {
    setPricingTiers(prev => prev.map(t => {
      if (t._uid !== tierUid) return t;
      if (t.pricing.length <= 1) return t; // keep at least one
      return { ...t, pricing: t.pricing.filter((_, i) => i !== rowIdx) };
    }));
    setSaved(false);
  };

  // Reorder a row within an alternate tier. Same FLIP machinery as
  // the Standard tier — capture positions, swap, let useLayoutEffect
  // animate the delta. Row _uids are unique across all tiers, so the
  // shared rowRefs map handles them transparently.
  const moveTierRowPosition = (tierUid, from, direction) => {
    const tier = pricingTiers.find(t => t._uid === tierUid);
    if (!tier) return;
    const to = from + direction;
    if (to < 0 || to >= tier.pricing.length) return;
    captureRowPositions();
    setPricingTiers(prev => prev.map(t => {
      if (t._uid !== tierUid) return t;
      const next = [...t.pricing];
      [next[from], next[to]] = [next[to], next[from]];
      return { ...t, pricing: next };
    }));
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

  // Move a tier one position up or down. Up/down chevron buttons are
  // the most reliable cross-browser sortable affordance — native HTML5
  // drag-and-drop is unpredictable and dead on touch devices. Capture
  // current row positions first so the FLIP effect can animate the
  // delta after the next render.
  const movePricingTier = (from, direction) => {
    const to = from + direction;
    if (to < 0 || to >= basePricing.length) return;
    captureRowPositions();
    setBasePricing(prev => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setSaved(false);
  };

  // Bulk-sort the Standard tier in place. FLIP-aware: capture before,
  // apply, animate. Same shape works for alternate tiers below.
  const sortBasePricing = (mode) => {
    captureRowPositions();
    setBasePricing(prev => {
      const next = [...prev];
      next.sort((a, b) => {
        if (mode === 'duration') return (Number(a.duration) || 0) - (Number(b.duration) || 0);
        if (mode === 'name') {
          return (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' });
        }
        return 0;
      });
      return next;
    });
    setSaved(false);
  };

  const sortTierPricing = (tierUid, mode) => {
    captureRowPositions();
    setPricingTiers(prev => prev.map(t => {
      if (t._uid !== tierUid) return t;
      const next = [...t.pricing];
      next.sort((a, b) => {
        if (mode === 'duration') return (Number(a.duration) || 0) - (Number(b.duration) || 0);
        if (mode === 'name') {
          return (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' });
        }
        return 0;
      });
      return { ...t, pricing: next };
    }));
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
    // Validate base pricing
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

    // Validate alternate tiers
    const seenTierNames = new Set();
    for (const tier of pricingTiers) {
      const trimmed = (tier.name || '').trim();
      if (!trimmed) {
        setError('Each pricing tier needs a name');
        return;
      }
      if (seenTierNames.has(trimmed.toLowerCase())) {
        setError(`Duplicate tier name: "${trimmed}"`);
        return;
      }
      seenTierNames.add(trimmed.toLowerCase());
      if (!tier.pricing || tier.pricing.length === 0) {
        setError(`Tier "${trimmed}" needs at least one price entry`);
        return;
      }
      for (const p of tier.pricing) {
        if (!p.duration || p.duration < 30) {
          setError(`Tier "${trimmed}": each row needs a duration ≥ 30 min`);
          return;
        }
        if (p.price < 0) {
          setError(`Tier "${trimmed}": prices cannot be negative`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      setError(null);

      // Auto-generate labels if missing. Stamp displayOrder from the
      // current array position so the provider's reorder sticks (server
      // sorts by displayOrder when present, otherwise duration). _uid is
      // a client-only animation key — strip it before saving.
      const pricingWithLabels = basePricing.map((p, idx) => {
        const { _uid, ...rest } = p;
        return {
          ...rest,
          label: rest.label || `${rest.duration} Minutes`,
          displayOrder: idx
        };
      });

      // Strip client-only _uid from tier pricing entries before saving;
      // keep tier _id when present so client refs survive the round trip.
      const tiersForSave = pricingTiers.map(t => ({
        ...(t._id && { _id: t._id }),
        name: t.name.trim(),
        pricing: t.pricing.map((p, idx) => {
          const { _uid, ...rest } = p;
          return {
            ...rest,
            label: rest.label || `${rest.duration} Minutes`,
            displayOrder: idx
          };
        })
      }));

      await axios.put('/api/users/provider/services', {
        basePricing: pricingWithLabels,
        pricingTiers: tiersForSave,
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
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Your offerings</div>
          <h1 className="font-display" style={{ fontSize: "2rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Services &amp; <em style={{ color: '#B07A4E' }}>pricing</em>
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Define the offerings you provide and any optional add-ons. Clients see these when booking.
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

        {/* Tabs — Pricing / Add-ons / Packages. Switches the content
            below so the page is one focused concern at a time
            instead of a long scroll of four large cards. URL hash
            persists the active tab. */}
        <div className="border-b border-line mb-6 overflow-x-auto">
          <div className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#B07A4E] text-[#B07A4E]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing tab — flat / typographic. Earlier iterations
            stacked four levels of card-in-card chrome (page → outer
            Pricing card → Standard wrapper card → row card → input
            fields). Even after tightening padding the boxes-within-
            boxes were busy. This version drops every container that
            wasn't carrying real information: no outer Pricing card,
            no Standard wrapper card, no row cards. Hierarchy comes
            from typography and hairline dividers; the DEFAULT badge
            on Standard is the only colored chrome. */}
        {activeTab === 'pricing' && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-[#B07A4E]" />
            <h3 className="font-medium text-slate-900">Pricing</h3>
          </div>
          <p className="text-sm text-ink-2 mb-6">
            Standard is the default menu every new client sees.
            Custom tiers are alternate price lists you tag specific
            clients with (grandfathered, concierge, family, etc.) —
            their bookings resolve through their tagged tier instead.
          </p>

          {/* Standard group — typographic header + flush rows. */}
          <div className="mb-10">
            <div className="flex items-center justify-between py-2 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-slate-900">Standard</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-[#B07A4E] text-white">
                  Default
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {basePricing.length} {basePricing.length === 1 ? 'offering' : 'offerings'}
              </span>
            </div>

            {basePricing.length > 1 && (
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-xs text-slate-500 mr-1">Quick sort:</span>
                <button
                  type="button"
                  onClick={() => sortBasePricing('duration')}
                  className="text-xs px-2 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
                >
                  By duration
                </button>
                <button
                  type="button"
                  onClick={() => sortBasePricing('name')}
                  className="text-xs px-2 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
                >
                  By name
                </button>
              </div>
            )}

            <div>
              {basePricing.map((tier, index) => (
                <div
                  key={tier._uid || index}
                  ref={el => {
                    if (el) rowRefs.current[tier._uid] = el;
                    else delete rowRefs.current[tier._uid];
                  }}
                  className="flex items-start gap-2 py-4 border-b border-line-soft last:border-b-0 will-change-transform"
                >
                  {basePricing.length > 1 && (
                    <div className="flex flex-col gap-0.5 flex-shrink-0 mt-5">
                      <button
                        type="button"
                        onClick={() => movePricingTier(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                        className="p-1 rounded text-slate-500 hover:text-[#B07A4E] hover:bg-paper-deep disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePricingTier(index, 1)}
                        disabled={index === basePricing.length - 1}
                        title="Move down"
                        className="p-1 rounded text-slate-500 hover:text-[#B07A4E] hover:bg-paper-deep disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Offering name</label>
                      <input
                        type="text"
                        value={tier.label || ''}
                        onChange={(e) => handlePricingChange(index, 'label', e.target.value)}
                        placeholder={tradePreset.packagePlaceholder}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E] bg-paper-elev"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Duration (min)</label>
                        <select
                          value={tier.duration}
                          onChange={(e) => handlePricingChange(index, 'duration', Number(e.target.value))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E] bg-paper-elev"
                        >
                          {[30, 45, 60, 75, 90, 105, 120, 150, 180].map(d => (
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
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E] bg-paper-elev"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemovePricingTier(index)}
                    className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 mt-6"
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
              Add Offering
            </button>
          </div>

          {/* Custom tiers — typographic header + collapsible disclosures
              with hairline dividers, no card chrome. */}
          <div>
            <div className="flex items-center justify-between py-2 border-b border-line mb-1">
              <span className="font-display text-lg text-slate-900">Custom tiers</span>
              <span className="text-xs text-slate-500">
                {pricingTiers.length === 0
                  ? 'None — all clients use Standard'
                  : `${pricingTiers.length} ${pricingTiers.length === 1 ? 'tier' : 'tiers'}`}
              </span>
            </div>

            {pricingTiers.length === 0 ? (
              <p className="text-xs text-slate-500 mt-3 mb-2">
                Add a custom tier to set alternate pricing for tagged clients.
              </p>
            ) : (
              <div>
                {pricingTiers.map((tier) => {
                  const isOpen = !!expandedTiers[tier._uid];
                  return (
                    <div key={tier._uid} className="border-b border-line-soft last:border-b-0">
                      {/* Header row — always visible */}
                      <div className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleTierExpanded(tier._uid)}
                          title={isOpen ? 'Collapse' : 'Expand'}
                          className="p-1 rounded text-slate-500 hover:text-[#B07A4E] transition-colors flex-shrink-0"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                          />
                        </button>
                        <input
                          type="text"
                          value={tier.name}
                          onChange={(e) => renameTier(tier._uid, e.target.value)}
                          placeholder="Tier name (e.g. Discount, Concierge)"
                          maxLength={60}
                          className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm font-medium focus:ring-[#B07A4E] focus:border-[#B07A4E] bg-paper-elev"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0 hidden sm:inline">
                          {tier.pricing.length} {tier.pricing.length === 1 ? 'row' : 'rows'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTier(tier._uid)}
                          className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                          title="Remove tier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Body — flush rows when expanded, indented from
                          the header so the parent/child relationship reads
                          without needing a card around them. */}
                      {isOpen && (
                        <div className="pl-7 pb-3">
                          {tier.pricing.length > 1 && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs text-slate-500 mr-1">Sort:</span>
                              <button
                                type="button"
                                onClick={() => sortTierPricing(tier._uid, 'duration')}
                                className="text-xs px-2 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
                              >
                                By duration
                              </button>
                              <button
                                type="button"
                                onClick={() => sortTierPricing(tier._uid, 'name')}
                                className="text-xs px-2 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
                              >
                                By name
                              </button>
                            </div>
                          )}

                          <div>
                            {tier.pricing.map((row, rowIdx) => (
                              <div
                                key={row._uid || rowIdx}
                                ref={el => {
                                  if (el) rowRefs.current[row._uid] = el;
                                  else delete rowRefs.current[row._uid];
                                }}
                                className="flex items-end gap-2 py-2 border-b border-line-soft/60 last:border-b-0 will-change-transform"
                              >
                                {tier.pricing.length > 1 && (
                                  <div className="flex flex-col gap-0.5 flex-shrink-0 mb-0.5">
                                    <button
                                      type="button"
                                      onClick={() => moveTierRowPosition(tier._uid, rowIdx, -1)}
                                      disabled={rowIdx === 0}
                                      title="Move up"
                                      className="p-0.5 rounded text-slate-500 hover:text-[#B07A4E] hover:bg-paper-deep disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveTierRowPosition(tier._uid, rowIdx, 1)}
                                      disabled={rowIdx === tier.pricing.length - 1}
                                      title="Move down"
                                      className="p-0.5 rounded text-slate-500 hover:text-[#B07A4E] hover:bg-paper-deep disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex-1">
                                  <label className="block text-xs text-slate-500 mb-0.5">Label</label>
                                  <input
                                    type="text"
                                    value={row.label || ''}
                                    onChange={(e) => updateTierTier(tier._uid, rowIdx, 'label', e.target.value)}
                                    placeholder={`${row.duration} Minutes`}
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-paper-elev"
                                  />
                                </div>
                                <div className="w-20">
                                  <label className="block text-xs text-slate-500 mb-0.5">Min</label>
                                  <select
                                    value={row.duration}
                                    onChange={(e) => updateTierTier(tier._uid, rowIdx, 'duration', Number(e.target.value))}
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-paper-elev"
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
                                    value={row.price}
                                    onChange={(e) => updateTierTier(tier._uid, rowIdx, 'price', e.target.value)}
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-paper-elev"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeTierRow(tier._uid, rowIdx)}
                                  disabled={tier.pricing.length <= 1}
                                  className="p-1 text-slate-500 hover:text-red-500 mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Remove row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addTierRow(tier._uid)}
                              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs border border-dashed border-slate-300 text-slate-500 rounded hover:border-[#B07A4E] hover:text-[#B07A4E] mt-2"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add a row
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={addAlternateTier}
              disabled={basePricing.length === 0}
              className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={basePricing.length === 0 ? 'Add a Standard offering first' : 'New tier seeded from your Standard pricing'}
            >
              <Plus className="w-4 h-4" />
              Add a custom tier
            </button>
          </div>
        </div>
        )}

        {/* Add-ons tab */}
        {activeTab === 'addons' && (
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#B07A4E]" />
              <h3 className="font-medium text-slate-900">Add-ons</h3>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Optional extras clients can tack onto any offering. Toggle to hide one without deleting it.
          </p>

          {addons.length === 0 && !showAddAddon ? (
            <div className="text-center py-6 bg-paper-deep rounded-lg border border-dashed border-slate-300">
              <p className="text-slate-500 text-sm">No add-ons yet</p>
              <p className="text-slate-500 text-xs mt-1">Examples: {tradePreset.addonExamples}</p>
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
                        <ToggleLeft className="w-6 h-6 text-slate-500" />
                      )}
                    </button>

                    {/* Editable fields */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          value={addon.name}
                          onChange={(e) => handleAddonFieldChange(index, 'name', e.target.value)}
                          placeholder="Add-on name"
                          className="w-full border border-line rounded px-2 py-1.5 text-sm font-medium focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="relative">
                            <span className="absolute left-2 top-1.5 text-sm text-slate-500">$</span>
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
                            <span className="absolute right-2 top-1.5 text-xs text-slate-500">min</span>
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
                      className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 mt-1"
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Add-on name</label>
                  <input
                    type="text"
                    value={newAddon.name}
                    onChange={(e) => setNewAddon(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={tradePreset.addonNamePlaceholder}
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
                  placeholder="Short description clients will see at booking"
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
                  Add Add-on
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddAddon(true)}
              className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Add-on
            </button>
          )}
        </div>
        )}

        {/* Packages tab — Package Deals (templates) + Sold Packages
            (instances). These two are tightly related and both save
            via their own endpoints, so the global Save button below
            stays gated to Pricing + Add-ons tabs. */}
        {activeTab === 'packages' && (
        <>
          <PackageDealsSection
            availableDurations={basePricing.map(p => Number(p.duration)).filter(Boolean)}
          />
          <SoldPackagesSection />
        </>
        )}

        {/* Save button — only visible on tabs that have unsaved
            global state (Pricing, Add-ons). Packages tab subsections
            save themselves via their own endpoints. */}
        {(activeTab === 'pricing' || activeTab === 'addons') && (
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
                Save
              </>
            )}
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

export default ProviderServices;
