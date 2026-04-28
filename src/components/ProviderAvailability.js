import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import ResponsiveCalendar from './ResponsiveCalendar';
import DaySchedule from './DaySchedule';
import AddAvailabilityModal from './AddAvailabilityModal';
import ModifyAvailabilityModal from './ModifyAvailabilityModal';
import BlockOffTimeModal from './BlockOffTimeModal';
import GoogleCalendarConflictModal from './GoogleCalendarConflictModal';
import AvailabilityList from './AvailabilityList';
import { Clock, Ban, AlertCircle, Calendar as CalendarIcon, List, Navigation, MapPin, ChevronDown } from 'lucide-react';
import { DateTime } from 'luxon';
import { TIME_FORMATS, DEFAULT_TZ } from '../utils/timeConstants';
import PinDropMap from './PinDropMap';


const DepartureEditor = ({ savedLocations, homeBase, currentAnchor, onSave, onCancel }) => {
  const [mode, setMode] = useState(
    currentAnchor?.lat ? 'custom' : 'homebase'
  );
  const [selectedLocId, setSelectedLocId] = useState(currentAnchor?.locationId || '');
  const [pinLocation, setPinLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);

  const handleSave = () => {
    if (mode === 'homebase') {
      // Clear anchor → revert to home base
      onSave({});
    } else if (mode === 'saved' && selectedLocId) {
      onSave({ locationId: selectedLocId });
    } else if (mode === 'pin' && pinLocation) {
      onSave({ name: 'Pinned Location', address: pinLocation.address || '', lat: pinLocation.lat, lng: pinLocation.lng });
    }
  };

  const nonHome = savedLocations.filter(l => !l.isHomeBase);

  return (
    <div className="mt-2 p-3 bg-paper-elev border border-line rounded-lg space-y-2">
      {/* Home base */}
      {homeBase && (
        <label className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm ${
          mode === 'homebase' ? 'bg-teal-50 border border-[#B07A4E]' : 'hover:bg-paper-deep'
        }`}>
          <input type="radio" name="dep" checked={mode === 'homebase'} onChange={() => setMode('homebase')}
            className="text-[#B07A4E] focus:ring-[#B07A4E]" />
          <MapPin className="w-3.5 h-3.5 text-slate-500" />
          <span className="truncate">Home Base — {homeBase.address}</span>
        </label>
      )}

      {/* Saved locations */}
      {nonHome.length > 0 && (
        <label className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-sm ${
          mode === 'saved' ? 'bg-teal-50 border border-[#B07A4E]' : 'hover:bg-paper-deep'
        }`}>
          <input type="radio" name="dep" checked={mode === 'saved'} onChange={() => setMode('saved')}
            className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]" />
          <div className="flex-1 min-w-0">
            <span>Saved Location</span>
            {mode === 'saved' && (
              <select value={selectedLocId} onChange={(e) => setSelectedLocId(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg p-1.5 text-sm focus:ring-2 focus:ring-[#B07A4E]">
                <option value="">Choose...</option>
                {nonHome.map(loc => (
                  <option key={loc._id} value={loc._id}>{loc.name}</option>
                ))}
              </select>
            )}
          </div>
        </label>
      )}

      {/* Pin drop */}
      <label className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-sm ${
        mode === 'pin' ? 'bg-teal-50 border border-[#B07A4E]' : 'hover:bg-paper-deep'
      }`}>
        <input type="radio" name="dep" checked={mode === 'pin'} onChange={() => { setMode('pin'); setShowMap(true); }}
          className="mt-0.5 text-[#B07A4E] focus:ring-[#B07A4E]" />
        <div className="flex-1">
          <span>Drop a Pin</span>
          {mode === 'pin' && showMap && (
            <div className="mt-2 rounded-lg overflow-hidden border border-line">
              <PinDropMap onLocationConfirmed={(loc) => setPinLocation(loc)} initialLocation={pinLocation} />
              {pinLocation && (
                <div className="p-2 bg-paper-deep text-xs text-slate-600">{pinLocation.address}</div>
              )}
            </div>
          )}
        </div>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          Cancel
        </button>
        <button onClick={handleSave} className="px-3 py-1.5 text-sm bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]">
          Update
        </button>
      </div>
    </div>
  );
};

const ProviderAvailability = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availabilityBlocks, setAvailabilityBlocks] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [error, setError] = useState(null);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [modifyModalOpen, setModifyModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [requestState, setRequestState] = useState('INITIAL');
  const [deleteConfirmBlock, setDeleteConfirmBlock] = useState(null);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' or 'list'
  const [showDepartureEditor, setShowDepartureEditor] = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [homeBase, setHomeBase] = useState(null);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [blockOffModalOpen, setBlockOffModalOpen] = useState(false);
  const [blockOffTargetBlock, setBlockOffTargetBlock] = useState(null);
  const [gcalConflicts, setGcalConflicts] = useState([]);
  const [pendingAction, setPendingAction] = useState(null); // { type, data }

  // Fetch saved locations for departure editor
  useEffect(() => {
    const fetchLocs = async () => {
      try {
        const res = await axios.get('/api/saved-locations', { withCredentials: true });
        const locs = res.data || [];
        setSavedLocations(locs);
        setHomeBase(locs.find(l => l.isHomeBase) || null);
      } catch (err) {
        console.error('Failed to fetch saved locations:', err);
      }
    };
    fetchLocs();
  }, []);

  const fetchAvailabilityBlocks = useCallback(async (date) => {
    try {
      // Convert date to LA time string
      const laDate = DateTime.fromJSDate(date)
        .setZone('America/Los_Angeles')
        .toFormat('yyyy-MM-dd');

      const response = await axios.get(
        `/api/availability/blocks/${laDate}`,
        { withCredentials: true }
      );
      setAvailabilityBlocks(response.data);
    } catch (error) {
      console.error('Error fetching availability blocks:', error);
    }
  }, []);

  const fetchBookings = useCallback(async (date) => {
    try {
      const response = await axios.get(
        `/api/bookings?date=${date.toISOString().split('T')[0]}`,
        { withCredentials: true }
      );
      // The /api/bookings endpoint includes cancelled bookings (other
      // pages — ProviderAppointments, BookingList — show them styled
      // muted/red as history). The availability day view is a "what's
      // blocking my day" surface, so cancelled entries shouldn't show
      // up on the timeline at all.
      const live = (response.data || []).filter(b => b.status !== 'cancelled');
      setBookings(live);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  }, []);

  const fetchBlockedTimes = useCallback(async (date) => {
    try {
      const laDate = DateTime.fromJSDate(date)
        .setZone('America/Los_Angeles')
        .toFormat('yyyy-MM-dd');
      const response = await axios.get(
        `/api/provider/blocked-times/${laDate}`,
        { withCredentials: true }
      );
      setBlockedTimes(response.data);
    } catch (error) {
      console.error('Error fetching blocked times:', error);
    }
  }, []);

  const fetchData = useCallback(async (date) => {
    try {
      setRequestState('LOADING');
      await Promise.all([
        fetchAvailabilityBlocks(date),
        fetchBookings(date),
        fetchBlockedTimes(date)
      ]);
      setRequestState('SUCCESS');
    } catch (error) {
      console.error('Data loading error:', error);
      setRequestState('ERROR');
    }
  }, [fetchAvailabilityBlocks, fetchBookings, fetchBlockedTimes]);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    fetchData(selectedDate);
  }, [selectedDate, user, navigate, fetchData]);

  // Find Google Calendar blocks that overlap a proposed time range on a given date
  const findGcalConflicts = useCallback((dateStr, startHHmm, endHHmm) => {
    const [sH, sM] = startHHmm.split(':').map(Number);
    const [eH, eM] = endHHmm.split(':').map(Number);
    const newStartMin = sH * 60 + sM;
    const newEndMin = eH * 60 + eM;

    return blockedTimes.filter(bt => {
      if (bt.source !== 'google_calendar' || bt.overridden) return false;
      if (bt.localDate !== dateStr) return false;
      const btStart = DateTime.fromISO(bt.start).setZone(DEFAULT_TZ);
      const btEnd = DateTime.fromISO(bt.end).setZone(DEFAULT_TZ);
      const btStartMin = btStart.hour * 60 + btStart.minute;
      const btEndMin = btEnd.hour * 60 + btEnd.minute;
      return newStartMin < btEndMin && newEndMin > btStartMin;
    });
  }, [blockedTimes]);

  const doAddAvailability = useCallback(async (newAvailability) => {
    try {
      const availabilityData = { ...newAvailability, provider: user._id };
      await axios.post('/api/availability', availabilityData, { withCredentials: true });
      await fetchAvailabilityBlocks(selectedDate);
      setIsModalOpen(false);
      setError(null);
    } catch (error) {
      console.error('Error adding availability:', error);
      setError('Failed to add availability block. Please try again.');
    }
  }, [fetchAvailabilityBlocks, selectedDate, user._id]);

  const handleAddAvailability = useCallback(async (newAvailability) => {
    const dateStr = typeof newAvailability.date === 'string'
      ? newAvailability.date
      : DateTime.fromJSDate(newAvailability.date).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
    const conflicts = findGcalConflicts(dateStr, newAvailability.start, newAvailability.end);
    if (conflicts.length > 0) {
      setPendingAction({ type: 'add', data: newAvailability });
      setGcalConflicts(conflicts);
      return;
    }
    await doAddAvailability(newAvailability);
  }, [findGcalConflicts, doAddAvailability]);

  const handleModifyClick = useCallback((block) => {
    setSelectedBlock(block);
    setModifyModalOpen(true);
  }, []);

  const handleBlockOffClick = useCallback((block) => {
    setBlockOffTargetBlock(block);
    setBlockOffModalOpen(true);
  }, []);

  const doBlockOffTime = useCallback(async (payload) => {
    await axios.post('/api/provider/blocked-times', payload, { withCredentials: true });
    await fetchBlockedTimes(selectedDate);
    await fetchAvailabilityBlocks(selectedDate);
    setBlockOffModalOpen(false);
    setBlockOffTargetBlock(null);
  }, [fetchBlockedTimes, fetchAvailabilityBlocks, selectedDate]);

  const handleBlockOffTime = useCallback(async (payload) => {
    // All-day blocks have no explicit start/end — treat them as covering
    // the entire day for conflict detection.
    const startStr = payload.allDay ? '00:00' : payload.start;
    const endStr = payload.allDay ? '23:59' : payload.end;
    const conflicts = findGcalConflicts(payload.date, startStr, endStr);
    if (conflicts.length > 0) {
      setPendingAction({ type: 'blockoff', data: payload });
      setGcalConflicts(conflicts);
      return;
    }
    await doBlockOffTime(payload);
  }, [findGcalConflicts, doBlockOffTime]);

  const handleDeleteBlockedTime = useCallback(async (blockedTimeId) => {
    try {
      await axios.delete(`/api/provider/blocked-times/${blockedTimeId}`, { withCredentials: true });
      await fetchBlockedTimes(selectedDate);
    } catch (error) {
      console.error('Error deleting blocked time:', error);
      setError('Failed to remove blocked time');
    }
  }, [fetchBlockedTimes, selectedDate]);

  const doModifyAvailability = useCallback(async (modifiedBlock) => {
    try {
      const response = await axios.put(
        `/api/availability/${modifiedBlock._id}`,
        { ...modifiedBlock },
        { withCredentials: true }
      );
      if (response.status === 200) {
        await fetchAvailabilityBlocks(selectedDate);
        setError(null);
        setConflictInfo(null);
        setModifyModalOpen(false);
        setSelectedBlock(null);
      }
    } catch (error) {
      console.error('Error modifying availability:', error);
      if (error.response?.data?.conflicts) {
        setConflictInfo({
          type: 'modify',
          message: error.response.data.message,
          conflicts: error.response.data.conflicts
        });
      } else {
        setError('Failed to modify availability block');
      }
    }
  }, [fetchAvailabilityBlocks, selectedDate]);

  const handleModifyAvailability = useCallback(async (modifiedBlock) => {
    const dateStr = modifiedBlock.localDate ||
      DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
    const conflicts = findGcalConflicts(dateStr, modifiedBlock.start, modifiedBlock.end);
    if (conflicts.length > 0) {
      setPendingAction({ type: 'modify', data: modifiedBlock });
      setGcalConflicts(conflicts);
      return;
    }
    await doModifyAvailability(modifiedBlock);
  }, [findGcalConflicts, doModifyAvailability, selectedDate]);

  const handleGcalModalConfirm = useCallback(async (idsToOverride) => {
    try {
      // Apply overrides first (if any)
      if (idsToOverride.length > 0) {
        await Promise.all(idsToOverride.map(id =>
          axios.put(`/api/provider/blocked-times/${id}/override`,
            { overridden: true },
            { withCredentials: true }
          )
        ));
        await fetchBlockedTimes(selectedDate);
      }

      // Execute the pending action
      if (pendingAction) {
        if (pendingAction.type === 'add') {
          await doAddAvailability(pendingAction.data);
        } else if (pendingAction.type === 'modify') {
          await doModifyAvailability(pendingAction.data);
        } else if (pendingAction.type === 'blockoff') {
          await doBlockOffTime(pendingAction.data);
        }
      }

      setGcalConflicts([]);
      setPendingAction(null);
    } catch (error) {
      console.error('Error applying conflict resolution:', error);
      setError('Failed to apply overrides');
    }
  }, [fetchBlockedTimes, selectedDate, pendingAction, doAddAvailability, doModifyAvailability, doBlockOffTime]);

  const handleGcalModalCancel = useCallback(() => {
    setGcalConflicts([]);
    setPendingAction(null);
  }, []);

  const handleRestoreBlockedTime = useCallback(async (blockedTimeId) => {
    if (!window.confirm('Restore this block? Clients will no longer be able to book during this time.')) return;
    try {
      await axios.put(`/api/provider/blocked-times/${blockedTimeId}/override`,
        { overridden: false },
        { withCredentials: true }
      );
      await fetchBlockedTimes(selectedDate);
    } catch (error) {
      console.error('Error restoring blocked time:', error);
      setError('Failed to restore block');
    }
  }, [fetchBlockedTimes, selectedDate]);

  const handleDeleteAvailability = useCallback(async (blockId) => {
    try {
      setError(null);
      setConflictInfo(null);
      
      const response = await axios.delete(`/api/availability/${blockId}`, {
        withCredentials: true
      });

      if (response.status === 200) {
        await Promise.all([
          fetchAvailabilityBlocks(selectedDate),
          fetchBlockedTimes(selectedDate)
        ]);
        // Show success feedback
        setError(null);
        setConflictInfo(null);
        // Optionally show a success message
        console.log('Availability block deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting availability:', error);
      
      if (error.response?.status === 400 && error.response?.data?.conflicts) {
        // Handle conflict with existing bookings
        setConflictInfo({
          type: 'delete',
          message: error.response.data.message,
          conflicts: error.response.data.conflicts,
          blockId: blockId // Store the block ID for potential retry
        });
        // Keep the delete confirmation modal closed
        setDeleteConfirmBlock(null);
      } else if (error.response?.status === 404) {
        setError('Availability block not found. It may have already been deleted.');
      } else if (error.response?.status === 403) {
        setError('You are not authorized to delete this availability block.');
      } else {
        setError(error.response?.data?.message || 'Failed to delete availability block. Please try again.');
      }
    }
  }, [fetchAvailabilityBlocks, fetchBlockedTimes, selectedDate]);

  const handleUpdateDeparture = useCallback(async (anchorData) => {
    // Update anchor on all availability blocks for the selected date
    try {
      for (const block of availabilityBlocks) {
        await axios.patch(`/api/availability/${block._id}/anchor`, anchorData, {
          withCredentials: true
        });
      }
      await fetchAvailabilityBlocks(selectedDate);
      setShowDepartureEditor(false);
    } catch (err) {
      console.error('Failed to update departure location:', err);
      setError('Failed to update departure location');
    }
  }, [availabilityBlocks, fetchAvailabilityBlocks, selectedDate]);

  // Get the current departure location from today's blocks
  const currentDeparture = availabilityBlocks.length > 0 && availabilityBlocks[0]?.anchor?.lat
    ? { name: availabilityBlocks[0].anchor.name, address: availabilityBlocks[0].anchor.address }
    : homeBase
      ? { name: 'Home Base', address: homeBase.address }
      : null;

const formatTime = useCallback((time) => {
  if (!time) return "";
  let dt;
  if (time instanceof Date) {
    dt = DateTime.fromJSDate(time);
  } else if (typeof time === 'string') {
    if (time.includes('T')) {
      dt = DateTime.fromISO(time);
    } else {
      dt = DateTime.fromFormat(time, "HH:mm");
    }
  } else if (typeof time === 'number') {
    dt = DateTime.fromMillis(time);
  } else {
    return "";
  }
  if (!dt.isValid) return "";
  return dt.toFormat(TIME_FORMATS.TIME_12H);
}, [TIME_FORMATS]);
  
  const formatDuration = useCallback((start, end) => {
    const dtStart = DateTime.fromISO(start);
    const dtEnd = DateTime.fromISO(end);
    if (!dtStart.isValid || !dtEnd.isValid) return "";
    const diff = dtEnd.diff(dtStart, ['hours', 'minutes']).toObject();
    const hours = Math.floor(diff.hours) || 0;
    const minutes = Math.round(diff.minutes) || 0;
    let parts = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    return parts.join(' and ');
  }, []);

  const renderConflictInfo = useCallback(() => {
    if (!conflictInfo) return null;

    const isDeleteConflict = conflictInfo.type === 'delete';
    const conflictIcon = isDeleteConflict ? '⚠️' : '⚠️';
    const actionWord = isDeleteConflict ? 'delete' : 'modify';
    
    return (
      <div className="mt-4 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-lg shadow-sm">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-amber-600 mt-0.5" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-semibold text-amber-900">
              {conflictIcon} Cannot {actionWord} availability - Appointments exist
            </h3>
            <div className="mt-2 text-sm text-amber-800">
              <p className="font-medium mb-2">{conflictInfo.message}</p>
              
              {conflictInfo.conflicts && conflictInfo.conflicts.length > 0 && (
                <div className="mt-3 bg-paper-elev rounded-lg p-3 border border-amber-200">
                  <p className="font-medium text-amber-900 mb-2">
                    Affected Appointments ({conflictInfo.conflicts.length}):
                  </p>
                  <div className="space-y-2">
                    {conflictInfo.conflicts.map((booking, index) => (
                      <div key={booking.id || index} className="flex items-start">
                        <span className="text-amber-600 mr-2 mt-0.5">•</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {booking.time || `${booking.startTime} - ${booking.endTime}`}
                            </span>
                            {booking.status && (
                              <span className={`px-2 py-0.5 text-xs rounded-full 
                                ${booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                                  booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-slate-100 text-slate-800'}`}>
                                {booking.status}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 text-sm">
                            Client: {booking.client || 'Unknown'}
                            {booking.clientEmail && (
                              <span className="text-slate-500 ml-2">
                                ({booking.clientEmail})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="mt-4 p-3 bg-amber-100 rounded-lg">
                <p className="text-sm text-amber-900 font-medium">
                  ⚠️ Important: Contact all affected clients before attempting to {actionWord} this availability block.
                </p>
                <p className="text-sm text-amber-800 mt-1">
                  Consider rescheduling these appointments first or providing alternative time slots.
                </p>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => setConflictInfo(null)}
                className="px-4 py-2 bg-paper-elev text-amber-700 border border-amber-300 rounded-lg 
                  hover:bg-amber-50 transition-colors duration-200 text-sm font-medium
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [conflictInfo]);

  return (
    <div className="pt-16">
      <div className="max-w-7xl mx-auto p-0 lg:p-4">
        <div className="hidden lg:flex justify-between items-center mb-6">
          <div>
            <div className="av-eyebrow mb-1">Your schedule</div>
            <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
              Manage <em style={{ color: '#B07A4E' }}>availability</em>
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setBlockOffTargetBlock(null);
                setBlockOffModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-slate-600 text-white
                rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Ban className="w-5 h-5 mr-2" />
              Block Off Time
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-[#B07A4E] text-white
                rounded-lg hover:bg-[#8A5D36] transition-colors"
            >
              <Clock className="w-5 h-5 mr-2" />
              Add Availability
            </button>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden lg:flex lg:flex-row gap-6">
          <div className="lg:w-1/3">
            <ResponsiveCalendar
              selectedDate={selectedDate}
              onDateChange={(newDate) => {
                if (requestState !== 'LOADING') {
                  const laDate = DateTime.fromJSDate(newDate)
                    .setZone('America/Los_Angeles')
                    .toJSDate();
                  setSelectedDate(laDate);
                }
              }}
              events={availabilityBlocks}
              disabled={requestState === 'LOADING'}
            />
          </div>
          <div className="lg:w-2/3">
            {/* Tabs */}
            <div className="mb-4 border-b border-line">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`${
                    activeTab === 'timeline'
                      ? 'border-[#B07A4E] text-[#B07A4E]'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Timeline View
                </button>
                <button
                  onClick={() => setActiveTab('list')}
                  className={`${
                    activeTab === 'list'
                      ? 'border-[#B07A4E] text-[#B07A4E]'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <List className="w-4 h-4 mr-2" />
                  List View
                </button>
              </nav>
            </div>

            {/* Departure Location */}
            {availabilityBlocks.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between p-3 bg-paper-deep border border-line rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <Navigation className="w-4 h-4 text-[#B07A4E] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Departure location</p>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {currentDeparture?.address || 'Not set'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDepartureEditor(!showDepartureEditor)}
                    className="text-xs font-medium text-[#B07A4E] hover:text-[#8A5D36] whitespace-nowrap ml-2"
                  >
                    Change
                  </button>
                </div>
                {showDepartureEditor && (
                  <DepartureEditor
                    savedLocations={savedLocations}
                    homeBase={homeBase}
                    currentAnchor={availabilityBlocks[0]?.anchor}
                    onSave={handleUpdateDeparture}
                    onCancel={() => setShowDepartureEditor(false)}
                  />
                )}
              </div>
            )}

            {/* Tab Content */}
            {activeTab === 'timeline' ? (
              <DaySchedule
                date={selectedDate}
                availabilityBlocks={availabilityBlocks}
                bookings={bookings}
                blockedTimes={blockedTimes}
                onModify={handleModifyClick}
                onDelete={(block) => setDeleteConfirmBlock(block)}
                onDeleteBlockedTime={handleDeleteBlockedTime}
                onRestoreBlockedTime={handleRestoreBlockedTime}
              />
            ) : (
              <AvailabilityList
                availabilityBlocks={availabilityBlocks}
                onModify={handleModifyClick}
                onDelete={(block) => setDeleteConfirmBlock(block)}
                formatTime={formatTime}
                formatDuration={formatDuration}
                onAdd={() => setIsModalOpen(true)}
                requestState={requestState}
                error={error}
                conflictInfo={conflictInfo}
                renderConflictInfo={renderConflictInfo}
              />
            )}
          </div>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden relative h-[calc(100dvh-4rem)] flex flex-col">
          <div className="flex-shrink-0 bg-paper-elev pb-2 shadow-sm">
            <ResponsiveCalendar
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              events={availabilityBlocks}
            />
          </div>
          
          {/* Mobile Tabs */}
          <div className="flex-shrink-0 flex border-b border-line bg-paper-elev">
             <button
                onClick={() => setActiveTab('timeline')}
                className={`flex-1 py-2 text-sm font-medium text-center ${
                  activeTab === 'timeline'
                    ? 'text-[#B07A4E] border-b-2 border-[#B07A4E]'
                    : 'text-slate-500'
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 py-2 text-sm font-medium text-center ${
                  activeTab === 'list'
                    ? 'text-[#B07A4E] border-b-2 border-[#B07A4E]'
                    : 'text-slate-500'
                }`}
              >
                List
              </button>
          </div>

          {/* Mobile Departure Location */}
          {availabilityBlocks.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 bg-paper-elev border-b border-line">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Navigation className="w-3.5 h-3.5 text-[#B07A4E] flex-shrink-0" />
                  <p className="text-xs text-slate-600 truncate">
                    <span className="text-slate-400">From: </span>
                    {currentDeparture?.address || 'Not set'}
                  </p>
                </div>
                <button
                  onClick={() => setShowDepartureEditor(!showDepartureEditor)}
                  className="text-xs font-medium text-[#B07A4E] whitespace-nowrap ml-2"
                >
                  Change
                </button>
              </div>
              {showDepartureEditor && (
                <div className="mt-2">
                  <DepartureEditor
                    savedLocations={savedLocations}
                    homeBase={homeBase}
                    currentAnchor={availabilityBlocks[0]?.anchor}
                    onSave={handleUpdateDeparture}
                    onCancel={() => setShowDepartureEditor(false)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-hidden relative">
             {activeTab === 'timeline' ? (
                <div className="absolute inset-0 px-2 pt-2">
                  <DaySchedule
                    date={selectedDate}
                    availabilityBlocks={availabilityBlocks}
                    bookings={bookings}
                    blockedTimes={blockedTimes}
                    onModify={handleModifyClick}
                    onDelete={(block) => setDeleteConfirmBlock(block)}
                    onDeleteBlockedTime={handleDeleteBlockedTime}
                    onRestoreBlockedTime={handleRestoreBlockedTime}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 overflow-y-auto pb-20 px-4 pt-4">
                  <AvailabilityList
                    availabilityBlocks={availabilityBlocks}
                    onModify={handleModifyClick}
                    onDelete={(block) => setDeleteConfirmBlock(block)}
                    formatTime={formatTime}
                    formatDuration={formatDuration}
                    onAdd={() => setIsModalOpen(true)}
                    requestState={requestState}
                    error={error}
                    conflictInfo={conflictInfo}
                    renderConflictInfo={renderConflictInfo}
                  />
                </div>
              )}
          </div>
          
          {/* Floating Buttons */}
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
            <button
              onClick={() => {
                setBlockOffTargetBlock(null);
                setBlockOffModalOpen(true);
              }}
              className="bg-slate-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center
                hover:bg-slate-700 transition-colors duration-200"
              aria-label="Block Off Time"
            >
              <Ban className="w-6 h-6" />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#B07A4E] text-white p-3 rounded-full shadow-lg flex items-center justify-center
                hover:bg-[#8A5D36] transition-colors duration-200"
              aria-label="Add Availability"
            >
              <Clock className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modals */}
        {isModalOpen && (
          <AddAvailabilityModal
            date={selectedDate}
            onAdd={handleAddAvailability}
            onClose={() => setIsModalOpen(false)}
          />
        )}
        {modifyModalOpen && selectedBlock && (
          <ModifyAvailabilityModal
            block={selectedBlock}
            onModify={handleModifyAvailability}
            onBlockOff={handleBlockOffClick}
            onClose={() => {
              setModifyModalOpen(false);
              setSelectedBlock(null);
            }}
          />
        )}
        {blockOffModalOpen && (
          <BlockOffTimeModal
            block={blockOffTargetBlock}
            availabilityBlocks={!blockOffTargetBlock ? availabilityBlocks : undefined}
            date={selectedDate}
            savedLocations={savedLocations}
            onBlock={handleBlockOffTime}
            onClose={() => {
              setBlockOffModalOpen(false);
              setBlockOffTargetBlock(null);
            }}
          />
        )}
        {gcalConflicts.length > 0 && (
          <GoogleCalendarConflictModal
            conflicts={gcalConflicts}
            onConfirm={handleGcalModalConfirm}
            onCancel={handleGcalModalCancel}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmBlock && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-paper-elev rounded-lg shadow-xl p-6 w-full max-w-md">
              <div className="mb-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 text-center">
                  Delete Availability Block?
                </h3>
                <p className="mt-2 text-sm text-slate-600 text-center">
                  Are you sure you want to delete this availability block for{' '}
                  {formatTime(deleteConfirmBlock.start)} - {formatTime(deleteConfirmBlock.end)}?
                </p>
                <p className="mt-2 text-sm text-red-600 text-center font-medium">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirmBlock(null)}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteAvailability(deleteConfirmBlock._id);
                    setDeleteConfirmBlock(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderAvailability;
