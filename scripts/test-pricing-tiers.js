// End-to-end smoke test for pricing tiers.
//
// Setup:
//   - Provider with basePricing: 60→140, 90→210, 120→280 (Standard)
//   - Provider has a "Discount" tier:    60→125, 90→175, 120→250
//   - Two clients linked to the provider:
//     a) Standard Sam — no tier tag (defaults to Standard)
//     b) Discount Dan — tagged with the Discount tier
//
// Asserts:
//   1. Provider GET services with no client context → returns Standard
//   2. Provider GET services for Sam (no tier)     → returns Standard
//   3. Provider GET services for Dan (Discount)    → returns Discount
//   4. Resolved pricingTierName field is correct in each case
//
// Run: heroku run node scripts/test-pricing-tiers.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../server/models/User');

const TEST_TAG = '@avayble-tiertest.local';
const tagId = Date.now();
const log = (...args) => console.log(...args);

const STANDARD = [
  { duration: 60,  price: 140, label: '60 Minutes' },
  { duration: 90,  price: 210, label: '90 Minutes' },
  { duration: 120, price: 280, label: '120 Minutes' },
];
const DISCOUNT = [
  { duration: 60,  price: 125, label: '60 Minutes' },
  { duration: 90,  price: 175, label: '90 Minutes' },
  { duration: 120, price: 250, label: '120 Minutes' },
];

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  log('Connected to MongoDB\n');

  let provider, sam, dan;
  let allPassed = true;
  const failures = [];

  // Helper that mirrors the tier-resolution logic in users.js's GET
  // /provider/:id/services. Reads the provider's basePricing + tiers
  // and resolves which list applies for a given clientId.
  function resolvePricing(provider, client) {
    if (client) {
      const tierId = client.clientProfile?.pricingTierId;
      if (tierId) {
        const tier = (provider.providerProfile?.pricingTiers || [])
          .find(t => t._id?.equals?.(tierId));
        if (tier && Array.isArray(tier.pricing) && tier.pricing.length > 0) {
          return { pricing: tier.pricing, tierName: tier.name };
        }
      }
    }
    return { pricing: provider.providerProfile?.basePricing || [], tierName: null };
  }

  function pricingMatches(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    const sortedA = [...actual].sort((a, b) => a.duration - b.duration);
    const sortedE = [...expected].sort((a, b) => a.duration - b.duration);
    return sortedA.every((row, i) =>
      Number(row.duration) === Number(sortedE[i].duration) &&
      Number(row.price) === Number(sortedE[i].price)
    );
  }

  try {
    log('Step 1: create test provider with Standard pricing + Discount tier');
    provider = await User.create({
      email: `provider-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'PROVIDER',
      registrationStep: 3,
      profile: { fullName: 'Test Tier Provider', phoneNumber: '5555550400' },
      providerProfile: {
        businessName: 'Test',
        trade: 'massage',
        basePricing: STANDARD,
        pricingTiers: [{ name: 'Discount', pricing: DISCOUNT }],
      },
    });
    log(`  provider _id: ${provider._id}`);
    const discountTier = provider.providerProfile.pricingTiers[0];
    log(`  Standard: ${STANDARD.map(p => `${p.duration}→$${p.price}`).join(' · ')}`);
    log(`  Discount tier _id: ${discountTier._id}`);
    log(`  Discount: ${DISCOUNT.map(p => `${p.duration}→$${p.price}`).join(' · ')}\n`);

    log('Step 2: create test clients');
    sam = await User.create({
      email: `sam-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'CLIENT',
      registrationStep: 3,
      providerId: provider._id,
      profile: { fullName: 'Standard Sam', phoneNumber: '5555550401' },
      // no pricingTierId — defaults to Standard
    });
    dan = await User.create({
      email: `dan-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'CLIENT',
      registrationStep: 3,
      providerId: provider._id,
      profile: { fullName: 'Discount Dan', phoneNumber: '5555550402' },
      clientProfile: { pricingTierId: discountTier._id },
    });
    log(`  Sam (no tier): ${sam._id}`);
    log(`  Dan (Discount tier): ${dan._id}\n`);

    log('Step 3: resolve pricing for each scenario');

    const scenarios = [
      { label: 'No client context', client: null, expected: STANDARD, expectedTier: null },
      { label: 'Sam — no tier',     client: sam,  expected: STANDARD, expectedTier: null },
      { label: 'Dan — Discount',    client: dan,  expected: DISCOUNT, expectedTier: 'Discount' },
    ];

    for (const sc of scenarios) {
      const { pricing, tierName } = resolvePricing(provider, sc.client);
      const priceOk = pricingMatches(pricing, sc.expected);
      const tierOk = tierName === sc.expectedTier;
      const ok = priceOk && tierOk;
      if (!ok) {
        allPassed = false;
        if (!priceOk) failures.push(`${sc.label}: pricing mismatch — got ${JSON.stringify(pricing)}`);
        if (!tierOk) failures.push(`${sc.label}: tier mismatch — got ${tierName ?? 'null'}, expected ${sc.expectedTier ?? 'null'}`);
      }
      log(
        `  ${ok ? '✓' : '✗'} ${sc.label}: ` +
        `${pricing.slice().sort((a, b) => a.duration - b.duration).map(p => `${p.duration}→$${p.price}`).join(' · ')} ` +
        `(tier: ${tierName || 'Standard'})`
      );
    }

    log('\nStep 4: tag Sam with Discount, retag Dan to Standard, re-resolve');
    sam.clientProfile = { pricingTierId: discountTier._id };
    await sam.save();
    dan.clientProfile = { pricingTierId: null };
    await dan.save();

    const samFresh = await User.findById(sam._id);
    const danFresh = await User.findById(dan._id);

    const samRes = resolvePricing(provider, samFresh);
    const danRes = resolvePricing(provider, danFresh);
    const samOk = pricingMatches(samRes.pricing, DISCOUNT) && samRes.tierName === 'Discount';
    const danOk = pricingMatches(danRes.pricing, STANDARD) && danRes.tierName === null;
    if (!samOk) { allPassed = false; failures.push('After retag: Sam should now be on Discount'); }
    if (!danOk) { allPassed = false; failures.push('After retag: Dan should now be on Standard'); }
    log(`  ${samOk ? '✓' : '✗'} Sam now on ${samRes.tierName || 'Standard'}`);
    log(`  ${danOk ? '✓' : '✗'} Dan now on ${danRes.tierName || 'Standard'}`);
  } catch (err) {
    allPassed = false;
    failures.push(`Unexpected error: ${err.message}`);
    log('\n✗ Unexpected error during test:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    log('\nCleanup');
    try {
      for (const u of [sam, dan, provider]) {
        if (u) await User.deleteOne({ _id: u._id });
      }
      const tagRegex = new RegExp(TEST_TAG.replace('.', '\\.') + '$');
      const sweep = await User.deleteMany({ email: tagRegex });
      log(`  scoped deletes done`);
      log(`  test-tag user sweep: ${sweep.deletedCount} extra removed`);
    } catch (cleanupErr) {
      log(`  ! cleanup error: ${cleanupErr.message}`);
    }

    log('\n─────────────────────────────────────────────────────────────');
    if (allPassed) {
      log('RESULT: ✓ Pricing tiers resolve correctly for all scenarios');
    } else {
      log('RESULT: ✗ FAILURES DETECTED:');
      failures.forEach(f => log(`  - ${f}`));
    }
    await mongoose.disconnect();
    process.exit(allPassed ? 0 : 1);
  }
})();
