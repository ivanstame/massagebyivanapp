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
import { Clock, Ban, AlertCircle, Calendar as CalendarIcon, List, ChevronDown, Share2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { TIME_FORMATS, tzOf } from '../utils/timeConstants';
import ScheduleShareSheet from './ScheduleShareSheet';


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
  const [showShareSheet, setShowShareSheet] = useState(false);
  // Bumped after any mutation that affects month-level calendar dots
  // (add/modify/delete availability, block off time, delete a block).
  // Pipes into ResponsiveCalendar's refreshKey to force a re-fetch.
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const bumpCalendar = () => setCalendarRefreshKey(k => k + 1);
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

  // Provider's local TZ — drives every "what day is this Date object?"
  // conversion below. Auth user is the provider for this whole route.
  const viewerTz = tzOf(user);

  const fetchAvailabilityBlocks = useCallback(async (date) => {
    try {
      // Convert date to provider-local YYYY-MM-DD
      const laDate = DateTime.fromJSDate(date)
        .setZone(viewerTz)
        .toFormat('yyyy-MM-dd');

      // Cache-bust query param to force a fresh fetch even if the
      // browser's HTTP cache wants to serve a 200 from before the
      // most recent modify/add.
      const response = await axios.get(
        `/api/availability/blocks/${laDate}?_=${Date.now()}`,
        { withCredentials: true }
      );
      setAvailabilityBlocks(response.data);
    } catch (error) {
      console.error('Error fetching availability blocks:', error);
    }
  }, [viewerTz]);

  const fetchBookings = useCallback(async (date) => {
    try {
      // Use the LA calendar date, not the UTC slice. `date.toISOString()`
      // collapses local time → UTC, so when the page loads in the
      // evening LA time the UTC date has already rolled to the next
      // day and we'd query the wrong day's bookings. The user's
      // initial-load symptom — "page looks empty until I toggle the
      // date" — was exactly this: clicking a calendar cell sets a
      // clean LA-midnight value where toISOString().split agrees,
      // initial mount with `new Date()` doesn't. fetchAvailabilityBlocks
      // and fetchBlockedTimes already do this conversion; this matches.
      const laDate = DateTime.fromJSDate(date).setZone(viewerTz).toFormat('yyyy-MM-dd');
      const response = await axios.get(
        `/api/bookings?date=${laDate}`,
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
  }, [viewerTz]);

  const fetchBlockedTimes = useCallback(async (date) => {
    try {
      const laDate = DateTime.fromJSDate(date)
        .setZone(viewerTz)
        .toFormat('yyyy-MM-dd');
      const response = await axios.get(
        `/api/provider/blocked-times/${laDate}`,
        { withCredentials: true }
      );
      setBlockedTimes(response.data);
    } catch (error) {
      console.error('Error fetching blocked times:', error);
    }
  }, [viewerTz]);

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
      // Each blocked-time was stamped with the provider's TZ at sync.
      const btTz = tzOf(bt, viewerTz);
      const btStart = DateTime.fromISO(bt.start).setZone(btTz);
      const btEnd = DateTime.fromISO(bt.end).setZone(btTz);
      const btStartMin = btStart.hour * 60 + btStart.minute;
      const btEndMin = btEnd.hour * 60 + btEnd.minute;
      return newStartMin < btEndMin && newEndMin > btStartMin;
    });
  }, [blockedTimes, viewerTz]);

  const doAddAvailability = useCallback(async (newAvailability) => {
    try {
      const availabilityData = { ...newAvailability, provider: user._id };
      await axios.post('/api/availability', availabilityData, { withCredentials: true });
      await fetchAvailabilityBlocks(selectedDate);
      bumpCalendar();
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
      : DateTime.fromJSDate(newAvailability.date).setZone(viewerTz).toFormat('yyyy-MM-dd');
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
    bumpCalendar();
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
      bumpCalendar();
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
        // Print the saved state to the browser console so it's
        // visible to anyone helping debug. The server returns the
        // updated doc; if its start/end DON'T match what was
        // submitted, the bug is server-side. If they DO match but
        // the calendar still shows the old time, the bug is in
        // the refetch / render path (likely browser cache).
        try {
          const saved = response.data || {};
          // eslint-disable-next-line no-console
          console.warn('[Modify Availability] saved doc:', {
            _id: saved._id,
            start: saved.start,
            end: saved.end,
            source: saved.source,
            kind: saved.kind,
            localDate: saved.localDate,
          });
        } catch {}
        // Cache-bust the refetch — browsers can serve stale GETs
        // even on same-origin XHR for routes without explicit
        // Cache-Control headers. Service worker skips /api/* but
        // the native http cache may still hold a copy. Forcing a
        // unique URL guarantees a fresh fetch.
        await fetchAvailabilityBlocks(selectedDate);
        bumpCalendar();
        setError(null);
        setConflictInfo(null);
        setModifyModalOpen(false);
        setSelectedBlock(null);
      }
    } catch (error) {
      console.error('Error modifying availability:', error);
      if (error.response?.data?.conflicts) {
        // Booking conflicts and overlap conflicts both come back via
        // `conflicts`. Close the modify modal so the user can see the
        // conflict banner the parent renders below — keeping the
        // modal open hides it.
        setConflictInfo({
          type: 'modify',
          message: error.response.data.message,
          conflicts: error.response.data.conflicts
        });
        setModifyModalOpen(false);
        setSelectedBlock(null);
      }
      // Re-throw so the modify modal's local catch can surface a
      // useful inline error message instead of silently spinning
      // down. The modal shows whatever .message we hand it, so
      // prefer the server's text when available.
      const msg = error.response?.data?.message
        || error.message
        || 'Failed to modify availability block';
      throw new Error(msg);
    }
  }, [fetchAvailabilityBlocks, selectedDate]);

  const handleModifyAvailability = useCallback(async (modifiedBlock) => {
    // Modify intentionally skips the GCal-conflict gate. When the
    // provider is editing an availability window they already own,
    // an overlapping GCal block should remain as a soft block within
    // the window (the slot picker subtracts it automatically) — not
    // a hard stop that pauses the save behind a second modal.
    //
    // The previous flow popped the GCal conflict modal here, which
    // looked to the user like the modify silently failed: modify
    // modal closed, second modal opened (or didn't render visibly),
    // user dismissed it without realizing they had to confirm
    // overrides for the modify to actually run. The DB never
    // changed. Add still uses the gate (creating a new window over
    // existing GCal commitments is genuinely conflicting).
    await doModifyAvailability(modifiedBlock);
  }, [doModifyAvailability]);

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
      bumpCalendar();
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
        bumpCalendar();
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
            <h1 className="font-display" style={{ fontSize: "2rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
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
                    .setZone(viewerTz)
                    .toJSDate();
                  setSelectedDate(laDate);
                }
              }}
              events={availabilityBlocks}
              disabled={requestState === 'LOADING'}
              refreshKey={calendarRefreshKey}
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
                {/* Share schedule — opens a sheet that formats the
                    selected day's bookings for sending to a spouse,
                    family, accountant, etc. Out-of-band recipient,
                    not in-app. Tucked into the tab row so it sits
                    next to the day controls without crowding the
                    primary actions. */}
                <button
                  onClick={() => setShowShareSheet(true)}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-[#B07A4E] hover:text-[#8A5D36] py-4 px-2"
                  title="Share today's schedule"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share schedule
                </button>
              </nav>
            </div>

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
              refreshKey={calendarRefreshKey}
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
              <button
                onClick={() => setShowShareSheet(true)}
                className="flex-shrink-0 px-3 py-2 text-[#B07A4E]"
                title="Share today's schedule"
                aria-label="Share schedule"
              >
                <Share2 className="w-4 h-4" />
              </button>
          </div>

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

        {showShareSheet && (
          <ScheduleShareSheet
            bookings={bookings}
            date={selectedDate}
            onClose={() => setShowShareSheet(false)}
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
