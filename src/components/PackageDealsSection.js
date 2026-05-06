import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Layers, Plus, Trash2, AlertCircle, CheckCircle, Loader2,
  Edit3, ToggleLeft, ToggleRight,
} from 'lucide-react';

// Provider-side management of bulk package deals (e.g. "5-Pack 60-min
// Massage"). Each package references a session duration the provider
// already offers via basePricing; the server validates this.
//
// Saves are per-template (create / update / delete fire their own API
// calls) so changes don't require the provider to hit a global Save.
// Inline "Save" buttons appear next to each row's edit form.
const PackageDealsSection = ({ availableDurations }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Either { _new: true, ...fields } for a net-new template being drafted,
  // or a template ID string for editing one inline.
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/packages/templates', { withCredentials: true });
      setTemplates(res.data || []);
    } catch (err) {
      console.error('Error fetching package templates:', err);
      setError(err.response?.data?.message || 'Failed to load package deals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Safe default for the duration picker: first available duration, else 60.
  const defaultDuration = (availableDurations && availableDurations[0]) || 60;

  const startNew = () => {
    setError(null);
    setEditing('_new');
    setEditDraft({
      name: '',
      description: '',
      kind: 'sessions',
      sessionsTotal: 5,
      sessionDuration: defaultDuration,
      minutesTotal: 300,
      price: 0,
      isActive: true,
    });
  };

  const startEdit = (tmpl) => {
    setError(null);
    setEditing(tmpl._id);
    setEditDraft({
      name: tmpl.name,
      description: tmpl.description || '',
      kind: tmpl.kind || 'sessions',
      sessionsTotal: tmpl.sessionsTotal ?? 5,
      sessionDuration: tmpl.sessionDuration ?? defaultDuration,
      minutesTotal: tmpl.minutesTotal ?? 300,
      price: tmpl.price,
      isActive: tmpl.isActive,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditDraft(null);
    setError(null);
  };

  const flashSaved = (id) => {
    setSavedFlash(id);
    setTimeout(() => setSavedFlash(null), 2000);
  };

  const save = async () => {
    if (!editDraft) return;
    setError(null);

    // Client-side sanity check — real validation is server-side.
    if (!editDraft.name.trim()) {
      setError('Package name is required');
      return;
    }
    if (editDraft.kind === 'minutes') {
      if (!Number.isInteger(Number(editDraft.minutesTotal)) || editDraft.minutesTotal < 30) {
        setError('Minutes must be a whole number of 30 or more');
        return;
      }
    } else {
      if (!Number.isInteger(Number(editDraft.sessionsTotal)) || editDraft.sessionsTotal < 1) {
        setError('Sessions must be a whole number of 1 or more');
        return;
      }
    }
    if (editDraft.price < 0) {
      setError('Price cannot be negative');
      return;
    }

    const payload = {
      name: editDraft.name.trim(),
      description: editDraft.description.trim(),
      kind: editDraft.kind,
      ...(editDraft.kind === 'minutes'
        ? { minutesTotal: Number(editDraft.minutesTotal) }
        : {
            sessionsTotal: Number(editDraft.sessionsTotal),
            sessionDuration: Number(editDraft.sessionDuration),
          }),
      price: Number(editDraft.price),
      isActive: editDraft.isActive,
    };

    try {
      setSavingId(editing);
      let saved;
      if (editing === '_new') {
        const res = await axios.post('/api/packages/templates', payload, { withCredentials: true });
        saved = res.data;
        setTemplates(prev => [saved, ...prev]);
      } else {
        const res = await axios.put(`/api/packages/templates/${editing}`, payload, { withCredentials: true });
        saved = res.data;
        setTemplates(prev => prev.map(t => t._id === saved._id ? saved : t));
      }
      flashSaved(saved._id);
      cancelEdit();
    } catch (err) {
      console.error('Error saving package:', err);
      setError(err.response?.data?.message || 'Failed to save package');
    } finally {
      setSavingId(null);
    }
  };

  // Toggle active state without entering edit mode — quick action for
  // retiring a package temporarily.
  const toggleActive = async (tmpl) => {
    try {
      setSavingId(tmpl._id);
      const res = await axios.put(`/api/packages/templates/${tmpl._id}`, {
        name: tmpl.name,
        description: tmpl.description,
        kind: tmpl.kind || 'sessions',
        ...(tmpl.kind === 'minutes'
          ? { minutesTotal: tmpl.minutesTotal }
          : {
              sessionsTotal: tmpl.sessionsTotal,
              sessionDuration: tmpl.sessionDuration,
            }),
        price: tmpl.price,
        isActive: !tmpl.isActive,
      }, { withCredentials: true });
      setTemplates(prev => prev.map(t => t._id === res.data._id ? res.data : t));
      flashSaved(res.data._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to toggle package');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (tmpl) => {
    const confirmMsg = 'Remove this package deal?\n\n' +
      'If any clients have purchased it, it will be retired instead of deleted so their records stay intact.';
    if (!window.confirm(confirmMsg)) return;
    try {
      setSavingId(tmpl._id);
      const res = await axios.delete(`/api/packages/templates/${tmpl._id}`, { withCredentials: true });
      // Retired packages come back with isActive:false; deleted ones just vanish.
      if (res.data.retired && res.data.template) {
        setTemplates(prev => prev.map(t => t._id === tmpl._id ? res.data.template : t));
      } else {
        setTemplates(prev => prev.filter(t => t._id !== tmpl._id));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove package');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#B07A4E]" />
          <h3 className="font-medium text-slate-900">Package Deals</h3>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Sell multi-session packs (e.g. a 5-pack). Clients pay upfront via Stripe, then
        redeem one credit per booking &mdash; add-ons are still paid per visit.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-sm text-slate-500">Loading…</div>
      ) : templates.length === 0 && editing !== '_new' ? (
        <div className="text-center py-6 bg-paper-deep rounded-lg border border-dashed border-slate-300">
          <p className="text-slate-500 text-sm">No package deals yet</p>
          <p className="text-slate-500 text-xs mt-1">
            Offer prepaid packs so regulars can buy in bulk.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tmpl => {
            const isEditing = editing === tmpl._id;
            const draft = isEditing ? editDraft : null;
            return (
              <div
                key={tmpl._id}
                className={`p-3 rounded-lg border transition-colors ${
                  tmpl.isActive
                    ? 'bg-paper-elev border-line shadow-sm'
                    : 'bg-paper-deep border-line-soft opacity-60'
                }`}
              >
                {!isEditing ? (
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleActive(tmpl)}
                      disabled={savingId === tmpl._id}
                      className="mt-0.5 flex-shrink-0"
                      title={tmpl.isActive ? 'Retire (hide from new purchases)' : 'Reactivate'}
                    >
                      {tmpl.isActive ? (
                        <ToggleRight className="w-6 h-6 text-[#B07A4E]" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-500" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{tmpl.name}</p>
                        {savedFlash === tmpl._id && (
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        )}
                        {!tmpl.isActive && (
                          <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                            Retired
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {tmpl.kind === 'minutes' ? (
                          <>
                            {tmpl.minutesTotal} min pool &middot;{' '}
                            <span className="font-medium text-slate-900">${tmpl.price}</span>
                            {tmpl.minutesTotal > 0 && tmpl.price > 0 && (
                              <span className="text-xs text-slate-500 ml-1.5">
                                (${((tmpl.price / tmpl.minutesTotal) * 60).toFixed(2)}/hr)
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {tmpl.sessionsTotal} × {tmpl.sessionDuration} min &middot;{' '}
                            <span className="font-medium text-slate-900">${tmpl.price}</span>
                            {tmpl.sessionsTotal > 0 && tmpl.price > 0 && (
                              <span className="text-xs text-slate-500 ml-1.5">
                                (${(tmpl.price / tmpl.sessionsTotal).toFixed(2)}/session)
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      {tmpl.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tmpl.description}</p>
                      )}
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(tmpl)}
                        className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(tmpl)}
                        disabled={savingId === tmpl._id}
                        className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <PackageForm
                    draft={draft}
                    setDraft={setEditDraft}
                    availableDurations={availableDurations}
                    onSave={save}
                    onCancel={cancelEdit}
                    saving={savingId === editing}
                    isNew={false}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing === '_new' && editDraft && (
        <div className="mt-3 p-4 bg-paper-deep rounded-lg border border-line">
          <PackageForm
            draft={editDraft}
            setDraft={setEditDraft}
            availableDurations={availableDurations}
            onSave={save}
            onCancel={cancelEdit}
            saving={savingId === '_new'}
            isNew={true}
          />
        </div>
      )}

      {editing !== '_new' && (
        <button
          onClick={startNew}
          className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Package Deal
        </button>
      )}
    </div>
  );
};

const PackageForm = ({ draft, setDraft, availableDurations, onSave, onCancel, saving, isNew }) => {
  const update = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  // Allow picking any of the provider's offered durations. Fall back to a
  // standard list if none are defined yet.
  const durationOptions = availableDurations && availableDurations.length > 0
    ? availableDurations
    : [30, 45, 60, 75, 90, 105, 120, 150, 180];

  const kind = draft.kind || 'sessions';

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Package name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder={kind === 'minutes' ? 'e.g. 5 Hours Bodywork' : 'e.g. 5-Pack Relaxation'}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
          autoFocus
        />
      </div>

      {/* Kind toggle. Sessions = fixed N×D credits, one per booking.
          Minutes = a pool the client can spend at any duration. */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Package type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update('kind', 'sessions')}
            className={`flex-1 px-3 py-2 rounded border text-xs font-medium transition-colors ${
              kind === 'sessions'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Fixed sessions
            <span className="block text-[10px] font-normal opacity-80 mt-0.5">
              N × set duration
            </span>
          </button>
          <button
            type="button"
            onClick={() => update('kind', 'minutes')}
            className={`flex-1 px-3 py-2 rounded border text-xs font-medium transition-colors ${
              kind === 'minutes'
                ? 'bg-[#B07A4E] text-white border-[#B07A4E]'
                : 'bg-paper-elev text-slate-700 border-line hover:border-slate-300'
            }`}
          >
            Minutes pool
            <span className="block text-[10px] font-normal opacity-80 mt-0.5">
              Client picks duration
            </span>
          </button>
        </div>
      </div>

      {kind === 'minutes' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total minutes</label>
            <input
              type="number"
              min="30"
              max="6000"
              step="15"
              value={draft.minutesTotal}
              onChange={(e) => update('minutesTotal', Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
            {draft.minutesTotal > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                {(draft.minutesTotal / 60).toFixed(draft.minutesTotal % 60 ? 1 : 0)} hours
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total price ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => update('price', Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Sessions</label>
            <input
              type="number"
              min="1"
              max="100"
              value={draft.sessionsTotal}
              onChange={(e) => update('sessionsTotal', Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Per session</label>
            <select
              value={draft.sessionDuration}
              onChange={(e) => update('sessionDuration', Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            >
              {durationOptions.map(d => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total price ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => update('price', Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
            />
          </div>
        </div>
      )}

      {kind === 'sessions' && draft.sessionsTotal > 0 && draft.price > 0 && (
        <p className="text-xs text-slate-500">
          Works out to{' '}
          <span className="font-medium text-slate-700">
            ${(draft.price / draft.sessionsTotal).toFixed(2)} per session.
          </span>
        </p>
      )}
      {kind === 'minutes' && draft.minutesTotal > 0 && draft.price > 0 && (
        <p className="text-xs text-slate-500">
          Works out to{' '}
          <span className="font-medium text-slate-700">
            ${((draft.price / draft.minutesTotal) * 60).toFixed(2)} per hour.
          </span>
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Description <span className="font-normal text-slate-500">(optional, shown to clients)</span>
        </label>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="What the client gets. Keep it short."
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-[#B07A4E] focus:border-[#B07A4E]"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => update('isActive', e.target.checked)}
          className="rounded border-slate-300 text-[#B07A4E] focus:ring-[#B07A4E]"
        />
        Available for purchase
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-1.5 text-sm bg-[#B07A4E] text-white rounded hover:bg-[#8A5D36] disabled:opacity-50 font-medium"
        >
          {saving ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
          ) : (
            isNew ? 'Add Package' : 'Save Changes'
          )}
        </button>
      </div>
    </div>
  );
};

export default PackageDealsSection;
