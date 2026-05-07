const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const PackagePurchase = require('../models/PackagePurchase');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY is not set — Stripe routes will return 503');
}
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const requireStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.' });
  }
  next();
};

// Base URL for Stripe redirects (account-onboarding return URL,
// dashboard login link target, etc.). Reads from APP_URL when set so
// you can flip domains as the DBA → custom domain transition lands.
// Falls back to the Heroku app URL in production and localhost in
// development.
const getBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production'
    ? 'https://massagebyivan-9420304df681.herokuapp.com'
    : 'http://localhost:3000';
};

// ─── Connect: Create account + onboarding link ──────────────────────────
router.post('/connect', ensureAuthenticated, requireStripe, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);

    // If they already have an account, just create a new onboarding link
    let accountId = user.providerProfile?.stripeAccountId;

    if (!accountId) {
      // Create a new Connect account (Standard type)
      const account = await stripe.accounts.create({
        type: 'standard',
        email: user.email,
        metadata: { userId: user._id.toString() }
      });
      accountId = account.id;

      // Save to user
      user.providerProfile.stripeAccountId = accountId;
      user.providerProfile.stripeAccountStatus = 'pending';
      await user.save();
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${getBaseUrl()}/provider/settings?stripe=refresh`,
      return_url: `${getBaseUrl()}/provider/settings?stripe=success`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Error creating Stripe Connect account:', error);
    res.status(500).json({ message: 'Failed to create Stripe account' });
  }
});

// ─── Connect: Check account status ──────────────────────────────────────
router.get('/connect/status', ensureAuthenticated, requireStripe, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);
    const accountId = user.providerProfile?.stripeAccountId;

    if (!accountId) {
      return res.json({
        connected: false,
        status: 'not_connected'
      });
    }

    // Fetch latest account status from Stripe
    const account = await stripe.accounts.retrieve(accountId);

    // Determine status
    let status = 'pending';
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active';
    } else if (account.requirements?.disabled_reason) {
      status = 'restricted';
    }

    // Update stored status if changed
    if (user.providerProfile.stripeAccountStatus !== status) {
      user.providerProfile.stripeAccountStatus = status;
      await user.save();
    }

    res.json({
      connected: status === 'active',
      status,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements?.currently_due || []
    });
  } catch (error) {
    console.error('Error checking Stripe Connect status:', error);
    res.status(500).json({ message: 'Failed to check Stripe status' });
  }
});

// ─── Connect: Dashboard login link (for providers to see their Stripe dashboard) ─
router.get('/connect/dashboard', ensureAuthenticated, requireStripe, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);
    const accountId = user.providerProfile?.stripeAccountId;

    if (!accountId) {
      return res.status(400).json({ message: 'No Stripe account connected' });
    }

    const loginLink = await stripe.accounts.createLoginLink(accountId);
    res.json({ url: loginLink.url });
  } catch (error) {
    console.error('Error creating Stripe dashboard link:', error);
    res.status(500).json({ message: 'Failed to create dashboard link' });
  }
});

// ─── Payments: Create payment intent for a booking ──────────────────────
router.post('/create-payment-intent', ensureAuthenticated, requireStripe, async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId).populate('provider');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify the requester is the client on this booking
    if (!booking.client.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check provider has Stripe connected
    const providerAccountId = booking.provider.providerProfile?.stripeAccountId;
    if (!providerAccountId) {
      return res.status(400).json({ message: 'Provider has not set up card payments yet' });
    }

    const totalPrice = booking.pricing?.totalPrice;
    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ message: 'Invalid booking price' });
    }

    // Create payment intent on the connected account (direct charge).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100), // cents
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        bookingId: booking._id.toString(),
        clientId: req.user._id.toString(),
        providerId: booking.provider._id.toString()
      },
    }, {
      stripeAccount: providerAccountId,
    });

    // Store the payment intent ID on the booking
    booking.stripePaymentIntentId = paymentIntent.id;
    await booking.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: providerAccountId
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ message: 'Failed to create payment' });
  }
});

// ─── Webhook: Handle Stripe events ──────────────────────────────────────
// NOTE: This route uses express.raw() body parser — registered separately in server.js
//
// One endpoint serves two Stripe webhook destinations:
//   STRIPE_WEBHOOK_SECRET           → "Your account" events (platform-side
//                                     stuff like account.updated for the
//                                     platform itself, or destination
//                                     charges fired on the platform)
//   STRIPE_CONNECT_WEBHOOK_SECRET   → "Connected accounts" events
//                                     (direct charges fired on each
//                                     provider's connected account, plus
//                                     account.updated for connected
//                                     accounts during onboarding)
//
// Each destination has its own signing secret. We try both during
// verification — whichever matches wins.
router.post('/webhook', requireStripe, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter(Boolean);

  let event;
  let lastErr;
  if (secrets.length === 0) {
    // Production must have at least one signing secret configured.
    // The earlier "parse and trust" dev fallback is a foot-gun: any
    // misconfigured prod deploy would silently accept forged events
    // and mark bookings/packages paid. Refuse outright instead.
    if (process.env.NODE_ENV === 'production') {
      console.error('Webhook reached server with no STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET set');
      return res.status(500).send('Webhook secret not configured');
    }
    // Local dev only: parse without verification.
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Webhook body parse failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!event) {
      console.error('Webhook signature verification failed against all configured secrets:', lastErr?.message);
      return res.status(400).send(`Webhook Error: ${lastErr?.message || 'invalid signature'}`);
    }
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata?.bookingId;
      const packagePurchaseId = paymentIntent.metadata?.packagePurchaseId;

      // Idempotency: Stripe retries webhooks. Skip if the doc was
      // already marked paid so paidAt/purchasedAt reflect the FIRST
      // successful event, not the latest retry. Without this the
      // original timestamp gets stomped on every replay.
      if (bookingId) {
        try {
          const booking = await Booking.findById(bookingId);
          if (booking && booking.paymentStatus !== 'paid') {
            booking.paymentStatus = 'paid';
            booking.paidAt = new Date();
            booking.stripeEventId = event.id;
            await booking.save();
            console.log(`Booking ${bookingId} marked as paid via webhook (event ${event.id})`);
          } else if (booking) {
            console.log(`Booking ${bookingId} already paid; skipping webhook ${event.id}`);
          }
        } catch (err) {
          console.error('Error updating booking from webhook:', err);
        }
      }

      if (packagePurchaseId) {
        try {
          const purchase = await PackagePurchase.findById(packagePurchaseId);
          if (purchase && purchase.paymentStatus !== 'paid') {
            purchase.paymentStatus = 'paid';
            purchase.purchasedAt = new Date();
            purchase.stripeEventId = event.id;
            await purchase.save();
            console.log(`Package purchase ${packagePurchaseId} marked as paid via webhook (event ${event.id})`);
          } else if (purchase) {
            console.log(`Package purchase ${packagePurchaseId} already paid; skipping webhook ${event.id}`);
          }
        } catch (err) {
          console.error('Error updating package purchase from webhook:', err);
        }
      }
      break;
    }
    case 'account.updated': {
      // Update provider's Stripe account status
      const account = event.data.object;
      const userId = account.metadata?.userId;
      if (userId) {
        try {
          let status = 'pending';
          if (account.charges_enabled && account.payouts_enabled) {
            status = 'active';
          } else if (account.requirements?.disabled_reason) {
            status = 'restricted';
          }
          await User.findByIdAndUpdate(userId, {
            'providerProfile.stripeAccountStatus': status
          });
          console.log(`Provider ${userId} Stripe status updated to ${status}`);
        } catch (err) {
          console.error('Error updating provider Stripe status:', err);
        }
      }
      break;
    }
    default:
      // Unhandled event type
      break;
  }

  res.json({ received: true });
});

module.exports = router;
