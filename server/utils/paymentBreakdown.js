// Compute the dollar split of a single booking between package
// redemption and the secondary payment method (cash/card/etc).
//
// Used for two purposes:
//   1. AppointmentDetail UI — show the math the provider needs to see
//      ("60 min from package @ $1.67/min = $100 + 30 min cash = $50").
//   2. Revenue endpoint — accrual-basis reporting splits each booking's
//      value into "fromPackages" (recognized from prepaid credits) vs
//      "fromOther" (cash that physically arrived).
//
// pkg can be the populated PackagePurchase doc/lean object, or null
// when there's no package redemption. When null, the whole booking
// value is attributed to "other".

function getBookingValueCents(booking) {
  // Provider-set actualChargedAmount overrides the listed price when
  // present — captures any reason the client ended up paying a
  // different amount (discount, comp, scope change, etc.). Falls back
  // to pricing.totalPrice for the unadjusted normal case.
  const total = (booking?.actualChargedAmount != null)
    ? booking.actualChargedAmount
    : (booking?.pricing?.totalPrice || 0);
  return Math.round(total * 100);
}

function getPerMinuteRateCents(pkg) {
  if (!pkg) return 0;
  // Mirror the virtual on PackagePurchase but accept lean objects too —
  // virtuals don't fire on .lean() unless the caller opts in, so we
  // re-derive defensively. Both kinds collapse to the same formula:
  // price / total-minutes-available. Bonuses dilute the rate.
  let totalMinutes;
  if (pkg.kind === 'minutes') {
    totalMinutes = (pkg.minutesTotal || 0)
      + (pkg.bonuses || []).reduce((s, b) => s + (b.minutes || 0), 0);
  } else {
    const baseSessionMinutes = (pkg.sessionsTotal || 0) * (pkg.sessionDuration || 0);
    const bonusSessionMinutes = (pkg.bonuses || [])
      .reduce((s, b) => s + (b.sessions || 0), 0) * (pkg.sessionDuration || 0);
    const bonusExtraMinutes = (pkg.bonuses || []).reduce((s, b) => s + (b.minutes || 0), 0);
    totalMinutes = baseSessionMinutes + bonusSessionMinutes + bonusExtraMinutes;
  }
  if (!totalMinutes) return 0;
  return Math.round(((pkg.price || 0) / totalMinutes) * 100);
}

// Returns:
//   {
//     fromPackageCents,      // recognized from package redemption
//     fromOtherCents,        // owed via cash/card/etc (the secondary)
//     totalCents,            // booking's full value
//     minutesFromPackage,    // how many minutes the package covered
//     minutesFromOther,      // how many minutes the secondary covers
//     perMinuteCents,        // rate used for the package portion
//     packageName,           // for display
//     fullyCoveredByPackage, // bool — no secondary owed
//   }
function computeBookingPaymentBreakdown(booking, pkg = null) {
  const totalCents = getBookingValueCents(booking);
  const minutesApplied = booking?.packageRedemption?.minutesApplied || 0;
  const duration = booking?.duration || 0;

  if (!minutesApplied || !pkg) {
    // No package in play — everything attributed to whichever method the
    // booking carries (cash/card/paymentApp).
    return {
      fromPackageCents: 0,
      fromOtherCents: totalCents,
      totalCents,
      minutesFromPackage: 0,
      minutesFromOther: duration,
      perMinuteCents: 0,
      packageName: null,
      fullyCoveredByPackage: false,
    };
  }

  const perMinuteCents = getPerMinuteRateCents(pkg);
  const fromPackageCents = perMinuteCents * minutesApplied;
  const minutesFromOther = Math.max(0, duration - minutesApplied);

  // For full redemption (minutesApplied === duration), the booking's
  // total value IS the package portion — no cash side.
  const fullyCoveredByPackage = minutesApplied >= duration;

  // The secondary portion: prefer the booking's own per-minute math
  // (booking total / duration × uncovered minutes) over the package's
  // per-minute rate. Why: the client paid the package's price-per-min,
  // but they're paying TODAY's price-per-min for the uncovered side.
  // Those rates can differ (grandfathered tier, price changes, etc.).
  const perBookingMinuteCents = duration > 0 ? totalCents / duration : 0;
  const fromOtherCents = fullyCoveredByPackage
    ? 0
    : Math.round(perBookingMinuteCents * minutesFromOther);

  return {
    fromPackageCents,
    fromOtherCents,
    totalCents,
    minutesFromPackage: minutesApplied,
    minutesFromOther,
    perMinuteCents,
    packageName: pkg.name || null,
    fullyCoveredByPackage,
  };
}

module.exports = {
  computeBookingPaymentBreakdown,
  getBookingValueCents,
  getPerMinuteRateCents,
};
