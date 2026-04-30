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
  Users, Clock
} from 'lucide-react';
import { DateTime } from 'luxon';

const ProviderWeeklyOutreach = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [state, setState] = useState(null); // {template, lastSentAt, canSendNow, recipientCounts, providerName}
  const [filter, setFilter] = useState('all'); // 'all' | 'quiet'
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Settings editor
  const [showSettings, setShowSettings] = useState(false);
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
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load outreach state');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch preview whenever the filter changes (and after template save / send).
  const loadPreview = useCallback(async (currentFilter = filter) => {
    try {
      setPreviewLoading(true);
      const res = await axios.post('/api/weekly-outreach/preview',
        { filter: currentFilter },
        { withCredentials: true }
      );
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (state) loadPreview(filter);
  }, [state?.template?.openingLine, state?.template?.closingLine, filter]);

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
        { filter },
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

  const { recipientCounts, lastSentAt, canSendNow, canSendAt } = state;
  const recipients = filter === 'quiet' ? recipientCounts.quiet : recipientCounts.all;
  const lastSentLabel = lastSentAt
    ? DateTime.fromISO(lastSentAt).toRelative()
    : 'Never';
  const nextSendLabel = !canSendNow && canSendAt
    ? DateTime.fromISO(canSendAt).setZone('America/Los_Angeles').toFormat('cccc, LLL d')
    : null;

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Drum up business</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
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
        {recipientCounts.all === 0 && (
          <div className="bg-paper-elev border border-line rounded-lg p-6 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium mb-1">No eligible clients yet</p>
            <p className="text-sm text-slate-500">
              Once you have clients with phone numbers and SMS consent, they'll show up here.
            </p>
          </div>
        )}

        {recipientCounts.all > 0 && (
          <>
            {/* Recipients picker */}
            <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-[#B07A4E]" />
                <h3 className="font-medium text-slate-900">Recipients</h3>
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-paper-deep">
                  <input
                    type="radio"
                    checked={filter === 'all'}
                    onChange={() => setFilter('all')}
                    className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      All active clients ({recipientCounts.all})
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Everyone with SMS consent and a phone number on file.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-paper-deep">
                  <input
                    type="radio"
                    checked={filter === 'quiet'}
                    onChange={() => setFilter('quiet')}
                    className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      Quiet clients only ({recipientCounts.quiet})
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Clients who haven't booked in the last 4 weeks. Usually converts better and
                      feels less spammy than blasting your whole list.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-5 mb-4">
              <div className="flex items-center justify-between mb-2">
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
              </p>
              {previewLoading ? (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-[#B07A4E] animate-spin" />
                </div>
              ) : preview ? (
                <pre className="text-sm text-slate-800 bg-paper-deep border border-line-soft rounded-lg p-4 whitespace-pre-wrap font-sans">
                  {preview.message}
                </pre>
              ) : null}
            </div>

            {/* Send */}
            <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-5 mb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
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
                  disabled={!canSendNow || recipients === 0 || sending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B07A4E] text-white rounded-lg font-medium hover:bg-[#8A5D36] disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send to {recipients} client{recipients === 1 ? '' : 's'}
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
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
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
                  <div className="text-xs text-slate-400 text-right mt-0.5">{draft.openingLine.length} / 280</div>
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
                  <div className="text-xs text-slate-400 text-right mt-0.5">{draft.closingLine.length} / 280</div>
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
                  Send to {recipients} client{recipients === 1 ? '' : 's'}?
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

export default ProviderWeeklyOutreach;
