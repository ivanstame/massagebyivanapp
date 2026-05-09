import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import {
  Plus, Pencil, Trash2, Download, Receipt, AlertCircle, X,
  Package, Sparkles, Megaphone, BookOpen, Box, ExternalLink,
} from 'lucide-react';
import { AuthContext } from '../AuthContext';
import { tzOf } from '../utils/timeConstants';

const API_URL = process.env.REACT_APP_API_URL || '';

// Categories are intentionally generic — provider doesn't need to map
// to Schedule C lines (their CPA does that). Icons + labels for the UI.
const CATEGORIES = [
  { id: 'supplies',  label: 'Supplies',  icon: Package,   hint: 'Oil, lotion, sheets, sanitizer…' },
  { id: 'equipment', label: 'Equipment', icon: Box,       hint: 'Table, headrest, bolster, electronics…' },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, hint: 'Cards, ads, website fees…' },
  { id: 'education', label: 'Education', icon: BookOpen,  hint: 'CEUs, books, conferences…' },
  { id: 'other',     label: 'Other',     icon: Sparkles,  hint: 'Anything else business-related' },
];

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (yyyyMmDd) =>
  DateTime.fromFormat(yyyyMmDd, 'yyyy-MM-dd').toFormat('EEE, MMM d, yyyy');

// Group expenses by their localDate's "yyyy-MM" so the UI can render
// month sections without re-bucketing every render.
const groupByMonth = (expenses) => {
  const map = new Map();
  for (const e of expenses) {
    const key = e.localDate.slice(0, 7); // yyyy-MM
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
};

// ─── Add/Edit modal ────────────────────────────────────────────────────

const ExpenseModal = ({ initial, onSave, onClose, viewerTz }) => {
  const today = DateTime.now().setZone(viewerTz).toFormat('yyyy-MM-dd');
  const [date, setDate] = useState(initial?.localDate || today);
  const [amount, setAmount] = useState(
    initial ? (initial.amountCents / 100).toFixed(2) : ''
  );
  const [category, setCategory] = useState(initial?.category || 'supplies');
  const [vendor, setVendor] = useState(initial?.vendor || '');
  const [note, setNote] = useState(initial?.note || '');
  const [receiptUrl, setReceiptUrl] = useState(initial?.receiptUrl || '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ date, amount: amt, category, vendor, note, receiptUrl });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-600/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper-elev rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="text-lg font-semibold text-slate-900">
            {initial ? 'Edit expense' : 'New expense'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm font-medium text-left transition-colors ${
                    category === id
                      ? 'border-[#B07A4E] bg-[#B07A4E]/5 text-[#8A5D36]'
                      : 'border-line text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Vendor <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Costco, Massage Warehouse"
              maxLength={200}
              className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
              maxLength={1000}
              rows={2}
              className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Receipt link <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              maxLength={500}
              className="w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-1">
              Paste a link to where you saved the receipt photo (Drive, Dropbox, etc.). We don't host receipt files.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#B07A4E] hover:bg-[#8A5D36] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main view ─────────────────────────────────────────────────────────

const OtherExpenses = ({ startDate, endDate }) => {
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/expenses`, {
        params: { startDate, endDate },
        withCredentials: true,
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (payload) => {
    if (editing) {
      await axios.put(`${API_URL}/api/expenses/${editing._id}`, payload, { withCredentials: true });
    } else {
      await axios.post(`${API_URL}/api/expenses`, payload, { withCredentials: true });
    }
    setEditing(null);
    await fetchData();
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete this ${fmtMoney(expense.amountCents)} ${expense.category} expense?`)) return;
    try {
      await axios.delete(`${API_URL}/api/expenses/${expense._id}`, { withCredentials: true });
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Date', 'Category', 'Vendor', 'Amount ($)', 'Note', 'Receipt link']];
    for (const e of data.expenses) {
      rows.push([
        e.localDate,
        CATEGORY_BY_ID[e.category]?.label || e.category,
        `"${(e.vendor || '').replace(/"/g, '""')}"`,
        (e.amountCents / 100).toFixed(2),
        `"${(e.note || '').replace(/"/g, '""')}"`,
        `"${(e.receiptUrl || '').replace(/"/g, '""')}"`,
      ]);
    }
    rows.push([]);
    rows.push(['SUMMARY']);
    for (const c of CATEGORIES) {
      const cents = data.summary.byCategory[c.id] || 0;
      rows.push([c.label, '', '', (cents / 100).toFixed(2)]);
    }
    rows.push(['TOTAL', '', '', (data.summary.totalCents / 100).toFixed(2)]);

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grouped = data ? groupByMonth(data.expenses) : [];

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Total + per-category breakdown */}
      <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total in range</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              {data ? fmtMoney(data.summary.totalCents) : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {data ? `${data.summary.count} expense${data.summary.count !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B07A4E] hover:bg-[#8A5D36] text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add expense
            </button>
            <button
              onClick={exportCSV}
              disabled={!data || data.expenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#B07A4E] border border-[#B07A4E]/20 rounded-lg hover:bg-[#B07A4E]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {data && data.summary.count > 0 && (
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const cents = data.summary.byCategory[c.id] || 0;
              if (cents === 0) return null;
              const Icon = c.icon;
              return (
                <div
                  key={c.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper-deep border border-line text-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-600">{c.label}</span>
                  <span className="font-medium text-slate-900">{fmtMoney(cents)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : !data || data.expenses.length === 0 ? (
        <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-12 text-center">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No expenses in this range yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Hit "Add expense" to log your first one.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([monthKey, items]) => {
            const monthLabel = DateTime.fromFormat(monthKey, 'yyyy-MM').toFormat('LLLL yyyy');
            const monthTotal = items.reduce((sum, e) => sum + e.amountCents, 0);
            return (
              <div key={monthKey}>
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-slate-700">{monthLabel}</h3>
                  <span className="text-sm font-medium text-slate-600">{fmtMoney(monthTotal)}</span>
                </div>
                <div className="bg-paper-elev rounded-xl shadow-sm border border-line overflow-hidden">
                  {items.map((e, idx) => {
                    const cat = CATEGORY_BY_ID[e.category];
                    const Icon = cat?.icon || Sparkles;
                    return (
                      <div
                        key={e._id}
                        className={`flex items-center gap-3 p-4 ${idx > 0 ? 'border-t border-line' : ''}`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-paper-deep flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">
                              {e.vendor || cat?.label || 'Expense'}
                            </span>
                            <span className="text-xs text-slate-500">{fmtDate(e.localDate)}</span>
                            {e.vendor && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {cat?.label}
                              </span>
                            )}
                          </div>
                          {e.note && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{e.note}</p>
                          )}
                          {e.receiptUrl && (
                            <a
                              href={e.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#B07A4E] hover:text-[#8A5D36] mt-0.5"
                            >
                              <ExternalLink className="w-3 h-3" /> Receipt
                            </a>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold text-slate-900">{fmtMoney(e.amountCents)}</div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => { setEditing(e); setModalOpen(true); }}
                            className="p-1.5 text-slate-500 hover:text-[#B07A4E] hover:bg-paper-deep rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <ExpenseModal
          initial={editing}
          viewerTz={viewerTz}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default OtherExpenses;
