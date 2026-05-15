import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import AddressForm from './AddressForm';
import api from '../services/api';
import { AlertCircle, User, Phone, Briefcase, MapPin, Link as LinkIcon, Check, X, Clock, Sparkles, CreditCard } from 'lucide-react';
import { handlePhoneNumberChange, isValidPhoneNumber } from '../utils/phoneUtils';
import { TRADES, TRADE_KEYS } from '../shared/trades';

// Starter prices in dollars. $100/hr by duration. Provider edits before
// submitting. Conservative on purpose — most providers go up from here.
const starterPriceFor = (durationMin) => Math.round((durationMin / 60) * 100);

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];  // Sun..Sat
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];  // Mon-Fri

// Convert "HH:mm" 24h → "h:mm AM/PM" for display in time inputs.
const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
};

const STATES = [
  ['AK', 'Alaska'], ['AL', 'Alabama'], ['AR', 'Arkansas'], ['AZ', 'Arizona'], 
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], 
  ['DC', 'District of Columbia'], ['DE', 'Delaware'], ['FL', 'Florida'], 
  ['GA', 'Georgia'], ['HI', 'Hawaii'], ['IA', 'Iowa'], ['ID', 'Idaho'], 
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['KS', 'Kansas'], ['KY', 'Kentucky'], 
  ['LA', 'Louisiana'], ['MA', 'Massachusetts'], ['MD', 'Maryland'], 
  ['ME', 'Maine'], ['MI', 'Michigan'], ['MN', 'Minnesota'], 
  ['MO', 'Missouri'], ['MS', 'Mississippi'], ['MT', 'Montana'], 
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['NE', 'Nebraska'], 
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], 
  ['NV', 'Nevada'], ['NY', 'New York'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], 
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], 
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], 
  ['TX', 'Texas'], ['UT', 'Utah'], ['VA', 'Virginia'], ['VT', 'Vermont'], 
  ['WA', 'Washington'], ['WI', 'Wisconsin'], ['WV', 'West Virginia'], 
  ['WY', 'Wyoming']
];

