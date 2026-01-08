import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import api from '../services/api';
import { Eye, EyeOff, AlertCircle, CheckCircle, UserPlus, Users } from 'lucide-react';

const ProgressIndicator = ({ currentStep, accountType }) => {
  const totalSteps = accountType === 'PROVIDER' ? 2 : 3;
  return (
    <div className="mb-8 w-full max-w-md">
      <div className="flex justify-between mb-2">
        <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
          Account
        </div>
        <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
          Profile
        </div>
        {accountType === 'CLIENT' && (
          <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#387c7e]' : 'text-slate-400'}`}>
            Preferences
          </div>
        )}
      </div>
      <div className="h-1 bg-slate-100 rounded-full">
        <div
          className="h-full bg-[#387c7e] rounded-full transition-all duration-500"
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
  });

  const [step, setStep] = useState(1);  // 1: Type Selection, 2: Provider Password Gate, 3: Details
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
          smsConsent: smsConsent, // Include SMS consent
        }
      );

      console.log('Registration response:', response.data);

      if (response.data.user) {
        localStorage.setItem('registrationStep', '1');
        setUser({ ...response.data.user, registrationStep: 1 });
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

  const renderTypeSelection = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-medium text-slate-900">Choose Account Type</h3>
        <p className="mt-2 text-slate-500">How will you be using our platform?</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <button
          onClick={() => setStep(2)} // Go to provider password gate
          className="p-6 border-2 rounded-lg hover:border-[#387c7e]
            hover:bg-[#387c7e]/5 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#387c7e]"
        >
          <h4 className="text-lg font-medium text-slate-900">Massage Provider</h4>
          <p className="mt-2 text-slate-600">
            I provide massage services and want to manage my client bookings
          </p>
        </button>

        <button
          onClick={() => {
            setFormData(prev => ({ ...prev, accountType: 'CLIENT' }));
            setStep(3); // Skip password gate for clients
          }}
          className="p-6 border-2 rounded-lg hover:border-[#387c7e]
            hover:bg-[#387c7e]/5 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#387c7e]"
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
    <div className="bg-white p-8 rounded-lg shadow-md">
      <div className="text-center mb-6">
        <h3 className="text-xl font-medium text-slate-900">Provider Access Required</h3>
        <p className="mt-2 text-slate-500">Enter the provider access password to continue</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="providerAccessPassword" className="block text-sm font-medium text-slate-600 mb-2">
            Provider Access Password
          </label>
          <input
            id="providerAccessPassword"
            type="password"
            value={providerAccessPassword}
            onChange={(e) => setProviderAccessPassword(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-md
              focus:outline-none focus:ring-2 focus:ring-[#387c7e]"
            placeholder="Enter provider access password"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                verifyProviderAccess();
              }
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
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
            className="flex-1 py-2 px-4 border border-slate-300 rounded-md text-slate-700
              hover:bg-slate-50 transition"
          >
            Back
          </button>
          <button
            onClick={verifyProviderAccess}
            disabled={isVerifyingProviderAccess || !providerAccessPassword.trim()}
            className="flex-1 py-2 px-4 rounded-md bg-[#387c7e] hover:bg-[#2c5f60]
              text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifyingProviderAccess ? 'Verifying...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-600 mb-2">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-slate-200 rounded-md 
            focus:outline-none focus:ring-2 focus:ring-[#387c7e]"
          placeholder="Enter your email"
        />
      </div>




      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-2">
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
            className="w-full px-4 py-2 border border-slate-200 rounded-md 
              focus:outline-none focus:ring-2 focus:ring-[#387c7e] pr-10"
            placeholder="Create a password (min 6 characters)"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            ) : (
              <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Must be at least 6 characters</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600 mb-2">
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
            className="w-full px-4 py-2 border border-slate-200 rounded-md 
              focus:outline-none focus:ring-2 focus:ring-[#387c7e] pr-10"
            placeholder="Re-enter your password"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            ) : (
              <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            )}
          </button>
        </div>
        {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
        </div>
        
        {/* SMS Consent Checkbox */}
        <div className="mt-4 flex items-start">
          <div className="flex items-center h-5">
            <input
              id="sms-consent"
              type="checkbox"
              checked={smsConsent}
              onChange={() => setSmsConsent(!smsConsent)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="sms-consent" className="font-medium text-gray-700">
              I agree to receive automated SMS messages for appointment-related communications.
            </label>
            <p className="text-gray-500">
              Standard message and data rates may apply. You can opt out at any time.
              <a href="/sms-consent-policy.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 ml-1">
                View our SMS consent policy.
              </a>
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-md bg-[#387c7e] hover:bg-[#2c5f60] 
            text-white font-medium transition duration-150 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#387c7e]
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Creating Account...' : 'Continue'}
        </button>
    </form>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50">
      <div className="mb-8">
        <img 
          src="/imgs/logo.png"
          alt="Massage by Ivan" 
          className="h-32 w-auto"
        />
      </div>

      <div className="w-full max-w-md">
        {step === 1 && (
          <div className="bg-white p-8 rounded-lg shadow-md">
            {renderTypeSelection()}
          </div>
        )}
        
        {step === 2 && renderProviderPasswordGate()}
        
        {step === 3 && (
          <>
            <ProgressIndicator currentStep={1} accountType={formData.accountType} />
            
            <div className="bg-white p-8 rounded-lg shadow-md">
              <h2 className="text-2xl font-normal text-center text-slate-700 mb-2">
                {formData.accountType === 'PROVIDER' ? 'Create Provider Account' : 'Create Client Account'}
              </h2>
              
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
                  <p>{error}</p>
                </div>
              )}

              {renderForm()}
            </div>
          </>
        )}

        <div className="mt-6 text-center">
          <Link 
            to="/login" 
            className="text-sm text-slate-600 hover:text-slate-800 transition"
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
