import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

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
    <div className="pt-16">
      <div className="flex flex-col justify-center pt-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <img
            src="/imgs/logo.png"
            alt="Massage by Ivan"
            className="mx-auto h-32 w-auto"
          />
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {success ? (
              <div>
                <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-md">
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
                    className="font-medium text-[#387c7e] hover:text-[#2c5f60] inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </Link>
                </div>
              </div>
            ) : (
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
                    {isLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="font-medium text-sm text-[#387c7e] hover:text-[#2c5f60] inline-flex items-center gap-1"
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
    </div>
  );
};

export default ForgotPassword;