const ProgressIndicator = ({ currentStep, accountType }) => {
  const totalSteps = accountType === 'PROVIDER' ? 2 : 3;
  const stepLabels = [
    'Account',
    'Profile',
    ...(accountType === 'CLIENT' ? ['Preferences'] : [])
  ];

  return (
    <div className="mb-8 w-full max-w-2xl">
      <div className="flex justify-between mb-2">
        {stepLabels.map((label, index) => (
          <div
            key={label}
            className={`text-sm font-medium ${currentStep >= index + 1 ? 'text-[#B07A4E]' : 'text-slate-500'}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="h-1 bg-slate-100 rounded-full">
        <div
          className="h-full bg-[#B07A4E] rounded-full transition-all duration-500"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
};

const ProfileSetup = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [formValid, setFormValid] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    street: '',
    unit: '',
    city: '',
    state: '',
    zip: '',
    businessName: '',
    trade: 'other',
    joinCode: ''
  });
  const [joinCodeStatus, setJoinCodeStatus] = useState(null); // null, 'checking', 'available', 'taken', 'invalid'

  // Provider-only onboarding setup state. Captured here so we can commit
  // a weekly template, base pricing, and accepted payment methods in one
  // backend round-trip alongside the profile save.
  const [workMode, setWorkMode] = useState('mobile');  // 'mobile' | 'static' | 'flexible'
  const [workDays, setWorkDays] = useState(DEFAULT_WORK_DAYS);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');

  // Services list — driven by trade selection. Each row { duration, label, price, enabled }.
  // Rebuilt whenever trade changes so a provider who toggles trade mid-form
  // gets the matching starter list.
  const [services, setServices] = useState([]);

  // Payment methods accepted. Defaults match the User schema default so
  // a provider who skips the question lands on the same baseline.
  const [paymentMethods, setPaymentMethods] = useState(['cash', 'paymentApp']);

  useEffect(() => {
    if (!user) {
      navigate('/signup');
      return;
    }

    if (user.admin) {
      navigate('/admin-dashboard');
      return;
    }
  }, [user, navigate]);

  // Rebuild the services list whenever trade changes. Pre-checks all
  // starter packages with a sensible default price so the provider can
  // submit unchanged or edit inline.
  useEffect(() => {
    if (user?.accountType !== 'PROVIDER') return;
    const starter = TRADES[formData.trade]?.starterPackages || [];
    setServices(starter.map(p => ({
      duration: p.duration,
      label: p.label,
      price: starterPriceFor(p.duration),
      enabled: true
    })));
  }, [formData.trade, user?.accountType]);

  useEffect(() => {
    const isProvider = user?.accountType === 'PROVIDER';
    const providerSetupValid = !isProvider || (
      workDays.length > 0 &&
      workStart < workEnd &&
      services.some(s => s.enabled && Number(s.price) > 0) &&
      paymentMethods.length > 0
    );
    const isValid = (
      formData.fullName.trim() !== '' &&
      formData.phoneNumber.trim() !== '' &&
      isValidPhoneNumber(formData.phoneNumber) &&
      formData.street.trim() !== '' &&
      formData.city.trim() !== '' &&
      formData.state.trim() !== '' &&
      formData.zip.trim() !== '' &&
      (!isProvider || formData.businessName.trim() !== '') &&
      (!isProvider || (formData.joinCode.trim().length >= 3 && joinCodeStatus === 'available')) &&
      providerSetupValid
    );
    setFormValid(isValid);
  }, [formData, user?.accountType, joinCodeStatus, workDays, workStart, workEnd, services, paymentMethods]);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const checkJoinCodeAvailability = async (code) => {
    const trimmed = code.toLowerCase().trim();
    if (trimmed.length < 3) {
      setJoinCodeStatus('invalid');
      return;
    }
    if (!/^[a-z0-9]+$/.test(trimmed)) {
      setJoinCodeStatus('invalid');
      return;
    }
    setJoinCodeStatus('checking');
    try {
      const response = await api.get(`/api/join-code/check/${trimmed}`);
      setJoinCodeStatus(response.data.available ? 'available' : 'taken');
    } catch {
      setJoinCodeStatus('invalid');
    }
  };

  useEffect(() => {
    if (user?.accountType !== 'PROVIDER' || !formData.joinCode) {
      setJoinCodeStatus(null);
      return;
    }
    const timer = setTimeout(() => {
      checkJoinCodeAvailability(formData.joinCode);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.joinCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValid || isLoading) return;

    setIsLoading(true);
    setError('');

    try {

      const requestBody = {
        fullName: formData.fullName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        address: {
          street: formData.street.trim(),
          unit: formData.unit?.trim() || '',
          city: formData.city.trim(),
          state: formData.state.trim(),
          zip: formData.zip.trim()
        },
        registrationStep: user?.accountType === 'PROVIDER' ? 3 : 2
      };

      // For providers, include the business name in providerProfile and set join code
      if (user?.accountType === 'PROVIDER') {
        requestBody.providerProfile = {
          businessName: formData.businessName.trim(),
          trade: formData.trade || 'other',
          // Payment methods chosen during onboarding. Backend persists
          // these to providerProfile.acceptedPaymentMethods so the
          // booking form respects the provider's pre-stated preferences
          // from day one.
          acceptedPaymentMethods: paymentMethods,
          // Base pricing committed from the starter packages the
          // provider kept enabled. Each entry has duration (min),
          // price ($), and label. Backend writes to
          // providerProfile.basePricing.
          basePricing: services
            .filter(s => s.enabled && Number(s.price) > 0)
            .map(s => ({
              duration: s.duration,
              price: Number(s.price),
              label: s.label || `${s.duration}-min service`
            }))
        };
        requestBody.joinCode = formData.joinCode.trim();
        // Weekly template setup. Backend materializes one
        // WeeklyTemplate doc per selected day with the same start/end
        // time and chosen kind. Days the provider didn't select stay
        // empty (no template = no recurring availability).
        requestBody.onboardingWeeklyTemplate = {
          days: workDays,
          startTime: workStart,
          endTime: workEnd,
          kind: workMode
        };
      } else {
        // For clients, include businessName at root level (if needed for any reason)
        requestBody.businessName = formData.businessName?.trim() || '';
      }

      const response = await api.put('/api/users/profile', requestBody);
      const userData = response.data;

      setUser({
        ...user,
        ...userData.user
      });

      if (user?.accountType === 'PROVIDER') {
        navigate('/dashboard', { replace: true });
      } else {
        // Clients still have step 3 (treatment preferences) to complete.
        navigate('/treatment-preferences', { replace: true });
      }

    } catch (err) {
      console.error('Submission Error:', err);
      setError(err.response?.data?.message || 'An error occurred while saving your profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (user?.admin) return null;

  if (loadError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg border border-red-200">
        <strong>Error:</strong> {loadError}. Check your API key and network connection.
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-paper-deep py-12">
      <div className="w-full max-w-2xl">
        <ProgressIndicator currentStep={2} accountType={user?.accountType} />
        
        <div className="bg-paper-elev rounded-lg shadow-md p-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-normal text-slate-700">Profile Information</h2>
            <p className="mt-2 text-slate-500">
              {user?.accountType === 'PROVIDER' ? 'Step 2 of 2: Basic Information' : 'Step 2 of 3: Basic Information'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact Information Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-800 flex items-center">
                <User className="w-5 h-5 mr-2 text-[#B07A4E]" />
                Contact Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition"
                      placeholder="John Doe"
                    />
                    <User className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={(e) => handlePhoneNumberChange(e, (value) =>
                        setFormData(prev => ({
                          ...prev,
                          phoneNumber: value
                        }))
                      )}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition"
                      placeholder="(555) 123-4567"
                    />
                    <Phone className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                  </div>
                </div>
              </div>
            </div>

            {user?.accountType === 'PROVIDER' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-slate-800 flex items-center">
                  <Briefcase className="w-5 h-5 mr-2 text-[#B07A4E]" />
                  Business Information
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Business Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition"
                      placeholder="e.g. Healing Hands, Glow Studio, Shine Detailing"
                    />
                    <Briefcase className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    What do you offer?
                  </label>
                  <select
                    name="trade"
                    value={formData.trade}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition bg-white"
                  >
                    {TRADE_KEYS.map(key => (
                      <option key={key} value={key}>{TRADES[key].displayName}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    We&rsquo;ll use this to suggest starter packages &mdash; you can always customize them.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Client Join Code *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="joinCode"
                      value={formData.joinCode}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                        setFormData(prev => ({ ...prev, joinCode: val }));
                      }}
                      required
                      maxLength={20}
                      className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition ${
                        joinCodeStatus === 'available' ? 'border-green-400 focus:ring-green-400' :
                        joinCodeStatus === 'taken' || joinCodeStatus === 'invalid' ? 'border-red-400 focus:ring-red-400' :
                        'border-line focus:ring-[#B07A4E]'
                      }`}
                      placeholder="e.g. ivan"
                    />
                    <LinkIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                    {joinCodeStatus === 'checking' && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#B07A4E]"></div>
                      </div>
                    )}
                    {joinCodeStatus === 'available' && (
                      <Check className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                    )}
                    {(joinCodeStatus === 'taken' || joinCodeStatus === 'invalid') && (
                      <X className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {joinCodeStatus === 'taken' ? 'This code is already taken. Try another.' :
                     joinCodeStatus === 'invalid' ? 'Must be 3-20 alphanumeric characters (letters and numbers only).' :
                     joinCodeStatus === 'available' ? 'This code is available!' :
                     'Your clients will enter this code when signing up to connect with you. Letters and numbers only.'}
                  </p>
                </div>
              </div>
            )}

            {/* Provider-only onboarding sections. Vertical-stacked, no
                wizard. Filling these here lets the system commit a
                weekly template, base pricing, and accepted payment
                methods on first save — so the provider can take a
                booking the moment they finish signup. */}
            {user?.accountType === 'PROVIDER' && (
              <>
                {/* Work hours / schedule kind */}
                <div className="space-y-5">
                  <h3 className="text-lg font-medium text-slate-800 flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-[#B07A4E]" />
                    Your typical week
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                      Where do you usually see clients?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { value: 'mobile',   label: 'I go to clients',     sub: 'Mobile — you travel to them' },
                        { value: 'static',   label: 'Clients come to me',  sub: 'In-studio at your address' },
                        { value: 'flexible', label: 'Either way',          sub: 'Mix of mobile and in-studio' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setWorkMode(opt.value)}
                          className={`text-left p-3 rounded-lg border transition ${
                            workMode === opt.value
                              ? 'border-[#B07A4E] bg-[#B07A4E]/5 ring-1 ring-[#B07A4E]'
                              : 'border-line bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                      Which days do you typically work?
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_LABELS.map((label, idx) => {
                        const selected = workDays.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setWorkDays(prev =>
                              prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()
                            )}
                            className={`w-10 h-10 rounded-full text-sm font-medium transition ${
                              selected
                                ? 'bg-[#B07A4E] text-white shadow-sm'
                                : 'bg-white border border-line text-slate-600 hover:border-slate-300'
                            }`}
                            aria-pressed={selected}
                            aria-label={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][idx]}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">
                        Start time
                      </label>
                      <input
                        type="time"
                        value={workStart}
                        onChange={(e) => setWorkStart(e.target.value)}
                        className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition"
                      />
                      <p className="mt-1 text-xs text-slate-500">{to12h(workStart)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">
                        End time
                      </label>
                      <input
                        type="time"
                        value={workEnd}
                        onChange={(e) => setWorkEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition"
                      />
                      <p className="mt-1 text-xs text-slate-500">{to12h(workEnd)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 -mt-2">
                    We&rsquo;ll set up your recurring weekly hours from this. You can split a day, change a single week, or add holidays anytime.
                  </p>
                </div>

                {/* Services & pricing */}
                <div className="space-y-5">
                  <h3 className="text-lg font-medium text-slate-800 flex items-center">
                    <Sparkles className="w-5 h-5 mr-2 text-[#B07A4E]" />
                    What you offer
                  </h3>
                  <p className="text-sm text-slate-500 -mt-3">
                    Starter prices below — adjust to whatever you actually charge. You can add more services anytime.
                  </p>

                  {services.length === 0 ? (
                    <div className="p-4 bg-paper-deep rounded-lg text-sm text-slate-600">
                      You can add services after signup in <span className="font-medium">Services</span>.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {services.map((s, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                            s.enabled ? 'border-line bg-white' : 'border-line bg-paper-deep opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={(e) => setServices(prev =>
                              prev.map((it, i) => i === idx ? { ...it, enabled: e.target.checked } : it)
                            )}
                            className="w-4 h-4 rounded text-[#B07A4E] focus:ring-[#B07A4E]"
                          />
                          <input
                            type="text"
                            value={s.label}
                            onChange={(e) => setServices(prev =>
                              prev.map((it, i) => i === idx ? { ...it, label: e.target.value } : it)
                            )}
                            disabled={!s.enabled}
                            placeholder="Service name"
                            className="flex-1 px-2 py-1.5 border border-line rounded text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-[#B07A4E] disabled:text-slate-400"
                          />
                          <span className="text-xs text-slate-500 whitespace-nowrap">{s.duration} min</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                            <input
                              type="number"
                              min="0"
                              step="5"
                              value={s.price}
                              onChange={(e) => setServices(prev =>
                                prev.map((it, i) => i === idx ? { ...it, price: e.target.value } : it)
                              )}
                              disabled={!s.enabled}
                              className="w-24 pl-6 pr-2 py-1.5 border border-line rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#B07A4E] disabled:bg-transparent disabled:text-slate-400"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment methods */}
                <div className="space-y-5">
                  <h3 className="text-lg font-medium text-slate-800 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2 text-[#B07A4E]" />
                    How clients pay you
                  </h3>
                  <p className="text-sm text-slate-500 -mt-3">
                    Pick everything you accept. You can change this anytime.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { value: 'cash',       label: 'Cash',           sub: 'In person, end of session' },
                      { value: 'check',      label: 'Check',          sub: 'Paper checks' },
                      { value: 'paymentApp', label: 'Payment app',    sub: 'Zelle, Venmo, Cash App, Apple Pay' },
                      { value: 'card',       label: 'Credit / debit', sub: 'Through Stripe — set up later' },
                    ].map(opt => {
                      const selected = paymentMethods.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPaymentMethods(prev =>
                            prev.includes(opt.value) ? prev.filter(p => p !== opt.value) : [...prev, opt.value]
                          )}
                          className={`text-left p-3 rounded-lg border transition flex items-start gap-2.5 ${
                            selected
                              ? 'border-[#B07A4E] bg-[#B07A4E]/5 ring-1 ring-[#B07A4E]'
                              : 'border-line bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            selected ? 'bg-[#B07A4E] border-[#B07A4E]' : 'border-slate-300'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{opt.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Address Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-800 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-[#B07A4E]" />
                {user?.accountType === 'PROVIDER' ? 'Business Address' : 'Your Address'}
              </h3>
              
              <AddressForm
                onAddressConfirmed={(addr) => setFormData(prev => ({
                  ...prev,
                  street: addr.street || addr.fullAddress || '',
                  city: addr.city || '',
                  state: addr.state || '',
                  zip: addr.zip || '',
                  unit: addr.unit || ''
                }))}
              />
            </div>

            <div className="flex justify-between space-x-4">
              <button
                type="submit"
                disabled={!formValid || isLoading}
                className={`flex-1 py-3 px-4 rounded-lg ${
                  formValid && !isLoading 
                    ? 'bg-[#B07A4E] hover:bg-[#8A5D36]' 
                    : 'bg-slate-300 cursor-not-allowed'
                } text-white font-medium transition-all duration-150`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  </div>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
