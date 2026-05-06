import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  Layers, AlertCircle, CheckCircle, Clock, ShoppingBag,
  ArrowRight, Calendar,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { packageHeadline } from '../utils/packageDisplay';

// Client-facing list of their own packages. Active packages first
// (with progress meter), then cancelled, then fully-redeemed.
const MyPackages = () => {
  const { user } = useContext(AuthContext);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await axios.get('/api/packages/mine', { withCredentials: true });
        setPackages(res.data || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load your packages');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Bucket by status for clearer rendering. Active includes pending purchases
  // even though their credits aren't redeemable yet — surfacing them lets
  // the client see "your card is processing" without confusion.
  const remainingOf = (p) => p.kind === 'minutes'
    ? (p.minutesRemaining ?? 0)
    : (p.sessionsRemaining ?? 0);

  const active = packages.filter(p => !p.cancelledAt && remainingOf(p) > 0);
  const fullyRedeemed = packages.filter(p => !p.cancelledAt && remainingOf(p) === 0);
  const cancelled = packages.filter(p => p.cancelledAt);

  const formatDate = (d) => DateTime.fromISO(d).toFormat('MMM d, yyyy');

  if (loading) {
    return (
      <div className="av-paper pt-16 min-h-screen">
        <div className="max-w-2xl mx-auto px-5 py-8">
          <p className="text-sm text-ink-2">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-7 flex items-end justify-between gap-3">
          <div>
            <div className="av-eyebrow mb-2">Your prepaid sessions</div>
            <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
              My <em style={{ color: '#B07A4E' }}>packages</em>
            </h1>
          </div>
          <Link
            to="/packages"
            className="text-sm text-[#B07A4E] hover:text-[#8A5D36] font-medium inline-flex items-center gap-1"
          >
            Browse <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
          </div>
        )}

        {packages.length === 0 ? (
          <div className="text-center py-12 bg-paper-elev rounded-lg border border-dashed border-line">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 text-sm mb-4">You don't have any packages yet.</p>
            <Link
              to="/packages"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] text-sm font-medium"
            >
              <Layers className="w-4 h-4" /> See available packages
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <Section title="Active">
                {active.map(pkg => (
                  <PackageCard key={pkg._id} pkg={pkg} formatDate={formatDate} />
                ))}
              </Section>
            )}

            {fullyRedeemed.length > 0 && (
              <Section title="Used up">
                {fullyRedeemed.map(pkg => (
                  <PackageCard key={pkg._id} pkg={pkg} formatDate={formatDate} muted />
                ))}
              </Section>
            )}

            {cancelled.length > 0 && (
              <Section title="Cancelled">
                {cancelled.map(pkg => (
                  <PackageCard key={pkg._id} pkg={pkg} formatDate={formatDate} muted />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-ink-2 mb-2 font-medium">{title}</p>
    <div className="space-y-2">{children}</div>
  </div>
);

const PackageCard = ({ pkg, formatDate, muted = false }) => {
  const isMinutes = pkg.kind === 'minutes';
  const total = isMinutes ? (pkg.minutesTotal || 0) : (pkg.sessionsTotal || 0);
  const used = isMinutes ? (pkg.minutesUsed || 0) : (pkg.sessionsUsed || 0);
  const remaining = isMinutes
    ? (pkg.minutesRemaining ?? (total - used))
    : (pkg.sessionsRemaining ?? (total - used));
  const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
  const providerName = pkg.provider?.providerProfile?.businessName
    || pkg.provider?.profile?.fullName
    || pkg.provider?.email
    || 'Your provider';

  const isPending = pkg.paymentStatus === 'pending';

  // Subtitle: shows the marketing framing ("5 × 90 min") if displayPack is
  // set; otherwise generic minutes-pool or legacy sessions form. All
  // minutes-mode packages can be booked at any duration the provider offers.
  const subtitle = pkg.displayPack?.sessions
    ? `${packageHeadline(pkg)} · book any duration`
    : isMinutes
      ? `${total} min pool · book any duration`
      : `${pkg.sessionsTotal} × ${pkg.sessionDuration}-min sessions`;

  return (
    <div className={`bg-paper-elev rounded-lg shadow-sm border border-line p-4 ${muted ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-[#B07A4E]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900 truncate">{pkg.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {providerName} &middot; {subtitle}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3 h-3" /> Processing
            </span>
          ) : pkg.cancelledAt ? (
            <span className="text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              Cancelled
            </span>
          ) : remaining === 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              <CheckCircle className="w-3 h-3" /> Done
            </span>
          ) : null}
        </div>
      </div>

      {/* Progress bar — only meaningful while package is paid + active.
          Minutes-mode shows minutes; sessions-mode shows session count
          plus a derived minutes line so the user can think in either. */}
      {!pkg.cancelledAt && pkg.paymentStatus === 'paid' && total > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-sm">
              <span className="font-semibold text-slate-900">{remaining}</span>{' '}
              <span className="text-slate-500">
                of {total} {isMinutes ? 'min' : ''} remaining
              </span>
            </p>
            <p className="text-xs text-slate-500">{percentUsed}% used</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#B07A4E] rounded-full transition-all"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          {!isMinutes && pkg.sessionDuration > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              {remaining * pkg.sessionDuration} of {total * pkg.sessionDuration} min remaining
            </p>
          )}
          {isMinutes && pkg.displayPack?.sessionDuration > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              ≈ {Math.floor(remaining / pkg.displayPack.sessionDuration)} × {pkg.displayPack.sessionDuration}-min sessions left
            </p>
          )}
        </>
      )}

      {/* Footer: purchase date + redemption count */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        {pkg.purchasedAt ? (
          <span>Purchased {formatDate(pkg.purchasedAt)}</span>
        ) : (
          <span>Awaiting payment confirmation</span>
        )}
        {used > 0 && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {isMinutes ? `${used} min used` : `${used} session${used !== 1 ? 's' : ''} booked`}
          </span>
        )}
      </div>
    </div>
  );
};

export default MyPackages;
