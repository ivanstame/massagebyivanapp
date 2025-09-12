import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import ResponsiveCalendar from './ResponsiveCalendar';
import DaySchedule from './DaySchedule';
import AddAvailabilityModal from './AddAvailabilityModal';
import ModifyAvailabilityModal from './ModifyAvailabilityModal';
import { Clock, Calendar, AlertCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { TIME_FORMATS } from '../utils/timeConstants';

// Import the direct database access function
// Note: In a real implementation, you would need to properly import this
// This is just a placeholder to show how it would be used
// const { addAvailabilityDirect } = require('../../add-availability-workaround');

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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [requestState, setRequestState] = useState('INITIAL');
  const [useDirectAccess, setUseDirectAccess] = useState(true); // Use direct access by default

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
      console.log('Sending availability data:', newAvailability);
      
      if (useDirectAccess) {
        // Use direct database access
        console.log('Using direct database access to add availability');
        
        // Create a form to submit to our server-side script
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/add-availability-direct';
        form.target = '_blank';
        
        // Add the availability data
        const availabilityInput = document.createElement('input');
        availabilityInput.type = 'hidden';
        availabilityInput.name = 'availabilityData';
        availabilityInput.value = JSON.stringify({
          ...newAvailability,
          provider: user._id
        });
        form.appendChild(availabilityInput);
        
        // Submit the form
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        
        // Wait a bit for the server to process the request
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Refresh the availability blocks
        await fetchAvailabilityBlocks(selectedDate);
        setIsModalOpen(false);
        return;
      }
      
      // Fall back to API if direct access is disabled
      const availabilityData = {
        ...newAvailability,
        provider: user._id,
      };
      console.log('Final payload:', availabilityData);

      const response = await axios.post('/api/availability', availabilityData, {
        withCredentials: true
      });
      
      await fetchAvailabilityBlocks(selectedDate);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error adding availability:', error);
      setError('Failed to add availability. Please try again.');
    }
  }, [fetchAvailabilityBlocks, selectedDate, user, useDirectAccess]);

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
      const response = await axios.delete(`/api/availability/${blockId}`, {
        withCredentials: true
      });

      if (response.status === 200) {
        await fetchAvailabilityBlocks(selectedDate);
        setError(null);
        setConflictInfo(null);
      }
    } catch (error) {
      console.error('Error deleting availability:', error);
      if (error.response?.data?.conflicts) {
        setConflictInfo({
          type: 'delete',
          message: error.response.data.message,
          conflicts: error.response.data.conflicts
        });
      } else {
        setError('Failed to delete availability block');
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
  }, []);
  
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

  const renderLoadingState = () => (
    <div className="text-center py-8">
      <div className="animate-spin inline-block w-8 h-8 border-4 border-[#387c7e] border-t-transparent rounded-full mb-4" />
      <p className="text-slate-600">Loading availability data...</p>
    </div>
  );

  const renderErrorState = () => (
    <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
      <div className="flex items-center">
        <svg className="h-5 w-5 text-red-400 mr-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-sm text-red-700">Failed to load availability data. Please try again.</p>
          <button
            onClick={() => fetchData(selectedDate)}
            className="mt-2 text-sm text-red-700 underline"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );

  const renderConflictInfo = useCallback(() => {
    if (!conflictInfo) return null;

    return (
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-400 rounded">
        <h3 className="font-semibold text-yellow-800">{conflictInfo.message}</h3>
        <p className="mt-2 text-sm text-yellow-700">Affected appointments:</p>
        <ul className="mt-1 text-sm">
          {conflictInfo.conflicts.map((booking, index) => (
            <li key={index} className="ml-4">
              • {booking.time} - {booking.client}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-yellow-700">
          Please contact affected clients before {conflictInfo.type === 'delete' ? 'deleting' : 'modifying'} this block.
        </p>
        <button 
          onClick={() => setConflictInfo(null)}
          className="mt-2 text-sm text-yellow-800 underline"
        >
          Dismiss
        </button>
      </div>
    );
  }, [conflictInfo]);

  const renderAvailabilityDetails = useCallback(() => {
    if (requestState === 'LOADING') return renderLoadingState();
    if (requestState === 'ERROR') return renderErrorState();
    if (availabilityBlocks.length === 0) {
      return (
        <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
          <p className="text-slate-600">
            No availability set for {selectedDate.toLocaleDateString()}
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="mt-4 inline-flex items-center px-4 py-2 bg-[#009ea5] hover:bg-[#a5825d] text-white rounded-md
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
              focus:ring-[#009ea5] shadow-sm"
          >
            <Clock className="w-5 h-5 mr-2" />
            Add First Availability Block
          </button>
        </div>
      );
    }
  
    return (
      <div className="space-y-4">
        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {renderConflictInfo()}
        
        {availabilityBlocks.map((block, index) => (
          <div 
            key={block._id || index} 
            className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden
              transition duration-200 ease-in-out hover:shadow-md"
          >
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-medium text-slate-900">
                      {formatTime(block.start)} - {formatTime(block.end)}
                    </span>
                    <span className={"px-2.5 py-0.5 text-xs font-medium rounded-full " + (block.type === 'autobook' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                      {block.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatDuration(block.start, block.end)}
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleModifyClick(block)}
                    className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                      text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50
                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#387c7e]
                      transition-colors duration-200 ease-in-out"
                  >
                    Edit
                  </button>
                  
                  <button 
                    onClick={() => handleDeleteAvailability(block._id)}
                    className="inline-flex items-center px-3 py-1.5 bg-white border border-red-300
                      text-sm font-medium rounded-md text-red-700 hover:bg-red-50
                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500
                      transition-colors duration-200 ease-in-out"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full flex items-center justify-center px-4 py-3 bg-[#009ea5] text-white
            rounded-md hover:bg-[#a5825d] transition-colors duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#009ea5]
            shadow-sm"
        >
          <Clock className="w-5 h-5 mr-2" />
          Add New Availability Block
        </button>
        
        {/* Toggle for direct access */}
        <div className="mt-4 flex items-center justify-center">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={useDirectAccess}
              onChange={() => setUseDirectAccess(!useDirectAccess)}
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">
              Use Direct Database Access
            </span>
          </label>
        </div>
      </div>
    );
  }, [availabilityBlocks, error, selectedDate, formatTime, formatDuration, handleModifyClick, handleDeleteAvailability, renderConflictInfo, useDirectAccess]);

  return (
    <div className="pt-16"> 
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manage Availability</h1>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-[#009ea5] text-white
              rounded-md hover:bg-[#a5825d] transition-colors"
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
            <div className="mt-4">
              <h2 className="text-xl font-semibold mb-4">Availability Details:</h2>
              {renderAvailabilityDetails()}
            </div>
          </div>
          <div className="lg:w-2/3">
            <DaySchedule
              date={selectedDate}
              availabilityBlocks={availabilityBlocks}
              bookings={bookings}
              onModify={handleModifyAvailability}
            />
          </div>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden relative h-[calc(100vh-6rem)] flex flex-col">
          <div className="sticky top-0 z-10 bg-white pb-4">
            <ResponsiveCalendar 
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              events={availabilityBlocks}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <DaySchedule
              date={selectedDate}
              availabilityBlocks={availabilityBlocks}
              bookings={bookings}
              onModify={handleModifyAvailability}
            />
          </div>
          
          {/* Floating Button for Add Availability */}
          <div className="fixed bottom-4 right-4 z-50">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-[#009ea5] text-white p-3 rounded-full shadow-lg flex items-center justify-center"
            >
              <span className="absolute -top-2 -right-2 bg-[#a5825d] text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {availabilityBlocks.length}
              </span>
              <Clock className="w-6 h-6" />
            </button>

            {isDetailsOpen && (
              <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl w-80 max-h-[80vh] overflow-auto border border-slate-200">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Availability Details</h2>
                    <button 
                      onClick={() => setIsDetailsOpen(false)}
                      className="text-slate-400 hover:text-slate-500"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {renderAvailabilityDetails()}
                </div>
              </div>
            )}
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
      </div>
    </div>
  );
};

export default ProviderAvailability;