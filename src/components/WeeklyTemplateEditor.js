import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Clock, Save, CheckCircle, AlertCircle } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

const WeeklyTemplateEditor = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [days, setDays] = useState(
    DAY_NAMES.map((_, i) => ({
      dayOfWeek: i,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      isActive: false
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const fetchTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/weekly-template', { withCredentials: true });
      if (res.data.length > 0) {
        // Merge server data with default structure
        const merged = DAY_NAMES.map((_, i) => {
          const serverDay = res.data.find(d => d.dayOfWeek === i);
          if (serverDay) {
            return {
              dayOfWeek: i,
              startTime: serverDay.startTime,
              endTime: serverDay.endTime,
              isActive: serverDay.isActive
            };
          }
          return {
            dayOfWeek: i,
            startTime: DEFAULT_START,
            endTime: DEFAULT_END,
            isActive: false
          };
        });
        setDays(merged);
      }
    } catch (err) {
      console.error('Error fetching template:', err);
      setError('Failed to load your schedule template');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    fetchTemplate();
  }, [user, navigate, fetchTemplate]);

  const handleToggleDay = (dayIndex) => {
    setDays(prev => prev.map(d =>
      d.dayOfWeek === dayIndex ? { ...d, isActive: !d.isActive } : d
    ));
    setSaved(false);
  };

  const handleTimeChange = (dayIndex, field, value) => {
    setDays(prev => prev.map(d =>
      d.dayOfWeek === dayIndex ? { ...d, [field]: value } : d
    ));
    setSaved(false);
  };

  const handleSave = async () => {
    // Validate active days
    for (const day of days) {
      if (day.isActive && day.endTime <= day.startTime) {
        setError(`${DAY_NAMES[day.dayOfWeek]}: End time must be after start time`);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      await axios.put('/api/weekly-template', { days }, { withCredentials: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // Quick preset buttons
  const applyPreset = (preset) => {
    let activeDays;
    switch (preset) {
      case 'weekdays':
        activeDays = [1, 2, 3, 4, 5]; // Mon-Fri
        break;
      case 'mwf':
        activeDays = [1, 3, 5]; // Mon, Wed, Fri
        break;
      case 'tth':
        activeDays = [2, 4]; // Tue, Thu
        break;
      default:
        return;
    }
    setDays(prev => prev.map(d => ({
      ...d,
      isActive: activeDays.includes(d.dayOfWeek)
    })));
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading schedule template...</div>
      </div>
    );
  }

  return (
    <div className="pt-16">
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Weekly Schedule Template</h1>
          <p className="text-sm text-slate-500 mt-1">
            Set your recurring weekly availability. This template auto-fills your calendar
            each week. You can still override individual days.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700 flex items-start rounded">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {saved && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700 flex items-start rounded">
            <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm">Template saved. Future dates will use this schedule.</p>
          </div>
        )}

        {/* Quick presets */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-sm text-slate-500 self-center mr-1">Quick set:</span>
          <button
            onClick={() => applyPreset('weekdays')}
            className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
          >
            Mon–Fri
          </button>
          <button
            onClick={() => applyPreset('mwf')}
            className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
          >
            Mon/Wed/Fri
          </button>
          <button
            onClick={() => applyPreset('tth')}
            className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
          >
            Tue/Thu
          </button>
        </div>

        {/* Day rows */}
        <div className="space-y-2">
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                day.isActive
                  ? 'bg-white border-[#009ea5]/30 shadow-sm'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => handleToggleDay(day.dayOfWeek)}
                className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                  day.isActive ? 'bg-[#009ea5]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    day.isActive ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>

              {/* Day name */}
              <span className={`w-12 text-sm font-medium ${
                day.isActive ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {/* Show short name on mobile, full on desktop */}
                <span className="hidden sm:inline">{DAY_NAMES[day.dayOfWeek]}</span>
                <span className="sm:hidden">{DAY_SHORT[day.dayOfWeek]}</span>
              </span>

              {/* Time selectors */}
              {day.isActive ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <select
                    value={day.startTime}
                    onChange={(e) => handleTimeChange(day.dayOfWeek, 'startTime', e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-[#009ea5] focus:border-[#009ea5]"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="text-slate-400 text-sm flex-shrink-0">to</span>
                  <select
                    value={day.endTime}
                    onChange={(e) => handleTimeChange(day.dayOfWeek, 'endTime', e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-[#009ea5] focus:border-[#009ea5]"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-slate-400 italic">Not available</span>
              )}
            </div>
          ))}
        </div>

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center px-6 py-2.5 rounded-md text-white font-medium transition-colors ${
              saving
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-[#009ea5] hover:bg-[#008a91]'
            }`}
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Template
              </>
            )}
          </button>
        </div>

        {/* Info box */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start">
            <Clock className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How this works</p>
              <ul className="list-disc ml-4 space-y-1 text-blue-700">
                <li>This template automatically creates availability for future dates</li>
                <li>Availability is generated when you or a client views a date</li>
                <li>You can still edit or delete individual days from the Availability page</li>
                <li>Manual changes to a specific day always take priority over the template</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyTemplateEditor;
