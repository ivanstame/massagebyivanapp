const express = require('express');
const router = express.Router();
const PackageTemplate = require('../models/PackageTemplate');
const PackagePurchase = require('../models/PackagePurchase');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// ──────────────────────────────────────────────────────────────────────
// Provider: manage their own package templates (the offerings clients buy)
// ──────────────────────────────────────────────────────────────────────

// List current provider's templates (including inactive). Used by the
// Packages tab on /provider/services.
router.get('/templates', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const templates = await PackageTemplate.find({ provider: req.user._id })
      .sort({ isActive: -1, createdAt: -1 });

    res.json(templates);
  } catch (err) {
    console.error('Error listing package templates:', err);
    res.status(500).json({ message: 'Failed to list package templates' });
  }
});

// Validate + normalize template payload shared by create/update.
// Enforces that sessionDuration matches one of the provider's basePricing
// entries so clients never buy a package that can't be redeemed.
async function validateTemplatePayload(req) {
  const { name, description, sessionsTotal, sessionDuration, price, isActive } = req.body;

  if (!name || !String(name).trim()) {
    return { error: 'Package name is required' };
  }

  const total = Number(sessionsTotal);
  if (!Number.isInteger(total) || total < 1 || total > 100) {
    return { error: 'Sessions total must be a whole number between 1 and 100' };
  }

  const duration = Number(sessionDuration);
  if (!Number.isInteger(duration) || duration < 30 || duration > 180) {
    return { error: 'Session duration must be a whole number between 30 and 180 minutes' };
  }

  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return { error: 'Price must be a non-negative number' };
  }

  // Enforce that the provider actually offers a session of this duration.
  const provider = await User.findById(req.user._id).select('providerProfile.basePricing');
  const durations = (provider?.providerProfile?.basePricing || []).map(p => p.duration);
  if (durations.length > 0 && !durations.includes(duration)) {
    return {
      error: `Session duration ${duration} min doesn't match any of your offered durations (${durations.join(', ')}). Add it to your pricing first, or pick a duration you already offer.`,
    };
  }

  return {
    data: {
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      sessionsTotal: total,
      sessionDuration: duration,
      price: priceNum,
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    },
  };
}

// Create a template.
router.post('/templates', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const validated = await validateTemplatePayload(req);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const template = await PackageTemplate.create({
      ...validated.data,
      provider: req.user._id,
    });

    res.status(201).json(template);
  } catch (err) {
    console.error('Error creating package template:', err);
    res.status(500).json({ message: 'Failed to create package template' });
  }
});

// Update a template. Doesn't touch any PackagePurchases — those snapshot
// their own fields at buy time (intentional; see plans/packages-v2.md).
router.put('/templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const template = await PackageTemplate.findOne({
      _id: req.params.id,
      provider: req.user._id,
    });
    if (!template) {
      return res.status(404).json({ message: 'Package template not found' });
    }

    const validated = await validateTemplatePayload(req);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    Object.assign(template, validated.data);
    await template.save();

    res.json(template);
  } catch (err) {
    console.error('Error updating package template:', err);
    res.status(500).json({ message: 'Failed to update package template' });
  }
});

