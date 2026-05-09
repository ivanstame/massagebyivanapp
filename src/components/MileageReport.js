import React, { useState, useEffect, useCallback } from 'react';
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

// MileageReport renders the mileage breakdown for a date range. The
// range is owned by the parent (ExpensesReport wrapper) so both the
// mileage tab and the supplies-and-other tab share one period
// selector. When called without a range it falls back to the current
// month so legacy URLs that hit it directly still work.
const MileageReport = ({ startDate: startDateProp, endDate: endDateProp, embedded = false }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDays, setExpandedDays] = useState({});

  const startDate = startDateProp || DateTime.now().startOf('month').toFormat('yyyy-MM-dd');
  const endDate = endDateProp || DateTime.now().endOf('month').toFormat('yyyy-MM-dd');

  const fetchReport = useCallback(async () => {
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
  }, [startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const toggleDay = (date) => {
    setExpandedDays((prev) => ({ ...prev, [date]: !prev[date] }));
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

  // When embedded inside ExpensesReport, the wrapper provides the page
  // chrome (header, range picker). Strip MileageReport's own chrome in
  // that case so we don't render two of everything.
  const inner = (
    <>
      {loading && (
        <div className="text-center py-6 text-slate-500">Loading…</div>
      )}

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
              <p className="text-xs text-slate-500 mt-1">
                Long gaps between bookings (≥ 2 hours) include an estimated round trip home, shown as dashed amber rows.
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
              <div key={i} className="bg-paper-elev rounded-xl shadow-sm border border-line p-4">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon className={`w-4 h-4 ${card.highlight ? 'text-[#B07A4E]' : 'text-slate-500'}`} />
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
            <p className="text-sm text-slate-500">
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
            <div className="bg-paper-elev rounded-xl shadow-sm border border-line p-8 text-center">
              <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No appointments found in this date range.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.days.map((day) => (
                <div
                  key={day.date}
                  className="bg-paper-elev rounded-xl shadow-sm border border-line overflow-hidden"
                >
                  {/* Day Header */}
                  <button
                    onClick={() => toggleDay(day.date)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-paper-deep transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-800">{fmtDate(day.date)}</span>
                      <span className="text-sm text-slate-500">{day.appointments} appt{day.appointments !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-[#B07A4E]">
                          {day.deductibleMiles.toFixed(1)} mi
                        </span>
                        {day.totalMiles !== day.deductibleMiles && (
                          <span className="text-xs text-slate-500 ml-2">
                            / {day.totalMiles.toFixed(1)} total
                          </span>
                        )}
                      </div>
                      {expandedDays[day.date] ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Legs */}
                  {expandedDays[day.date] && (
                    <div className="border-t border-line-soft px-5 py-3 space-y-2">
                      {day.legs.map((leg, i) => {
                        // Gap-trip legs are auto-inserted estimates of
                        // a return-home round trip during long idle
                        // gaps between bookings. Render with dashed
                        // amber styling so the provider knows they're
                        // estimates, not booked appointments.
                        const isGap = leg.gapTrip;
                        const gapMin = leg.gapMinutes || 0;
                        const gapH = Math.floor(gapMin / 60);
                        const gapM = gapMin % 60;
                        const gapLabel = gapH > 0
                          ? (gapM > 0 ? `${gapH}h ${gapM}m` : `${gapH}h`)
                          : `${gapM}m`;
                        return (
                          <div
                            key={i}
                            className={
                              isGap
                                ? 'py-2 px-3 rounded-lg bg-amber-50/60 border border-dashed border-amber-300'
                                : `flex items-center justify-between py-2 px-3 rounded-lg ${
                                    leg.isDeductible ? 'bg-green-50/50' : 'bg-paper-deep'
                                  }`
                            }
                          >
                            {isGap && (
                              <div className="text-[10px] uppercase tracking-wide font-medium text-amber-700 mb-1">
                                Estimated return home · {gapLabel} gap
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${
                                  isGap ? 'text-amber-500'
                                    : (leg.isDeductible ? 'text-green-500' : 'text-slate-500')
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
                                  isGap ? 'text-amber-700'
                                    : (leg.isDeductible ? 'text-green-700' : 'text-slate-500')
                                }`}>
                                  {leg.miles.toFixed(1)} mi
                                </span>
                                {!leg.isDeductible && !isGap && (
                                  <span className="text-xs bg-slate-200 text-slate-500 rounded-full px-2 py-0.5">
                                    commute
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-end pt-2 border-t border-line-soft">
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
    </>
  );

  if (embedded) return inner;

  // Standalone fallback for any direct hit on /provider/mileage that
  // isn't routed through the wrapper.
  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-4xl mx-auto px-3 sm:px-5 py-8">
        {inner}
      </div>
    </div>
  );
};

export default MileageReport;
