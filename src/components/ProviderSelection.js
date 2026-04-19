import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import api from '../services/api';
import { UserCheck, Users, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const ProviderSelection = () => {
  const [providers, setProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [requestStatus, setRequestStatus] = useState(null);
  const [currentRequest, setCurrentRequest] = useState(null);
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAvailableProviders();
    checkCurrentRequestStatus();
  }, []);

  const fetchAvailableProviders = async () => {
    try {
      const response = await api.get('/api/provider-requests/available-providers');
      setProviders(response.data.providers);
    } catch (err) {
      console.error('Error fetching providers:', err);
      setError('Failed to load available providers');
    } finally {
      setIsLoading(false);
    }
  };

  const checkCurrentRequestStatus = async () => {
    try {
      const response = await api.get('/api/provider-requests/client/status');
      if (response.data.hasPendingRequest) {
        setCurrentRequest(response.data.request);
        setRequestStatus(response.data.request.status);
      }
    } catch (err) {
      console.error('Error checking request status:', err);
    }
  };

  const handleProviderSelect = async (provider) => {
    if (currentRequest) {
      setError('You already have a pending provider request');
      return;
    }

    setSelectedProvider(provider);
    setError('');

    try {
      setIsLoading(true);
      const response = await api.post('/api/provider-requests', {
        providerId: provider.id,
        clientMessage: 'I would like to request assignment to this provider'
      });

      setCurrentRequest(response.data.request);
      setRequestStatus('PENDING');
      
      // Update user context to reflect the pending request
      setUser(prev => ({
        ...prev,
        hasPendingProviderRequest: true
      }));
    } catch (err) {
      console.error('Error submitting provider request:', err);
      console.error('Error details:', err.response?.data);
      
      // Check if this is a duplicate request error (MongoDB duplicate key error)
      const errorMessage = err.response?.data?.message || 'Failed to submit provider request';
      
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        // This might be a case where the request succeeded but we got an error response
        // Let's check the current status to confirm
        try {
          const statusResponse = await api.get('/api/provider-requests/client/status');
          if (statusResponse.data.hasPendingRequest) {
            // Request actually succeeded, update UI accordingly
            setCurrentRequest(statusResponse.data.request);
            setRequestStatus('PENDING');
            setUser(prev => ({
              ...prev,
              hasPendingProviderRequest: true
            }));
            
            // Show success message instead of error
            setError('');
            return; // Exit early since request was successful
          }
        } catch (statusErr) {
          console.error('Error checking request status:', statusErr);
        }
      }
      
      // For other errors, provide more specific messages
      let displayError = errorMessage;
      if (errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
        displayError = 'Network error. Please check your connection and try again.';
      } else if (err.response?.status === 500) {
        displayError = 'Server error. Please try again in a moment.';
      }
      
      setError(displayError);
      setSelectedProvider(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueToDashboard = () => {
    navigate('/dashboard');
  };

  if (isLoading && !currentRequest) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B07A4E] mx-auto mb-4"></div>
          <p className="text-slate-600">Loading available providers...</p>
        </div>
      </div>
    );
  }

  if (error && !currentRequest) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center text-red-600 mb-4">
            <AlertCircle className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-center mb-4">Error</h2>
          <p className="text-slate-600 mb-6 text-center">{error}</p>
          <button
            onClick={fetchAvailableProviders}
            className="w-full py-2 px-4 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (requestStatus === 'PENDING') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center text-blue-600 mb-4">
            <Clock className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-center mb-4">Request Submitted</h2>
          <p className="text-slate-600 mb-4 text-center">
            Your request to work with {currentRequest?.provider?.businessName} has been submitted.
          </p>
          <p className="text-slate-500 text-sm mb-6 text-center">
            The provider will review your request and you'll be notified once they respond.
            You can continue to explore the app while waiting.
          </p>
          <button
            onClick={handleContinueToDashboard}
            className="w-full py-2 px-4 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (requestStatus === 'ACCEPTED') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center text-green-600 mb-4">
            <CheckCircle className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-center mb-4">Request Accepted!</h2>
          <p className="text-slate-600 mb-4 text-center">
            {currentRequest?.provider?.businessName} has accepted your request.
          </p>
          <p className="text-slate-500 text-sm mb-6 text-center">
            You can now book appointments with your provider.
          </p>
          <button
            onClick={handleContinueToDashboard}
            className="w-full py-2 px-4 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (requestStatus === 'DENIED') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center text-red-600 mb-4">
            <XCircle className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-center mb-4">Request Denied</h2>
          <p className="text-slate-600 mb-4 text-center">
            {currentRequest?.provider?.businessName} was unable to accept your request at this time.
          </p>
          <p className="text-slate-500 text-sm mb-6 text-center">
            You can choose another provider from the list below.
          </p>
          <button
            onClick={() => {
              setCurrentRequest(null);
              setRequestStatus(null);
              setSelectedProvider(null);
            }}
            className="w-full py-2 px-4 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] mb-4"
          >
            Choose Another Provider
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-[#B07A4E] rounded-full mb-4">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-normal text-slate-800 mb-2">Choose Your Massage Provider</h1>
          <p className="text-slate-600">
            Select the massage therapist you'd like to work with. They'll review your request and get back to you soon.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`bg-white rounded-lg shadow-md p-6 border-2 transition-all ${
                selectedProvider?.id === provider.id
                  ? 'border-[#B07A4E] bg-[#B07A4E]/5'
                  : 'border-transparent hover:border-[#B07A4E] hover:bg-[#B07A4E]/5'
              }`}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-[#B07A4E] rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserCheck className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-medium text-slate-800 mb-2">
                  {provider.businessName}
                </h3>
                <p className="text-slate-600 text-sm mb-4">{provider.email}</p>
                <button
                  onClick={() => handleProviderSelect(provider)}
                  disabled={isLoading}
                  className="w-full py-2 px-4 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading && selectedProvider?.id === provider.id ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Requesting...
                    </div>
                  ) : (
                    'Request Assignment'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {providers.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">
              No providers available at the moment
            </h3>
            <p className="text-slate-500">
              Please check back later or contact support for assistance.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            onClick={handleContinueToDashboard}
            className="inline-flex items-center px-6 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition"
          >
            Skip for now and continue to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProviderSelection;
