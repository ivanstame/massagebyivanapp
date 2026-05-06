import React, { useState, useMemo } from 'react';
import { DateTime } from 'luxon';
import { Share2, Copy, MessageSquare, Mail, X, CheckCircle, EyeOff } from 'lucide-react';
import { DEFAULT_TZ } from '../utils/timeConstants';

// Generates a plain-text version of a provider's day and offers share
// actions (native Web Share, copy-to-clipboard, SMS, email). Built for
// the "wife wants my schedule" use case but works for any out-of-band
// recipient — family, accountant, employee covering for you, etc.
//
// Privacy posture: client names are off by default. The provider can
// turn them on per-share when the recipient knows the clients (spouse,
// office partner) or off when sharing with someone who shouldn't know
// who's on the table (CMIA-relevant — the fact that someone is getting
// a massage is itself protected info in CA, more so since 2026 when
// MTs were formally classified as healthcare providers).

const ScheduleShareSheet = ({ bookings = [], date, onClose }) => {
  const [showClientNames, setShowClientNames] = useState(false);
  const [showAddresses, setShowAddresses] = useState(true);
  const [copiedFlash, setCopiedFlash] = useState(false);

  // Filter to what's actually shareable: not cancelled, has start/end.
  // Sort by start time. Series occurrences and chain bookings each
  // render as their own line — the provider's day reads chronologically.
  const liveBookings = useMemo(() => {
    return (bookings || [])
      .filter(b => b && b.status !== 'cancelled' && b.startTime && b.endTime)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [bookings]);

  const dayLabel = useMemo(() => {
    if (!date) return '';
    const dt = date instanceof Date
      ? DateTime.fromJSDate(date).setZone(DEFAULT_TZ)
      : DateTime.fromISO(String(date), { zone: DEFAULT_TZ });
    return dt.isValid ? dt.toFormat('EEE, MMM d') : '';
  }, [date]);

  // Pretty-print "HH:mm" → "9:00am" (or "9:00 AM" if you'd rather; this
  // is the lowercase compact form that reads cleanly in SMS).
  const fmtTime = (hhmm) => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const period = h >= 12 ? 'pm' : 'am';
    const display = ((h + 11) % 12) + 1;
    return `${display}:${String(m).padStart(2, '0')}${period}`;
  };

  const recipientLabel = (b) => {
    if (b.recipientType === 'other' && b.recipientInfo?.name) {
      return b.recipientInfo.name;
    }
    if (b.client?.profile?.fullName) return b.client.profile.fullName;
    if (b.client?.email) return b.client.email;
    return 'Client';
  };

  // Just the city or first address segment — full street address is
  // overkill for a "where are you working today" share. Provider can
  // re-enable if needed (toggle below).
  const shortLocation = (b) => {
    const addr = b.location?.address || '';
    if (!addr) return '';
    // "712 Jasmine Ave, Corona Del Mar, CA 92625" → "Corona Del Mar"
    const parts = addr.split(',').map(s => s.trim());
    if (parts.length >= 2) return parts[1];
    return parts[0];
  };

  // Roll-up summary line: "4 sessions · 5h work · last ends 5:30pm"
  const summaryLine = useMemo(() => {
    if (liveBookings.length === 0) return 'Day off — nothing scheduled.';
    const totalMin = liveBookings.reduce((sum, b) => sum + (b.duration || 0), 0);
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    const workStr = hours
      ? (minutes ? `${hours}h ${minutes}m` : `${hours}h`)
      : `${minutes}m`;
    const last = liveBookings[liveBookings.length - 1];
    const lastEnd = fmtTime(last.endTime);
    const sessionLabel = liveBookings.length === 1 ? 'session' : 'sessions';
    return `${liveBookings.length} ${sessionLabel} · ${workStr} work · last ends ${lastEnd}`;
  }, [liveBookings]);

  // The actual text that gets shared/copied. Recompute when either
  // toggle flips.
  const shareText = useMemo(() => {
    const header = dayLabel ? `Schedule (${dayLabel})` : 'Schedule';
    const lines = [header, summaryLine, ''];
    for (const b of liveBookings) {
      const time = `${fmtTime(b.startTime)}–${fmtTime(b.endTime)}`;
      const dur = b.duration ? `${b.duration} min` : '';
      const who = showClientNames ? recipientLabel(b) : `${dur} appt`;
      const where = showAddresses ? shortLocation(b) : '';
      const tail = [where].filter(Boolean).join(' · ');
      const main = showClientNames && dur
        ? `${time} · ${who} (${dur})`
        : `${time} · ${who}`;
      lines.push(tail ? `${main} — ${tail}` : main);
    }
    return lines.join('\n');
  }, [dayLabel, summaryLine, liveBookings, showClientNames, showAddresses]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 1800);
    } catch (err) {
      console.error('Clipboard write failed', err);
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      handleCopy();
      return;
    }
    try {
      await navigator.share({ text: shareText });
    } catch (err) {
      // User cancelled or share unsupported for the data — silent.
    }
  };

  const smsLink = `sms:?&body=${encodeURIComponent(shareText)}`;
  const mailtoLink = `mailto:?subject=${encodeURIComponent(`My schedule${dayLabel ? ' — ' + dayLabel : ''}`)}&body=${encodeURIComponent(shareText)}`;

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-paper-elev rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-md mx-auto sm:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-line-soft">
          <h3 className="text-base font-semibold text-slate-900">Share schedule</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-800 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Toggles */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showClientNames}
                onChange={(e) => setShowClientNames(e.target.checked)}
                className="w-4 h-4 accent-[#B07A4E]"
              />
              <span className="text-sm text-slate-700">Show client names</span>
              {!showClientNames && (
                <EyeOff className="w-3.5 h-3.5 text-slate-500" title="Names hidden by default for privacy" />
              )}
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showAddresses}
                onChange={(e) => setShowAddresses(e.target.checked)}
                className="w-4 h-4 accent-[#B07A4E]"
              />
              <span className="text-sm text-slate-700">Show locations</span>
            </label>
          </div>

          {/* Preview */}
          <div className="bg-paper-deep border border-line rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap font-mono leading-relaxed">
            {shareText}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#B07A4E] text-white text-sm font-medium hover:bg-[#8A5D36]"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper-elev text-slate-700 text-sm font-medium hover:bg-paper-deep"
            >
              {copiedFlash ? (
                <><CheckCircle className="w-4 h-4 text-green-700" /> Copied</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy</>
              )}
            </button>
            <a
              href={smsLink}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper-elev text-slate-700 text-sm font-medium hover:bg-paper-deep"
            >
              <MessageSquare className="w-4 h-4" /> SMS
            </a>
            <a
              href={mailtoLink}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper-elev text-slate-700 text-sm font-medium hover:bg-paper-deep"
            >
              <Mail className="w-4 h-4" /> Email
            </a>
          </div>

          <p className="text-xs text-slate-500">
            Names off by default — flip the toggle when sharing with someone who already knows your clients (spouse, partner). Avoid sharing names with people who don't.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScheduleShareSheet;
