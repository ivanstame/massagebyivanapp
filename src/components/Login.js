import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import axios from 'axios';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/auth/login',
        { email, password },
        {
          withCredentials: true,
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        }
      );

      if (response.data.user) {
        setUser(response.data.user);
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
        }

        const registrationStep = response.data.user.registrationStep || 1;

        if (response.data.user.isAdmin) {
          navigate('/admin');
        } else if (registrationStep === 1) {
          navigate('/profile-setup');
        } else if (registrationStep === 2) {
          navigate('/treatment-preferences');
        } else {
          navigate(response.data.user.accountType === 'PROVIDER' ? '/provider' : '/');
        }
      }
    } catch (err) {
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
            className="mx-auto h-28 w-auto"
          />
          <h2 className="mt-6 text-center text-2xl font-bold text-slate-900">
            Welcome back
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Sign in to manage your appointments
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-3 border border-slate-300 rounded-lg text-base placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009ea5] focus:border-transparent transition-shadow"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg text-base placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009ea5] focus:border-transparent transition-shadow"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-base font-medium text-white bg-[#009ea5] hover:bg-[#008a91] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#009ea5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-6 text-center space-y-3">
              <Link to="/forgot-password" className="text-sm font-medium text-[#009ea5] hover:text-[#008a91] transition-colors">
                Forgot your password?
              </Link>
              <p className="text-sm text-slate-500">
                Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-[#009ea5] hover:text-[#008a91] transition-colors">
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
