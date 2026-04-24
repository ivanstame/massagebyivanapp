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

module.exports = router;
