import React, { useState, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Receipt, Car, DollarSign } from 'lucide-react';
import { AuthContext } from '../AuthContext';
import { tzOf } from '../utils/timeConstants';
import MileageReport from './MileageReport';
import OtherExpenses from './OtherExpenses';
import IncomeReport from './IncomeReport';

// ReportsPage (file is still ExpensesReport.js for git history) — the
// provider's one-stop tax-time view. Three tabs:
//   - Income: cash-basis income + transaction list + CSV export
//   - Mileage: existing IRS deductible-miles report
//   - Supplies & Other: existing logged expenses
//
// Wrapper owns the date range; all three tabs receive startDate/endDate
// as props and re-fetch on change. URL controls the default tab:
//   /provider/reports             → Income
//   /provider/reports?tab=income  → Income
//   /provider/reports?tab=mileage → Mileage (also reached via /provider/mileage)
//   /provider/reports?tab=expenses → Supplies (also reached via /provider/expenses)

const TABS = [
  { id: 'income',   label: 'Income',           icon: DollarSign },
  { id: 'mileage',  label: 'Mileage',          icon: Car },
  { id: 'supplies', label: 'Supplies & Other', icon: Receipt },
];

const ReportsPage = () => {
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);
  const location = useLocation();

  // Default tab driven by URL path and ?tab= query for back-compat
  // with /provider/mileage and /provider/expenses.
  const pickDefaultTab = () => {
    const params = new URLSearchParams(location.search);
    const qTab = params.get('tab');
    if (qTab && TABS.some(t => t.id === qTab)) return qTab;
    if (location.pathname.includes('mileage')) return 'mileage';
    if (location.pathname.includes('expenses')) return 'supplies';
    return 'income';
  };
  const [activeTab, setActiveTab] = useState(pickDefaultTab);

  useEffect(() => {
    setActiveTab(pickDefaultTab());
    // pickDefaultTab is a closure over `location` which IS in deps;
    // not declaring it explicitly to avoid the noise of memoizing a
    // tiny synchronous reader.
  }, [location.pathname, location.search]); // eslint-disable-line

  // Period — current month by default, anchored in the provider's TZ.
  const now = DateTime.now().setZone(viewerTz);
  const [startDate, setStartDate] = useState(now.startOf('month').toFormat('yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(now.endOf('month').toFormat('yyyy-MM-dd'));

  const setRange = (preset) => {
    const n = DateTime.now().setZone(viewerTz);
    switch (preset) {
      case 'thisMonth':
        setStartDate(n.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(n.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      case 'lastMonth': {
        const lm = n.minus({ months: 1 });
        setStartDate(lm.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(lm.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      }
      case 'thisQuarter':
        setStartDate(n.startOf('quarter').toFormat('yyyy-MM-dd'));
        setEndDate(n.endOf('quarter').toFormat('yyyy-MM-dd'));
        break;
      case 'lastQuarter': {
        const lq = n.minus({ quarters: 1 });
        setStartDate(lq.startOf('quarter').toFormat('yyyy-MM-dd'));
        setEndDate(lq.endOf('quarter').toFormat('yyyy-MM-dd'));
        break;
      }
      case 'thisYear':
        setStartDate(n.startOf('year').toFormat('yyyy-MM-dd'));
        setEndDate(n.endOf('year').toFormat('yyyy-MM-dd'));
        break;
      default:
        break;
    }
  };

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-4xl mx-auto px-3 sm:px-5 py-8">
        <div className="mb-6">
          <div className="av-eyebrow mb-2">For the taxman</div>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-card flex items-center justify-center"
              style={{ background: 'var(--accent-soft)' }}
            >
              <DollarSign className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1
                className="font-display"
                style={{ fontSize: '1.875rem', lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}
              >
                Reports
              </h1>
              <p className="text-sm text-ink-2 mt-0.5">
                Income, mileage, and supplies — everything you'll hand your CPA
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-line mb-5">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Report categories">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? 'border-[#B07A4E] text-[#B07A4E]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Date range — shared across all three tabs */}
        <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-5 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ['thisMonth', 'This Month'],
              ['lastMonth', 'Last Month'],
              ['thisQuarter', 'This Quarter'],
              ['lastQuarter', 'Last Quarter'],
              ['thisYear', 'This Year'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className="px-3 py-1.5 text-sm rounded-lg border border-line text-slate-600 hover:bg-paper-deep transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-slate-600 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-slate-600 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {activeTab === 'income' && <IncomeReport startDate={startDate} endDate={endDate} />}
        {activeTab === 'mileage' && <MileageReport startDate={startDate} endDate={endDate} embedded />}
        {activeTab === 'supplies' && <OtherExpenses startDate={startDate} endDate={endDate} />}
      </div>
    </div>
  );
};

export default ReportsPage;
