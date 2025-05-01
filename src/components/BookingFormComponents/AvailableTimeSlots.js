import React, { useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../../utils/timeConstants';

const AvailableTimeSlots = ({ 
  availableSlots, 
  selectedTime, 
  onTimeSelected,
  hasValidDuration = false,
  isComplete = false,
  selectedDate
}) => {
  // Internal function to determine time period (morning, afternoon, evening)
  const formatPeriod = (isoTime) => {
    try {
      const slotDT = DateTime.fromISO(isoTime, { zone: DEFAULT_TZ });
      if (!slotDT.isValid) return 'unavailable';
      
      const hour = slotDT.hour;
      
      if (isNaN(hour)) {
        return 'unavailable';
      }
      
      if (hour >= 6 && hour < 12) return 'Morning';
      if (hour >= 12 && hour < 17) return 'Afternoon';
      return 'Evening';
    } catch (err) {
      console.error('Error determining time period:', isoTime, err);
      return 'unavailable';
    }
  };
  
  // Time period tabs
  const timeTabs = ['Morning', 'Afternoon', 'Evening'];
  
  // Calculate slot counts and determine initial tab (using useMemo to avoid recalculations)
  const { initialTab, slotsByPeriod } = useMemo(() => {
    // Default to Evening if no slots available
    let bestTab = 'Evening';
    const slotMap = {
      'Morning': [],
      'Afternoon': [],
      'Evening': []
    };
    
    if (availableSlots && availableSlots.length > 0) {
      // Group slots by period
      availableSlots.forEach(slot => {
        const period = formatPeriod(slot.iso);
        if (period !== 'unavailable' && slotMap[period]) {
          slotMap[period].push(slot);
        }
      });
      
      // Find period with most slots
      const morningCount = slotMap['Morning'].length;
      const afternoonCount = slotMap['Afternoon'].length;
      const eveningCount = slotMap['Evening'].length;
      
      if (morningCount >= afternoonCount && morningCount >= eveningCount && morningCount > 0) {
        bestTab = 'Morning';
      } else if (afternoonCount >= morningCount && afternoonCount >= eveningCount && afternoonCount > 0) {
        bestTab = 'Afternoon';
      } else if (eveningCount > 0) {
        bestTab = 'Evening';
      }
    }
    
    return { initialTab: bestTab, slotsByPeriod: slotMap };
  }, [availableSlots]);
  
  // State for the selected tab (Morning, Afternoon, Evening)
  const [selectedTimeTab, setSelectedTimeTab] = useState(initialTab);

  // Handle tab selection - this is local to the component and won't trigger parent effects
  const handleTimeTabSelect = (tab) => {
    setSelectedTimeTab(tab);
  };
  
  // Handle time selection - this will notify the parent component
  const handleTimeSelect = (slot) => {
    onTimeSelected(slot);
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    return DateTime.fromJSDate(date)
      .setZone(DEFAULT_TZ)
      .toFormat('cccc, MMMM d, yyyy');
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      maxWidth: '100%',
      margin: '0 auto',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <span style={{
          width: '24px',
          height: '24px',
          marginRight: '10px',
          color: '#2e8b57',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Clock className="w-5 h-5" />
        </span>
        <h2 style={{
          fontSize: '18px',
          margin: 0
        }}>Available Times</h2>
        {!selectedTime && availableSlots.length > 0 && (
          <span style={{
            marginLeft: '8px',
            fontSize: '14px',
            color: '#2e8b57'
          }}>(Select a time to continue)</span>
        )}
      </div>
      
      <div style={{ marginTop: '15px' }}>
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          {timeTabs.map(tab => (
            <div
              key={tab}
              style={{
                padding: '10px 15px',
                cursor: 'pointer',
                position: 'relative',
                color: selectedTimeTab === tab ? '#2e8b57' : 'inherit',
                fontWeight: selectedTimeTab === tab ? 600 : 'normal'
              }}
              onClick={() => handleTimeTabSelect(tab)}
            >
              {tab}
              {selectedTimeTab === tab && (
                <div style={{
                  position: 'absolute',
                  bottom: '-1px',
                  left: 0,
                  width: '100%',
                  height: '2px',
                  backgroundColor: '#2e8b57'
                }}></div>
              )}
            </div>
          ))}
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px'
        }}>
          {!hasValidDuration ? (
            // Show placeholders if no duration is selected
            Array(6).fill(null).map((_, idx) => (
              <div 
                key={idx}
                style={{
                  textAlign: 'center',
                  padding: '10px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  backgroundColor: '#f5f5f5',
                  color: '#aaa'
                }}
              />
            ))
          ) : !availableSlots.length ? (
            // Show placeholders if no slots are available
            Array(6).fill(null).map((_, idx) => (
              <div 
                key={idx}
                style={{
                  textAlign: 'center',
                  padding: '10px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  backgroundColor: '#f5f5f5',
                  color: '#aaa'
                }}
              />
            ))
          ) : slotsByPeriod[selectedTimeTab].length === 0 ? (
            // Show "No available times" message when the selected tab has no slots
            <div 
              style={{
                gridColumn: '1 / span 3',
                textAlign: 'center',
                padding: '20px',
                color: '#666'
              }}
            >
              No available times in this period
            </div>
          ) : (
            // Show actual time slots from the pre-calculated slots by period
            slotsByPeriod[selectedTimeTab].map(slot => (
                <div
                  key={slot.iso}
                  style={{
                    textAlign: 'center',
                    padding: '10px',
                    border: `1px solid ${selectedTime?.iso === slot.iso ? '#2e8b57' : '#e0e0e0'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: selectedTime?.iso === slot.iso ? '#f5f9f7' : 'transparent',
                    fontWeight: selectedTime?.iso === slot.iso ? 600 : 'normal',
                    color: selectedTime?.iso === slot.iso ? '#256d44' : 'inherit',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => handleTimeSelect(slot)}
                >
                  {slot.display || slot.local}
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {DateTime.fromISO(slot.iso).toFormat('ZZ')}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
      
      {selectedTime && selectedDate && (
        <div style={{
          marginTop: '20px',
          fontSize: '14px',
          color: '#666'
        }}>
          Selected time: <span style={{ fontWeight: 'bold', color: '#2e8b57' }}>{selectedTime.display || selectedTime.local}</span> on 
          <span style={{ fontWeight: 'bold' }}> {formatDate(selectedDate)}</span>
        </div>
      )}
    </div>
  );
};

export default AvailableTimeSlots;
