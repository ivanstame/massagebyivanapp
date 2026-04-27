import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import {
  User, Phone, Mail, MapPin, Calendar, Clock,
  AlertCircle, MessageSquare, FileText,
  MoreHorizontal, Trash2, Edit, DollarSign,
  CheckCircle, Clock8, BarChart2, StickyNote, CalendarPlus,
  Send, Copy, Loader2, ChevronDown, ChevronRight, Repeat
} from 'lucide-react';
import axios from 'axios';
import moment from 'moment-timezone';
import ClientPackagesSection from './ClientPackagesSection';
import StandingAppointmentsSection from './StandingAppointmentsSection';

const ProviderClientDetails = () => {
  console.log('NEW ProviderClientDetails loaded');
  const { clientId } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  
  // Helper function to format address
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.street}${address.unit ? `, ${address.unit}` : ''}, ${address.city}, ${address.state} ${address.zip}`;
  };
  
  const [client, setClient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditNotes, setShowEditNotes] = useState(false);
  const [clientNotes, setClientNotes] = useState('');
  const [stats, setStats] = useState({
    totalAppointments: 0,
    upcomingAppointments: 0,
    completedAppointments: 0,
    totalRevenue: 0
  });

  // Claim-link generation state. Kept minimal — the provider generates a
  // link, copies it (or uses the prefilled SMS/email deep links), and hands
  // it off however makes sense for their client. Regenerating replaces the
  // previous link server-side.
  const [claimLink, setClaimLink] = useState(null);
  const [claimLinkExpiresAt, setClaimLinkExpiresAt] = useState(null);
  const [generatingClaim, setGeneratingClaim] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    
    fetchClientDetails();
    fetchClientAppointments();
  }, [clientId, user]);

  const fetchClientDetails = async () => {
    try {
      const response = await axios.get(`/api/users/provider/clients/${clientId}`);
      setClient(response.data);
      console.log('Client data:', response.data);
      
      // Set client notes from the clientProfile field
      if (response.data.clientProfile && response.data.clientProfile.notes) {
        setClientNotes(response.data.clientProfile.notes);
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
      setError('Failed to load client details');
    }
  };

  const fetchClientAppointments = async () => {
    try {
      const response = await axios.get(`/api/bookings`, {
        params: { clientId, providerId: user._id }
      });
      setAppointments(response.data);
      
      // Calculate statistics
      if (response.data && response.data.length > 0) {
        const now = new Date();
        const upcoming = response.data.filter(apt => new Date(apt.date) > now && apt.status !== 'cancelled');
        const completed = response.data.filter(apt => apt.status === 'completed');
        
        // Calculate total revenue (assuming each appointment has a price field)
        // If price is not available, we'll use a default value based on duration
        const revenue = response.data.reduce((total, apt) => {
          if (apt.price) {
            return total + apt.price;
          } else if (apt.duration) {
            // Estimate price based on duration if actual price not available
            const hourlyRate = 100; // Default hourly rate
            return total + (apt.duration / 60) * hourlyRate;
          }
          return total;
        }, 0);
        
        setStats({
          totalAppointments: response.data.length,
          upcomingAppointments: upcoming.length,
          completedAppointments: completed.length,
          totalRevenue: revenue
        });
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const handleRemoveClient = async () => {
    try {
      await axios.delete(`/api/users/provider/clients/${clientId}`);
      navigate('/provider/clients');
    } catch (error) {
      setError('Failed to remove client');
    }
  };
  
  const handleGenerateClaimLink = async () => {
    setClaimError(null);
    setCopied(false);
    setGeneratingClaim(true);
    try {
      const res = await axios.post(`/api/claim/generate/${clientId}`);
      setClaimLink(res.data.url);
      setClaimLinkExpiresAt(res.data.expiresAt);
    } catch (err) {
      setClaimError(err.response?.data?.message || 'Failed to generate claim link');
    } finally {
      setGeneratingClaim(false);
    }
  };

  const handleCopyClaimLink = () => {
    if (!claimLink) return;
    navigator.clipboard.writeText(claimLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateNotes = async () => {
    try {
      await axios.patch(`/api/users/provider/clients/${clientId}/notes`, {
        notes: clientNotes
      });
      
      // Update the client object with the new notes
      setClient(prevClient => ({
        ...prevClient,
        clientProfile: {
          ...prevClient.clientProfile,
          notes: clientNotes
        }
      }));
      
      setShowEditNotes(false);
    } catch (error) {
      console.error('Error updating client notes:', error);
      setError('Failed to update client notes');
    }
  };

  const DeleteConfirmationModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-paper-elev rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-medium text-slate-900 mb-4">
          {client?.isManaged ? 'Delete Managed Client' : 'Remove Client'}
        </h3>
        <p className="text-slate-500 mb-4">
          {client?.isManaged
            ? 'This will permanently delete this client profile and all of their appointments. This action cannot be undone.'
            : 'Are you sure you want to remove this client? This action cannot be undone.'}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleRemoveClient}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            {client?.isManaged ? 'Delete' : 'Remove Client'}
          </button>
        </div>
      </div>
    </div>
  );
  
  const EditNotesModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-paper-elev rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Edit Client Notes</h3>
        <textarea
          value={clientNotes}
          onChange={(e) => setClientNotes(e.target.value)}
          className="w-full p-3 border border-slate-300 rounded-lg mb-4 h-40"
          placeholder="Enter notes about this client..."
        />
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShowEditNotes(false)}
            className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdateNotes}
            className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="pt-16">
        <div className="max-w-7xl mx-auto p-4">
          <div className="text-center">Loading client details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-16">
        <div className="max-w-7xl mx-auto p-4">
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
            <div className="flex">
              <AlertCircle className="w-5 h-5 mr-2" />
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-4">
        {/* Client Header */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <div className="flex justify-between items-start">
            <div className="flex items-start space-x-4">
              <div className="bg-slate-100 p-3 rounded-full">
                <User className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900">
                    {client?.profile?.fullName || 'Unnamed Client'}
                  </h1>
                  {client?.isManaged && (
                    <span
                      className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600"
                      title="Client profile you manage on their behalf"
                    >
                      Managed
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {client?.email && (
                    <div className="flex items-center text-slate-600">
                      <Mail className="w-4 h-4 mr-2" />
                      {client.email}
                    </div>
                  )}
                  {client?.profile?.phoneNumber && (
                    <div className="flex items-center text-slate-600">
                      <Phone className="w-4 h-4 mr-2" />
                      {client.profile.phoneNumber}
                    </div>
                  )}
                  {client?.profile?.address && (
                    <div className="flex items-center text-slate-600">
                      <MapPin className="w-4 h-4 mr-2" />
                      {formatAddress(client.profile.address)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigate(`/book?clientId=${clientId}`)}
                className="inline-flex items-center px-3 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] text-sm font-medium"
              >
                <CalendarPlus className="w-4 h-4 mr-1.5" />
                Book appointment
              </button>
              {client?.profile?.phoneNumber && (
                <button
                  onClick={() => window.location.href = `tel:${client.profile.phoneNumber}`}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  title="Call client"
                >
                  <Phone className="w-5 h-5" />
                </button>
              )}
              {client?.profile?.phoneNumber && (
                <button
                  onClick={() => window.location.href = `sms:${client.profile.phoneNumber}`}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  title="Text client"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Claim-link section — only shown for managed clients. Lets the
            provider send a one-time signup link so the client can set a
            password and take ownership of this account. */}
        {client?.isManaged && (
          <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-lg font-medium text-slate-900">Let {client.profile?.fullName?.split(' ')[0] || 'them'} take over</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Send a one-time link so they can set a password and manage their own
                  appointments. After they claim it, you won't be able to edit their profile anymore.
                </p>
              </div>
            </div>

            {claimError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{claimError}</p>
              </div>
            )}

            {!claimLink ? (
              <button
                onClick={handleGenerateClaimLink}
                disabled={generatingClaim}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] disabled:opacity-50 text-sm font-medium"
              >
                {generatingClaim ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Send className="w-4 h-4" /> Generate claim link</>
                )}
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="p-3 bg-paper-deep border border-line rounded-lg">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Claim link</p>
                  <p className="text-xs text-slate-900 font-mono break-all">{claimLink}</p>
                  {claimLinkExpiresAt && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Expires {new Date(claimLinkExpiresAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}. Single-use.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCopyClaimLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-line rounded-lg hover:bg-paper-deep"
                  >
                    {copied ? (
                      <><CheckCircle className="w-4 h-4 text-green-600" /> Copied</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copy link</>
                    )}
                  </button>

                  {client.profile?.phoneNumber && (
                    <a
                      href={`sms:${client.profile.phoneNumber}?&body=${encodeURIComponent(
                        `Hi ${client.profile?.fullName?.split(' ')[0] || ''}, set up your Avayble account here: ${claimLink}`
                      )}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-line rounded-lg hover:bg-paper-deep"
                    >
                      <MessageSquare className="w-4 h-4" /> Send via SMS
                    </a>
                  )}

                  {client.email && (
                    <a
                      href={`mailto:${client.email}?subject=${encodeURIComponent('Set up your Avayble account')}&body=${encodeURIComponent(
                        `Hi ${client.profile?.fullName?.split(' ')[0] || ''},\n\nFollow this link to set a password and manage your Avayble appointments:\n\n${claimLink}\n\nThe link expires in 7 days and can only be used once.`
                      )}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-line rounded-lg hover:bg-paper-deep"
                    >
                      <Mail className="w-4 h-4" /> Send via email
                    </a>
                  )}

                  <button
                    onClick={handleGenerateClaimLink}
                    disabled={generatingClaim}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 underline"
                  >
                    {generatingClaim ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Client Stats Section */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Client Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#B07A4E]/10 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Calendar className="w-5 h-5 text-[#B07A4E] mr-2" />
                <h3 className="text-sm font-medium text-[#8A5D36]">Total Sessions</h3>
              </div>
              <p className="text-2xl font-bold text-[#8A5D36]">{stats.totalAppointments}</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                <h3 className="text-sm font-medium text-green-700">Completed</h3>
              </div>
              <p className="text-2xl font-bold text-green-900">{stats.completedAppointments}</p>
            </div>
            
            <div className="bg-teal-50 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Clock8 className="w-5 h-5 text-teal-500 mr-2" />
                <h3 className="text-sm font-medium text-teal-700">Upcoming</h3>
              </div>
              <p className="text-2xl font-bold text-teal-900">{stats.upcomingAppointments}</p>
            </div>
            
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <DollarSign className="w-5 h-5 text-amber-500 mr-2" />
                <h3 className="text-sm font-medium text-amber-700">Revenue</h3>
              </div>
              <p className="text-2xl font-bold text-amber-900">${stats.totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Packages — view, comp, cancel/refund, reinstate consumed credits */}
        <ClientPackagesSection
          clientId={clientId}
          clientName={client?.profile?.fullName || ''}
        />

        {/* Standing (recurring) appointments */}
        <StandingAppointmentsSection
          client={client}
          clientId={clientId}
        />

        {/* Client Notes Section */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-slate-900">Client Notes</h2>
            <button
              onClick={() => setShowEditNotes(true)}
              className="text-[#B07A4E] hover:text-[#8A5D36] flex items-center"
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit Notes
            </button>
          </div>
          <div className="bg-paper-deep p-4 rounded-lg">
            <div className="flex items-start">
              <StickyNote className="w-5 h-5 text-slate-400 mr-2 mt-1" />
              <p className="text-slate-700 whitespace-pre-wrap">
                {client?.clientProfile?.notes || 'No notes added yet.'}
              </p>
            </div>
          </div>
        </div>

        {/* Medical Info Section */}
        <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6 mb-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Medical Information</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-700">Allergies</h3>
              <p className="mt-1 text-slate-600">
                {client?.profile?.allergies || 'None reported'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-700">Medical Conditions</h3>
              <p className="mt-1 text-slate-600">
                {client?.profile?.medicalConditions || 'None reported'}
              </p>
            </div>
          </div>
        </div>

        {/* Appointments Section */}
        <AppointmentHistorySection
          appointments={appointments}
          clientId={clientId}
          navigate={navigate}
        />
      </div>

      {showDeleteConfirm && <DeleteConfirmationModal />}
      {showEditNotes && <EditNotesModal />}
    </div>
  );
};

// ── Appointment History section ──────────────────────────────────────
//
// Renders active appointments inline + collapses cancelled ones into a
// single accordion at the bottom. Inside the cancelled accordion, runs of
// occurrences from the same recurring series are folded into one summary
// row — series cancellations cascade into many docs and showing each one
// individually buries the signal that "this series ended" under noise.
//
// Industry-standard "keep the trail" without sacrificing readability:
// the data's still here, just not in your face.
const AppointmentHistorySection = ({ appointments, clientId, navigate }) => {
  const [showCancelled, setShowCancelled] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState({});

  const active = appointments.filter(a => a.status !== 'cancelled');
  const cancelled = appointments.filter(a => a.status === 'cancelled');

  // Group cancelled appointments by series. Each group becomes either a
  // single row (no series, or series with 1 occurrence) or a collapsed
  // summary (series with >1 occurrences).
  const cancelledGroups = (() => {
    const bySeries = new Map(); // seriesId → [appts]
    const standalone = [];
    for (const appt of cancelled) {
      const sid = appt.series && (appt.series._id || appt.series);
      if (sid) {
        const key = String(sid);
        if (!bySeries.has(key)) bySeries.set(key, []);
        bySeries.get(key).push(appt);
      } else {
        standalone.push(appt);
      }
    }
    const groups = [];
    for (const [sid, appts] of bySeries.entries()) {
      const sorted = [...appts].sort((a, b) =>
        new Date(a.date) - new Date(b.date)
      );
      groups.push({
        kind: appts.length > 1 ? 'series' : 'single',
        seriesId: sid,
        appointments: sorted,
      });
    }
    for (const appt of standalone) {
      groups.push({ kind: 'single', appointments: [appt] });
    }
    // Sort groups by their earliest occurrence date (most recent first
    // makes more sense for cancelled history — what was just killed).
    groups.sort((a, b) =>
      new Date(b.appointments[0].date) - new Date(a.appointments[0].date)
    );
    return groups;
  })();

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm border border-line p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-slate-900">Appointment History</h2>
        <button
          onClick={() => navigate(`/book?clientId=${clientId}`)}
          className="text-[#B07A4E] hover:text-[#8A5D36]"
        >
          Schedule New
        </button>
      </div>

      {appointments.length === 0 ? (
        <p className="text-slate-500">No appointments found</p>
      ) : (
        <>
          {/* Active appointments — inline. */}
          {active.length > 0 ? (
            <div className="space-y-4">
              {active.map(appt => (
                <AppointmentRow key={appt._id} appointment={appt} navigate={navigate} />
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No active appointments</p>
          )}

          {/* Cancelled accordion. */}
          {cancelled.length > 0 && (
            <div className="mt-6 pt-4 border-t border-line">
              <button
                onClick={() => setShowCancelled(s => !s)}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
              >
                {showCancelled
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />}
                {cancelled.length} cancelled appointment{cancelled.length === 1 ? '' : 's'}
                {!showCancelled && cancelledGroups.some(g => g.kind === 'series') && (
                  <span className="text-xs text-slate-400 ml-1">
                    (incl. recurring series)
                  </span>
                )}
              </button>

              {showCancelled && (
                <div className="mt-4 space-y-3 opacity-80">
                  {cancelledGroups.map((group, idx) => {
                    if (group.kind === 'series') {
                      const isExpanded = expandedSeriesIds[group.seriesId];
                      const first = group.appointments[0];
                      const last = group.appointments[group.appointments.length - 1];
                      const fmt = (d) => moment(d).format('MMM D, YYYY');
                      return (
                        <div
                          key={`series-${group.seriesId}`}
                          className="p-3 rounded-lg border border-line-soft bg-paper-deep"
                        >
                          <button
                            onClick={() => setExpandedSeriesIds(prev => ({
                              ...prev, [group.seriesId]: !prev[group.seriesId]
                            }))}
                            className="w-full flex items-start gap-3 text-left"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />}
                            <Repeat className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-700">
                                Recurring series cancelled — {group.appointments.length} occurrence{group.appointments.length === 1 ? '' : 's'}
                              </div>
                              <div className="text-xs text-slate-500">
                                {fmt(first.date)} – {fmt(last.date)}
                                {first.duration && ` · ${first.duration} min`}
                              </div>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="mt-3 pl-7 space-y-2">
                              {group.appointments.map(appt => (
                                <AppointmentRow
                                  key={appt._id}
                                  appointment={appt}
                                  navigate={navigate}
                                  compact
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <AppointmentRow
                        key={group.appointments[0]._id}
                        appointment={group.appointments[0]}
                        navigate={navigate}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Single appointment card. `compact` strips the duration/price/location row
// so series-expansion lists stay scannable.
const AppointmentRow = ({ appointment, navigate, compact = false }) => {
  const statusBadge = (
    <span className={`px-2 py-1 text-xs rounded-full ${
      appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
      appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
      appointment.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
      'bg-slate-100 text-slate-800'
    }`}>
      {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
    </span>
  );

  return (
    <div className={`${compact ? 'p-2' : 'p-4'} hover:bg-paper-deep rounded-lg border border-line-soft`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-start space-x-3">
          <Calendar className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-slate-400 mt-1`} />
          <div>
            <div className={`${compact ? 'text-sm' : 'font-medium'} text-slate-900`}>
              {moment(appointment.date).format('dddd, MMMM D, YYYY')}
            </div>
            <div className="text-sm text-slate-500">
              {moment(appointment.startTime, 'HH:mm').format('h:mm A')} -
              {moment(appointment.endTime, 'HH:mm').format('h:mm A')}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {statusBadge}
          <button
            onClick={() => navigate(`/provider/appointments/${appointment._id}`)}
            className="text-slate-600 hover:text-slate-900"
          >
            <FileText className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
        </div>
      </div>
      {!compact && (
        <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Duration:</span>
            <span className="ml-2 text-slate-700 font-medium">{appointment.duration} min</span>
          </div>
          <div>
            <span className="text-slate-500">Price:</span>
            <span className="ml-2 text-slate-700 font-medium">
              ${appointment.price ? appointment.price.toFixed(2) : ((appointment.duration / 60) * 100).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Location:</span>
            <span className="ml-2 text-slate-700 font-medium truncate max-w-[150px] inline-block">
              {appointment.location?.address ? appointment.location.address.split(',')[0] : 'N/A'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderClientDetails;
