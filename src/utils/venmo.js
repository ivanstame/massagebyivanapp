// Venmo universal link helper. The web URL opens the Venmo app on iOS/Android
// when installed, with amount and note prefilled — otherwise falls back to the
// web flow. No backend involvement.

// Pulls a handle out of whatever the provider pasted — works for venmo.com
// URLs (with or without protocol), account.venmo.com/u/ URLs (newer format),
// and bare handles with or without a leading @. Typos become visible because
// the input asks for the URL; garbage input returns an empty string so the
// UI can show "couldn't read that" feedback instead of saving a bad value.
export const parseVenmoInput = (input) => {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  const urlMatch = raw.match(
    /(?:https?:\/\/)?(?:www\.|account\.)?venmo\.com\/(?:u\/|code\?user_id=)?([A-Za-z0-9_-]+)/i
  );
  if (urlMatch) return urlMatch[1];

  // Bare handle input
  const bare = raw.replace(/^@+/, '');
  if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(bare)) return bare;

  return '';
};

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
