// Weekly Outreach — provider sends a once-a-week SMS to their clients
// summarizing the upcoming week's openings. The provider controls the
// opening + closing line; Avayble fills in the day-by-day body from
// their actual availability + bookings.

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import {
  Megaphone, Send, AlertCircle, CheckCircle, Loader2, Edit2, X,
  Users, Clock, ChevronDown, ChevronRight
} from 'lucide-react';
import { DateTime } from 'luxon';

const ProviderWeeklyOutreach = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [state, setState] = useState(null);
  // Selected client IDs — single source of truth for who gets the
  // message. Quick-select buttons mutate this set; per-row checkboxes
  // toggle individual entries.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Settings editor
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [draft, setDraft] = useState({ openingLine: '', closingLine: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Send confirmation + result
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    loadState();
  }, [user, navigate]);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/weekly-outreach', { withCredentials: true });
      setState(res.data);
      setDraft({
        openingLine: res.data.template.openingLine,
        closingLine: res.data.template.closingLine,
      });
      // Default selection on first load: all active clients.
      setSelectedIds(prev => {
        if (prev.size > 0) return prev; // preserve mid-session selection
        return new Set((res.data.recipients || []).map(r => String(r._id)));
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load outreach state');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch preview when the selection changes (or after template
  // save / send). Sample preview uses the first selected client's
  // first name so the provider sees realistic personalization.
  const loadPreview = useCallback(async (ids) => {
    try {
      setPreviewLoading(true);
      const res = await axios.post('/api/weekly-outreach/preview',
        { clientIds: Array.from(ids) },
        { withCredentials: true }
      );
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state) loadPreview(selectedIds);
  }, [state?.template?.openingLine, state?.template?.closingLine, selectedIds, loadPreview]);

  const handleSaveTemplate = async () => {
    try {
      setSavingTemplate(true);
      setError(null);
      await axios.put('/api/weekly-outreach/template', draft, { withCredentials: true });
      setShowSettings(false);
      await loadState(); // pull fresh state, which will trigger preview reload
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSend = async () => {
    try {
      setSending(true);
      setError(null);
      const res = await axios.post('/api/weekly-outreach/send',
        { clientIds: Array.from(selectedIds) },
        { withCredentials: true }
      );
      setSendResult(res.data);
      setShowConfirm(false);
      await loadState();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send');
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 text-[#B07A4E] animate-spin" />
      </div>
    );
  }

  if (!state) return null;

  const { recipients: allRecipients, lastSentAt, canSendNow, canSendAt } = state;
  const totalCount = allRecipients.length;
  const quietCount = allRecipients.filter(r => r.isQuiet).length;
  const selectedCount = selectedIds.size;

  const lastSentLabel = lastSentAt
    ? DateTime.fromISO(lastSentAt).toRelative()
    : 'Never';
  const nextSendLabel = !canSendNow && canSendAt
    ? DateTime.fromISO(canSendAt).setZone('America/Los_Angeles').toFormat('cccc, LLL d')
    : null;

  const filteredRecipients = search.trim()
    ? allRecipients.filter(r => r.fullName.toLowerCase().includes(search.toLowerCase()))
    : allRecipients;

  const toggleClient = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const sid = String(id);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(allRecipients.map(r => String(r._id))));
  const selectQuiet = () => setSelectedIds(new Set(allRecipients.filter(r => r.isQuiet).map(r => String(r._id))));
  const selectNone = () => setSelectedIds(new Set());

  const formatLastBooking = (iso) => {
    if (!iso) return 'no bookings yet';
    const dt = DateTime.fromISO(iso);
    const days = Math.floor(Math.abs(DateTime.now().diff(dt, 'days').days));
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    return dt.toFormat('LLL d, yyyy');
  };

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Drum up business</div>
          <h1 className="font-display" style={{ fontSize: "2rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Weekly <em style={{ color: '#B07A4E' }}>outreach</em>
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Send a weekly text to your clients with your open times for the upcoming week. Good for filling
            slow weeks and reminding regulars you're still here. Avayble pulls the day-by-day openings
            automatically — you just decide how the message starts and ends. Preview before you send.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start gap-2 rounded">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-2"><X className="w-4 h-4" /></button>
          </div>
        )}

        {sendResult && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900">
                  Sent to {sendResult.sent} client{sendResult.sent === 1 ? '' : 's'}
                  {sendResult.skipped > 0 && ` (${sendResult.skipped} skipped — opted out or no phone)`}
                  {sendResult.failed > 0 && `, ${sendResult.failed} failed`}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  You can send again starting{' '}
                  <strong>
                    {DateTime.fromISO(sendResult.nextAvailableAt).setZone('America/Los_Angeles').toFormat('cccc, LLL d')}
                  </strong>.
                </p>
              </div>
              <button onClick={() => setSendResult(null)}><X className="w-4 h-4 text-green-700" /></button>
            </div>
          </div>
        )}

        {/* Empty state — no clients with SMS consent + a phone number */}
        {totalCount === 0 && (
          <div className="bg-paper-elev border border-line rounded-lg p-6 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium mb-1">No eligible clients yet</p>
            <p className="text-sm text-slate-500">
              Once you have clients with phone numbers and SMS consent, they'll show up here.
            </p>
          </div>
        )}

        {totalCount > 0 && (
          <>
            {/* Recipients picker */}
            <div className="mb-6">
              <div className="flex items-center justify-between gap-2 py-2 mb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#B07A4E]" />
                  <h3 className="font-medium text-slate-900">Recipients</h3>
                </div>
                <span className="text-xs text-slate-500">
                  <strong className="text-slate-900">{selectedCount}</strong> of {totalCount} selected
                </span>
              </div>

              {/* Quick-select shortcuts */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs px-2.5 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E]"
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={selectQuiet}
                  className="text-xs px-2.5 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E]"
                  title="Clients who haven't booked in the last 4 weeks. Usually higher-converting than blasting everyone."
                >
                  Quiet only ({quietCount})
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-xs px-2.5 py-1 rounded-full border border-line text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E]"
                >
                  None
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full mb-2 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />

              {/* List */}
              <div className="border border-line-soft rounded-lg max-h-72 overflow-y-auto">
                {filteredRecipients.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-500">
                    No matches.
                  </div>
                ) : (
                  filteredRecipients.map(r => {
                    const id = String(r._id);
                    const checked = selectedIds.has(id);
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-line-soft last:border-b-0 ${
                          checked ? 'bg-[#B07A4E]/5' : 'hover:bg-paper-deep'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClient(r._id)}
                          className="rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {r.fullName}
                            </span>
                            {r.isQuiet && (
                              <span
                                className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                title="No booking in the last 4 weeks"
                              >
                                Quiet
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Last booking: {formatLastBooking(r.lastBookingAt)}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-6">
              <div className="flex items-center justify-between py-2 mb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#B07A4E]" />
                  <h3 className="font-medium text-slate-900">Preview</h3>
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-xs text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit message
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                This is exactly what each client will see, with their own name filled in.
                {preview?.sampleClientName && (
                  <> Showing <strong>{preview.sampleClientName}</strong>'s preview.</>
                )}
                {' '}
                Avayble subtracts your existing appointments from each day's window, so the open
                times you see are real.
                {' '}
                In-studio openings are labeled with the location name; everything else is
                in-home.
              </p>
              {previewLoading ? (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-[#B07A4E] animate-spin" />
                </div>
              ) : preview ? (
                <>
                  <pre className="text-sm text-slate-800 bg-paper-deep border border-line-soft rounded-lg p-4 whitespace-pre-wrap font-sans">
                    {preview.message}
                  </pre>
                  {Array.isArray(preview.diagnostic) && preview.diagnostic.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowDiagnostic(s => !s)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        {showDiagnostic ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {showDiagnostic ? 'Hide details' : 'Show details — what was subtracted from each window'}
                      </button>
                      {showDiagnostic && (
                        <div className="mt-2 space-y-3 bg-paper-deep border border-line-soft rounded-lg p-3 text-xs">
                          {preview.diagnostic.map(d => (
                            <DiagnosticDay key={d.localDate} day={d} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Send */}
            <div className="mb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Last sent: {lastSentLabel}
                  </div>
                  {nextSendLabel && (
                    <div className="mt-1">
                      Next send available: <strong>{nextSendLabel}</strong>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={!canSendNow || selectedCount === 0 || sending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B07A4E] text-white rounded-lg font-medium hover:bg-[#8A5D36] disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send to {selectedCount} client{selectedCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Settings modal — edit opening + closing line */}
        {showSettings && (
          <div className="fixed inset-0 bg-slate-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-paper-elev rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-line flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Edit message template</h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Your opening line
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    The first line of every message. Use <code className="bg-paper-deep px-1 rounded">{'{firstName}'}</code> to personalize. Keep it short.
                  </p>
                  <textarea
                    value={draft.openingLine}
                    onChange={(e) => setDraft({ ...draft, openingLine: e.target.value })}
                    rows={2}
                    maxLength={280}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                  />
                  <div className="text-xs text-slate-500 text-right mt-0.5">{draft.openingLine.length} / 280</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Your closing line
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    The call-to-action at the bottom. <code className="bg-paper-deep px-1 rounded">{'{bookingLink}'}</code> becomes a tappable link.
                  </p>
                  <textarea
                    value={draft.closingLine}
                    onChange={(e) => setDraft({ ...draft, closingLine: e.target.value })}
                    rows={2}
                    maxLength={280}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                  />
                  <div className="text-xs text-slate-500 text-right mt-0.5">{draft.closingLine.length} / 280</div>
                </div>

                <div className="text-xs text-slate-500 bg-paper-deep border border-line-soft rounded p-3">
                  <strong>Available merge tags:</strong>{' '}
                  <code className="bg-paper-elev px-1 rounded">{'{firstName}'}</code>{' '}
                  <code className="bg-paper-elev px-1 rounded">{'{providerName}'}</code>{' '}
                  <code className="bg-paper-elev px-1 rounded">{'{bookingLink}'}</code>
                  <div className="mt-1.5">
                    The day-by-day availability list and the "Reply STOP to opt out" footer are added
                    automatically — you don't need to include them.
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-line bg-paper-deep flex justify-end gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  disabled={savingTemplate}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] font-medium disabled:bg-slate-300"
                >
                  {savingTemplate && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm send */}
        {showConfirm && (
          <div className="fixed inset-0 bg-slate-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-paper-elev rounded-lg shadow-xl w-full max-w-md">
              <div className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">
                  Send to {selectedCount} client{selectedCount === 1 ? '' : 's'}?
                </h2>
                <p className="text-sm text-slate-600 mb-2">
                  Each client will get their own personalized message with their first name in the greeting.
                  Anyone who has previously replied STOP is automatically skipped.
                </p>
                <p className="text-xs text-slate-500">
                  Avayble limits this to <strong>once every 7 days</strong> so you can't accidentally double-send.
                </p>
              </div>
              <div className="px-5 py-4 border-t border-line bg-paper-deep flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={sending}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] font-medium"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Per-day breakdown panel — shows what bookings + blocked times were
// found and how each availability window was reduced. Helps the
// provider verify reality matches the SMS body. If a real booking
// shows up in this list but the open window above doesn't reflect it,
// something is broken upstream and we want to see it.
const DiagnosticDay = ({ day }) => {
  const fmt = (hhmm) => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const period = h >= 12 ? 'pm' : 'am';
    const display = h % 12 || 12;
    return m === 0 ? `${display}${period}` : `${display}:${String(m).padStart(2, '0')}${period}`;
  };

  if (!day.hasAvailability) {
    return (
      <div className="text-slate-500">
        <strong className="text-slate-700">{day.dayLabel}</strong> — no availability set
      </div>
    );
  }

  const bookings = day.bookings || [];
  const blocks = day.blockedTimes || [];

  return (
    <div>
      <div className="font-medium text-slate-800">{day.dayLabel}</div>
      <div className="mt-1 ml-3 space-y-1">
        {bookings.length === 0 && blocks.length === 0 && (
          <div className="text-slate-500">No bookings or blocked times found for this day.</div>
        )}
        {bookings.length > 0 && (
          <div>
            <span className="text-slate-500">Bookings ({bookings.length}):</span>
            <ul className="ml-3 list-disc list-inside text-slate-700">
              {bookings.map((b, i) => (
                <li key={`b-${i}`}>
                  {fmt(b.startTime)}–{fmt(b.endTime)} · {b.clientName}
                  {b.status !== 'confirmed' && (
                    <span className="text-slate-500 ml-1">({b.status})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {blocks.length > 0 && (
          <div>
            <span className="text-slate-500">Blocked time ({blocks.length}):</span>
            <ul className="ml-3 list-disc list-inside text-slate-700">
              {blocks.map((b, i) => (
                <li key={`x-${i}`}>
                  {fmt(b.startTime)}–{fmt(b.endTime)}
                  {b.source === 'google_calendar' ? ' · GCal' : ''}
                  {b.reason ? ` · ${b.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(day.windows || []).map((w, i) => (
          <div key={`w-${i}`} className="text-slate-700">
            <span className="text-slate-500">Window:</span> {fmt(w.windowStart)}–{fmt(w.windowEnd)}
            {w.kind === 'static' && w.locationName && (
              <span className="text-slate-500"> (in-studio at {w.locationName})</span>
            )}
            {' → '}
            {w.openRanges.length === 0
              ? <span className="text-red-600">fully booked</span>
              : <span>{w.openRanges.map(r => `${fmt(r.start)}–${fmt(r.end)}`).join(', ')}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderWeeklyOutreach;
