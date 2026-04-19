import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import api from '../services/api';
import { Eye, EyeOff, AlertCircle, CheckCircle, UserPlus, Users, ArrowLeft } from 'lucide-react';

const ProgressIndicator = ({ currentStep, accountType }) => {
  const totalSteps = accountType === 'PROVIDER' ? 2 : 3;
  return (
    <div className="mb-8 w-full max-w-md">
      <div className="flex justify-between mb-2">
        <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
          Account
        </div>
        <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
          Profile
        </div>
        {accountType === 'CLIENT' && (
          <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
            Preferences
          </div>
        )}
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full">
        <div
          className="h-full bg-gradient-to-r from-[#B07A4E] to-[#8A5D36] rounded-full transition-all duration-500"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
};

const SignUp = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    accountType: '',  // 'PROVIDER' or 'CLIENT'
    invitationToken: '',  // for invited clients
    joinCode: '',  // for client join code
  });

  const [step, setStep] = useState(1);  // 1: Type Selection, 2: Provider Password Gate, 2.5: Client Join Code, 3: Details
  const [verifiedJoinProvider, setVerifiedJoinProvider] = useState(null);
  const [isVerifyingJoinCode, setIsVerifyingJoinCode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showProviderConfirmation, setShowProviderConfirmation] = useState(false);
  const [verifiedProvider, setVerifiedProvider] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [providerAccessPassword, setProviderAccessPassword] = useState('');
  const [isVerifyingProviderAccess, setIsVerifyingProviderAccess] = useState(false);
  const [verifiedProviderPassword, setVerifiedProviderPassword] = useState(''); // Store the verified password separately
  const [smsConsent, setSmsConsent] = useState(false); // State for SMS consent
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateForm = () => {
    const errors = {};
    
    if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    // Provider password is now set automatically during verification, no longer user input
    // if (formData.accountType === 'PROVIDER' && !formData.providerPassword.trim()) {
    //   errors.providerPassword = 'Provider password is required';
    // }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Additional validation for provider accounts
    if (formData.accountType === 'PROVIDER' && !verifiedProviderPassword) {
      setError('Provider access password verification is required');
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/register',
        {
          email: formData.email,
          password: formData.password,
          accountType: formData.accountType,
          invitationToken: formData.invitationToken,
          ...(formData.accountType === 'PROVIDER' && { providerPassword: verifiedProviderPassword }),
          ...(formData.accountType === 'CLIENT' && formData.joinCode && { joinCode: formData.joinCode }),
          smsConsent: smsConsent,
        }
      );

      console.log('Registration response:', response.data);

      if (response.data.user) {
        const userData = { ...response.data.user, registrationStep: 1 };
        // If client registered with join code, they already have a provider
        if (formData.accountType === 'CLIENT' && formData.joinCode && response.data.user.providerId) {
          userData.hasProviderViaJoinCode = true;
        }
        localStorage.setItem('registrationStep', '1');
        setUser(userData);
        navigate('/profile-setup');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.response?.data?.message || 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyProviderAccess = async () => {
    setIsVerifyingProviderAccess(true);
    setError('');
    
    // Trim the input to handle accidental spaces
    const trimmedPassword = providerAccessPassword.trim();
    
    // Simulate a quick check (in real scenario, this could be an API call)
    setTimeout(() => {
      if (trimmedPassword === 'B@ckstreetsback0222') {
        setFormData(prev => ({ ...prev, accountType: 'PROVIDER' }));
        setVerifiedProviderPassword(trimmedPassword); // Store the verified password
        setStep(3); // Move to actual sign-up form
      } else {
        setError('Invalid provider access password');
      }
      setIsVerifyingProviderAccess(false);
      setProviderAccessPassword('');
    }, 500);
  };

  const verifyJoinCode = async () => {
    const code = formData.joinCode.trim();
    if (!code) {
      setError('Please enter a join code');
      return;
    }
    setIsVerifyingJoinCode(true);
    setError('');
    try {
      const response = await api.get(`/api/join-code/verify/${code}`);
      setVerifiedJoinProvider(response.data.provider);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid join code');
    } finally {
      setIsVerifyingJoinCode(false);
    }
  };

  const renderJoinCodeStep = () => (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <div className="text-center mb-6">
        <h3 className="text-xl font-medium text-slate-900">Enter Your Provider's Code</h3>
        <p className="mt-2 text-slate-500">Your massage provider should have given you a short join code</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="joinCode" className="block text-sm font-medium text-slate-600 mb-2">
            Join Code
          </label>
          <input
            id="joinCode"
            type="text"
            value={formData.joinCode}
            onChange={(e) => {
              const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
              setFormData(prev => ({ ...prev, joinCode: val }));
            }}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center text-lg tracking-wider
              focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all duration-200"
            placeholder="e.g. ivan"
            maxLength={20}
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                verifyJoinCode();
              }
            }}
          />
        </div>

        <div className="flex space-x-4">
          <button
            onClick={() => {
              setStep(1);
              setFormData(prev => ({ ...prev, joinCode: '', accountType: '' }));
              setError('');
            }}
            className="flex-1 py-3 px-4 border border-slate-200 rounded-xl text-slate-700 font-medium
              hover:bg-slate-50 transition-all duration-200"
          >
            Back
          </button>
          <button
            onClick={verifyJoinCode}
            disabled={isVerifyingJoinCode || !formData.joinCode.trim()}
            className="flex-1 py-3 px-4 rounded-xl bg-[#B07A4E] hover:bg-[#8A5D36] active:bg-[#007a80]
              text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifyingJoinCode ? 'Verifying...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTypeSelection = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-medium text-slate-900">Choose Account Type</h3>
        <p className="mt-2 text-slate-500">How will you be using our platform?</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <button
          onClick={() => setStep(2)} // Go to provider password gate
          className="p-6 border-2 border-slate-200 rounded-xl hover:border-[#B07A4E]
            hover:bg-[#B07A4E]/5 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
        >
          <h4 className="text-lg font-medium text-slate-900">Massage Provider</h4>
          <p className="mt-2 text-slate-600">
            I provide massage services and want to manage my client bookings
          </p>
        </button>

        <button
          onClick={() => {
            setFormData(prev => ({ ...prev, accountType: 'CLIENT' }));
            setStep(2.5); // Go to join code entry
          }}
          className="p-6 border-2 border-slate-200 rounded-xl hover:border-[#B07A4E]
            hover:bg-[#B07A4E]/5 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
        >
          <h4 className="text-lg font-medium text-slate-900">Client</h4>
          <p className="mt-2 text-slate-600">
            I want to book massage services
          </p>
        </button>
      </div>
    </div>
  );

  const renderProviderPasswordGate = () => (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <div className="text-center mb-6">
        <h3 className="text-xl font-medium text-slate-900">Provider Access Required</h3>
        <p className="mt-2 text-slate-500">Enter the provider access password to continue</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="providerAccessPassword" className="block text-sm font-medium text-slate-600 mb-2">
            Provider Access Password
          </label>
          <input
            id="providerAccessPassword"
            type="password"
            value={providerAccessPassword}
            onChange={(e) => setProviderAccessPassword(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all duration-200"
            placeholder="Enter provider access password"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                verifyProviderAccess();
              }
            }}
          />
          <p className="mt-1 text-xs text-slate-400">
            Contact support to obtain the provider access password
          </p>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={() => {
              setStep(1);
              setProviderAccessPassword('');
              setError('');
            }}
            className="flex-1 py-3 px-4 border border-slate-200 rounded-xl text-slate-700 font-medium
              hover:bg-slate-50 transition-all duration-200"
          >
            Back
          </button>
          <button
            onClick={verifyProviderAccess}
            disabled={isVerifyingProviderAccess || !providerAccessPassword.trim()}
            className="flex-1 py-3 px-4 rounded-xl bg-[#B07A4E] hover:bg-[#8A5D36] active:bg-[#007a80]
              text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifyingProviderAccess ? 'Verifying...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all duration-200"
          placeholder="Enter your email"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
          Create Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            value={formData.password}
            onChange={handleChange}
            className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all duration-200"
            placeholder="Create a password (min 6 characters)"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-all duration-200"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Must be at least 6 characters</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
          Confirm Password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            required
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent transition-all duration-200"
            placeholder="Re-enter your password"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-all duration-200"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
        {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
        </div>

        {/* SMS Consent Checkbox */}
        <div className="mt-1 flex items-start">
          <div className="flex items-center h-5">
            <input
              id="sms-consent"
              type="checkbox"
              checked={smsConsent}
              onChange={() => setSmsConsent(!smsConsent)}
              className="w-4 h-4 text-[#B07A4E] border-slate-300 rounded focus:ring-[#B07A4E] accent-[#B07A4E]"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="sms-consent" className="font-medium text-slate-700">
              I agree to receive automated SMS messages for appointment-related communications.
            </label>
            <p className="text-slate-400">
              Standard message and data rates may apply. You can opt out at any time.
              <a href="/sms-consent-policy.html" target="_blank" rel="noopener noreferrer" className="text-[#B07A4E] hover:text-[#8A5D36] ml-1 transition-all duration-200">
                View our SMS consent policy.
              </a>
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-6 rounded-xl bg-[#B07A4E] hover:bg-[#8A5D36] active:bg-[#007a80]
            text-white font-semibold transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B07A4E]
            disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isLoading ? 'Creating Account...' : 'Continue'}
        </button>
    </form>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-slate-50">
      <div className="mb-8">
        <img 
          src="/imgs/logo.png"
          alt="Massage by Ivan" 
          className="h-32 w-auto"
        />
      </div>

      <div className="w-full max-w-md">
        {step === 1 && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            {renderTypeSelection()}
          </div>
        )}
        
        {step === 2 && renderProviderPasswordGate()}

        {step === 2.5 && renderJoinCodeStep()}

        {step === 3 && (
          <>
            <ProgressIndicator currentStep={1} accountType={formData.accountType} />
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-2xl font-medium text-center text-slate-900 mb-2">
                {formData.accountType === 'PROVIDER' ? 'Create Provider Account' : 'Create Client Account'}
              </h2>

              {verifiedJoinProvider && formData.accountType === 'CLIENT' && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                  <div className="flex items-center justify-center text-green-700">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">
                      Joining {verifiedJoinProvider.businessName || verifiedJoinProvider.name}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {renderForm()}
            </div>
          </>
        )}

        <div className="mt-6 text-center">
          <Link 
            to="/login" 
            className="text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36] transition-all duration-200"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      {showProviderConfirmation && verifiedProvider && (
        <ProviderConfirmationModal
          provider={verifiedProvider}
          onConfirm={() => {
            setShowProviderConfirmation(false);
            setUser({ ...verifiedProvider, registrationStep: 1 });
            navigate('/profile-setup');
          }}
          onCancel={() => {
            setShowProviderConfirmation(false);
            setError('Registration cancelled. Please try again or contact support.');
          }}
        />
      )}
    </div>
  );
};

export default SignUp;