// Soft-delete: if any purchases exist for this template, set inactive
// instead of deleting (so the PackagePurchase.template ref stays valid
// for history and provenance). Otherwise, hard-delete.
router.delete('/templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const template = await PackageTemplate.findOne({
      _id: req.params.id,
      provider: req.user._id,
    });
    if (!template) {
      return res.status(404).json({ message: 'Package template not found' });
    }

    const purchaseCount = await PackagePurchase.countDocuments({ template: template._id });
    if (purchaseCount > 0) {
      template.isActive = false;
      await template.save();
      return res.json({
        message: 'Package retired (has existing purchases, kept for history)',
        retired: true,
        template,
      });
    }

    await template.deleteOne();
    res.json({ message: 'Package deleted', deleted: true });
  } catch (err) {
    console.error('Error deleting package template:', err);
    res.status(500).json({ message: 'Failed to delete package template' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Client-facing: browse a provider's active templates and start a purchase
// ──────────────────────────────────────────────────────────────────────

// Public list of a provider's *active* templates. Used by the /packages
// browse page; auth not required so it can also power a future public
// landing page if we want.
router.get('/provider/:providerId/templates', async (req, res) => {
  try {
    const provider = await User.findOne({
      _id: req.params.providerId,
      accountType: 'PROVIDER',
    }).select('providerProfile.businessName providerProfile.stripeAccountStatus');
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const templates = await PackageTemplate.find({
      provider: provider._id,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      providerName: provider.providerProfile?.businessName || null,
      stripeReady: provider.providerProfile?.stripeAccountStatus === 'active',
      templates,
    });
  } catch (err) {
    console.error('Error listing public templates:', err);
    res.status(500).json({ message: 'Failed to load packages' });
  }
});

// Lazy Stripe SDK init — mirrors routes/stripe.js so this route silently
// returns 503 if STRIPE_SECRET_KEY isn't configured (e.g. in dev without
// Stripe creds).
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// Client buys a package: creates a pending PackagePurchase + a Stripe
// payment intent on the provider's Connect account (direct charge). The
// webhook in routes/stripe.js flips paymentStatus to 'paid' once Stripe
// confirms; until then the purchase exists but its credits can't be
// redeemed (canRedeem checks paymentStatus === 'paid').
router.post('/purchase', ensureAuthenticated, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured.' });
    }
    if (req.user.accountType !== 'CLIENT') {
      return res.status(403).json({ message: 'Only clients can buy packages.' });
    }

    const { templateId } = req.body;
    if (!templateId) {
      return res.status(400).json({ message: 'templateId is required' });
    }

    const template = await PackageTemplate.findById(templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ message: 'Package not available.' });
    }

    // Client must be assigned to this provider (no cross-provider buying).
    if (!req.user.providerId || !req.user.providerId.equals(template.provider)) {
      return res.status(403).json({ message: 'You can only buy packages from your assigned provider.' });
    }

    // Provider needs Stripe Connect active to accept payment.
    const provider = await User.findById(template.provider).select(
      'providerProfile.stripeAccountId providerProfile.stripeAccountStatus'
    );
    const accountId = provider?.providerProfile?.stripeAccountId;
    if (!accountId || provider.providerProfile.stripeAccountStatus !== 'active') {
      return res.status(400).json({
        message: 'This provider hasn\'t finished setting up card payments yet.',
      });
    }

    // Snapshot template fields onto the purchase. If price is 0 (free
    // package — provider could in principle define one), still go through
    // Stripe so the payment-confirmed signal flows through the same path;
    // Stripe rejects $0 intents though, so we short-circuit to 'paid'.
    const purchase = await PackagePurchase.create({
      template: template._id,
      provider: template.provider,
      client: req.user._id,
      name: template.name,
      sessionsTotal: template.sessionsTotal,
      sessionDuration: template.sessionDuration,
      price: template.price,
      paymentMethod: 'stripe',
      paymentStatus: template.price > 0 ? 'pending' : 'paid',
      purchasedAt: template.price > 0 ? null : new Date(),
    });

    if (template.price <= 0) {
      // Free package — no Stripe call needed.
      return res.status(201).json({
        purchase,
        clientSecret: null,
        stripeAccountId: null,
        free: true,
      });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(template.price * 100),
      currency: 'usd',
      payment_method_types: ['card', 'venmo'],
      metadata: {
        packagePurchaseId: purchase._id.toString(),
        clientId: req.user._id.toString(),
        providerId: template.provider.toString(),
      },
    }, { stripeAccount: accountId });

    purchase.stripePaymentIntentId = intent.id;
    await purchase.save();

    res.status(201).json({
      purchase,
      clientSecret: intent.client_secret,
      stripeAccountId: accountId,
    });
  } catch (err) {
    console.error('Error creating package purchase:', err);
    res.status(500).json({ message: 'Failed to start package purchase' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Provider-side: view + manage a specific client's packages
// ──────────────────────────────────────────────────────────────────────

// Provider views all packages owned by one of their clients.
router.get('/client/:clientId', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    // Verify the target user is one of this provider's clients.
    const client = await User.findOne({
      _id: req.params.clientId,
      providerId: req.user._id,
    });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const purchases = await PackagePurchase.find({
      client: req.params.clientId,
      provider: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(purchases);
  } catch (err) {
    console.error('Error listing client packages:', err);
    res.status(500).json({ message: 'Failed to load client packages' });
  }
});

// Provider comps a free package directly to one of their clients (loyalty
// reward, makeup for a bad session, etc.). No template required — the
// provider can grant arbitrary session count + duration. paymentStatus
// flips to 'paid' immediately so credits are usable right away.
router.post('/comp', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { clientId, name, sessionsTotal, sessionDuration, templateId } = req.body;
    if (!clientId) return res.status(400).json({ message: 'clientId is required' });

    // Verify the target client belongs to this provider.
    const client = await User.findOne({ _id: clientId, providerId: req.user._id });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Either comp from a template or specify the fields directly.
    let pkgName, pkgSessions, pkgDuration, templateRef = null;
    if (templateId) {
      const template = await PackageTemplate.findOne({ _id: templateId, provider: req.user._id });
      if (!template) return res.status(404).json({ message: 'Template not found' });
      pkgName = name || template.name;
      pkgSessions = sessionsTotal || template.sessionsTotal;
      pkgDuration = sessionDuration || template.sessionDuration;
      templateRef = template._id;
    } else {
      if (!name || !sessionsTotal || !sessionDuration) {
        return res.status(400).json({
          message: 'name, sessionsTotal, and sessionDuration are required when comping without a template',
        });
      }
      pkgName = String(name).trim();
      pkgSessions = Number(sessionsTotal);
      pkgDuration = Number(sessionDuration);
    }

    if (!Number.isInteger(pkgSessions) || pkgSessions < 1 || pkgSessions > 100) {
      return res.status(400).json({ message: 'Sessions must be 1–100' });
    }
    if (!Number.isInteger(pkgDuration) || pkgDuration < 30 || pkgDuration > 180) {
      return res.status(400).json({ message: 'Duration must be 30–180 minutes' });
    }

    const purchase = await PackagePurchase.create({
      template: templateRef,
      provider: req.user._id,
      client: clientId,
      name: pkgName,
      sessionsTotal: pkgSessions,
      sessionDuration: pkgDuration,
      price: 0,
      paymentMethod: 'comped',
      paymentStatus: 'paid',
      purchasedAt: new Date(),
    });

    res.status(201).json(purchase);
  } catch (err) {
    console.error('Error comping package:', err);
    res.status(500).json({ message: 'Failed to comp package' });
  }
});

// Provider cancels a package — for after they've manually issued the
// Stripe refund. Sets cancelledAt + paymentStatus='cancelled' so the
// remaining credits can no longer be redeemed. Already-redeemed bookings
// stay valid (the provider's still going to those appointments).
router.patch('/:id/cancel', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const purchase = await PackagePurchase.findOne({
      _id: req.params.id,
      provider: req.user._id,
    });
    if (!purchase) {
      return res.status(404).json({ message: 'Package not found' });
    }
    if (purchase.cancelledAt) {
      return res.status(400).json({ message: 'Package is already cancelled' });
    }

    purchase.cancelledAt = new Date();
    purchase.paymentStatus = 'cancelled';
    await purchase.save();

    res.json(purchase);
  } catch (err) {
    console.error('Error cancelling package:', err);
    res.status(500).json({ message: 'Failed to cancel package' });
  }
});

