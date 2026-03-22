import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Clock, Save, CheckCircle, AlertCircle, MapPin, ExternalLink } from 'lucide-react';

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

const FORECAST_OPTIONS = [
  { value: 1, label: '1 week' },
  { value: 2, label: '2 weeks' },
  { value: 4, label: '4 weeks' },
  { value: 6, label: '6 weeks' },
  { value: 8, label: '8 weeks' },
  { value: 12, label: '12 weeks' },
];

const WeeklyTemplateEditor = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [days, setDays] = useState(
    DAY_NAMES.map((_, i) => ({
      dayOfWeek: i,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      isActive: false,
      anchor: { locationId: null, startTime: DEFAULT_START, endTime: DEFAULT_END }
    }))
  );
  const [savedLocations, setSavedLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [forecastWeeks, setForecastWeeks] = useState(4);

  const fetchTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const [templateRes, locationsRes] = await Promise.all([
        axios.get('/api/weekly-template', { withCredentials: true }),
        axios.get('/api/saved-locations', { withCredentials: true })
      ]);

      setSavedLocations(locationsRes.data);

      if (templateRes.data.length > 0) {
        const merged = DAY_NAMES.map((_, i) => {
          const serverDay = templateRes.data.find(d => d.dayOfWeek === i);
          if (serverDay) {
            return {
              dayOfWeek: i,
              startTime: serverDay.startTime,
              endTime: serverDay.endTime,
              isActive: serverDay.isActive,
              anchor: {
                locationId: serverDay.anchor?.locationId?._id || serverDay.anchor?.locationId || null,
                startTime: serverDay.anchor?.startTime || serverDay.startTime,
                endTime: serverDay.anchor?.endTime || serverDay.endTime
              }
            };
          }
          return {
            dayOfWeek: i,
            startTime: DEFAULT_START,
            endTime: DEFAULT_END,
            isActive: false,
            anchor: { locationId: null, startTime: DEFAULT_START, endTime: DEFAULT_END }
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

  const handleAnchorChange = (dayIndex, field, value) => {
    setDays(prev => prev.map(d => {
      if (d.dayOfWeek !== dayIndex) return d;
      return {
        ...d,
        anchor: { ...d.anchor, [field]: value }
      };
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    for (const day of days) {
      if (day.isActive && day.endTime <= day.startTime) {
        setError(`${DAY_NAMES[day.dayOfWeek]}: End time must be after start time`);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      await axios.put('/api/weekly-template', { days, forecastWeeks }, { withCredentials: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset) => {
    let activeDays;
    switch (preset) {
      case 'weekdays': activeDays = [1, 2, 3, 4, 5]; break;
      case 'mwf': activeDays = [1, 3, 5]; break;
      case 'tth': activeDays = [2, 4]; break;
      default: return;
    }
    setDays(prev => prev.map(d => ({
      ...d,
      isActive: activeDays.includes(d.dayOfWeek)
    })));
    setSaved(false);
  };

  const getLocationName = (locationId) => {
    const loc = savedLocations.find(l => l._id === locationId);
    return loc ? loc.name : '';
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
            Set your recurring weekly availability and anchor locations.
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
            <p className="text-sm">Template saved. Availability generated {forecastWeeks} weeks out.</p>
          </div>
        )}

        {/* Forecast duration */}
        <div className="mb-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            How far ahead should this schedule be generated?
          </label>
          <div className="flex flex-wrap gap-2">
            {FORECAST_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setForecastWeeks(opt.value); setSaved(false); }}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  forecastWeeks === opt.value
                    ? 'bg-[#009ea5] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Locations link */}
        {savedLocations.length === 0 ? (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>No saved locations yet.</span>
              <Link to="/provider/locations" className="font-medium underline hover:text-amber-900">
                Add locations
              </Link>
              <span>to assign them to days.</span>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <MapPin className="w-4 h-4" />
            <span>{savedLocations.length} saved location{savedLocations.length !== 1 ? 's' : ''}</span>
            <Link to="/provider/locations" className="text-[#009ea5] hover:underline flex items-center gap-1">
              Manage <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Quick presets */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-sm text-slate-500 self-center mr-1">Quick set:</span>
          {[['weekdays', 'Mon\u2013Fri'], ['mwf', 'Mon/Wed/Fri'], ['tth', 'Tue/Thu']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Day rows */}
        <div className="space-y-2">
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`p-3 rounded-lg border transition-colors ${
                day.isActive
                  ? 'bg-white border-[#009ea5]/30 shadow-sm'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
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

              {/* Anchor location assignment */}
              {day.isActive && (
                <div className="mt-3 ml-[76px] p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-600 flex-shrink-0">Anchor:</span>
                    <select
                      value={day.anchor.locationId || ''}
                      onChange={(e) => handleAnchorChange(day.dayOfWeek, 'locationId', e.target.value || null)}
                      className="border border-slate-200 rounded px-2 py-1 text-xs flex-1 min-w-0 bg-white focus:ring-[#009ea5] focus:border-[#009ea5]"
                    >
                      <option value="">No anchor (mobile day)</option>
                      {savedLocations.map(loc => (
                        <option key={loc._id} value={loc._id}>
                          {loc.name}{loc.isHomeBase ? ' (Home)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Anchor time range */}
                  {day.anchor.locationId && (
                    <div className="mt-2 flex items-center gap-2 ml-5">
                      <span className="text-xs text-amber-600 flex-shrink-0">At location:</span>
                      <select
                        value={day.anchor.startTime}
                        onChange={(e) => handleAnchorChange(day.dayOfWeek, 'startTime', e.target.value)}
                        className="border border-amber-200 rounded px-1.5 py-0.5 text-xs bg-amber-50 flex-1 min-w-0"
                      >
                        {TIME_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">to</span>
                      <select
                        value={day.anchor.endTime}
                        onChange={(e) => handleAnchorChange(day.dayOfWeek, 'endTime', e.target.value)}
                        className="border border-amber-200 rounded px-1.5 py-0.5 text-xs bg-amber-50 flex-1 min-w-0"
                      >
                        {TIME_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
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
                <li>This template generates availability <strong>{forecastWeeks} weeks</strong> into the future</li>
                <li>You can edit or delete individual days from the Availability page</li>
                <li>Manual changes to a specific day always take priority</li>
                <li><strong>Anchor locations</strong> block off time on your calendar for that location</li>
                <li>Drive time calculates from your anchor location on anchored days</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyTemplateEditor;
