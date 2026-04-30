// Translate a PackageTemplate (or sessions-style ad-hoc spec) into the
// minutes-pool shape we persist on PackagePurchase. The marketing layer
// stays sessions-flavored ("5 × 90 min — $X") but every owned package is
// fungible minutes, so a buyer can spend a 90-min credit on a 60-min visit.
//
// The original session framing is snapshotted into displayPack so UI
// surfaces can render "5-pack 90 min · 450 min remaining" instead of a
// bare "450 min pool" — preserves recognition for the buyer.

function materializeFromTemplate(template) {
  if (!template) {
    throw new Error('materializeFromTemplate: template is required');
  }
  if (template.kind === 'minutes') {
    return {
      kind: 'minutes',
      minutesTotal: template.minutesTotal,
      displayPack: undefined,
    };
  }
  // Sessions template → minutes pool with display framing snapshotted.
  const sessions = Number(template.sessionsTotal);
  const sessionDuration = Number(template.sessionDuration);
  return {
    kind: 'minutes',
    minutesTotal: sessions * sessionDuration,
    displayPack: { sessions, sessionDuration },
  };
}

// Same conversion for ad-hoc sessions specs (provider's "custom sessions"
// comp form). Inputs are pre-validated by the route handler.
function materializeFromSessionsSpec({ sessionsTotal, sessionDuration }) {
  const s = Number(sessionsTotal);
  const d = Number(sessionDuration);
  return {
    kind: 'minutes',
    minutesTotal: s * d,
    displayPack: { sessions: s, sessionDuration: d },
  };
}

module.exports = { materializeFromTemplate, materializeFromSessionsSpec };
