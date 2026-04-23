import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import {
  Users, Mail, UserPlus, AlertCircle, CheckCircle,
  ExternalLink, MapPin, Clock, Search, Phone, Calendar,
  MessageSquare, Clock as ClockIcon, UserX, Copy, Link as LinkIcon, Edit3,
  DollarSign, AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { SkeletonText } from './ui/Skeleton';
import AddManagedClientModal from './AddManagedClientModal';

const formatClientAddress = (address) => {
  if (!address) return '';
  // Try formatted first, then build from parts
  if (address.formatted) return address.formatted;
  const parts = [address.street, address.city, address.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '';
};

const formatRelativeDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const futureDiffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    // Future date
    if (futureDiffDays === 0) return 'Today';
    if (futureDiffDays === 1) return 'Tomorrow';
    if (futureDiffDays < 7) return `In ${futureDiffDays} days`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Past date
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ProviderClients = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true);
  const [error, setError] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddManagedModal, setShowAddManagedModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationExpires, setInvitationExpires] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'recent', 'email'
  const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'invitations'
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);
  const [isEditingJoinCode, setIsEditingJoinCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeError, setJoinCodeError] = useState('');
  const [isSavingJoinCode, setIsSavingJoinCode] = useState(false);

  useEffect(() => {
    if (user?.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    
    fetchClients();
    fetchInvitations();
    fetchJoinCode();
  }, [user, navigate]);

  const fetchJoinCode = async () => {
    try {
      const response = await axios.get('/api/join-code');
      setJoinCode(response.data.joinCode || '');
    } catch (error) {
      console.error('Error fetching join code:', error);
    }
  };

  const copyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setJoinCodeCopied(true);
    setTimeout(() => setJoinCodeCopied(false), 2000);
  };

  const saveJoinCode = async () => {
    const code = joinCodeInput.toLowerCase().trim();
    if (!code || code.length < 3) {
      setJoinCodeError('Must be at least 3 characters');
      return;
    }
    if (!/^[a-z0-9]+$/.test(code)) {
      setJoinCodeError('Letters and numbers only');
      return;
    }
    setIsSavingJoinCode(true);
    setJoinCodeError('');
    try {
      const response = await axios.put('/api/join-code', { joinCode: code });
      setJoinCode(response.data.joinCode);
      setIsEditingJoinCode(false);
      setJoinCodeInput('');
    } catch (err) {
      setJoinCodeError(err.response?.data?.message || 'Failed to save join code');
    } finally {
      setIsSavingJoinCode(false);
    }
  };

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
        const email = (client.email || '').toLowerCase();
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
          return (a.email || '').localeCompare(b.email || '');
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
      <div className="bg-paper-elev rounded-lg shadow-xl p-6 w-full max-w-md">
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
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="client@example.com"
              required
            />
          </div>

          {inviteStatus && (
            <div className={`mb-4 p-3 rounded-lg ${
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
                  className="flex-1 px-3 py-2 border rounded-lg bg-paper-deep mr-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(invitationCode);
                    // Optional: show a quick copied message
                  }}
                  className="px-3 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
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
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Close
            </button>
            {!invitationCode && (
              <button
                type="submit"
                className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg
                  hover:bg-[#8A5D36]"
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
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-7xl mx-auto px-5 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-4">
          <div>
            <div className="av-eyebrow mb-2">Your people</div>
            <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
              Clients
            </h1>
            <p className="text-sm text-ink-2 mt-1.5">
              {activeTab === 'clients' ? `${clients.length} registered` : `${invitations.length} pending invitations`}
            </p>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowAddManagedModal(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2
                bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Add Client
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2
                text-[#B07A4E] border border-[#B07A4E] rounded-lg hover:bg-[#B07A4E]/10"
            >
              <Mail className="w-5 h-5 mr-2" />
              Invite
            </button>
          </div>
        </div>

        {/* Join Code Card */}
        <div className="mb-6 bg-[#B07A4E]/5 border border-[#B07A4E]/20 rounded-lg p-4">
          {joinCode && !isEditingJoinCode ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center">
                <LinkIcon className="w-5 h-5 text-[#B07A4E] mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Your Client Join Code</p>
                  <p className="text-xs text-slate-500">Share this code with clients so they can sign up and connect with you</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-wider text-[#B07A4E] bg-paper-elev px-4 py-1.5 rounded-lg border border-[#B07A4E]/20">
                  {joinCode.toUpperCase()}
                </span>
                <button
                  onClick={copyJoinCode}
                  className="inline-flex items-center px-3 py-1.5 text-sm text-[#B07A4E]
                    hover:bg-[#B07A4E]/10 rounded-lg transition"
                >
                  {joinCodeCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setIsEditingJoinCode(true); setJoinCodeInput(joinCode); }}
                  className="inline-flex items-center px-2 py-1.5 text-sm text-slate-500
                    hover:bg-slate-100 rounded-lg transition"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center mb-3">
                <LinkIcon className="w-5 h-5 text-[#B07A4E] mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {joinCode ? 'Edit Join Code' : 'Set Up Your Client Join Code'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {joinCode ? 'Change your join code (once every 30 days)' : 'Create a short code that clients enter when signing up to connect with you'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                    setJoinCodeError('');
                  }}
                  placeholder="e.g. ivan"
                  maxLength={20}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-lg tracking-wider
                    focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                  onKeyPress={(e) => { if (e.key === 'Enter') saveJoinCode(); }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveJoinCode}
                    disabled={isSavingJoinCode || !joinCodeInput.trim()}
                    className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingJoinCode ? 'Saving...' : 'Save'}
                  </button>
                  {joinCode && (
                    <button
                      onClick={() => { setIsEditingJoinCode(false); setJoinCodeInput(''); setJoinCodeError(''); }}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-paper-deep"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {joinCodeError && (
                <p className="mt-2 text-sm text-red-600">{joinCodeError}</p>
              )}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-line">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('clients')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'clients'
                  ? 'border-[#B07A4E] text-[#B07A4E]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Registered Clients ({clients.length})
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'invitations'
                  ? 'border-[#B07A4E] text-[#B07A4E]'
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
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg
                  focus:ring-[#B07A4E] focus:border-[#B07A4E]"
              />
            </div>
            
            {activeTab === 'clients' && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg
                  focus:ring-[#B07A4E] focus:border-[#B07A4E]"
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

        <div className="bg-paper-elev rounded-lg shadow-sm border border-line">
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
                  <p className="text-slate-600 mb-1">No clients yet.</p>
                  <p className="text-sm text-slate-500 mb-4">
                    Add existing clients yourself, or invite new ones to sign up.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      onClick={() => setShowAddManagedModal(true)}
                      className="inline-flex items-center justify-center px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
                    >
                      <UserPlus className="w-5 h-5 mr-2" />
                      Add a Client
                    </button>
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="inline-flex items-center justify-center px-4 py-2 text-[#B07A4E] border border-[#B07A4E] rounded-lg hover:bg-[#B07A4E]/10"
                    >
                      <Mail className="w-5 h-5 mr-2" />
                      Invite to Sign Up
                    </button>
                  </div>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-8 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2">No clients found matching "{searchQuery}"</p>
                  <p className="text-sm text-slate-500">Try adjusting your search terms</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {filteredClients.map(client => {
                    const address = formatClientAddress(client.profile?.address);
                    const stats = client.bookingStats;
                    const hasHealthInfo = client.profile?.allergies || client.profile?.medicalConditions;

                    return (
                      <div
                        key={client._id}
                        className="p-4 sm:p-6 hover:bg-paper-deep cursor-pointer transition-colors"
                        onClick={() => navigate(`/provider/clients/${client._id}`)}
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          {/* Left: Client info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-base sm:text-lg font-medium text-slate-900 truncate">
                                {client.profile?.fullName || 'Unnamed Client'}
                              </h3>
                              {client.isManaged && (
                                <span
                                  className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0"
                                  title="Client profile you manage on their behalf"
                                >
                                  Managed
                                </span>
                              )}
                              {hasHealthInfo && (
                                <span title="Has health info on file">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                </span>
                              )}
                            </div>

                            {/* Contact info row */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              {client.email && (
                                <div className="flex items-center text-sm text-slate-500">
                                  <Mail className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                                  <span className="truncate">{client.email}</span>
                                </div>
                              )}
                              {client.profile?.phoneNumber && (
                                <div className="flex items-center text-sm text-slate-500">
                                  <Phone className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                                  <span>{client.profile.phoneNumber}</span>
                                </div>
                              )}
                              {address && (
                                <div className="flex items-center text-sm text-slate-500">
                                  <MapPin className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                                  <span className="truncate">{address}</span>
                                </div>
                              )}
                            </div>

                            {/* Stats row */}
                            {stats && stats.totalAppointments > 0 && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                <span className="inline-flex items-center text-xs text-slate-500">
                                  <Calendar className="w-3.5 h-3.5 mr-1" />
                                  {stats.totalAppointments} session{stats.totalAppointments !== 1 ? 's' : ''}
                                </span>
                                {stats.lastAppointmentDate && (
                                  <span className="text-xs text-slate-500">
                                    Last: {formatRelativeDate(stats.lastAppointmentDate)}
                                  </span>
                                )}
                                {stats.nextAppointmentDate && (
                                  <span className="text-xs text-[#B07A4E] font-medium">
                                    Next: {formatRelativeDate(stats.nextAppointmentDate)}
                                  </span>
                                )}
                                {stats.totalRevenue > 0 && (
                                  <span className="inline-flex items-center text-xs text-slate-500">
                                    <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                                    {stats.totalRevenue.toFixed(0)}
                                  </span>
                                )}
                              </div>
                            )}
                            {stats && stats.totalAppointments === 0 && (
                              <p className="mt-2 text-xs text-slate-400 italic">No appointments yet</p>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex flex-row sm:flex-col lg:flex-row gap-2 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {client.profile?.phoneNumber && (
                              <button
                                onClick={() => window.location.href = `tel:${client.profile.phoneNumber}`}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-slate-700
                                  hover:bg-slate-100 rounded-lg border border-line flex-1 sm:flex-initial"
                              >
                                <Phone className="w-4 h-4 mr-1" />
                                Call
                              </button>
                            )}
                            {client.profile?.phoneNumber && (
                              <button
                                onClick={() => window.location.href = `sms:${client.profile.phoneNumber}`}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-slate-700
                                  hover:bg-slate-100 rounded-lg border border-line flex-1 sm:flex-initial"
                              >
                                <MessageSquare className="w-4 h-4 mr-1" />
                                Text
                              </button>
                            )}
                            <button
                              onClick={() => navigate(`/provider/clients/${client._id}`)}
                              className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-[#B07A4E]
                                hover:bg-[#B07A4E]/10 rounded-lg flex-1 sm:flex-initial"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                    className="inline-flex items-center px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
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
                    <div key={invitation._id} className="p-4 sm:p-6 hover:bg-paper-deep">
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
                              hover:bg-slate-100 rounded-lg border border-line flex-1 sm:flex-initial"
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
      {showAddManagedModal && (
        <AddManagedClientModal
          onClose={() => setShowAddManagedModal(false)}
          onCreated={(newClient) => {
            setShowAddManagedModal(false);
            // Seed the new row into the list so the provider sees it immediately.
            setClients(prev => [{ ...newClient, bookingStats: null }, ...prev]);
          }}
        />
      )}
    </div>
  );
};

export default ProviderClients;
