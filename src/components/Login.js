import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('Waiting for login attempt...');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Debug logging
      const debugData = {
        baseURL: axios.defaults.baseURL,
        currentHost: window.location.hostname,
        fullUrl: window.location.href,
        timestamp: new Date().toISOString(),
        email
      };
      setDebugInfo(`Attempt details:\n${JSON.stringify(debugData, null, 2)}`);

      const response = await axios.post('/api/auth/login', 
        { email, password },
        { 
          withCredentials: true,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Login response:', response.data);

      setDebugInfo(prev => `${prev}\n\nResponse received:\n${JSON.stringify(response.data, null, 2)}`);

      if (response.data.user) {
        setUser(response.data.user);
        // Save the token if it exists in the response
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
        }
        
        // Handle incomplete registrations by redirecting to the appropriate step
        const registrationStep = response.data.user.registrationStep || 1;
        
        if (response.data.user.isAdmin) {
          navigate('/admin');
        } else if (registrationStep === 1) {
          // User needs to complete profile setup
          navigate('/profile-setup');
        } else if (registrationStep === 2) {
          // User needs to complete treatment preferences
          navigate('/treatment-preferences');
        } else {
          // Registration complete, go to appropriate dashboard
          navigate(response.data.user.accountType === 'PROVIDER' ? '/provider' : '/');
        }
      }
    } catch (err) {
      const errorDetails = {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        type: err.type,
        name: err.name
      };
      setDebugInfo(prev => `${prev}\n\nError occurred:\n${JSON.stringify(errorDetails, null, 2)}`);
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pt-16">  
      <div className="flex flex-col justify-center pt-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <img 
            src="/imgs/logo.png"
            alt="Massage by Ivan"
            className="mx-auto h-32 w-auto"
          />
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#387c7e] focus:border-[#387c7e] sm:text-sm"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#387c7e] focus:border-[#387c7e] sm:text-sm pr-10"
                    placeholder="Enter your password"
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
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#387c7e] hover:bg-[#2c5f60] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#387c7e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>

            <div className="mt-4 text-center">
              <Link to="/forgot-password" className="text-sm font-medium text-[#387c7e] hover:text-[#2c5f60]">
                Forgot your password?
              </Link>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-[#387c7e] hover:text-[#2c5f60]">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
