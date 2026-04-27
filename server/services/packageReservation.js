// Atomic redemption helpers shared by every code path that consumes a
// PackagePurchase credit (single bookings, chains, series materialization).
//
// The same Mongo conditional pattern works for both sessions-mode and
// minutes-mode packages:
//
//   sessions-mode → "this purchase has at least 1 unused credit at the right
//                    duration." Each redemption weighs 1.
//   minutes-mode  → "this purchase has at least `duration` minutes remaining
//                    in the pool." Each redemption weighs minutesConsumed.
//
// Both shapes do an aggregation-pipeline conditional check so concurrent
// reserve attempts from two flows can't both succeed against the same
// finite capacity. The push of the redemption sub-doc is part of the same
// findOneAndUpdate, so success ⇒ the credit is yours.

const PackagePurchase = require('../models/PackagePurchase');

// Reserve `duration` minutes' worth of capacity on packageId. For
// sessions-mode this becomes a 1-credit reservation gated on
// sessionDuration === duration. For minutes-mode it's a minutes
// debit gated on remaining ≥ duration.
//
// Returns the updated PackagePurchase doc on success, null on failure
// (package not redeemable, wrong owner, capacity exceeded, etc).
//
// On success the caller MUST either persist the booking that references
// `bookingId`, OR call returnReservedCredit({ packageId, bookingId }) so
// the credit isn't silently consumed.
async function reservePackageCredit({ packageId, clientId, providerId, duration, bookingId }) {
  // We need to know `kind` before we can pick the right $expr. One read
  // is cheap and lets us write each branch as a clean conditional.
  const purchase = await PackagePurchase.findById(packageId).select('kind').lean();
  if (!purchase) return null;

  if (purchase.kind === 'minutes') {
    return PackagePurchase.findOneAndUpdate(
      {
        _id: packageId,
        client: clientId,
        provider: providerId,
        kind: 'minutes',
        paymentStatus: 'paid',
        cancelledAt: null,
        $expr: {
          $gte: [
            // remaining = minutesTotal - preConsumed - sum(active redemptions' minutesConsumed)
            {
              $subtract: [
                { $subtract: ['$minutesTotal', { $ifNull: ['$preConsumedMinutes', 0] }] },
                {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: '$redemptions',
                          as: 'r',
                          cond: { $eq: ['$$r.returnedAt', null] },
                        },
                      },
                      as: 'r',
                      in: { $ifNull: ['$$r.minutesConsumed', 0] },
                    },
                  },
                },
              ],
            },
            duration,
          ],
        },
      },
      {
        $push: {
          redemptions: {
            booking: bookingId,
            minutesConsumed: duration,
            redeemedAt: new Date(),
          },
        },
      },
      { new: true }
    );
  }

  // sessions-mode (default).
  return PackagePurchase.findOneAndUpdate(
    {
      _id: packageId,
      client: clientId,
      provider: providerId,
      kind: { $in: ['sessions', null, undefined] },
      sessionDuration: duration,
      paymentStatus: 'paid',
      cancelledAt: null,
      $expr: {
        $gt: [
          { $subtract: ['$sessionsTotal', { $ifNull: ['$preConsumedSessions', 0] }] },
          {
            $size: {
              $filter: {
                input: '$redemptions',
                as: 'r',
                cond: { $eq: ['$$r.returnedAt', null] },
              },
            },
          },
        ],
      },
    },
    {
      $push: { redemptions: { booking: bookingId, redeemedAt: new Date() } },
    },
    { new: true }
  );
}

// Roll back a reservation. Pulls the sub-doc out by booking ID. Idempotent
// — if the redemption isn't there (already pulled, or never created),
// updateOne is a no-op.
async function returnReservedCredit({ packageId, bookingId }) {
  await PackagePurchase.updateOne(
    { _id: packageId },
    { $pull: { redemptions: { booking: bookingId } } }
  );
}

// Mark an existing redemption as returned (kept in history). Used by the
// cancel flow where we want to preserve the row but free the capacity.
async function markRedemptionReturned({ packageId, bookingId }) {
  await PackagePurchase.updateOne(
    {
      _id: packageId,
      'redemptions.booking': bookingId,
      'redemptions.returnedAt': null,
    },
    { $set: { 'redemptions.$.returnedAt': new Date() } }
  );
}

module.exports = {
  reservePackageCredit,
  returnReservedCredit,
  markRedemptionReturned,
};
