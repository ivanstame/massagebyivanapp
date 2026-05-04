import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  Layers, Search, Loader2, AlertCircle, ChevronDown, ChevronUp,
  Calendar, RotateCcw, ExternalLink, X, DollarSign, Filter,
} from 'lucide-react';
import { packageHeadline } from '../utils/packageDisplay';

// Provider's master list of every package they've sold/comped, across all
// clients. Three tabs (Active / Fulfilled / Cancelled), search by client
// name, filter by payment method / kind / purchase date range, and rows
// expand in place to show the redemption timeline. Rendered as a section
// inside the Services page (next to the package-template editor) so the
// nav stays uncluttered and templates + sold instances live together.
const SoldPackagesSection = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(null);

  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // active | fulfilled | cancelled
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');   // all | stripe | cash | comped
  const [kindFilter, setKindFilter] = useState('all');         // all | sessions | minutes
  const [fromDate, setFromDate] = useState('');                // YYYY-MM-DD
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await axios.get('/api/packages/provider/all', { withCredentials: true });
      setPackages(data || []);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy-load on first expand. Services page already has plenty going on,
  // so don't pay this fetch unless the provider asks to see the data.
  useEffect(() => {
    if (!collapsed && !loaded && !loading) fetchAll();
  }, [collapsed, loaded, loading, fetchAll]);

  // Bucket every package into one of the three tabs. A package is:
  //   cancelled — paymentStatus='cancelled' OR cancelledAt set
  //   fulfilled — paid and remaining capacity is zero
  //   active    — everything else (includes pending payments awaiting webhook)
  const bucket = (pkg) => {
    if (pkg.paymentStatus === 'cancelled' || pkg.cancelledAt) return 'cancelled';
    const remaining = computeRemaining(pkg);
    if (pkg.paymentStatus === 'paid' && remaining <= 0) return 'fulfilled';
    return 'active';
  };

  const counts = useMemo(() => {
    const c = { active: 0, fulfilled: 0, cancelled: 0 };
    for (const p of packages) c[bucket(p)]++;
    return c;
  }, [packages]);

  // Apply tab + filters + search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter(p => {
      if (bucket(p) !== activeTab) return false;
      if (paymentFilter !== 'all' && p.paymentMethod !== paymentFilter) return false;
      if (kindFilter !== 'all' && p.kind !== kindFilter) return false;
      if (fromDate || toDate) {
        const pd = p.purchasedAt ? new Date(p.purchasedAt) : (p.createdAt ? new Date(p.createdAt) : null);
        if (!pd) return false;
        if (fromDate && pd < new Date(fromDate + 'T00:00:00')) return false;
        if (toDate && pd > new Date(toDate + 'T23:59:59')) return false;
      }
      if (q) {
        const name = (p.client?.profile?.fullName || '').toLowerCase();
        const email = (p.client?.email || '').toLowerCase();
        const pkgName = (p.name || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !pkgName.includes(q)) return false;
      }
      return true;
    });
  }, [packages, activeTab, paymentFilter, kindFilter, fromDate, toDate, search]);

  // Aggregate stats — computed from the *currently visible* set so the
  // numbers reflect whatever the provider has filtered to.
  const stats = useMemo(() => {
    let revenue = 0;
    let totalRedemptions = 0;
    for (const p of filtered) {
      if (p.paymentMethod !== 'comped' && p.paymentStatus === 'paid') {
        revenue += Number(p.price) || 0;
      }
      totalRedemptions += (p.redemptions || []).filter(r => !r.returnedAt).length;
    }
    return { revenue, totalRedemptions, count: filtered.length };
  }, [filtered]);

  const handleReinstate = async (pkg, redemptionId) => {
    if (!window.confirm('Reinstate this credit? The client will get the session back to use.')) return;
    try {
      setWorking(`${pkg._id}:${redemptionId}`);
      await axios.patch(
        `/api/packages/${pkg._id}/redemptions/${redemptionId}/reinstate`,
        {},
        { withCredentials: true }
      );
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reinstate credit');
    } finally {
      setWorking(null);
    }
  };

  const clearFilters = () => {
    setPaymentFilter('all');
    setKindFilter('all');
    setFromDate('');
    setToDate('');
    setSearch('');
  };

  const hasActiveFilters = paymentFilter !== 'all' || kindFilter !== 'all' || fromDate || toDate || search;

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#B07A4E]" />
          <h2 className="text-lg font-medium text-slate-900">Sold Packages</h2>
          {loaded && packages.length > 0 && (
            <span className="text-xs text-slate-500">
              ({counts.active} active · {counts.fulfilled} fulfilled
              {counts.cancelled > 0 ? ` · ${counts.cancelled} cancelled` : ''})
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-slate-400" />
          : <ChevronUp className="w-4 h-4 text-slate-400" />
        }
      </button>

      {!collapsed && (
      <div className="mt-4">
        <p className="text-sm text-slate-500 mb-4">
          Every package you&rsquo;ve sold or comped, with redemption history. Templates above
          are the offerings clients see; rows here are individual instances clients own.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-line">
          {[
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'fulfilled', label: 'Fulfilled', count: counts.fulfilled },
            { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setExpandedId(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-[#B07A4E] text-[#B07A4E]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-[#B07A4E]/10 text-[#B07A4E]' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="bg-paper-elev border border-line rounded-lg p-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client name, email, or package name…"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded border ${
                showFilters || hasActiveFilters
                  ? 'border-[#B07A4E] text-[#B07A4E] bg-[#B07A4E]/5'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-0.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-[#B07A4E] text-white">
                  {[paymentFilter !== 'all', kindFilter !== 'all', !!fromDate, !!toDate, !!search].filter(Boolean).length}
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment</label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                >
                  <option value="all">All methods</option>
                  <option value="stripe">Stripe (online)</option>
                  <option value="cash">Cash</option>
                  <option value="comped">Comped</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                >
                  <option value="all">All types</option>
                  <option value="sessions">Sessions</option>
                  <option value="minutes">Minutes pool</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Purchased from</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Purchased to</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Showing" value={stats.count} />
            <StatCard
              label={activeTab === 'fulfilled' ? 'Total revenue' : 'Revenue (paid)'}
              value={`$${stats.revenue.toFixed(2)}`}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <StatCard label="Live redemptions" value={stats.totalRedemptions} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading packages…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={activeTab} hasFilters={!!hasActiveFilters} totalCount={packages.length} />
        ) : (
          <div className="space-y-2">
            {filtered.map(pkg => (
              <PackageCard
                key={pkg._id}
                pkg={pkg}
                expanded={expandedId === pkg._id}
                onToggle={() => setExpandedId(expandedId === pkg._id ? null : pkg._id)}
                onReinstate={(redemptionId) => handleReinstate(pkg, redemptionId)}
                working={working}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────

function computeRemaining(pkg) {
  const isMinutes = pkg.kind === 'minutes';
  const total = isMinutes ? (pkg.minutesTotal || 0) : (pkg.sessionsTotal || 0);
  const liveRedemptions = (pkg.redemptions || []).filter(r => !r.returnedAt);
  const liveUsed = isMinutes
    ? liveRedemptions.reduce((sum, r) => sum + (r.minutesConsumed || 0), 0)
    : liveRedemptions.length;
  const used = isMinutes
    ? (pkg.minutesUsed ?? (liveUsed + (pkg.preConsumedMinutes || 0)))
    : (pkg.sessionsUsed ?? (liveUsed + (pkg.preConsumedSessions || 0)));
  return isMinutes
    ? (pkg.minutesRemaining ?? (total - used))
    : (pkg.sessionsRemaining ?? (total - used));
}

const StatCard = ({ label, value, icon }) => (
  <div className="bg-paper-elev border border-line rounded-lg px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wide font-medium">
      {icon}
      {label}
    </div>
    <div className="text-xl font-semibold text-slate-900 mt-0.5">{value}</div>
  </div>
);

const EmptyState = ({ tab, hasFilters, totalCount }) => (
  <div className="text-center py-12 bg-paper-elev border border-line rounded-lg">
    <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
    <p className="text-slate-700 font-medium">
      {hasFilters ? 'No packages match your filters.' :
       totalCount === 0 ? 'No packages yet.' :
       `No ${tab} packages.`}
    </p>
    <p className="text-sm text-slate-500 mt-1">
      {hasFilters ? 'Try clearing the search or filters above.' :
       totalCount === 0 ? 'Packages will appear here once clients buy them or you record cash sales / comps.' :
       `Switch tabs to see your other packages.`}
    </p>
  </div>
);

// ─── Per-package card ────────────────────────────────────────────────

const PackageCard = ({ pkg, expanded, onToggle, onReinstate, working }) => {
  const isMinutes = pkg.kind === 'minutes';
  const total = isMinutes ? (pkg.minutesTotal || 0) : (pkg.sessionsTotal || 0);
  const remaining = computeRemaining(pkg);
  const used = total - remaining;
  const isCancelled = !!pkg.cancelledAt || pkg.paymentStatus === 'cancelled';
  const isPending = pkg.paymentStatus === 'pending';
  const liveRedemptions = (pkg.redemptions || []).filter(r => !r.returnedAt);
  const allRedemptions = pkg.redemptions || [];

  const clientName = pkg.client?.profile?.fullName || pkg.client?.email || 'Unknown client';
  const clientId = pkg.client?._id;

  // Status badge — same priority order as ClientPackagesSection.
  let statusBadge = null;
  if (isCancelled) {
    statusBadge = <Badge color="slate">Cancelled</Badge>;
  } else if (isPending) {
    statusBadge = <Badge color="amber">Pending</Badge>;
  } else if (remaining === 0) {
    statusBadge = <Badge color="slate">Used up</Badge>;
  } else if (pkg.paymentMethod === 'comped') {
    statusBadge = <Badge color="brand">Comped</Badge>;
  } else if (pkg.paymentMethod === 'cash') {
    statusBadge = <Badge color="emerald">Cash</Badge>;
  } else if (pkg.paymentMethod === 'stripe') {
    statusBadge = <Badge color="blue">Stripe</Badge>;
  }

  const summary = packageHeadline(pkg);

  const unit = isMinutes ? 'min' : '';

  // Last redemption date — handy at-a-glance signal of activity. If the
  // package has been used at all, show when it was last touched; else
  // fall back to "—".
  const lastRedemptionDate = (() => {
    if (allRedemptions.length === 0) return null;
    const sorted = [...allRedemptions].sort((a, b) =>
      new Date(b.redeemedAt) - new Date(a.redeemedAt)
    );
    return sorted[0]?.redeemedAt || null;
  })();

  // Progress percentage for the bar.
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;

  return (
    <div className={`rounded-lg border ${isCancelled ? 'bg-paper-deep border-line-soft opacity-75' : 'bg-paper-elev border-line'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-slate-50/40 rounded-lg transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#B07A4E]/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-[#B07A4E]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 truncate">{clientName}</span>
                  {statusBadge}
                </div>
                <p className="text-sm text-slate-700 mt-0.5 truncate">{pkg.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {summary} · {pkg.price > 0 ? `$${pkg.price.toFixed(2)}` : 'Comped'}
                  {pkg.purchasedAt && <> · purchased {DateTime.fromISO(pkg.purchasedAt).toFormat('MMM d, yyyy')}</>}
                  {!pkg.purchasedAt && pkg.createdAt && <> · created {DateTime.fromISO(pkg.createdAt).toFormat('MMM d, yyyy')}</>}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {pkg.paymentStatus === 'paid' && !isCancelled && (
                  <div className="text-right">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">{remaining}</span>
                      <span className="text-slate-500"> / {total} {unit}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">remaining</div>
                  </div>
                )}
                {expanded
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />
                }
              </div>
            </div>

            {/* Progress bar — paid + uncancelled only. */}
            {pkg.paymentStatus === 'paid' && !isCancelled && total > 0 && (
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${remaining === 0 ? 'bg-slate-300' : 'bg-[#B07A4E]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            {/* Last activity hint, collapsed view. */}
            {!expanded && lastRedemptionDate && (
              <p className="text-[11px] text-slate-400 mt-2">
                Last redeemed {DateTime.fromISO(lastRedemptionDate).toFormat('MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded redemption history. */}
      {expanded && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs uppercase tracking-wide font-medium text-slate-500">
              Redemption history ({allRedemptions.length})
            </h4>
            {clientId && (
              <Link
                to={`/provider/clients/${clientId}`}
                className="text-xs text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1"
              >
                Open client
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {(pkg.preConsumedMinutes > 0 || pkg.preConsumedSessions > 0) && (
            <p className="text-[11px] text-slate-500 italic mb-2">
              Includes {isMinutes ? `${pkg.preConsumedMinutes} min` : `${pkg.preConsumedSessions} session(s)`} backfilled from before tracking
              {pkg.preConsumedNote ? ` — ${pkg.preConsumedNote}` : '.'}
            </p>
          )}

          {allRedemptions.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No redemptions yet.</p>
          ) : (
            <ul className="space-y-2">
              {allRedemptions
                .slice()
                .sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt))
                .map(r => {
                  const b = r.booking && typeof r.booking === 'object' ? r.booking : null;
                  const apptLabel = b
                    ? `${DateTime.fromFormat(b.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d, yyyy')} at ${DateTime.fromFormat(b.startTime, 'HH:mm').toFormat('h:mm a')}`
                    : `Used ${DateTime.fromISO(r.redeemedAt).toFormat('MMM d, yyyy h:mm a')}`;
                  const status = b?.status || null;
                  const statusColors = {
                    pending: 'bg-amber-50 text-amber-700 border-amber-200',
                    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
                    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
                  };
                  const isReturned = !!r.returnedAt;
                  return (
                    <li
                      key={r._id}
                      className={`flex items-start justify-between gap-2 p-2 rounded ${
                        isReturned ? 'bg-slate-50/60 opacity-70' : 'bg-paper-deep'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap text-sm">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-900">{apptLabel}</span>
                          {b && (
                            <span className="text-slate-500 text-xs">({b.duration} min)</span>
                          )}
                          {isMinutes && r.minutesConsumed > 0 && !b && (
                            <span className="text-slate-500 text-xs">({r.minutesConsumed} min)</span>
                          )}
                          {status && (
                            <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${statusColors[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {status}
                            </span>
                          )}
                          {isReturned && (
                            <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                              Returned
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Redeemed {DateTime.fromISO(r.redeemedAt).toFormat('MMM d, yyyy h:mm a')}
                          {isReturned && r.returnedAt && (
                            <> · returned {DateTime.fromISO(r.returnedAt).toFormat('MMM d, yyyy')}</>
                          )}
                        </div>
                      </div>
                      {!isCancelled && !isReturned && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onReinstate(r._id); }}
                          disabled={working === `${pkg._id}:${r._id}`}
                          className="text-xs text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
                        >
                          {working === `${pkg._id}:${r._id}` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Reinstate
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const Badge = ({ color, children }) => {
  const colors = {
    slate:  'bg-slate-100 text-slate-600',
    amber:  'bg-amber-50 text-amber-700 border border-amber-200',
    brand:  'bg-[#B07A4E]/10 text-[#8A5D36]',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    blue:   'bg-blue-50 text-blue-700 border border-blue-200',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

export default SoldPackagesSection;
