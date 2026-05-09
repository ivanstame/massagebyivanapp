import React, { useState, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Receipt, Car } from 'lucide-react';
import { AuthContext } from '../AuthContext';
import { tzOf } from '../utils/timeConstants';
import MileageReport from './MileageReport';
import OtherExpenses from './OtherExpenses';

// ExpensesReport — single page where the provider sees both Mileage
// and Supplies & Other expenses for a unified date range. The wrapper
// owns the period selector; both tabs receive startDate/endDate as
// props and re-fetch on change.

const TABS = [
  { id: 'mileage',  label: 'Mileage',           icon: Car },
  { id: 'supplies', label: 'Supplies & Other',  icon: Receipt },
];

const ExpensesReport = () => {
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);
  const location = useLocation();

  // Default tab driven by URL — /provider/mileage opens with the
  // mileage tab selected so the legacy URL still feels like "Mileage."
  // /provider/expenses opens with supplies (the new feature).
  const defaultTab = location.pathname.includes('mileage') ? 'mileage' : 'supplies';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Period — current month by default, anchored in the provider's TZ.
  const now = DateTime.now().setZone(viewerTz);
  const [startDate, setStartDate] = useState(now.startOf('month').toFormat('yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(now.endOf('month').toFormat('yyyy-MM-dd'));

  // If the URL changes between /provider/mileage and /provider/expenses
  // without a remount, swap the active tab to match.
  useEffect(() => {
    setActiveTab(location.pathname.includes('mileage') ? 'mileage' : 'supplies');
  }, [location.pathname]);

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
              <Receipt className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1
                className="font-display"
                style={{ fontSize: '1.875rem', lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}
              >
                Expenses
              </h1>
              <p className="text-sm text-ink-2 mt-0.5">
                Mileage and supply costs for tax-time record-keeping
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-line mb-5">
          <nav className="flex gap-1" aria-label="Expense categories">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

        {/* Date range — shared across tabs */}
        <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-5 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ['thisMonth', 'This Month'],
              ['lastMonth', 'Last Month'],
              ['thisQuarter', 'This Quarter'],
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

        {activeTab === 'mileage' ? (
          <MileageReport startDate={startDate} endDate={endDate} embedded />
        ) : (
          <OtherExpenses startDate={startDate} endDate={endDate} />
        )}
      </div>
    </div>
  );
};

export default ExpensesReport;
