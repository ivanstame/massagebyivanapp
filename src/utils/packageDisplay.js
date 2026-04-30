// Friendly display helpers for PackagePurchase rows.
//
// All purchases are stored as minutes pools (post-Apr-2026), but we
// snapshot the original "5 × 90 min" framing onto displayPack so UI
// surfaces still read in session terms when the buyer expects it. Old
// unmigrated sessions-mode purchases keep working through the legacy
// branch below.

export function packageHeadline(pkg) {
  if (pkg?.displayPack?.sessions && pkg?.displayPack?.sessionDuration) {
    return `${pkg.displayPack.sessions} × ${pkg.displayPack.sessionDuration} min`;
  }
  if (pkg?.kind === 'minutes') return `${pkg.minutesTotal || 0} min pool`;
  // Legacy sessions-mode (only for purchases not yet migrated).
  return `${pkg?.sessionsTotal || 0} × ${pkg?.sessionDuration || 0} min`;
}

// Used in row summaries. Shows "<remaining> min remaining (≈ N × D-min)"
// for displayPack-flavored purchases so buyers still recognize the count
// in session terms.
export function packageRemainingLabel(pkg) {
  if (!pkg) return '';
  if (pkg.kind === 'minutes') {
    const min = pkg.minutesRemaining ?? Math.max(0, (pkg.minutesTotal || 0) - (pkg.minutesUsed || 0));
    if (pkg.displayPack?.sessionDuration > 0) {
      const sess = Math.floor(min / pkg.displayPack.sessionDuration);
      return `${min} min remaining (≈ ${sess} × ${pkg.displayPack.sessionDuration}-min)`;
    }
    return `${min} min remaining`;
  }
  // Legacy sessions-mode.
  const remaining = pkg.sessionsRemaining ?? Math.max(0, (pkg.sessionsTotal || 0) - (pkg.sessionsUsed || 0));
  return `${remaining} of ${pkg.sessionsTotal || 0} sessions remaining`;
}

// Total capacity (minutes for new, sessions for legacy). Used by progress
// bars and stat readouts.
export function packageTotalCapacity(pkg) {
  if (!pkg) return 0;
  if (pkg.kind === 'minutes') return pkg.minutesTotal || 0;
  return pkg.sessionsTotal || 0;
}

// Capacity unit label ("min" or "sessions") so callers can suffix.
export function packageCapacityUnit(pkg) {
  return pkg?.kind === 'minutes' ? 'min' : 'sessions';
}
