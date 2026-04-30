import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, CheckCircle, AlertCircle, X, Layers } from 'lucide-react';

// Stripe checkout for buying a package. Mirrors the booking-side
// StripeCheckout but talks to the packages API: POST /api/packages/purchase
// creates the pending PackagePurchase + returns the client secret in one
// call (the price is locked from the template, no separate price step).
//
// On payment success the webhook flips paymentStatus to paid; we redirect
// the client to /my-packages immediately and they'll see the credits ready
// to use as soon as Stripe confirms (usually <1s).
const PackagePurchaseModal = ({ template, onSuccess, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [stripe, setStripe] = useState(null);
  const [elements, setElements] = useState(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        if (!window.Stripe) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Stripe'));
            document.head.appendChild(script);
          });
        }

        const res = await axios.post('/api/packages/purchase',
          { templateId: template._id },
          { withCredentials: true }
        );

        if (!mounted) return;

        const { clientSecret, stripeAccountId, free } = res.data;

        // $0 packages skip Stripe entirely.
        if (free) {
          setSuccess(true);
          setTimeout(() => onSuccess?.(), 1200);
          return;
        }

        const stripeInstance = window.Stripe(
          process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
          { stripeAccount: stripeAccountId }
        );
        setStripe(stripeInstance);

        const elementsInstance = stripeInstance.elements({
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#B07A4E',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
          },
        });

        const paymentElement = elementsInstance.create('payment', { layout: 'tabs' });

        setTimeout(() => {
          const mountPoint = document.getElementById('package-stripe-element');
          if (mountPoint && mounted) {
            paymentElement.mount('#package-stripe-element');
            setElements(elementsInstance);
            setLoading(false);
          }
        }, 100);
      } catch (err) {
        if (!mounted) return;
        console.error('Package purchase init error:', err);
        setError(err.response?.data?.message || 'Failed to start checkout.');
        setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [template._id, onSuccess]);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/my-packages`,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message);
        setPaying(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => onSuccess?.(), 1500);
    } catch (err) {
      setError('Payment failed. Please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-paper-elev rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#B07A4E]" />
            <h3 className="font-semibold text-slate-900">Buy {template.name}</h3>
          </div>
          {!success && (
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-medium text-slate-900">Payment received!</p>
              <p className="text-sm text-slate-500 mt-1">
                {template.kind === 'minutes'
                  ? `Your ${template.minutesTotal} minutes are ready to use.`
                  : `Your ${template.sessionsTotal * template.sessionDuration} minutes are ready to use — book at any duration.`}
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-5">
                <p className="text-sm text-slate-500">
                  {template.kind === 'minutes'
                    ? `${template.minutesTotal} min pool — book any duration`
                    : `${template.sessionsTotal} × ${template.sessionDuration}-min sessions (book any duration)`}
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-1">${template.price.toFixed(2)}</p>
                {template.kind === 'minutes' && template.minutesTotal > 0 && template.price > 0 ? (
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${((template.price / template.minutesTotal) * 60).toFixed(2)} per hour
                  </p>
                ) : template.sessionsTotal > 0 && template.price > 0 ? (
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${(template.price / template.sessionsTotal).toFixed(2)} per session
                  </p>
                ) : null}
              </div>

              <div className="mb-4">
                <div id="package-stripe-element" className="min-h-[120px]">
                  {loading && (
                    <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading payment options…
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={loading || paying}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:opacity-50 font-medium text-sm transition-colors"
              >
                {paying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                ) : loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                ) : (
                  <><CreditCard className="w-4 h-4" /> Pay ${template.price.toFixed(2)}</>
                )}
              </button>

              <p className="text-xs text-slate-400 text-center mt-3">
                Payments processed securely by Stripe.
                Credits never expire and you'll see them on your packages page.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackagePurchaseModal;
