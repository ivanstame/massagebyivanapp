import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { CheckCircle, Clock, Settings, Edit2, Check } from 'lucide-react';

const PRESSURE_OPTIONS = [
  { value: 'light', label: 'Light', hint: 'Relaxation, gentle touch' },
  { value: 'medium', label: 'Medium', hint: 'Balanced pressure' },
  { value: 'firm', label: 'Firm', hint: 'Targeted muscle work' },
  { value: 'deep', label: 'Deep', hint: 'Intense, may cause soreness' },
];

const AREA_OPTIONS = [
  'Head', 'Neck', 'Shoulders', 'Upper back', 'Lower back',
  'Arms', 'Hands', 'Hips', 'Legs', 'Feet'
];

const ProviderPreferences = ({ formData, onChange }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-semibold text-slate-900">Business Settings</h3>

    {/* Scheduling Preferences */}
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#B07A4E]" />
        <h4 className="font-medium text-slate-900">Scheduling Settings</h4>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Default Appointment Duration
          </label>
          <select
            value={formData.defaultDuration || 60}
            onChange={(e) => onChange('defaultDuration', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Buffer Time Between Appointments
          </label>
          <select
            value={formData.bufferTime || 15}
            onChange={(e) => onChange('bufferTime', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Advance Booking Window
          </label>
          <select
            value={formData.advanceBooking || 30}
            onChange={(e) => onChange('advanceBooking', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={30}>1 month</option>
            <option value={60}>2 months</option>
          </select>
        </div>
      </div>
    </div>

    {/* Service Settings */}
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-[#B07A4E]" />
        <h4 className="font-medium text-slate-900">Service Settings</h4>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Available Services
          </label>
          <div className="space-y-2">
            {['Swedish Massage', 'Deep Tissue', 'Sports Massage', 'Prenatal Massage'].map(service => (
              <label key={service} className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.services?.includes(service)}
                  onChange={(e) => {
                    const services = formData.services || [];
                    if (e.target.checked) {
                      onChange('services', [...services, service]);
                    } else {
                      onChange('services', services.filter(s => s !== service));
                    }
                  }}
                  className="form-checkbox h-5 w-5 text-[#B07A4E]"
                />
                <span className="text-slate-700">{service}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Travel Fee (per mile)
          </label>
          <div className="relative mt-1 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-slate-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              step="0.50"
              min="0"
              value={formData.travelFee || 0}
              onChange={(e) => onChange('travelFee', parseFloat(e.target.value))}
              className="block w-full rounded-lg pl-7 pr-12 focus:border-[#B07A4E] focus:ring-[#B07A4E] sm:text-sm"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ProgressIndicator = ({ currentStep }) => (
  <div className="mb-8 w-full max-w-4xl">
    <div className="flex justify-between mb-2">
      <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Account
      </div>
      <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Profile
      </div>
      <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Preferences
      </div>
    </div>
    <div className="h-1 bg-slate-100 rounded-full">
      <div
        className="h-full bg-[#B07A4E] rounded-full transition-all duration-500"
        style={{ width: `${(currentStep / 3) * 100}%` }}
      />
    </div>
  </div>
);

const ChipGroup = ({ options, selected, onToggle, disabled, variant }) => {
  const styles = variant === 'avoid'
    ? {
        on: 'bg-red-50 border-red-300 text-red-700',
        off: 'bg-paper-elev border-line text-slate-700 hover:bg-paper-deep',
      }
    : {
        on: 'bg-[#B07A4E]/10 border-[#B07A4E] text-[#B07A4E]',
        off: 'bg-paper-elev border-line text-slate-700 hover:bg-paper-deep',
      };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm font-medium border rounded-full transition-colors ${
              isOn ? styles.on : styles.off
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};

const ClientPreferences = ({ prefs, onChange, disabled }) => (
  <div className="space-y-6">
    {/* Pressure */}
    <section className="bg-paper-elev rounded-lg shadow-sm p-5 border border-line">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Pressure preference</h3>
      <p className="text-sm text-slate-500 mb-4">How firm do you generally like your massage?</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PRESSURE_OPTIONS.map(opt => {
          const isOn = prefs.pressure === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...prefs, pressure: opt.value })}
              disabled={disabled}
              className={`p-3 rounded-lg border text-left transition-colors ${
                isOn
                  ? 'bg-[#B07A4E]/10 border-[#B07A4E] text-[#B07A4E]'
                  : 'bg-paper-elev border-line text-slate-700 hover:bg-paper-deep'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-xs mt-0.5 opacity-80">{opt.hint}</div>
            </button>
          );
        })}
      </div>
    </section>

    {/* Focus */}
    <section className="bg-paper-elev rounded-lg shadow-sm p-5 border border-line">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Focus on these areas</h3>
      <p className="text-sm text-slate-500 mb-4">Where do you usually want extra attention? (optional)</p>
      <ChipGroup
        options={AREA_OPTIONS}
        selected={prefs.focusAreas || []}
        disabled={disabled}
        onToggle={(area) => {
          const current = prefs.focusAreas || [];
          const updated = current.includes(area)
            ? current.filter(a => a !== area)
            : [...current, area];
          onChange({ ...prefs, focusAreas: updated });
        }}
      />
    </section>

    {/* Avoid */}
    <section className="bg-paper-elev rounded-lg shadow-sm p-5 border border-line">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Avoid these areas</h3>
      <p className="text-sm text-slate-500 mb-4">Anywhere you'd rather not be touched? (optional)</p>
      <ChipGroup
        options={AREA_OPTIONS}
        selected={prefs.avoidAreas || []}
        disabled={disabled}
        variant="avoid"
        onToggle={(area) => {
          const current = prefs.avoidAreas || [];
          const updated = current.includes(area)
            ? current.filter(a => a !== area)
            : [...current, area];
          onChange({ ...prefs, avoidAreas: updated });
        }}
      />
    </section>

    {/* Oil sensitivities */}
    <section className="bg-paper-elev rounded-lg shadow-sm p-5 border border-line">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Oil or scent sensitivities</h3>
      <p className="text-sm text-slate-500 mb-4">Anything to avoid? (optional)</p>
      <input
        type="text"
        value={prefs.oilSensitivities || ''}
        onChange={(e) => onChange({ ...prefs, oilSensitivities: e.target.value })}
        disabled={disabled}
        maxLength={500}
        placeholder="e.g., lavender, peppermint, nut oils"
        className="w-full px-3 py-2 border border-line rounded-lg focus:border-[#B07A4E] focus:ring-1 focus:ring-[#B07A4E] outline-none disabled:opacity-60"
      />
    </section>

    {/* Notes */}
    <section className="bg-paper-elev rounded-lg shadow-sm p-5 border border-line">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Anything else your therapist should know?</h3>
      <p className="text-sm text-slate-500 mb-4">
        Setup requests, preferences, accessibility notes — whatever helps your session go smoothly. (optional)
      </p>
      <textarea
        value={prefs.notes || ''}
        onChange={(e) => onChange({ ...prefs, notes: e.target.value })}
        disabled={disabled}
        maxLength={2000}
        rows={4}
        placeholder={`e.g., "Please bring breast support for the table"\n"I'm pregnant — second trimester"\n"Park in driveway, dog might bark"\n"I prefer minimal conversation"`}
        className="w-full px-3 py-2 border border-line rounded-lg focus:border-[#B07A4E] focus:ring-1 focus:ring-[#B07A4E] outline-none resize-y disabled:opacity-60"
      />
      <div className="text-xs text-slate-400 mt-1 text-right">
        {(prefs.notes || '').length} / 2000
      </div>
    </section>
  </div>
);

const TreatmentPreferences = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Provider-only state
  const [formData, setFormData] = useState({
    defaultDuration: 60,
    bufferTime: 15,
    advanceBooking: 30,
    services: [],
    travelFee: 0,
  });

  // Client-only state
  const [clientPrefs, setClientPrefs] = useState({
    pressure: 'medium',
    focusAreas: [],
    avoidAreas: [],
    oilSensitivities: '',
    notes: '',
  });

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/users/profile', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load preferences');

        const data = await response.json();
        const tp = data.profile?.treatmentPreferences;
        if (tp && user?.accountType !== 'PROVIDER') {
          setClientPrefs({
            pressure: tp.pressure || 'medium',
            focusAreas: Array.isArray(tp.focusAreas) ? tp.focusAreas : [],
            avoidAreas: Array.isArray(tp.avoidAreas) ? tp.avoidAreas : [],
            oilSensitivities: tp.oilSensitivities || '',
            notes: tp.notes || '',
          });
        }

        if (data.registrationStep < 2) {
          navigate('/profile-setup');
        }
      } catch (err) {
        console.error('Error loading preferences:', err);
        setError('Failed to load preferences');
      }
    };

    loadPreferences();
  }, [navigate, user?.accountType]);

  const handleProviderChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const isProvider = user.accountType === 'PROVIDER';
      const endpoint = isProvider
        ? '/api/users/provider/preferences'
        : '/api/users/treatment-preferences';

      const body = isProvider
        ? {
            preferences: {
              defaultDuration: formData.defaultDuration,
              bufferTime: formData.bufferTime,
              advanceBooking: formData.advanceBooking,
              services: formData.services,
              travelFee: formData.travelFee,
            },
            registrationStep: 3,
          }
        : {
            preferences: clientPrefs,
            registrationStep: 3,
          };

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save preferences');
      }

      setUser(data.user);
      setSuccessMessage('Preferences saved');
      setIsEditing(false);

      const wasOnboarding = (user?.registrationStep || 1) < 3;
      if (wasOnboarding) {
        const isClient = user?.accountType !== 'PROVIDER';
        const hasProvider = !!(user?.providerId || data.user?.providerId);
        if (isClient && !hasProvider) {
          navigate('/provider-selection');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred while saving your preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const currentStep = user?.registrationStep || 1;
  const isRegistrationComplete = currentStep >= 3;
  const isProvider = user?.accountType === 'PROVIDER';
  const editable = !isRegistrationComplete || isEditing;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-paper-deep py-12">
      <div className="w-full max-w-4xl px-4">
        {!isRegistrationComplete && <ProgressIndicator currentStep={3} />}

        <div className="bg-paper-elev rounded-lg shadow-md p-6 sm:p-8">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-normal text-slate-700">
                {isProvider ? 'Business Preferences' : 'Treatment Preferences'}
              </h2>
              {!isRegistrationComplete && (
                <p className="mt-1 text-slate-500">Step 3 of 3 — quick and optional</p>
              )}
              {isRegistrationComplete && !isProvider && (
                <p className="mt-1 text-sm text-slate-500">
                  These help your therapist tailor each session.
                </p>
              )}
            </div>
            {isRegistrationComplete && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      handleSubmit({ preventDefault: () => {} });
                    } else {
                      setIsEditing(true);
                    }
                  }}
                  disabled={isLoading}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg
                    ${isEditing
                      ? 'text-white bg-[#B07A4E] hover:bg-[#8A5D36]'
                      : 'text-[#B07A4E] hover:bg-[#B07A4E]/10'}
                    transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isEditing ? (
                    <><Check size={18} className="mr-1.5" /> Save</>
                  ) : (
                    <><Edit2 size={18} className="mr-1.5" /> Edit</>
                  )}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
              <p>{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 text-green-700 flex items-center">
              <CheckCircle className="mr-2" size={16} />
              <p>{successMessage}</p>
            </div>
          )}

          <form id="prefs-form" onSubmit={handleSubmit}>
            {isProvider ? (
              <ProviderPreferences formData={formData} onChange={handleProviderChange} />
            ) : (
              <ClientPreferences
                prefs={clientPrefs}
                onChange={setClientPrefs}
                disabled={!editable || isLoading}
              />
            )}

            {!isRegistrationComplete && (
              <div className="flex justify-between space-x-4 mt-8">
                <button
                  type="button"
                  onClick={() => navigate('/profile-setup')}
                  disabled={isLoading}
                  className={`px-6 py-3 rounded-lg border border-slate-300 text-slate-600 hover:bg-paper-deep
                    transition focus:outline-none focus:ring-2 focus:ring-offset-2
                    focus:ring-slate-500 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`flex-1 py-3 px-4 rounded-lg bg-[#B07A4E] hover:bg-[#8A5D36]
                    text-white font-medium transition
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B07A4E]
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isLoading ? 'Saving...' : 'Complete Setup'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default TreatmentPreferences;
