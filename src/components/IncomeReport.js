import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import {
  Download, AlertCircle, DollarSign, TrendingUp, TrendingDown, Receipt,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

const METHOD_LABEL = {
  cash: 'Cash',
  check: 'Check',
  paymentApp: 'Payment app',
  card: 'Card',
  package: 'Package',
};

const TYPE_COLORS = {
  'Service': 'text-slate-800',
  'Tip': 'text-emerald-700',
  'Package sale': 'text-[#8A5D36]',
  'Package redemption': 'text-slate-400',
  'Refund': 'text-red-700',
  'Package refund': 'text-red-700',
  'Stripe fee': 'text-slate-500',
};

const fmt = (n) => {
  const v = Number(n || 0);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d) => DateTime.fromJSDate(new Date(d)).toFormat('M/d');

const IncomeReport = ({ startDate, endDate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/bookings/income-transactions`, {
        params: { startDate, endDate },
        withCredentials: true,
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load income report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build a tax-CPA-ready CSV: every transaction as a row, summary
  // footer with per-method subtotals + grand totals + stripe fees +
  // sessions delivered.
  const exportCSV = () => {
    if (!data) return;
    const rows = [['Date', 'Type', 'Method', 'Client', 'Description', 'Amount', 'Stripe fee', 'Notes']];
    for (const t of data.transactions) {
      rows.push([
        DateTime.fromJSDate(new Date(t.date)).toFormat('yyyy-MM-dd'),
        t.type,
        METHOD_LABEL[t.method] || t.method,
        `"${(t.client || '').replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        Number(t.amount || 0).toFixed(2),
        Number(t.stripeFee || 0).toFixed(2),
        `"${(t.notes || '').replace(/"/g, '""')}"`,
      ]);
    }
    rows.push([]);
    rows.push(['SUMMARY']);
    rows.push(['Income total', '', '', '', '', Number(data.summary.incomeTotal || 0).toFixed(2)]);
    rows.push(['  Booking payments', '', '', '', '', Number(data.summary.bookingPayments || 0).toFixed(2)]);
    rows.push(['  Tips', '', '', '', '', Number(data.summary.tips || 0).toFixed(2)]);
    rows.push(['  Package sales', '', '', '', '', Number(data.summary.packageSales || 0).toFixed(2)]);
    if (data.summary.refunds > 0) {
      rows.push(['  Less refunds', '', '', '', '', `-${Number(data.summary.refunds || 0).toFixed(2)}`]);
    }
    rows.push([]);
    rows.push(['By method']);
    for (const m of Object.keys(METHOD_LABEL)) {
      if (m === 'package') continue;
      const v = data.summary.byMethod?.[m] || 0;
      if (v > 0) rows.push([`  ${METHOD_LABEL[m]}`, '', '', '', '', Number(v).toFixed(2)]);
    }
    rows.push([]);
    rows.push(['Stripe fees (deductible expense)', '', '', '', '', Number(data.summary.stripeFees || 0).toFixed(2)]);
    rows.push(['Sessions delivered (cash-paid)', '', '', '', data.summary.sessionsDelivered]);
    rows.push(['Sessions redeemed from packages (no new income)', '', '', '', data.summary.sessionsRedeemedFromPackage]);

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-500">Loading…</div>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <span className="text-red-700">{error}</span>
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;
  const hasTransactions = data.transactions && data.transactions.length > 0;

  return (
    <div className="space-y-5">
      {/* Headline + totals card */}
      <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-6">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <p className="av-eyebrow text-accent">Income in range</p>
            <p className="font-display mt-1" style={{ fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {fmt(s.incomeTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Cash-basis. Schedule C-ready.
            </p>
          </div>
          <button
            onClick={exportCSV}
            disabled={!hasTransactions}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B07A4E] hover:bg-[#8A5D36] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Per-source breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="bg-paper-deep rounded-lg p-3 border border-line">
            <div className="text-xs uppercase tracking-wide text-slate-500">Bookings</div>
            <div className="text-lg font-semibold text-slate-900 mt-1">{fmt(s.bookingPayments)}</div>
          </div>
          <div className="bg-paper-deep rounded-lg p-3 border border-line">
            <div className="text-xs uppercase tracking-wide text-slate-500">Tips</div>
            <div className="text-lg font-semibold text-slate-900 mt-1">{fmt(s.tips)}</div>
          </div>
          <div className="bg-paper-deep rounded-lg p-3 border border-line">
            <div className="text-xs uppercase tracking-wide text-slate-500">Package sales</div>
            <div className="text-lg font-semibold text-slate-900 mt-1">{fmt(s.packageSales)}</div>
          </div>
        </div>

        {/* By method chips */}
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">By method</div>
          <div className="flex flex-wrap gap-2">
            {['cash', 'check', 'paymentApp', 'card'].map(m => {
              const v = s.byMethod?.[m] || 0;
              if (v <= 0) return null;
              return (
                <div key={m} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper-deep border border-line text-sm">
                  <span className="text-slate-600">{METHOD_LABEL[m]}</span>
                  <span className="font-medium text-slate-900">{fmt(v)}</span>
                </div>
              );
            })}
            {Object.values(s.byMethod || {}).every(v => !v || v <= 0) && (
              <span className="text-xs text-slate-500">No payments collected in this range</span>
            )}
          </div>
        </div>

        {/* Refunds + fees + session counts */}
        {(s.refunds > 0 || s.stripeFees > 0 || s.sessionsRedeemedFromPackage > 0) && (
          <div className="mt-4 pt-4 border-t border-line space-y-1 text-xs text-slate-600">
            {s.refunds > 0 && (
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                <span>Refunds issued: <span className="font-medium text-red-700">{fmt(s.refunds)}</span> (already subtracted from income)</span>
              </div>
            )}
            {s.stripeFees > 0 && (
              <div className="flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-500" />
                <span>Stripe processor fees: <span className="font-medium">{fmt(s.stripeFees)}</span> (deductible expense — not subtracted from income above)</span>
              </div>
            )}
            {s.sessionsRedeemedFromPackage > 0 && (
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                <span>{s.sessionsRedeemedFromPackage} session{s.sessionsRedeemedFromPackage === 1 ? '' : 's'} redeemed from packages (commitment fulfilled, no new income)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="bg-paper-elev rounded-xl shadow-sm border border-line">
        <div className="px-5 py-3 border-b border-line">
          <p className="text-sm font-semibold text-slate-900">Transactions</p>
          <p className="text-xs text-slate-500 mt-0.5">Every income event in the selected range, in chronological order.</p>
        </div>
        {!hasTransactions ? (
          <div className="p-12 text-center">
            <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No transactions in this range</p>
            <p className="text-sm text-slate-500 mt-1">Try widening the date range above.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {data.transactions.map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="w-12 text-xs text-slate-500 flex-shrink-0">{fmtDate(t.date)}</div>
                <div className="w-32 flex-shrink-0">
                  <span className={`text-xs font-medium ${TYPE_COLORS[t.type] || 'text-slate-700'}`}>
                    {t.type}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 truncate">{t.client}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {t.description}
                    {t.method && ` · ${METHOD_LABEL[t.method] || t.method}`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-medium ${
                    t.type === 'Stripe fee' ? 'text-slate-500'
                    : t.amount < 0 ? 'text-red-700'
                    : t.type === 'Package redemption' ? 'text-slate-400'
                    : 'text-slate-900'
                  }`}>
                    {t.type === 'Stripe fee'
                      ? `-${fmt(t.stripeFee)} fee`
                      : t.type === 'Package redemption' ? '— ' : fmt(t.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomeReport;
