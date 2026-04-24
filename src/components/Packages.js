import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { Layers, AlertCircle, ShoppingBag } from 'lucide-react';
import PackagePurchaseModal from './PackagePurchaseModal';

// Client-facing package browse page. Lists active packages from the
// client's assigned provider; clicking Buy opens PackagePurchaseModal
// which handles the Stripe Element checkout.
//
// Providers landing here are redirected to their own services page —
// they manage offerings, they don't buy them.
const Packages = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.accountType === 'PROVIDER') {
      navigate('/provider/services', { replace: true });
      return;
    }
    if (!user.providerId) {
      setError('You\'re not assigned to a provider yet.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await axios.get(
          `/api/packages/provider/${user.providerId}/templates`,
          { withCredentials: true }
        );
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load packages');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate]);

  const handlePurchaseSuccess = () => {
    setBuying(null);
    navigate('/my-packages');
  };

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
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Save with bulk packs</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            <em style={{ color: '#B07A4E' }}>Packages</em>
            {data?.providerName && (
              <span className="text-ink-2"> from {data.providerName}</span>
            )}
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Pay upfront, redeem one credit per booking. Add-ons stay per-visit.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
          </div>
        )}

        {data && !data.stripeReady && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 flex-1">
              Your provider hasn't finished setting up card payments. Packages can't be bought
              right now — check back soon, or ask them to enable Stripe in their settings.
            </p>
          </div>
        )}

        {data?.templates?.length === 0 ? (
          <div className="text-center py-10 bg-paper-elev rounded-lg border border-dashed border-line">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 text-sm">No packages available yet.</p>
            <p className="text-slate-400 text-xs mt-1">
              Your provider will list package deals here when they're ready.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.templates?.map(tmpl => (
              <div
                key={tmpl._id}
                className="bg-paper-elev rounded-lg shadow-sm border border-line p-5"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-[#B07A4E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900">{tmpl.name}</h3>
                    <p className="text-sm text-slate-600">
                      {tmpl.sessionsTotal} × {tmpl.sessionDuration}-min sessions
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-bold text-slate-900">${tmpl.price}</p>
                    {tmpl.sessionsTotal > 0 && tmpl.price > 0 && (
                      <p className="text-[11px] text-slate-400">
                        ${(tmpl.price / tmpl.sessionsTotal).toFixed(2)}/session
                      </p>
                    )}
                  </div>
                </div>

                {tmpl.description && (
                  <p className="text-sm text-slate-600 mb-3 leading-relaxed">{tmpl.description}</p>
                )}

                <button
                  onClick={() => setBuying(tmpl)}
                  disabled={!data.stripeReady}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  Buy this package
                </button>
              </div>
            ))}
          </div>
        )}

        {buying && (
          <PackagePurchaseModal
            template={buying}
            onSuccess={handlePurchaseSuccess}
            onClose={() => setBuying(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Packages;
