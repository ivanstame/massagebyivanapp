import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import ResponsiveCalendar from './ResponsiveCalendar';
import DaySchedule from './DaySchedule';
import AddAvailabilityModal from './AddAvailabilityModal';
import ModifyAvailabilityModal from './ModifyAvailabilityModal';
import AvailabilityList from './AvailabilityList';
import { Clock, AlertCircle, Calendar as CalendarIcon, List } from 'lucide-react';
import { DateTime } from 'luxon';
import { TIME_FORMATS } from '../utils/timeConstants';


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

  // Removed service area useEffect

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
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  }, []);

  const fetchData = useCallback(async (date) => {
    try {
      setRequestState('LOADING');
      await Promise.all([
        fetchAvailabilityBlocks(date),
        fetchBookings(date)
      ]);
      setRequestState('SUCCESS');
    } catch (error) {
      console.error('Data loading error:', error);
      setRequestState('ERROR');
    }
  }, [fetchAvailabilityBlocks, fetchBookings]);

  useEffect(() => {
    if (!user || user.accountType !== 'PROVIDER') {
      navigate('/login');
      return;
    }
    fetchData(selectedDate);
  }, [selectedDate, user, navigate, fetchData]);

  const handleAddAvailability = useCallback(async (newAvailability) => {
    try {
      const availabilityData = {
        ...newAvailability,
        provider: user._id,
      };

      const response = await axios.post('/api/availability', availabilityData, {
        withCredentials: true
      });
      
      await fetchAvailabilityBlocks(selectedDate);
      setIsModalOpen(false);
      setError(null);
    } catch (error) {
      console.error('Error adding availability:', error);
      setError('Failed to add availability block. Please try again.');
    }
  }, [fetchAvailabilityBlocks, selectedDate, user._id]);

  const handleModifyClick = useCallback((block) => {
    setSelectedBlock(block);
    setModifyModalOpen(true);
  }, []);

  const handleModifyAvailability = useCallback(async (modifiedBlock) => {
    try {
      const response = await axios.put(
        `/api/availability/${modifiedBlock._id}`,
        {
          ...modifiedBlock
        },
        {
          withCredentials: true
        }
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

  const handleDeleteAvailability = useCallback(async (blockId) => {
    try {
      setError(null);
      setConflictInfo(null);
      
      const response = await axios.delete(`/api/availability/${blockId}`, {
        withCredentials: true
      });

      if (response.status === 200) {
        await fetchAvailabilityBlocks(selectedDate);
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
  }, [fetchAvailabilityBlocks, selectedDate]);
 

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
                <div className="mt-3 bg-white rounded-md p-3 border border-amber-200">
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
              
              <div className="mt-4 p-3 bg-amber-100 rounded-md">
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
                className="px-4 py-2 bg-white text-amber-700 border border-amber-300 rounded-md 
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
            <h1 className="text-2xl font-bold text-slate-900">Manage Availability</h1>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-[#009ea5] text-white
              rounded-md hover:bg-[#008a91] transition-colors"
          >
            <Clock className="w-5 h-5 mr-2" />
            Add Availability
          </button>
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
            <div className="mb-4 border-b border-slate-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`${
                    activeTab === 'timeline'
                      ? 'border-[#009ea5] text-[#009ea5]'
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
                      ? 'border-[#009ea5] text-[#009ea5]'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <List className="w-4 h-4 mr-2" />
                  List View
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'timeline' ? (
              <DaySchedule
                date={selectedDate}
                availabilityBlocks={availabilityBlocks}
                bookings={bookings}
                onModify={handleModifyClick}
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
          <div className="flex-shrink-0 bg-white pb-2 shadow-sm">
            <ResponsiveCalendar
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              events={availabilityBlocks}
            />
          </div>
          
          {/* Mobile Tabs */}
          <div className="flex-shrink-0 flex border-b border-slate-200 bg-white">
             <button
                onClick={() => setActiveTab('timeline')}
                className={`flex-1 py-2 text-sm font-medium text-center ${
                  activeTab === 'timeline'
                    ? 'text-[#009ea5] border-b-2 border-[#009ea5]'
                    : 'text-slate-500'
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 py-2 text-sm font-medium text-center ${
                  activeTab === 'list'
                    ? 'text-[#009ea5] border-b-2 border-[#009ea5]'
                    : 'text-slate-500'
                }`}
              >
                List
              </button>
          </div>

          <div className="flex-1 overflow-hidden relative">
             {activeTab === 'timeline' ? (
                <div className="absolute inset-0 px-2 pt-2">
                  <DaySchedule
                    date={selectedDate}
                    availabilityBlocks={availabilityBlocks}
                    bookings={bookings}
                    onModify={handleModifyClick}
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
          
          {/* Floating Button for Add Availability */}
          <div className="fixed bottom-4 right-4 z-50">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-[#009ea5] text-white p-3 rounded-full shadow-lg flex items-center justify-center
                hover:bg-[#008a91] transition-colors duration-200"
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
            onClose={() => {
              setModifyModalOpen(false);
              setSelectedBlock(null);
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmBlock && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
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
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteAvailability(deleteConfirmBlock._id);
                    setDeleteConfirmBlock(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
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
