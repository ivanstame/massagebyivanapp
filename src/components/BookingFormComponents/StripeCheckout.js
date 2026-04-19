import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * StripeCheckout - Handles card + Venmo payment after a booking is created.
 *
 * Uses Stripe Payment Element (supports card, Venmo, and other methods).
 * Payment goes directly to the provider's connected Stripe account.
 *
 * Props:
 *   bookingId - The booking to pay for
 *   totalPrice - Display price
 *   onSuccess - Called when payment succeeds
 *   onClose - Called when user closes without paying
 */
const StripeCheckout = ({ bookingId, totalPrice, onSuccess, onClose }) => {
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
        // Load Stripe.js if not already loaded
        if (!window.Stripe) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Stripe'));
            document.head.appendChild(script);
          });
        }

        // Create payment intent
        const res = await axios.post('/api/stripe/create-payment-intent',
          { bookingId },
          { withCredentials: true }
        );

        if (!mounted) return;

        const { clientSecret, stripeAccountId } = res.data;

        // Initialize Stripe with the connected account
        const stripeInstance = window.Stripe(
          process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
          { stripeAccount: stripeAccountId }
        );
        setStripe(stripeInstance);

        // Create Payment Element (supports card + Venmo + more)
        const elementsInstance = stripeInstance.elements({
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#635bff',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }
          }
        });

        const paymentElement = elementsInstance.create('payment', {
          layout: 'tabs'
        });

        // Mount after a tick to ensure DOM is ready
        setTimeout(() => {
          const mountPoint = document.getElementById('stripe-payment-element');
          if (mountPoint && mounted) {
            paymentElement.mount('#stripe-payment-element');
            setElements(elementsInstance);
            setLoading(false);
          }
        }, 100);

      } catch (err) {
        if (!mounted) return;
        console.error('Stripe init error:', err);
        setError(err.response?.data?.message || 'Failed to initialize payment');
        setLoading(false);
      }
    };

    init();

    return () => { mounted = false; };
  }, [bookingId]);

  const handlePay = async () => {
    if (!stripe || !elements) return;

    setPaying(true);
    setError(null);

    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/my-bookings`,
        },
        redirect: 'if_required'
      });

      if (stripeError) {
        setError(stripeError.message);
        setPaying(false);
        return;
      }

      // Payment succeeded (no redirect needed for card)
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#635bff]" />
            <h3 className="font-semibold text-slate-900">Payment</h3>
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
              <p className="text-lg font-medium text-slate-900">Payment Successful!</p>
              <p className="text-sm text-slate-500 mt-1">${totalPrice?.toFixed(2)} paid</p>
            </div>
          ) : (
            <>
              {/* Amount */}
              <div className="text-center mb-6">
                <p className="text-sm text-slate-500">Amount due</p>
                <p className="text-3xl font-bold text-slate-900">${totalPrice?.toFixed(2)}</p>
              </div>

              {/* Payment Element (card + Venmo tabs) */}
              <div className="mb-4">
                <div
                  id="stripe-payment-element"
                  className="min-h-[120px]"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Pay button */}
              <button
                onClick={handlePay}
                disabled={loading || paying}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#635bff] text-white rounded-lg hover:bg-[#5851db] disabled:opacity-50 font-medium text-sm transition-colors"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                ) : paying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <>Pay ${totalPrice?.toFixed(2)}</>
                )}
              </button>

              <p className="text-xs text-slate-400 text-center mt-3">
                Payments are processed securely by Stripe
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StripeCheckout;
