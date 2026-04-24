// Venmo universal link helper. The web URL opens the Venmo app on iOS/Android
// when installed, with amount and note prefilled — otherwise falls back to the
// web flow. No backend involvement.
//
// Input forms we accept:
//   - bare handle:           "ivan-stame"  or  "@ivan-stame"
//   - profile URL:           "https://venmo.com/ivan-stame"
//   - new-style profile URL: "https://account.venmo.com/u/ivan-stame"
//   - /u/ path:              "https://venmo.com/u/ivan-stame"
//
// Input forms we explicitly REJECT (they look like URLs but don't give us a
// usable handle — venmo.com/{numeric_id}?txn=pay does NOT resolve):
//   - QR-code share URL:     "https://venmo.com/code?user_id=3094759082756298034"
//   - any numeric-only input (a user ID masquerading as a handle)

const HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/;

// Returns a richer result than parseVenmoInput so callers (e.g. the settings
// UI) can show a targeted error message rather than a generic "couldn't read
// that" — the difference between "you pasted a user_id share link" and "you
// pasted random text" matters for the user.
//
// Shape: { kind: 'empty' | 'user_id_link' | 'numeric' | 'invalid' | 'ok',
//          handle?: string }
export const describeVenmoInput = (input) => {
  if (!input) return { kind: 'empty' };
  const raw = String(input).trim();
  if (!raw) return { kind: 'empty' };

  // Detect and reject the app's "Share Profile → Copy Link" format, which
  // points at a numeric user_id. The URL loads a QR landing page, not a
  // username profile, and can't be turned into a payment deep link.
  if (/venmo\.com\/code\?user_id=/i.test(raw)) {
    return { kind: 'user_id_link' };
  }

  // URL forms we can extract a username from. Match venmo.com/{handle} or
  // venmo.com/u/{handle} (with optional account. or www. subdomain, with or
  // without protocol). We do NOT accept ?user_id= here — that's handled above.
  const urlMatch = raw.match(
    /^(?:https?:\/\/)?(?:www\.|account\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9][A-Za-z0-9_-]{0,29})(?:[/?#]|$)/i
  );
  if (urlMatch) {
    const handle = urlMatch[1];
    if (/^\d+$/.test(handle)) return { kind: 'numeric' };
    return { kind: 'ok', handle };
  }

  // Bare handle (letters/digits/dashes/underscores), optionally @-prefixed.
  const bare = raw.replace(/^@+/, '');
  if (HANDLE_PATTERN.test(bare)) {
    // Reject purely-numeric "handles" — nearly always a user ID someone
    // stripped out of a share link by hand.
    if (/^\d+$/.test(bare)) return { kind: 'numeric' };
    return { kind: 'ok', handle: bare };
  }

  return { kind: 'invalid' };
};

// Thin wrapper for callers that just want the handle or nothing (e.g. the
// save path where we only need the clean value). Empty string on any failure.
export const parseVenmoInput = (input) => {
  const result = describeVenmoInput(input);
  return result.kind === 'ok' ? result.handle : '';
};

// Public profile URL — used for the "Preview on Venmo" link so providers can
// visually confirm we resolved the right account before saving.
export const buildVenmoProfileUrl = (handle) => {
  if (!handle) return null;
  const clean = String(handle).replace(/^@+/, '').trim();
  if (!clean) return null;
  return `https://venmo.com/u/${encodeURIComponent(clean)}`;
};

// Payment deep link — opens the Venmo app on mobile (or the web payment flow
// otherwise) with the amount and note prefilled. Uses the bare /{handle}
// path, not /u/, because that's what Venmo's txn=pay deep link format expects.
export const buildVenmoPayUrl = (handle, amount, note) => {
  if (!handle) return null;
  const cleanHandle = String(handle).replace(/^@+/, '').trim();
  if (!cleanHandle) return null;

  const params = new URLSearchParams({ txn: 'pay' });
  if (amount != null && Number(amount) > 0) {
    params.set('amount', Number(amount).toFixed(2));
  }
  if (note) {
    params.set('note', note);
  }
  return `https://venmo.com/${encodeURIComponent(cleanHandle)}?${params.toString()}`;
};
