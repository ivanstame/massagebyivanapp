import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * StripeCheckout - Handles card payment after a booking is created.
 *
 * Uses Stripe.js (loaded from CDN) to collect card details and confirm payment.
 * The payment goes directly to the provider's connected Stripe account.
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
  const [cardElement, setCardElement] = useState(null);
  const [stripe, setStripe] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);

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

        const { clientSecret: secret, stripeAccountId } = res.data;
        setClientSecret(secret);

        // Initialize Stripe with the connected account
        const stripeInstance = window.Stripe(
          process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
          { stripeAccount: stripeAccountId }
        );
        setStripe(stripeInstance);

        // Create card element
        const elements = stripeInstance.elements();
        const card = elements.create('card', {
          style: {
            base: {
              fontSize: '16px',
              color: '#1e293b',
              '::placeholder': { color: '#94a3b8' },
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
            invalid: { color: '#ef4444' },
          }
        });

        // Mount card element after a tick to ensure DOM is ready
        setTimeout(() => {
          const mountPoint = document.getElementById('stripe-card-element');
          if (mountPoint && mounted) {
            card.mount('#stripe-card-element');
            setCardElement(card);
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

    return () => {
      mounted = false;
      if (cardElement) {
        cardElement.destroy();
      }
    };
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!stripe || !cardElement || !clientSecret) return;

    setPaying(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (stripeError) {
        setError(stripeError.message);
        setPaying(false);
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        setSuccess(true);
        setTimeout(() => onSuccess?.(), 1500);
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#635bff]" />
            <h3 className="font-semibold text-slate-900">Card Payment</h3>
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

              {/* Card input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Card Details
                </label>
                <div
                  id="stripe-card-element"
                  className="p-3 border border-slate-300 rounded-lg bg-white min-h-[44px]"
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
