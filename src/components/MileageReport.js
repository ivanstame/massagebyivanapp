import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import axios from 'axios';
import { DateTime } from 'luxon';
import {
  Car,
  Download,
  Calendar,
  MapPin,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Home,
  AlertCircle,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

const MileageReport = () => {
  const { user } = useContext(AuthContext);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDays, setExpandedDays] = useState({});

  // Default: current month
  const now = DateTime.now().setZone('America/Los_Angeles');
  const [startDate, setStartDate] = useState(now.startOf('month').toFormat('yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(now.endOf('month').toFormat('yyyy-MM-dd'));

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/bookings/mileage-report`, {
        params: { startDate, endDate },
        withCredentials: true,
      });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load mileage report');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (date) => {
    setExpandedDays((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  // Quick range presets
  const setRange = (preset) => {
    const n = DateTime.now().setZone('America/Los_Angeles');
    switch (preset) {
      case 'thisMonth':
        setStartDate(n.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(n.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      case 'lastMonth':
        const lm = n.minus({ months: 1 });
        setStartDate(lm.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(lm.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      case 'thisQuarter':
        const qStart = n.startOf('quarter');
        setStartDate(qStart.toFormat('yyyy-MM-dd'));
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

  const exportCSV = () => {
    if (!report) return;

    const rows = [['Date', 'From', 'To', 'Miles', 'Deductible', 'Deduction ($)']];
    for (const day of report.days) {
      for (const leg of day.legs) {
        rows.push([
          day.date,
          `"${leg.from}"`,
          `"${leg.to}"`,
          leg.miles.toFixed(2),
          leg.isDeductible ? 'Yes' : 'No',
          leg.isDeductible ? (leg.miles * report.irsRate).toFixed(2) : '0.00',
        ]);
      }
    }

    // Summary row
    rows.push([]);
    rows.push(['SUMMARY']);
    rows.push(['Total Miles', report.summary.totalMiles.toFixed(2)]);
    rows.push(['Deductible Miles', report.summary.deductibleMiles.toFixed(2)]);
    rows.push(['Non-Deductible Miles', report.summary.nonDeductibleMiles.toFixed(2)]);
    rows.push(['IRS Rate ($/mile)', report.irsRate.toFixed(2)]);
    rows.push(['Estimated Deduction', `$${report.summary.estimatedDeduction.toFixed(2)}`]);
    rows.push(['Home Office', report.hasHomeOffice ? 'Yes' : 'No']);

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mileage-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (d) => DateTime.fromFormat(d, 'yyyy-MM-dd').toFormat('EEE, MMM d');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pt-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#B07A4E]/10 flex items-center justify-center">
          <Car className="w-5 h-5 text-[#B07A4E]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mileage Report</h1>
          <p className="text-sm text-slate-500">Track driving miles for tax deductions</p>
        </div>
      </div>

      {/* Date Range & Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
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
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all duration-200"
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
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="w-full sm:w-auto bg-[#B07A4E] hover:bg-[#8A5D36] text-white font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {report && (
        <>
          {/* Home Office Notice */}
          <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${
            report.hasHomeOffice
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <Home className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              report.hasHomeOffice ? 'text-green-600' : 'text-amber-600'
            }`} />
            <div>
              <p className={`font-medium ${report.hasHomeOffice ? 'text-green-800' : 'text-amber-800'}`}>
                Home Office: {report.hasHomeOffice ? 'Yes' : 'No'}
              </p>
              <p className={`text-sm ${report.hasHomeOffice ? 'text-green-600' : 'text-amber-600'}`}>
                {report.hasHomeOffice
                  ? 'All miles (including home to first client and last client to home) are deductible.'
                  : 'First and last trips of each day (home ↔ client) are commuting miles and not deductible.'}
              </p>
              {!report.hasHomeOffice && (
                <p className="text-sm text-amber-500 mt-1">
                  Toggle home office in Provider Settings to change this.
                </p>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Miles', value: report.summary.totalMiles.toFixed(1), icon: Car },
              { label: 'Deductible', value: report.summary.deductibleMiles.toFixed(1), icon: TrendingUp, highlight: true },
              { label: 'Days', value: report.summary.totalDays, icon: Calendar },
              { label: 'Est. Deduction', value: `$${report.summary.estimatedDeduction.toFixed(0)}`, icon: TrendingUp, highlight: true },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon className={`w-4 h-4 ${card.highlight ? 'text-[#B07A4E]' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-500">{card.label}</span>
                </div>
                <p className={`text-xl font-bold ${card.highlight ? 'text-[#B07A4E]' : 'text-slate-900'}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          {/* IRS Rate Note */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              IRS standard rate: ${report.irsRate}/mile ({new Date().getFullYear()})
            </p>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#B07A4E] border border-[#B07A4E]/20 rounded-xl hover:bg-[#B07A4E]/5 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Daily Breakdown */}
          {report.days.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No appointments found in this date range.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.days.map((day) => (
                <div
                  key={day.date}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                >
                  {/* Day Header */}
                  <button
                    onClick={() => toggleDay(day.date)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-800">{fmtDate(day.date)}</span>
                      <span className="text-sm text-slate-400">{day.appointments} appt{day.appointments !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-[#B07A4E]">
                          {day.deductibleMiles.toFixed(1)} mi
                        </span>
                        {day.totalMiles !== day.deductibleMiles && (
                          <span className="text-xs text-slate-400 ml-2">
                            / {day.totalMiles.toFixed(1)} total
                          </span>
                        )}
                      </div>
                      {expandedDays[day.date] ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Legs */}
                  {expandedDays[day.date] && (
                    <div className="border-t border-slate-100 px-5 py-3 space-y-2">
                      {day.legs.map((leg, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                            leg.isDeductible ? 'bg-green-50/50' : 'bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${
                              leg.isDeductible ? 'text-green-500' : 'text-slate-400'
                            }`} />
                            <span className="text-sm text-slate-600 truncate">
                              {leg.from}
                            </span>
                            <span className="text-slate-300 flex-shrink-0">→</span>
                            <span className="text-sm text-slate-600 truncate">
                              {leg.to}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                            <span className={`text-sm font-medium ${
                              leg.isDeductible ? 'text-green-700' : 'text-slate-400'
                            }`}>
                              {leg.miles.toFixed(1)} mi
                            </span>
                            {!leg.isDeductible && (
                              <span className="text-xs bg-slate-200 text-slate-500 rounded-full px-2 py-0.5">
                                commute
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end pt-2 border-t border-slate-100">
                        <span className="text-sm text-slate-500">
                          Day deduction: <span className="font-semibold text-[#B07A4E]">${day.deduction.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MileageReport;
