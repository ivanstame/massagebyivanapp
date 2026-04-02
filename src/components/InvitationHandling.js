import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, LogIn, AlertCircle } from 'lucide-react';
import axios from 'axios';

const InvitationHandling = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invitationStatus, setInvitationStatus] = useState('loading'); // loading, valid, invalid, expired
  const [providerInfo, setProviderInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    verifyInvitation();
  }, [token]);

  const verifyInvitation = async () => {
    try {
      const response = await axios.get(`/api/invitations/verify/${token}`);
      if (response.data.valid) {
        setInvitationStatus('valid');
        setProviderInfo(response.data.provider);
        setEmail(response.data.email);
      } else {
        setInvitationStatus('invalid');
      }
    } catch (error) {
      setInvitationStatus('expired');
      console.error('Error verifying invitation:', error);
    }
  };

  const handleRegistration = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    try {
      // First accept the invitation
      await axios.post(`/api/invitations/accept/${token}`);

      // Then register the user
      const response = await axios.post('/api/auth/register', {
        email,
        password,
        accountType: 'CLIENT',
        invitationToken: token
      });

      if (response.data.user) {
        navigate('/profile-setup');
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
    }
  };

  const renderContent = () => {
    switch (invitationStatus) {
      case 'loading':
        return (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#009ea5] mx-auto"></div>
            <p className="mt-4 text-slate-600">Verifying invitation...</p>
          </div>
        );

      case 'valid':
        return (
          <div>
            <div className="text-center mb-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900">
                You're invited!
              </h2>
              <p className="mt-2 text-slate-600">
                {providerInfo.businessName} has invited you to join their client list
              </p>
            </div>

            <form onSubmit={handleRegistration} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 border rounded-md bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Create Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-[#009ea5]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-[#009ea5]"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                  <div className="flex">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    <p>{error}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-[#009ea5] text-white rounded-md 
                  hover:bg-[#2c5f60] transition-colors"
              >
                Create Account
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-[#009ea5] hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        );

      case 'invalid':
      case 'expired':
        return (
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900">
              Invalid Invitation
            </h2>
            <p className="mt-2 text-slate-600">
              This invitation link is {invitationStatus === 'expired' ? 'expired' : 'invalid'}.
              Please contact your provider for a new invitation.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 inline-flex items-center px-4 py-2 bg-[#009ea5] 
                text-white rounded-md hover:bg-[#2c5f60]"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Return to Login
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default InvitationHandling;
