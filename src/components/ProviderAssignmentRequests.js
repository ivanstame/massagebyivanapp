import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import api from '../services/api';
import { CheckCircle, XCircle, Clock, User, Mail, Phone, MessageSquare } from 'lucide-react';

const ProviderAssignmentRequests = () => {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingRequest, setProcessingRequest] = useState(null);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      const response = await api.get('/api/provider-requests/pending');
      setRequests(response.data.requests);
    } catch (err) {
      console.error('Error fetching pending requests:', err);
      setError('Failed to load pending requests');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    setProcessingRequest(requestId);
    try {
      await api.put(`/api/provider-requests/${requestId}/accept`);
      // Refresh the list after accepting
      await fetchPendingRequests();
    } catch (err) {
      console.error('Error accepting request:', err);
      setError('Failed to accept request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleDenyRequest = async (requestId) => {
    setProcessingRequest(requestId);
    try {
      await api.put(`/api/provider-requests/${requestId}/deny`);
      // Refresh the list after denying
      await fetchPendingRequests();
    } catch (err) {
      console.error('Error denying request:', err);
      setError('Failed to deny request');
    } finally {
      setProcessingRequest(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#009ea5] mx-auto mb-4"></div>
          <p className="text-slate-600">Loading assignment requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-slate-800 mb-2">Client Assignment Requests</h1>
          <p className="text-slate-600">
            Review and manage client requests to work with you
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Clock className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-slate-700 mb-2">No Pending Requests</h2>
            <p className="text-slate-500">
              You don't have any pending client assignment requests at the moment.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-[#009ea5] rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-slate-800">
                        {request.client.fullName || 'Unknown Client'}
                      </h3>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600">
                        {request.client.email && (
                          <div className="flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {request.client.email}
                          </div>
                        )}
                        {request.client.phoneNumber && (
                          <div className="flex items-center">
                            <Phone className="h-4 w-4 mr-1" />
                            {request.client.phoneNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    Requested {new Date(request.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {request.clientMessage && (
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start mb-2">
                      <MessageSquare className="h-4 w-4 text-slate-500 mr-2 mt-0.5" />
                      <span className="text-sm font-medium text-slate-700">Client Message:</span>
                    </div>
                    <p className="text-sm text-slate-600">{request.clientMessage}</p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    disabled={processingRequest === request.id}
                    className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingRequest === request.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Accept
                  </button>
                  <button
                    onClick={() => handleDenyRequest(request.id)}
                    disabled={processingRequest === request.id}
                    className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingRequest === request.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderAssignmentRequests;
