import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { AvMonogram, BrushStroke } from './brush/BrushMotifs';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/auth/forgot-password', { email });
      setSuccess(response.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-md mx-auto w-full px-7 pt-10 pb-8">
        <div className="flex justify-center mb-3">
          <AvMonogram size={56} ringColor="#1B7F84" inkColor="#2A2520" accent="#B07A4E" />
        </div>
        <div className="text-center mb-8">
          <div className="av-meta mb-1.5">A moment of forgetfulness</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Reset your <em style={{ color: '#B07A4E' }}>password.</em>
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Enter your email and we'll send you a link.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-paper-elev py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {success ? (
              <div>
                <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-lg">
                  <div className="flex">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                    <div className="ml-3">
                      <p className="text-sm text-green-700">{success}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 text-center">
                  <Link
                    to="/login"
                    className="font-medium text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
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
                      className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-[#B07A4E] focus:border-[#B07A4E] sm:text-sm"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
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
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#B07A4E] hover:bg-[#8A5D36] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B07A4E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {isLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="font-medium text-sm text-[#B07A4E] hover:text-[#8A5D36] inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-center pb-8">
        <BrushStroke width={120} height={12} color="#B07A4E" opacity={0.5} />
      </div>
    </div>
  );
};

export default ForgotPassword;
