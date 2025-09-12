import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import {
  Users, Mail, UserPlus, AlertCircle, CheckCircle,
  ExternalLink, MapPin, Clock, Search, Phone, Calendar,
  MessageSquare, Clock as ClockIcon, UserX
} from 'lucide-react';
import axios from 'axios';
import { SkeletonText } from './ui/Skeleton';

const ProviderClients = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true);
  const [error, setError] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationExpires, setInvitationExpires] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'recent', 'email'
  const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'invitations'

  useEffect(() => {
    if (user?.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    
    fetchClients();
    fetchInvitations();
  }, [user, navigate]);

  const fetchClients = async () => {
    try {
      const response = await axios.get('/api/users/provider/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setError('Failed to fetch clients');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      const response = await axios.get('/api/invitations/provider');
      setInvitations(response.data);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      setError('Failed to fetch invitations');
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  // Filter and sort clients
  const getFilteredClients = () => {
    let filtered = [...clients];
    
    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(client => {
        const searchLower = searchQuery.toLowerCase();
        const fullName = (client.profile?.fullName || '').toLowerCase();
        const email = client.email.toLowerCase();
        const phone = (client.profile?.phoneNumber || '').toLowerCase();
        
        return fullName.includes(searchLower) || 
               email.includes(searchLower) || 
               phone.includes(searchLower);
      });
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const nameA = (a.profile?.fullName || 'Unnamed').toLowerCase();
          const nameB = (b.profile?.fullName || 'Unnamed').toLowerCase();
          return nameA.localeCompare(nameB);
        case 'email':
          return a.email.localeCompare(b.email);
        case 'recent':
          // Assuming we'll have lastBookingDate in future
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        default:
          return 0;
      }
    });
    
    return filtered;
  };

  const filteredClients = getFilteredClients();

  const handleInviteClient = async (e) => {
    e.preventDefault();
    setInviteStatus(null);
    setInvitationCode('');
    setInvitationExpires('');
    
    try {
      const response = await axios.post('/api/invitations', {
        email: inviteEmail
      });

      if (response.data.status === 'exists') {
        setInviteStatus({
          type: 'exists',
          message: 'Invitation already exists for this email'
        });
        setInvitationCode(response.data.code);
        setInvitationExpires(response.data.expiresAt);
      } else {
        setInviteStatus({
          type: 'success',
          message: 'Invitation created successfully'
        });
        setInvitationCode(response.data.code);
        setInvitationExpires(response.data.expiresAt);
        setInviteEmail('');
        // Refresh the invitations list
        fetchInvitations();
        setTimeout(() => setShowInviteModal(false), 3000);
      }
    } catch (error) {
      setInviteStatus({
        type: 'error',
        message: error.response?.data?.message || 'Failed to send invitation'
      });
    }
  };


  const InviteModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Invite New Client</h3>
        
        <form onSubmit={handleInviteClient}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Client's Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="client@example.com"
              required
            />
          </div>

          {inviteStatus && (
            <div className={`mb-4 p-3 rounded-md ${
              inviteStatus.type === 'success'
                ? 'bg-green-50 text-green-700'
                : inviteStatus.type === 'exists'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-700'
            }`}>
              <div className="flex items-center">
                {inviteStatus.type === 'success'
                  ? <CheckCircle className="w-4 h-4 mr-2" />
                  : inviteStatus.type === 'exists'
                  ? <CheckCircle className="w-4 h-4 mr-2" />
                  : <AlertCircle className="w-4 h-4 mr-2" />
                }
                {inviteStatus.message}
              </div>
            </div>
          )}

          {invitationCode && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Invitation Code
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={invitationCode}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-md bg-slate-50 mr-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(invitationCode);
                    // Optional: show a quick copied message
                  }}
                  className="px-3 py-2 bg-[#387c7e] text-white rounded-md hover:bg-[#2c5f60]"
                >
                  Copy
                </button>
              </div>
              {invitationExpires && (
                <p className="mt-2 text-sm text-slate-500">
                  Expires: {new Date(invitationExpires).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setShowInviteModal(false);
                setInvitationCode('');
                setInvitationExpires('');
                setInviteStatus(null);
              }}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-md"
            >
              Close
            </button>
            {!invitationCode && (
              <button
                type="submit"
                className="px-4 py-2 bg-[#387c7e] text-white rounded-md
                  hover:bg-[#2c5f60]"
              >
                Send Invitation
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  // Filter invitations based on search query
  const getFilteredInvitations = () => {
    let filtered = [...invitations];
    
    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(invitation => {
        const searchLower = searchQuery.toLowerCase();
        const email = invitation.email.toLowerCase();
        
        return email.includes(searchLower);
      });
    }
    
    // Sort by creation date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return filtered;
  };

  const filteredInvitations = getFilteredInvitations();

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Client Management</h1>
            <p className="text-sm text-slate-500 mt-1">
              {activeTab === 'clients' ? `${clients.length} registered clients` : `${invitations.length} pending invitations`}
            </p>
          </div>
          
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-[#387c7e]
              text-white rounded-md hover:bg-[#2c5f60] w-full sm:w-auto"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Invite Client
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('clients')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'clients'
                  ? 'border-[#387c7e] text-[#387c7e]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Registered Clients ({clients.length})
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'invitations'
                  ? 'border-[#387c7e] text-[#387c7e]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Pending Invitations ({invitations.length})
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
            <div className="flex">
              <AlertCircle className="w-5 h-5 mr-2" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Search and Filter Bar */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'clients' ? "Search by name, email, or phone..." : "Search by email..."}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md
                  focus:ring-[#387c7e] focus:border-[#387c7e]"
              />
            </div>
            
            {activeTab === 'clients' && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-md
                  focus:ring-[#387c7e] focus:border-[#387c7e]"
              >
                <option value="name">Sort by Name</option>
                <option value="email">Sort by Email</option>
                <option value="recent">Sort by Recent</option>
              </select>
            )}
          </div>
          
          {searchQuery && (
            <p className="text-sm text-slate-600">
              Found {activeTab === 'clients' ? filteredClients.length : filteredInvitations.length}
              {activeTab === 'clients' ?
                ` client${filteredClients.length !== 1 ? 's' : ''}` :
                ` invitation${filteredInvitations.length !== 1 ? 's' : ''}`
              }
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {activeTab === 'clients' ? (
            <>
              {isLoading ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-3" />
                          <div className="space-y-2">
                            <div className="flex items-center">
                              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse mr-2" />
                              <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                            </div>
                            <div className="flex items-center">
                              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse mr-2" />
                              <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
                          <div className="h-8 w-28 bg-slate-200 rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">No clients yet.</p>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-[#387c7e] text-white rounded-md hover:bg-[#2c5f60]"
                  >
                    <UserPlus className="w-5 h-5 mr-2" />
                    Invite Your First Client
                  </button>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-8 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2">No clients found matching "{searchQuery}"</p>
                  <p className="text-sm text-slate-500">Try adjusting your search terms</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {filteredClients.map(client => (
                    <div key={client._id} className="p-4 sm:p-6 hover:bg-slate-50">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <h3 className="text-base sm:text-lg font-medium text-slate-900">
                            {client.profile?.fullName || 'Unnamed Client'}
                          </h3>
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center text-sm text-slate-500">
                              <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </div>
                            {client.profile?.address && (
                              <div className="flex items-center text-sm text-slate-500">
                                <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                                <span className="truncate">{client.profile.address.formatted}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-row sm:flex-col lg:flex-row gap-2">
                          {client.profile?.phoneNumber && (
                            <button
                              onClick={() => window.location.href = `tel:${client.profile.phoneNumber}`}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-slate-700
                                hover:bg-slate-100 rounded-md border border-slate-200 flex-1 sm:flex-initial"
                            >
                              <Phone className="w-4 h-4 mr-1" />
                              Call
                            </button>
                          )}
                          {client.profile?.phoneNumber && (
                            <button
                              onClick={() => window.location.href = `sms:${client.profile.phoneNumber}`}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-slate-700
                                hover:bg-slate-100 rounded-md border border-slate-200 flex-1 sm:flex-initial"
                            >
                              <MessageSquare className="w-4 h-4 mr-1" />
                              Text
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/provider/clients/${client._id}`)}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-[#387c7e]
                              hover:bg-[#387c7e]/10 rounded-md flex-1 sm:flex-initial"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {isLoadingInvitations ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-3" />
                          <div className="space-y-2">
                            <div className="flex items-center">
                              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse mr-2" />
                              <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                            </div>
                            <div className="flex items-center">
                              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse mr-2" />
                              <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : invitations.length === 0 ? (
                <div className="p-8 text-center">
                  <UserX className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">No pending invitations.</p>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-[#387c7e] text-white rounded-md hover:bg-[#2c5f60]"
                  >
                    <UserPlus className="w-5 h-5 mr-2" />
                    Send Your First Invitation
                  </button>
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="p-8 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2">No invitations found matching "{searchQuery}"</p>
                  <p className="text-sm text-slate-500">Try adjusting your search terms</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {filteredInvitations.map(invitation => (
                    <div key={invitation._id} className="p-4 sm:p-6 hover:bg-slate-50">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <h3 className="text-base sm:text-lg font-medium text-slate-900">
                            {invitation.email}
                          </h3>
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center text-sm text-slate-500">
                              <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">{invitation.email}</span>
                            </div>
                            <div className="flex items-center text-sm text-slate-500">
                              <ClockIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">
                                Invited on {new Date(invitation.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center text-sm text-slate-500">
                              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">
                                Expires on {new Date(invitation.expires).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-row sm:flex-col lg:flex-row gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(invitation.token);
                              // Optional: show a quick copied message
                            }}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-slate-700
                              hover:bg-slate-100 rounded-md border border-slate-200 flex-1 sm:flex-initial"
                          >
                            Copy Invite Code
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showInviteModal && <InviteModal />}
    </div>
  );
};

export default ProviderClients;