// Provider reinstates a consumed credit — useful when a client cancelled
// late but the provider wants to grant a goodwill return, or when a
// booking gets cancelled by the provider after the fact. The redemption
// row is kept (with returnedAt set) so we preserve the history.
router.patch('/:id/redemptions/:redemptionId/reinstate', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const result = await PackagePurchase.updateOne(
      {
        _id: req.params.id,
        provider: req.user._id,
        'redemptions._id': req.params.redemptionId,
        'redemptions.returnedAt': null,
      },
      { $set: { 'redemptions.$.returnedAt': new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: 'Redemption not found, already returned, or not yours.',
      });
    }

    const updated = await PackagePurchase.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error reinstating credit:', err);
    res.status(500).json({ message: 'Failed to reinstate credit' });
  }
});

// Client lists their own packages. Active first, then cancelled, then
// fully-redeemed; within each group most-recent first. The booking form
// will use the same model statics (PackagePurchase.redeemableForClient)
// for filtering.
router.get('/mine', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'CLIENT') {
      return res.status(403).json({ message: 'Only clients have packages.' });
    }

    const purchases = await PackagePurchase.find({ client: req.user._id })
      .populate('provider', 'providerProfile.businessName email profile.fullName')
      .sort({ createdAt: -1 });

    res.json(purchases);
  } catch (err) {
    console.error('Error listing client packages:', err);
    res.status(500).json({ message: 'Failed to load your packages' });
  }
});

module.exports = router;
