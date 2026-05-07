import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Clock, Save, CheckCircle, AlertCircle, MapPin, ExternalLink, Building2, Navigation } from 'lucide-react';

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
      isActive: false,
      kind: 'mobile',
      staticLocation: null,
    }))
  );
  const [savedLocations, setSavedLocations] = useState([]);
  const [staticLocations, setStaticLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const fetchTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const [templateRes, locationsRes] = await Promise.all([
        axios.get('/api/weekly-template', { withCredentials: true }),
        axios.get('/api/saved-locations', { withCredentials: true })
      ]);

      const locs = locationsRes.data;
      setSavedLocations(locs);
      // Static locations are saved locations tagged with the
      // isStaticLocation role — single source of truth.
      setStaticLocations((locs || []).filter(l => l.isStaticLocation));

      if (templateRes.data.length > 0) {
        const merged = DAY_NAMES.map((_, i) => {
          const serverDay = templateRes.data.find(d => d.dayOfWeek === i);
          if (serverDay) {
            const staticLocId = serverDay.staticLocation?._id || serverDay.staticLocation || null;
            return {
              dayOfWeek: i,
              startTime: serverDay.startTime,
              endTime: serverDay.endTime,
              isActive: serverDay.isActive,
              kind: serverDay.kind || 'mobile',
              staticLocation: staticLocId,
            };
          }
          return {
            dayOfWeek: i,
            startTime: DEFAULT_START,
            endTime: DEFAULT_END,
            isActive: false,
            kind: 'mobile',
            staticLocation: null,
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
    setDays(prev => prev.map(d => {
      if (d.dayOfWeek !== dayIndex) return d;
      return { ...d, isActive: !d.isActive };
    }));
    setSaved(false);
  };

  const handleTimeChange = (dayIndex, field, value) => {
    setDays(prev => prev.map(d => {
      if (d.dayOfWeek !== dayIndex) return d;
      return { ...d, [field]: value };
    }));
    setSaved(false);
  };

  const handleKindChange = (dayIndex, newKind) => {
    setDays(prev => prev.map(d => {
      if (d.dayOfWeek !== dayIndex) return d;
      if (newKind === 'static') {
        return { ...d, kind: 'static' };
      }
      return { ...d, kind: 'mobile', staticLocation: null };
    }));
    setSaved(false);
  };

  const handleStaticLocationChange = (dayIndex, locationId) => {
    setDays(prev => prev.map(d => {
      if (d.dayOfWeek !== dayIndex) return d;
      return { ...d, staticLocation: locationId || null };
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    for (const day of days) {
      if (!day.isActive) continue;
      if (day.endTime <= day.startTime) {
        setError(`${DAY_NAMES[day.dayOfWeek]}: End time must be after start time`);
        return;
      }
      if (day.kind === 'static' && !day.staticLocation) {
        setError(`${DAY_NAMES[day.dayOfWeek]}: Pick an in-studio location for this day.`);
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

  if (loading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500">Loading your weekly hours...</div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Your schedule</div>
          <h1 className="font-display" style={{ fontSize: "2rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Weekly hours
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            Set the hours you typically work each day. The Availability page
            uses this as the default and lets you adjust specific dates.
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
            <p className="text-sm">Template saved. Days generate as you (or a client) view the calendar.</p>
          </div>
        )}

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
            <Link to="/provider/locations" className="text-[#B07A4E] hover:underline flex items-center gap-1">
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

        {/* Day rows — flush with hairline dividers; active vs
            inactive carried by the toggle + opacity rather than a
            card border. */}
        <div>
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`py-4 border-b border-line-soft last:border-b-0 transition-opacity ${
                day.isActive ? '' : 'opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Toggle */}
                <button
                  onClick={() => handleToggleDay(day.dayOfWeek)}
                  className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                    day.isActive ? 'bg-[#B07A4E]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-paper-elev rounded-full shadow transition-transform ${
                      day.isActive ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>

                {/* Day name */}
                <span className={`w-12 text-sm font-medium ${
                  day.isActive ? 'text-slate-900' : 'text-slate-500'
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
                      className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className="text-slate-500 text-sm flex-shrink-0">to</span>
                    <select
                      value={day.endTime}
                      onChange={(e) => handleTimeChange(day.dayOfWeek, 'endTime', e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-[#B07A4E] focus:border-[#B07A4E]"
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500 italic">Not available</span>
                )}
              </div>

              {day.isActive && (
                <div className="mt-3 ml-[76px] space-y-2">
                  {/* Mobile vs In-studio mode toggle */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-slate-600 mr-1">Mode:</span>
                    <button
                      type="button"
                      onClick={() => handleKindChange(day.dayOfWeek, 'mobile')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        day.kind === 'mobile'
                          ? 'border-[#B07A4E] bg-[#B07A4E]/10 text-[#B07A4E] font-medium'
                          : 'border-line text-slate-600 hover:bg-paper-deep'
                      }`}
                    >
                      <Navigation className="w-3 h-3" /> Mobile
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKindChange(day.dayOfWeek, 'static')}
                      disabled={staticLocations.length === 0}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        day.kind === 'static'
                          ? 'border-[#B07A4E] bg-[#B07A4E]/10 text-[#B07A4E] font-medium'
                          : 'border-line text-slate-600 hover:bg-paper-deep'
                      } ${staticLocations.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={staticLocations.length === 0 ? 'Add an in-studio location first' : ''}
                    >
                      <Building2 className="w-3 h-3" /> In-studio
                    </button>
                  </div>

                  {/* Mode-specific config row */}
                  {day.kind === 'static' ? (
                    <div className="pl-3 border-l-2 border-line">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-[#B07A4E] flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-600 flex-shrink-0">
                          In-studio at:
                        </span>
                        {staticLocations.length > 0 ? (
                          <select
                            value={day.staticLocation || ''}
                            onChange={(e) => handleStaticLocationChange(day.dayOfWeek, e.target.value)}
                            className={`border rounded px-2 py-1 text-xs flex-1 min-w-0 bg-paper-elev focus:ring-[#B07A4E] focus:border-[#B07A4E] ${
                              !day.staticLocation ? 'border-red-300 bg-red-50' : 'border-line'
                            }`}
                          >
                            <option value="">— Pick a location —</option>
                            {staticLocations.map(loc => (
                              <option key={loc._id} value={loc._id}>{loc.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-amber-600">
                            <Link to="/provider/locations" className="underline">
                              Tag a saved location as in-studio
                            </Link> first
                          </span>
                        )}
                      </div>
                      {!day.staticLocation && staticLocations.length > 0 && (
                        <p className="mt-1 ml-5 text-xs text-red-500">
                          Required — bookings happen at this location
                        </p>
                      )}
                    </div>
                  ) : null}
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
            className={`inline-flex items-center px-6 py-2.5 rounded-lg text-white font-medium transition-colors ${
              saving
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-[#B07A4E] hover:bg-[#8A5D36]'
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
        <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
          <div className="flex items-start">
            <Clock className="w-5 h-5 text-teal-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-teal-800">
              <p className="font-medium mb-1">How this works</p>
              <ul className="list-disc ml-4 space-y-1 text-teal-700">
                <li>This template applies on demand — each day is generated the first time you or a client view that date</li>
                <li>You can edit or delete individual days from the Availability page</li>
                <li>Manual changes to a specific day always take priority</li>
                <li>Every active day requires a <strong>departure location</strong> — this is where you'll start from</li>
                <li>Drive time to clients is calculated from your departure location</li>
                <li>You can change your departure location for a specific day from the Availability page</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyTemplateEditor;
