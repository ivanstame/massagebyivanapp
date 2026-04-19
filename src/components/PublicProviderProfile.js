import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, DollarSign, CreditCard, Plus, Sparkles } from 'lucide-react';

const PublicProviderProfile = () => {
  const { joinCode } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/join-code/profile/${joinCode}`);
        if (!res.ok) throw new Error('Provider not found');
        setProfile(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [joinCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-paper-deep">
        <div className="animate-pulse space-y-4 w-full max-w-md px-6">
          <div className="h-8 bg-slate-200 rounded-lg w-3/4 mx-auto" />
          <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto" />
          <div className="h-40 bg-slate-200 rounded-xl mt-8" />
          <div className="h-40 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-paper-deep text-center px-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-slate-300" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Provider not found</h1>
        <p className="text-slate-500 mb-6 max-w-sm">
          The link you followed may be incorrect or the provider is no longer available.
        </p>
        <Link
          to="/login"
          className="text-[#B07A4E] hover:text-[#8A5D36] font-medium transition-colors"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  const paymentIcons = {
    cash: '💵',
    zelle: '⚡',
    venmo: '🔵',
    card: '💳'
  };
  const paymentLabels = {
    cash: 'Cash',
    zelle: 'Zelle',
    venmo: 'Venmo',
    card: 'Card'
  };

  return (
    <div className="min-h-screen bg-paper-deep">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#B07A4E] to-[#007a80] text-white pt-16 pb-20 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-paper-elev/20" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-paper-elev/10" />
        </div>
        <div className="relative">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            {profile.businessName || 'Massage Services'}
          </h1>
          {profile.providerName && (
            <p className="text-white/80 text-lg">with {profile.providerName}</p>
          )}
        </div>
      </div>

      {/* Content — pulled up to overlap hero */}
      <div className="max-w-lg mx-auto px-4 -mt-12 pb-10 space-y-5">

        {/* Services & Pricing */}
        {profile.basePricing?.length > 0 && (
          <div className="bg-paper-elev rounded-xl shadow-sm border border-line overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#B07A4E]" />
              <h2 className="text-lg font-semibold text-slate-800">Services & Pricing</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {profile.basePricing.map((item, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#B07A4E]/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-[#B07A4E]" />
                    </div>
                    <span className="text-slate-700 font-medium">{item.duration} min</span>
                  </div>
                  <span className="text-lg font-bold text-slate-900">${item.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add-ons */}
        {profile.addons?.length > 0 && (
          <div className="bg-paper-elev rounded-xl shadow-sm border border-line overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#B07A4E]" />
              <h2 className="text-lg font-semibold text-slate-800">Add-ons</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {profile.addons.map((addon, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-slate-700 font-medium">{addon.name}</span>
                    {addon.extraTime > 0 && (
                      <span className="text-slate-400 text-sm ml-2">+{addon.extraTime} min</span>
                    )}
                    {addon.description && (
                      <p className="text-sm text-slate-400 mt-0.5">{addon.description}</p>
                    )}
                  </div>
                  <span className="text-slate-700 font-semibold">+${addon.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Methods */}
        {profile.acceptedPaymentMethods?.length > 0 && (
          <div className="bg-paper-elev rounded-xl shadow-sm border border-line overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#B07A4E]" />
              <h2 className="text-lg font-semibold text-slate-800">Payment</h2>
            </div>
            <div className="px-5 py-4 flex flex-wrap gap-2">
              {profile.acceptedPaymentMethods.map((method) => (
                <span
                  key={method}
                  className="inline-flex items-center gap-1.5 bg-paper-deep text-slate-700 rounded-full px-4 py-2 text-sm font-medium border border-line-soft"
                >
                  <span>{paymentIcons[method]}</span>
                  {paymentLabels[method] || method}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Book Now */}
        <div className="pt-2">
          <Link
            to={`/signup?joinCode=${profile.joinCode}`}
            className="block w-full text-center bg-[#B07A4E] hover:bg-[#8A5D36] active:bg-[#007a80] text-white font-semibold text-lg py-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
          >
            Book Now
          </Link>
          <p className="text-center text-slate-400 text-sm mt-3">
            Create a free account to book your appointment
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicProviderProfile;
